<?php
// cron_zip_cleanup.php - Deletes ZIP files 5 minutes after they have been CREATED.

echo "Cron ZIP Cleanup (by creation time) Started - " . date('Y-m-d H:i:s') . "\n";

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
$new_status_after_cleanup = 'cleaned_by_timeout'; // New status for jobs cleaned this way

echo "ZIP Cache Directory: " . ZIP_CACHE_DIR . "\n";
echo "Cleanup interval: {$cleanup_interval_minutes} minutes after CREATION.\n";

// --- Main Logic ---
try {
    // For MySQL/MariaDB, use NOW() - INTERVAL X MINUTE against created_at
    $cleanup_threshold_sql = "(NOW() - INTERVAL {$cleanup_interval_minutes} MINUTE)";

    // Select jobs that are older than the interval, have a zip path, and are not already cleaned.
    // We target any status other than 'cleaned' or 'cleaned_by_timeout' to avoid reprocessing.
    $sql_get_old_zips =
        "SELECT id, job_token, final_zip_path, created_at, status FROM zip_jobs " .
        "WHERE final_zip_path IS NOT NULL AND final_zip_path != '' " .
        "AND created_at < {$cleanup_threshold_sql} " .
        "AND status NOT IN ('cleaned', '{$new_status_after_cleanup}')";
    
    error_log("[Cron ZIP Cleanup] Executing SQL to find jobs based on creation time: " . $sql_get_old_zips);
    echo "Executing SQL: {$sql_get_old_zips}\n";

    $stmt_get_zips = $pdo->prepare($sql_get_old_zips);
    $stmt_get_zips->execute();
    $jobs_to_cleanup = $stmt_get_zips->fetchAll(PDO::FETCH_ASSOC);

    error_log("[Cron ZIP Cleanup] Found " . count($jobs_to_cleanup) . " ZIP job(s) to process for cleanup (based on creation time).");

    if (empty($jobs_to_cleanup)) {
        echo "No ZIP files found ready for cleanup based on creation time.\n";
        exit(0);
    }

    echo "Found " . count($jobs_to_cleanup) . " ZIP job(s) to process for cleanup.\n";
    $cleaned_count = 0;
    $error_count = 0;

    foreach ($jobs_to_cleanup as $job) {
        $job_id = $job['id'];
        $job_token = $job['job_token'];
        $zip_filepath_from_db = $job['final_zip_path'];
        $created_at_from_db = $job['created_at'];
        $current_status_from_db = $job['status'];

        error_log("[Cron ZIP Cleanup] Processing Job ID: {$job_id}, Token: {$job_token}, Created At: {$created_at_from_db}, Current Status: {$current_status_from_db}, Final Zip Path: '{$zip_filepath_from_db}'");

        // final_zip_path should have been checked by SQL, but double check
        if (empty($zip_filepath_from_db)) {
            error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) met time criteria but final_zip_path is empty. Skipping file deletion, attempting to update status to '{$new_status_after_cleanup}'.");
            try {
                // Update status, set final_zip_path to NULL, and add a result message
                $stmt_mark_cleaned = $pdo->prepare(
                    "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ? " .
                    "WHERE id = ? AND status NOT IN ('cleaned', ?)"
                );
                $message = "Cleaned by timeout due to empty final_zip_path at " . date('Y-m-d H:i:s');
                if ($stmt_mark_cleaned->execute([$new_status_after_cleanup, $message, $job_id, $new_status_after_cleanup]) && $stmt_mark_cleaned->rowCount() > 0) {
                    echo "Marked job ID {$job_id} as '{$new_status_after_cleanup}' due to missing final_zip_path.\n";
                    error_log("[Cron ZIP Cleanup] Marked job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' due to missing final_zip_path.");
                    $cleaned_count++;
                } else {
                    error_log("[Cron ZIP Cleanup] Failed to mark job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' for missing path or already appropriately cleaned. Error: " . print_r($stmt_mark_cleaned->errorInfo(), true));
                }
            } catch (PDOException $e) {
                error_log("[Cron ZIP Cleanup] PDOException while trying to mark job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' for missing path: " . $e->getMessage());
            }
            continue; 
        } 

        $zip_filepath_to_delete = $zip_filepath_from_db; 

        error_log("[Cron ZIP Cleanup] Checking file for deletion by creation time: '{$zip_filepath_to_delete}' for job token {$job_token}");

        if (is_file($zip_filepath_to_delete) && is_readable($zip_filepath_to_delete)) {
            echo "Attempting to delete ZIP file (due to age): {$zip_filepath_to_delete} for job token {$job_token}\n";
            error_log("[Cron ZIP Cleanup] Attempting to delete ZIP file (due to age): {$zip_filepath_to_delete} for job token {$job_token}");
            
            if (unlink($zip_filepath_to_delete)) {
                echo "Successfully deleted ZIP file: {$zip_filepath_to_delete}\n";
                error_log("[Cron ZIP Cleanup] Successfully deleted ZIP file: {$zip_filepath_to_delete} for job token {$job_token}");
                
                try {
                    $stmt_mark_cleaned = $pdo->prepare(
                        "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ? " .
                        "WHERE id = ? AND status NOT IN ('cleaned', ?)"
                    );
                    $message = "File deleted and job cleaned by timeout at " . date('Y-m-d H:i:s');
                    if ($stmt_mark_cleaned->execute([$new_status_after_cleanup, $message, $job_id, $new_status_after_cleanup]) && $stmt_mark_cleaned->rowCount() > 0) {
                        echo "Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' in database.\n";
                        error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' in database.");
                        $cleaned_count++;
                    } else {
                        $error_count++;
                        $db_error_message = "Failed to mark job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' in database (or already cleaned).";
                        echo "ERROR: {$db_error_message}\n";
                        error_log("[Cron ZIP Cleanup] ERROR: {$db_error_message} - SQL Error: " . print_r($stmt_mark_cleaned->errorInfo(), true));
                    }
                } catch (PDOException $e) {
                    $error_count++;
                    $pdo_error_message = "PDOException while marking job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}': " . $e->getMessage();
                    echo "ERROR: {$pdo_error_message}\n";
                    error_log("[Cron ZIP Cleanup] ERROR: {$pdo_error_message}");
                }
            } else {
                $error_count++;
                $error_message = "Failed to delete ZIP file (unlink failed): {$zip_filepath_to_delete} for job token {$job_token}. Check permissions.";
                echo "ERROR: {$error_message}\n";
                error_log("[Cron ZIP Cleanup] ERROR: {$error_message}");
                // Do not mark as cleaned if file deletion failed, so we can retry or investigate
                continue; 
            }
        } else { // File not found or not readable
            if (!file_exists($zip_filepath_to_delete)) {
                error_log("[Cron ZIP Cleanup] File does not exist: '{$zip_filepath_to_delete}'");
            } else if (!is_file($zip_filepath_to_delete)) {
                error_log("[Cron ZIP Cleanup] Path is not a file: '{$zip_filepath_to_delete}'");
            } else if (!is_readable($zip_filepath_to_delete)) {
                error_log("[Cron ZIP Cleanup] File is not readable: '{$zip_filepath_to_delete}' (check permissions)");
            } else {
                error_log("[Cron ZIP Cleanup] Unknown reason for is_file/is_readable returning false for: '{$zip_filepath_to_delete}'");
            }

            echo "ZIP file not found or not readable for job token {$job_token}: Path from DB '{$zip_filepath_from_db}'. Assuming already deleted or moved. Marking as '{$new_status_after_cleanup}'.\n";
            error_log("[Cron ZIP Cleanup] ZIP file not found or not readable for job token {$job_token}: Path from DB '{$zip_filepath_from_db}'. Assuming already deleted. Marking as '{$new_status_after_cleanup}'.");
            
            try {
                $stmt_mark_cleaned_missing = $pdo->prepare(
                    "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ? " .
                    "WHERE id = ? AND status NOT IN ('cleaned', ?)"
                );
                $message = "File was missing, job cleaned by timeout at " . date('Y-m-d H:i:s');
                if ($stmt_mark_cleaned_missing->execute([$new_status_after_cleanup, $message, $job_id, $new_status_after_cleanup]) && $stmt_mark_cleaned_missing->rowCount() > 0) {
                    echo "Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' (file was missing).\n";
                    error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}' (file was missing).");
                    $cleaned_count++; 
                } else {
                    echo "Job ID {$job_id} (Token: {$job_token}) already cleaned or failed to mark as '{$new_status_after_cleanup}' (file was missing). Error: " . print_r($stmt_mark_cleaned_missing->errorInfo(), true) . "\n";
                    error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) already cleaned or failed to mark as '{$new_status_after_cleanup}' (file was missing, rowCount 0 or execute failed).");
                    if ($stmt_mark_cleaned_missing->rowCount() > 0) $cleaned_count++;
                    else $error_count++; 
                }
            } catch (PDOException $e) {
                $error_count++;
                $pdo_error_message = "PDOException while marking missing file job ID {$job_id} (Token: {$job_token}) as '{$new_status_after_cleanup}': " . $e->getMessage();
                echo "ERROR: {$pdo_error_message}\n";
                error_log("[Cron ZIP Cleanup] ERROR: {$pdo_error_message}");
            }
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