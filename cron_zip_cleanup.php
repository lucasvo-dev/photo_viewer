<?php
// cron_zip_cleanup.php - Deletes ZIP files 5 minutes after they have been downloaded.

echo "Cron ZIP Cleanup Started - " . date('Y-m-d H:i:s') . "\n";

// --- Environment Setup ---
error_reporting(E_ALL);
ini_set('display_errors', 0); // Do not display errors to CLI output
ini_set('log_errors', 1);

// Ensure logs directory exists relative to this script's location
// Assumes cron script is in the project root, and logs is ./logs/
if (!is_dir(__DIR__ . '/logs')) {
    if (!mkdir(__DIR__ . '/logs', 0755, true) && !is_dir(__DIR__ . '/logs')) {
        // Fallback if logs dir cannot be created at root, try relative to script
        // This might be the case if script is in a subfolder like 'cron/'
        if (!is_dir('logs')) { // check relative to current execution path
             mkdir('logs', 0755, true);
        }
        ini_set('error_log', 'logs/cron_zip_cleanup_error.log');
    } else {
      ini_set('error_log', __DIR__ . '/logs/cron_zip_cleanup_error.log');
    }
} else {
    ini_set('error_log', __DIR__ . '/logs/cron_zip_cleanup_error.log');
}

set_time_limit(0); // Allow script to run as long as needed

// --- Include Necessary Files ---
try {
    require_once __DIR__ . '/db_connect.php'; // For $pdo and config constants
    if (!isset($pdo) || !$pdo instanceof PDO) {
        throw new Exception("Database connection (\$pdo) not established. Check db_connect.php.");
    }
} catch (Throwable $e) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[{$timestamp}] [Cron ZIP Cleanup Init Error] Failed to include required files: " . $e->getMessage());
    echo "[{$timestamp}] [Cron ZIP Cleanup Init Error] Failed to initialize. Check error log.\n";
    exit(1);
}

// --- Configuration ---
// Define ZIP_CACHE_DIR - this should match where worker_zip.php saves files
// worker_zip.php uses: define('ZIP_CACHE_DIR', __DIR__ . '/../cache/zips/'); if it's in api/
// If this cron script is in the project root, then cache/zips/ is correct.
if (!defined('ZIP_CACHE_DIR')) {
    define('ZIP_CACHE_DIR', __DIR__ . '/cache/zips/');
}

$cleanup_interval_minutes = 5;

echo "ZIP Cache Directory: " . ZIP_CACHE_DIR . "\n";
echo "Cleanup interval: {$cleanup_interval_minutes} minutes after download.\n";

// --- Main Logic ---
try {
    $sql_get_old_zips = 
        "SELECT id, job_token, final_zip_name FROM zip_jobs " .
        "WHERE status = 'downloaded' AND downloaded_at IS NOT NULL " .
        "AND downloaded_at < (NOW() - INTERVAL {$cleanup_interval_minutes} MINUTE)";
    
    // For SQLite, the equivalent of NOW() - INTERVAL X MINUTE is DATETIME('now', '-X minutes')
    // However, db_connect.php shows this is a MySQL project.
    // If it were SQLite, the query would be:
    // "AND downloaded_at < DATETIME('now', '-{$cleanup_interval_minutes} minutes')";

    $stmt_get_zips = $pdo->prepare($sql_get_old_zips);
    $stmt_get_zips->execute();
    $jobs_to_cleanup = $stmt_get_zips->fetchAll(PDO::FETCH_ASSOC);

    if (empty($jobs_to_cleanup)) {
        echo "No ZIP files found ready for cleanup.\n";
        exit(0);
    }

    echo "Found " . count($jobs_to_cleanup) . " ZIP job(s) to process for cleanup.\n";
    $cleaned_count = 0;
    $error_count = 0;

    foreach ($jobs_to_cleanup as $job) {
        $job_id = $job['id'];
        $job_token = $job['job_token'];
        $zip_filename = $job['final_zip_name'];

        if (empty($zip_filename)) {
            error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) has status 'downloaded' but zip_filename is empty. Skipping file deletion, attempting to delete DB record.");
            // Proceed to delete DB record as the file reference is missing anyway
        } else {
            $zip_filepath = realpath(ZIP_CACHE_DIR . $zip_filename);

            if ($zip_filepath && is_file($zip_filepath)) {
                echo "Attempting to delete ZIP file: {$zip_filepath} for job token {$job_token}\n";
                if (unlink($zip_filepath)) {
                    echo "Successfully deleted ZIP file: {$zip_filepath}\n";
                    error_log("[Cron ZIP Cleanup] Successfully deleted ZIP file: {$zip_filepath} for job token {$job_token}");
                } else {
                    $error_count++;
                    $error_message = "Failed to delete ZIP file: {$zip_filepath} for job token {$job_token}. Check permissions.";
                    echo "ERROR: {$error_message}\n";
                    error_log("[Cron ZIP Cleanup] ERROR: {$error_message}");
                    // Don't delete the DB record if file deletion failed, so we can retry or investigate
                    continue; 
                }
            } else {
                echo "ZIP file not found or path invalid for job token {$job_token}: {$zip_filename} (Resolved: " . ($zip_filepath ?: 'false') . "). Assuming already deleted or moved.\n";
                error_log("[Cron ZIP Cleanup] ZIP file not found for job token {$job_token}: {$zip_filename}. Path: " . ZIP_CACHE_DIR . $zip_filename . ". Resolved: " . ($zip_filepath ?: 'false') . ". Proceeding to delete DB record.");
            }
        }

        // Delete the job record from the database if file is deleted or was missing
        try {
            $stmt_delete_job = $pdo->prepare("DELETE FROM zip_jobs WHERE id = ?");
            if ($stmt_delete_job->execute([$job_id])) {
                if ($stmt_delete_job->rowCount() > 0) {
                    echo "Successfully deleted job record ID {$job_id} (Token: {$job_token}) from database.\n";
                    error_log("[Cron ZIP Cleanup] Successfully deleted job record ID {$job_id} (Token: {$job_token}) from database.");
                    $cleaned_count++;
                } else {
                     // This could happen if another process deleted it in the meantime
                    echo "Job record ID {$job_id} (Token: {$job_token}) already deleted or not found during delete attempt.\n";
                    error_log("[Cron ZIP Cleanup] Job record ID {$job_id} (Token: {$job_token}) already deleted or not found during delete attempt (rowCount 0).");
                    // If rowCount is 0 but execute was true, it's not a fatal error for this job, count as cleaned.
                    $cleaned_count++; 
                }
            } else {
                $error_count++;
                $db_error_message = "Failed to delete job record ID {$job_id} (Token: {$job_token}) from database.";
                echo "ERROR: {$db_error_message}\n";
                error_log("[Cron ZIP Cleanup] ERROR: {$db_error_message} - SQL Error: " . print_r($stmt_delete_job->errorInfo(), true));
            }
        } catch (PDOException $e) {
            $error_count++;
            $pdo_error_message = "PDOException while deleting job record ID {$job_id} (Token: {$job_token}): " . $e->getMessage();
            echo "ERROR: {$pdo_error_message}\n";
            error_log("[Cron ZIP Cleanup] ERROR: {$pdo_error_message}");
        }
        echo "----\n";
    }

    echo "Cron ZIP Cleanup Finished. Cleaned jobs: {$cleaned_count}. Errors encountered: {$error_count}.\n";

} catch (Throwable $e) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[{$timestamp}] [Cron ZIP Cleanup Main Error] " . $e->getMessage() . "\nStack Trace:\n" . $e->getTraceAsString());
    echo "[{$timestamp}] [Cron ZIP Cleanup Main Error] An error occurred. Check error log.\n";
    exit(1);
}

exit(0);

?> 