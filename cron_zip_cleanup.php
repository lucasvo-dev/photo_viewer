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
             if (!mkdir('logs', 0755, true) && !is_dir('logs')) {
                // If still can't create, log to system temp and error out
                $system_temp_log = sys_get_temp_dir() . '/cron_zip_cleanup_bootstrap_error.log';
                ini_set('error_log', $system_temp_log);
                error_log("Critial: Could not create logs directory at __DIR__/logs or ./logs. Logging to {$system_temp_log}");
                echo "Critial: Could not create logs directory. Check permissions or path. Logging to {$system_temp_log}
";
                // exit(1); // Decided to let it try to continue if db_connect.php defines its own log
             } else {
                ini_set('error_log', 'logs/cron_zip_cleanup_error.log');
             }
        } else {
          ini_set('error_log', 'logs/cron_zip_cleanup_error.log');
        }
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

// --- New Constants ---
define('MAX_CLEANUP_ATTEMPTS', 3); // Max times to try deleting a problematic file
define('STATUS_CLEANED_BY_TIMEOUT', 'cleaned_by_timeout'); // Existing, but good to have as constant
define('STATUS_CLEANUP_FAILED_DELETE', 'cleanup_failed_delete'); // For persistent unlink failures
define('STATUS_CLEANUP_FAILED_UNREADABLE', 'cleanup_failed_unreadable'); // For files existing but unreadable/not a file

$cleanup_interval_minutes = 5;
// $new_status_after_cleanup = 'cleaned_by_timeout'; // Replaced by STATUS_CLEANED_BY_TIMEOUT

echo "ZIP Cache Directory: " . ZIP_CACHE_DIR . "
";
echo "Cleanup interval: {$cleanup_interval_minutes} minutes after CREATION.
";
echo "Max cleanup attempts for a single file: " . MAX_CLEANUP_ATTEMPTS . "
";

// --- New Helper Functions ---
function cleanup_orphaned_files($pdo, $zip_cache_dir) {
    echo "Checking for orphaned ZIP files...\n";
    $orphaned_files = [];
    
    // Get all ZIP files in cache directory
    $zip_files = glob($zip_cache_dir . '*.zip');
    if (empty($zip_files)) {
        echo "No ZIP files found in cache directory.\n";
        return 0;
    }
    
    // Get all final_zip_paths from database
    $stmt = $pdo->query("SELECT final_zip_path FROM zip_jobs WHERE final_zip_path IS NOT NULL AND final_zip_path != ''");
    $db_paths = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Find orphaned files (exist on disk but not in DB)
    foreach ($zip_files as $file) {
        if (!in_array($file, $db_paths)) {
            $orphaned_files[] = $file;
        }
    }
    
    // Delete orphaned files
    $deleted_count = 0;
    foreach ($orphaned_files as $file) {
        if (unlink($file)) {
            echo "Deleted orphaned file: " . basename($file) . "\n";
            error_log("[Cron ZIP Cleanup] Deleted orphaned file: {$file}");
            $deleted_count++;
        } else {
            error_log("[Cron ZIP Cleanup] Failed to delete orphaned file: {$file}");
        }
    }
    
    return $deleted_count;
}

function cleanup_stale_records($pdo) {
    echo "Checking for stale database records...\n";
    
    // Find records where final_zip_path exists but file is missing
    $stmt = $pdo->query("SELECT id, job_token, final_zip_path FROM zip_jobs WHERE final_zip_path IS NOT NULL AND final_zip_path != ''");
    $stale_records = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (!file_exists($row['final_zip_path'])) {
            $stale_records[] = $row;
        }
    }
    
    // Clean up stale records
    $cleaned_count = 0;
    foreach ($stale_records as $record) {
        $update_stmt = $pdo->prepare("UPDATE zip_jobs SET final_zip_path = NULL, final_zip_name = NULL, zip_filename = NULL, zip_filesize = NULL WHERE id = ?");
        if ($update_stmt->execute([$record['id']])) {
            echo "Cleaned stale record for job ID {$record['id']} (Token: {$record['job_token']})\n";
            error_log("[Cron ZIP Cleanup] Cleaned stale record for job ID {$record['id']} (Token: {$record['job_token']})");
            $cleaned_count++;
        }
    }
    
    return $cleaned_count;
}

// --- Main Logic ---
try {
    // For MySQL/MariaDB, use NOW() - INTERVAL X MINUTE against created_at
    $cleanup_threshold_sql = "(NOW() - INTERVAL {$cleanup_interval_minutes} MINUTE)";

    // Define all statuses that mean "don't process this job anymore"
    $terminal_statuses_for_cron = [
        'cleaned', 
        STATUS_CLEANED_BY_TIMEOUT, 
        STATUS_CLEANUP_FAILED_DELETE, 
        STATUS_CLEANUP_FAILED_UNREADABLE
    ];
    // $terminal_statuses_placeholders is defined later, just before the main query

    // Log DB Current Time and Threshold (moved earlier for debug block)
    $times = ['current_db_time' => 'N/A', 'threshold_time' => 'N/A']; // Initialize to avoid errors if DB query fails
    try {
        $current_db_time_stmt = $pdo->query("SELECT NOW() as current_db_time, {$cleanup_threshold_sql} as threshold_time");
        $times_result = $current_db_time_stmt->fetch(PDO::FETCH_ASSOC);
        if ($times_result) {
            $times = $times_result;
        }
        error_log("[Cron ZIP Cleanup] DB Current Time: {$times['current_db_time']}, Calculated Threshold: {$times['threshold_time']}");
    } catch (PDOException $e) {
        error_log("[Cron ZIP Cleanup] Warning: Could not fetch DB time for logging: " . $e->getMessage());
    }

    // Debug specific job: Set $debug_job_id_to_check = job_id to debug

    $terminal_statuses_placeholders = implode(',', array_fill(0, count($terminal_statuses_for_cron), '?'));

    // Select jobs that are older than the interval, have a zip path, and are not already in a terminal state.
    // Also select cleanup_attempts.
    $sql_get_old_zips =
        "SELECT id, job_token, final_zip_path, created_at, status, cleanup_attempts FROM zip_jobs " .
        "WHERE final_zip_path IS NOT NULL AND final_zip_path != '' " .
        "AND created_at < {$cleanup_threshold_sql} " .
        "AND status NOT IN ({$terminal_statuses_placeholders})";
    
    error_log("[Cron ZIP Cleanup] Executing SQL to find jobs based on creation time: " . $sql_get_old_zips);


    $stmt_get_zips = $pdo->prepare($sql_get_old_zips);
    if (!$stmt_get_zips->execute($terminal_statuses_for_cron)) {
        $error_info = $stmt_get_zips->errorInfo();
        error_log("[Cron ZIP Cleanup] CRITICAL: SQL execution failed for getting old zips. SQL: {$sql_get_old_zips} Params: " . implode(', ', $terminal_statuses_for_cron) . " Error: " . print_r($error_info, true));
        echo "[Cron ZIP Cleanup] CRITICAL: SQL execution failed. Check logs.\n";
        $jobs_to_cleanup = []; // Ensure it's an empty array so script can exit gracefully or handle as no jobs
    } else {
    $jobs_to_cleanup = $stmt_get_zips->fetchAll(PDO::FETCH_ASSOC);
    }

    error_log("[Cron ZIP Cleanup] Found " . count($jobs_to_cleanup) . " ZIP job(s) to process for cleanup (based on creation time).");

    if (empty($jobs_to_cleanup)) {
        echo "No ZIP files found ready for cleanup based on creation time.\n";
        exit(0);
    }

    echo "Found " . count($jobs_to_cleanup) . " ZIP job(s) to process for cleanup.\n";
    $cleaned_count = 0;
    $error_count = 0;

    // --- Healing Step: Mark broken jobs as cleaned_by_timeout ---
    try {
        $sql_heal_broken = "UPDATE zip_jobs SET status = ?, result_message = ?, final_zip_path = NULL, cleanup_attempts = cleanup_attempts + 1, updated_at = NOW() WHERE (final_zip_path IS NULL OR final_zip_path = '') AND status = 'completed'";
        $stmt_heal = $pdo->prepare($sql_heal_broken);
        $msg = "Healed by cron: completed job missing final_zip_path at " . date('Y-m-d H:i:s');
        $stmt_heal->execute([STATUS_CLEANED_BY_TIMEOUT, $msg]);
        $healed_count = $stmt_heal->rowCount();
        if ($healed_count > 0) {
            error_log("[Cron ZIP Cleanup] Healed {$healed_count} broken completed jobs missing final_zip_path.");
            echo "Healed {$healed_count} broken completed jobs missing final_zip_path.\n";
        }
    } catch (Throwable $e) {
        error_log("[Cron ZIP Cleanup] Healing step failed: " . $e->getMessage());
    }

    // Add new cleanup steps before processing jobs
    $orphaned_deleted = cleanup_orphaned_files($pdo, ZIP_CACHE_DIR);
    $stale_cleaned = cleanup_stale_records($pdo);
    
    echo "Cleanup summary:\n";
    echo "- Deleted {$orphaned_deleted} orphaned ZIP files\n";
    echo "- Cleaned {$stale_cleaned} stale database records\n";

    foreach ($jobs_to_cleanup as $job) {
        $job_id = $job['id'];
        $job_token = $job['job_token'];
        $zip_filepath_from_db = $job['final_zip_path'];
        $created_at_from_db = $job['created_at'];
        $current_status_from_db = $job['status'];
        $cleanup_attempts_from_db = (int)$job['cleanup_attempts'];

        error_log("[Cron ZIP Cleanup] Processing Job ID: {$job_id}, Token: {$job_token}, Created At: {$created_at_from_db}, Current Status: {$current_status_from_db}, Path: '{$zip_filepath_from_db}', Attempts: {$cleanup_attempts_from_db}");

        // final_zip_path should have been checked by SQL, but double check
        if (empty($zip_filepath_from_db)) {
            error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) met time criteria but final_zip_path is empty. Skipping file deletion, attempting to update status to '" . STATUS_CLEANED_BY_TIMEOUT . "'.");
            try {
                // Update status, set final_zip_path to NULL, and add a result message
                $stmt_mark_cleaned = $pdo->prepare(
                    "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ? " .
                    "WHERE id = ? AND status NOT IN (" . implode(',', array_fill(0, count($terminal_statuses_for_cron), '?')) . ")"
                );
                $message = "Cleaned by timeout (final_zip_path was empty) at " . date('Y-m-d H:i:s');
                $params = array_merge([STATUS_CLEANED_BY_TIMEOUT, $message, $job_id], $terminal_statuses_for_cron);
                if ($stmt_mark_cleaned->execute($params) && $stmt_mark_cleaned->rowCount() > 0) {
                    echo "Marked job ID {$job_id} as '" . STATUS_CLEANED_BY_TIMEOUT . "' due to missing final_zip_path.
";
                    error_log("[Cron ZIP Cleanup] Marked job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' due to missing final_zip_path.");
                    $cleaned_count++;
                } else {
                    error_log("[Cron ZIP Cleanup] Failed to mark job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' for missing path or already appropriately processed. Error: " . print_r($stmt_mark_cleaned->errorInfo(), true));
                }
            } catch (PDOException $e) {
                error_log("[Cron ZIP Cleanup] PDOException while trying to mark job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' for missing path: " . $e->getMessage());
            }
            continue; 
        } 

        $zip_filepath_to_delete = $zip_filepath_from_db; 

        error_log("[Cron ZIP Cleanup] Checking file for deletion by creation time: '{$zip_filepath_to_delete}' for job token {$job_token}");

        if (is_file($zip_filepath_to_delete) && is_readable($zip_filepath_to_delete)) {
            echo "Attempting to delete ZIP file (due to age): {$zip_filepath_to_delete} for job token {$job_token}
";
            error_log("[Cron ZIP Cleanup] Attempting to delete ZIP file (due to age): {$zip_filepath_to_delete} for job token {$job_token}");
            
            if (unlink($zip_filepath_to_delete)) {
                echo "Successfully deleted ZIP file: {$zip_filepath_to_delete}
";
                error_log("[Cron ZIP Cleanup] Successfully deleted ZIP file: {$zip_filepath_to_delete} for job token {$job_token}");
                
                try {
                    $stmt_mark_cleaned = $pdo->prepare(
                        "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ?, cleanup_attempts = ? " .
                        "WHERE id = ? AND status NOT IN (" . implode(',', array_fill(0, count($terminal_statuses_for_cron), '?')) . ")"
                    );
                    $message = "File deleted and job cleaned by timeout at " . date('Y-m-d H:i:s');
                    $params = array_merge([STATUS_CLEANED_BY_TIMEOUT, $message, $cleanup_attempts_from_db, $job_id], $terminal_statuses_for_cron);

                    if ($stmt_mark_cleaned->execute($params) && $stmt_mark_cleaned->rowCount() > 0) {
                        echo "Successfully marked job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' in database.
";
                        error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' in database.");
                        $cleaned_count++;
                    } else {
                        $error_count++;
                        $db_error_message = "Failed to mark job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "' in database (or already processed).";
                        echo "ERROR: {$db_error_message}
";
                        error_log("[Cron ZIP Cleanup] ERROR: {$db_error_message} - SQL Error: " . print_r($stmt_mark_cleaned->errorInfo(), true));
                    }
                } catch (PDOException $e) {
                    $error_count++;
                    $pdo_error_message = "PDOException while marking job ID {$job_id} (Token: {$job_token}) as '" . STATUS_CLEANED_BY_TIMEOUT . "': " . $e->getMessage();
                    echo "ERROR: {$pdo_error_message}
";
                    error_log("[Cron ZIP Cleanup] ERROR: {$pdo_error_message}");
                }
            } else { // unlink failed
                $error_count++;
                $current_attempts = $cleanup_attempts_from_db + 1;
                $error_message = "Failed to delete ZIP file (unlink failed): {$zip_filepath_to_delete} for job token {$job_token}. Attempt #{$current_attempts}. Check permissions.";
                echo "ERROR: {$error_message}
";
                error_log("[Cron ZIP Cleanup] ERROR: {$error_message}");

                if ($current_attempts >= MAX_CLEANUP_ATTEMPTS) {
                    $final_status = STATUS_CLEANUP_FAILED_DELETE;
                    $result_msg = "Failed to delete file after {$current_attempts} attempts. Path: {$zip_filepath_to_delete}. Last attempt: " . date('Y-m-d H:i:s');
                    error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) reached max delete attempts. Setting status to '{$final_status}'.");
                    try {
                        $stmt_mark_failed = $pdo->prepare(
                            "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ?, cleanup_attempts = ? " .
                            "WHERE id = ? AND status NOT IN (" . implode(',', array_fill(0, count($terminal_statuses_for_cron), '?')) . ")"
                        );
                        $params = array_merge([$final_status, $result_msg, $current_attempts, $job_id], $terminal_statuses_for_cron);
                        if ($stmt_mark_failed->execute($params) && $stmt_mark_failed->rowCount() > 0) {
                           error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} as '{$final_status}'.");
                        } else {
                             error_log("[Cron ZIP Cleanup] Failed to mark job ID {$job_id} as '{$final_status}' or already processed. Error: " . print_r($stmt_mark_failed->errorInfo(), true));
                        }
                    } catch (PDOException $e) {
                        error_log("[Cron ZIP Cleanup] PDOException while marking job ID {$job_id} as '{$final_status}': " . $e->getMessage());
                    }
                } else { // Increment attempt counter
                    try {
                        $stmt_update_attempts = $pdo->prepare(
                            "UPDATE zip_jobs SET cleanup_attempts = ?, result_message = ? WHERE id = ?"
                        );
                        $retry_msg = "File deletion failed. Will retry. Attempt {$current_attempts} at " . date('Y-m-d H:i:s') . ". Path: {$zip_filepath_to_delete}";
                        if ($stmt_update_attempts->execute([$current_attempts, $retry_msg, $job_id])) {
                            error_log("[Cron ZIP Cleanup] Incremented cleanup_attempts to {$current_attempts} for job ID {$job_id}.");
                        } else {
                            error_log("[Cron ZIP Cleanup] Failed to increment cleanup_attempts for job ID {$job_id}. Error: " . print_r($stmt_update_attempts->errorInfo(), true));
                        }
                    } catch (PDOException $e) {
                        error_log("[Cron ZIP Cleanup] PDOException while incrementing cleanup_attempts for job ID {$job_id}: " . $e->getMessage());
                    }
                }
                continue; 
            }
        } else { // File not found or not readable or not a file
            $current_attempts = $cleanup_attempts_from_db + 1;
            $file_exists = file_exists($zip_filepath_to_delete);
            $is_file = $file_exists ? is_file($zip_filepath_to_delete) : false;
            $is_readable = $is_file ? is_readable($zip_filepath_to_delete) : false;
            
            $reason = "";
            if (!$file_exists) {
                $reason = "File does not exist";
                error_log("[Cron ZIP Cleanup] File does not exist: '{$zip_filepath_to_delete}' for job {$job_id}.");
                // If file doesn't exist, treat as cleaned.
                $status_to_set = STATUS_CLEANED_BY_TIMEOUT;
                $message = "File was missing, job cleaned by timeout at " . date('Y-m-d H:i:s') . ". Path: {$zip_filepath_to_delete}";
                error_log("[Cron ZIP Cleanup] ZIP file '{$zip_filepath_to_delete}' not found for job token {$job_token}. Assuming already deleted. Marking as '{$status_to_set}'.");
            try {
                $stmt_mark_cleaned_missing = $pdo->prepare(
                        "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ?, cleanup_attempts = ? " .
                        "WHERE id = ? AND status NOT IN (" . implode(',', array_fill(0, count($terminal_statuses_for_cron), '?')) . ")"
                    );
                    $params = array_merge([$status_to_set, $message, $cleanup_attempts_from_db, $job_id], $terminal_statuses_for_cron);
                    if ($stmt_mark_cleaned_missing->execute($params) && $stmt_mark_cleaned_missing->rowCount() > 0) {
                        echo "Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$status_to_set}' (file was missing).
";
                        error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} (Token: {$job_token}) as '{$status_to_set}' (file was missing).");
                    $cleaned_count++; 
                } else {
                        echo "Job ID {$job_id} (Token: {$job_token}) already processed or failed to mark as '{$status_to_set}' (file was missing). Error: " . print_r($stmt_mark_cleaned_missing->errorInfo(), true) . "
";
                        error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) already processed or failed to mark as '{$status_to_set}' (file was missing, rowCount 0 or execute failed).");
                         if ($stmt_mark_cleaned_missing->rowCount() > 0) $cleaned_count++; else $error_count++;
                    }
                } catch (PDOException $e) {
                    $error_count++;
                    $pdo_error_message = "PDOException while marking missing file job ID {$job_id} (Token: {$job_token}) as '{$status_to_set}': " . $e->getMessage();
                    echo "ERROR: {$pdo_error_message}
";
                    error_log("[Cron ZIP Cleanup] ERROR: {$pdo_error_message}");
                }
            } else { // File exists, but is not a file or not readable
                if (!$is_file) $reason = "Path is not a file";
                else if (!$is_readable) $reason = "File is not readable (check permissions)";
                else $reason = "Unknown reason for is_file/is_readable returning false";
                
                error_log("[Cron ZIP Cleanup] Problem with file '{$zip_filepath_to_delete}' for job {$job_id}: {$reason}. Attempt #{$current_attempts}.");
                echo "Problem with file '{$zip_filepath_to_delete}' for job {$job_id}: {$reason}. Attempt #{$current_attempts}.
";
                $error_count++;

                if ($current_attempts >= MAX_CLEANUP_ATTEMPTS) {
                    $final_status = STATUS_CLEANUP_FAILED_UNREADABLE;
                    $result_msg = "File problematic ({$reason}) after {$current_attempts} attempts. Path: {$zip_filepath_to_delete}. Last attempt: " . date('Y-m-d H:i:s');
                    error_log("[Cron ZIP Cleanup] Job ID {$job_id} (Token: {$job_token}) reached max attempts for unreadable/non-file. Setting status to '{$final_status}'.");
                     try {
                        $stmt_mark_failed = $pdo->prepare(
                            "UPDATE zip_jobs SET status = ?, final_zip_path = NULL, result_message = ?, cleanup_attempts = ? " .
                            "WHERE id = ? AND status NOT IN (" . implode(',', array_fill(0, count($terminal_statuses_for_cron), '?')) . ")"
                        );
                        $params = array_merge([$final_status, $result_msg, $current_attempts, $job_id], $terminal_statuses_for_cron);
                        if ($stmt_mark_failed->execute($params) && $stmt_mark_failed->rowCount() > 0) {
                           error_log("[Cron ZIP Cleanup] Successfully marked job ID {$job_id} as '{$final_status}'.");
                        } else {
                           error_log("[Cron ZIP Cleanup] Failed to mark job ID {$job_id} as '{$final_status}' or already processed. Error: " . print_r($stmt_mark_failed->errorInfo(), true));
                        }
                    } catch (PDOException $e) {
                        error_log("[Cron ZIP Cleanup] PDOException while marking job ID {$job_id} as '{$final_status}': " . $e->getMessage());
                    }
                } else { // Increment attempt counter for problematic file
                    try {
                        $stmt_update_attempts = $pdo->prepare(
                            "UPDATE zip_jobs SET cleanup_attempts = ?, result_message = ? WHERE id = ?"
                        );
                        $retry_msg = "File problematic ({$reason}). Will retry. Attempt {$current_attempts} at " . date('Y-m-d H:i:s') . ". Path: {$zip_filepath_to_delete}";
                        if ($stmt_update_attempts->execute([$current_attempts, $retry_msg, $job_id])) {
                            error_log("[Cron ZIP Cleanup] Incremented cleanup_attempts to {$current_attempts} for problematic file, job ID {$job_id}.");
                        } else {
                            error_log("[Cron ZIP Cleanup] Failed to increment cleanup_attempts for problematic file, job ID {$job_id}. Error: " . print_r($stmt_update_attempts->errorInfo(), true));
                        }
                    } catch (PDOException $e) {
                        error_log("[Cron ZIP Cleanup] PDOException while incrementing cleanup_attempts for problematic file, job ID {$job_id}: " . $e->getMessage());
                    }
                }
            }
        }
        echo "----
";
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