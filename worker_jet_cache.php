<?php
// worker_jet_cache.php - Background worker for processing RAW image cache queue

echo "Jet Cache Worker Started - " . date('Y-m-d H:i:s') . "\n";

// --- Environment Setup ---
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors to CLI output
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/worker_jet_php_error.log'); // Separate log for worker

// Increase time and memory limits for worker
set_time_limit(0); // Run indefinitely (or set very large limit)
ini_set('memory_limit', '2048M'); // Increase for RAW processing

// Include necessary files
try {
    require_once __DIR__ . '/db_connect.php'; // DB connection, load config, define constants
    if (!$pdo) {
        throw new Exception("Database connection failed in worker.");
    }
    require_once __DIR__ . '/api/helpers.php'; // Load helper functions
} catch (Throwable $e) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[{$timestamp}] [Jet Worker Init Error] Failed to include required files: " . $e->getMessage());
    echo "[{$timestamp}] [Jet Worker Init Error] Worker failed to initialize. Check logs/worker_jet_php_error.log\n";
    exit(1); // Exit with error code
}

// +++ Reset 'processing' jobs to 'pending' on startup +++
try {
    $sql_reset = "UPDATE jet_cache_jobs SET status = 'pending' WHERE status = 'processing'";
    $stmt_reset = $pdo->prepare($sql_reset);
    $affected_rows = $stmt_reset->execute() ? $stmt_reset->rowCount() : 0;
    if ($affected_rows > 0) {
        $reset_timestamp = date('Y-m-d H:i:s');
        $message = "[{$reset_timestamp}] [Jet Worker Startup] Reset {$affected_rows} stuck 'processing' jobs back to 'pending'.";
        echo $message . "\n";
        error_log($message);
    }
} catch (Throwable $e) {
    $reset_fail_timestamp = date('Y-m-d H:i:s');
    $error_message = "[{$reset_fail_timestamp}] [Jet Worker Startup Error] Failed to reset processing jobs: " . $e->getMessage();
    echo $error_message . "\n";
    error_log($error_message);
    // Continue running even if reset fails, but log the error
}
// +++ END RESET +++

// --- Worker Variables ---
$sleep_interval = 3; // Seconds to wait between queue checks
$running = true;

// --- Signal Handling (Graceful Shutdown) ---
if (function_exists('pcntl_signal')) {
    declare(ticks = 1);
    function signal_handler($signo) {
        global $running;
        $timestamp = date('Y-m-d H:i:s');
        echo "\n[{$timestamp}] [Jet Worker Signal] Received signal {$signo}. Shutting down gracefully...\n";
        error_log("[{$timestamp}] [Jet Worker Signal] Received signal {$signo}. Initiating shutdown.");
        $running = false;
    }
    pcntl_signal(SIGTERM, 'signal_handler'); // Standard shutdown signal
    pcntl_signal(SIGINT, 'signal_handler');  // Ctrl+C signal
}

// --- Main Worker Loop ---
echo "Entering main Jet cache worker loop...\n";
while ($running) {
    $job = null;
    try {
        // --- Get Job from Queue ---
        $sql_get_job = "SELECT * FROM jet_cache_jobs 
                        WHERE status = 'pending' 
                        ORDER BY created_at ASC 
                        LIMIT 1";
        $stmt_get = $pdo->prepare($sql_get_job);
        $stmt_get->execute();
        $job = $stmt_get->fetch(PDO::FETCH_ASSOC);

        if ($job) {
            $job_id = $job['id'];
            $source_key = $job['source_key'];
            $image_relative_path = $job['image_relative_path'];
            $cache_size = $job['cache_size'];
            $raw_file_path = $job['raw_file_path'];

            $timestamp = date('Y-m-d H:i:s');
            error_log("[{$timestamp}] [Jet Job {$job_id}] Found job. Source: {$source_key}, Path: {$image_relative_path}, Size: {$cache_size}");

            usleep(100000); // Sleep for 100 milliseconds

            // --- Update status to 'processing' ---
            $sql_update_status = "UPDATE jet_cache_jobs SET status = 'processing', processed_at = ?, worker_id = ? WHERE id = ?";
            $worker_instance_id = gethostname() . "_" . getmypid(); // Unique ID for this worker instance
            if ($stmt_update = $pdo->prepare($sql_update_status)) {
                if ($stmt_update->execute([time(), $worker_instance_id, $job_id])) {
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Status updated to processing by worker {$worker_instance_id}.");
                } else {
                    error_log("[{$timestamp}] [Jet Job {$job_id}] FAILED to execute status update to processing.");
                    throw new Exception("Failed to update job status to processing for job {$job_id}.");
                }
            } else {
                error_log("[{$timestamp}] [Jet Job {$job_id}] FAILED to prepare status update query.");
                throw new Exception("Failed to prepare job status update query for job {$job_id}.");
            }

            $job_success = true;
            $job_result_message = '';
            
            // --- Validate RAW source and file path ---
            if (!isset(RAW_IMAGE_SOURCES[$source_key])) {
                throw new Exception("Invalid RAW source key: {$source_key}");
            }

            $source_config = RAW_IMAGE_SOURCES[$source_key];
            $base_raw_path = rtrim($source_config['path'], '/\\');
            
            // Construct full file path
            $full_raw_file_path = $base_raw_path . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $image_relative_path);
            $full_raw_file_path_realpath = realpath($full_raw_file_path);

            if (!$full_raw_file_path_realpath || !is_file($full_raw_file_path_realpath)) {
                throw new Exception("RAW file not found: {$full_raw_file_path}");
            }

            // Security check: ensure real path is within the source base path
            if (strpos($full_raw_file_path_realpath, realpath($base_raw_path)) !== 0) {
                throw new Exception("Path security violation for: {$full_raw_file_path_realpath}");
            }

            $raw_extension = strtolower(pathinfo($full_raw_file_path_realpath, PATHINFO_EXTENSION));
            if (!in_array($raw_extension, RAW_IMAGE_EXTENSIONS)) {
                throw new Exception("File extension '{$raw_extension}' is not an allowed RAW extension");
            }

            // --- Construct cache path using helper function ---
            $cached_preview_full_path = get_jet_cache_path($source_key, $image_relative_path, $cache_size);
            $cache_dir_path = dirname($cached_preview_full_path);

            error_log("[{$timestamp}] [Jet Job {$job_id}] RAW file: {$full_raw_file_path_realpath}");
            error_log("[{$timestamp}] [Jet Job {$job_id}] Cache path: {$cached_preview_full_path}");

            // Create cache directory if it doesn't exist
            if (!is_dir($cache_dir_path)) {
                if (!@mkdir($cache_dir_path, 0775, true)) {
                    throw new Exception("Failed to create cache directory: {$cache_dir_path}");
                }
            }

            // --- Process RAW file ---
            if (file_exists($cached_preview_full_path) && filesize($cached_preview_full_path) > 0) {
                error_log("[{$timestamp}] [Jet Job {$job_id}] Cache file already exists. Skipping processing.");
                $job_result_message = "Cache file already existed.";
            } else {
                try {
                    // Define paths to dcraw and ImageMagick (now in exe folder)
                    $dcraw_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "dcraw.exe";
                    $magick_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "magick.exe";
                    
                    $escaped_final_cache_path = escapeshellarg($cached_preview_full_path);

                    // Two-step conversion using temporary PPM file
                    $temp_ppm_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_worker_temp_' . uniqid() . '.ppm';
                    $escaped_temp_ppm_path = escapeshellarg($temp_ppm_filename);

                    // Step 1: Convert RAW to temporary PPM file
                    $dcraw_to_ppm_cmd = "\"{$dcraw_executable_path}\" -c \"{$full_raw_file_path_realpath}\" > {$escaped_temp_ppm_path} 2>&1";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Executing Step 1 (dcraw to PPM). CMD: {$dcraw_to_ppm_cmd}");
                    $dcraw_output = shell_exec($dcraw_to_ppm_cmd);
                    $trimmed_dcraw_output = is_string($dcraw_output) ? trim($dcraw_output) : '';

                    if (!file_exists($temp_ppm_filename) || filesize($temp_ppm_filename) === 0) {
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Step 1 FAILED: dcraw did not create PPM file or PPM is empty. Temp PPM: {$temp_ppm_filename}. dcraw output: " . ($trimmed_dcraw_output ?: "EMPTY"));
                        if (file_exists($temp_ppm_filename)) { @unlink($temp_ppm_filename); }
                        throw new Exception("RAW processing step 1 failed (dcraw). Output: " . $trimmed_dcraw_output);
                    }
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Step 1 SUCCESS: dcraw created PPM file: {$temp_ppm_filename}. Size: " . filesize($temp_ppm_filename));

                    // Step 2: Convert temporary PPM to final JPG
                    // Use resize with height as the constraint for consistent height across all images
                    $magick_ppm_to_jpg_cmd = "\"{$magick_executable_path}\" convert {$escaped_temp_ppm_path} -resize x{$cache_size} -quality 85 {$escaped_final_cache_path} 2>&1";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Executing Step 2 (PPM to JPG). CMD: {$magick_ppm_to_jpg_cmd}");
                    $magick_output = shell_exec($magick_ppm_to_jpg_cmd);
                    $trimmed_magick_output = is_string($magick_output) ? trim($magick_output) : '';

                    // Clean up temporary PPM file immediately
                    if (file_exists($temp_ppm_filename)) {
                        @unlink($temp_ppm_filename);
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Temporary PPM file {$temp_ppm_filename} deleted.");
                    }

                    if (!file_exists($cached_preview_full_path) || filesize($cached_preview_full_path) === 0) {
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Step 2 FAILED: ImageMagick did not create final JPG or JPG is empty. Final JPG: {$cached_preview_full_path}. Magick output: " . ($trimmed_magick_output ?: "EMPTY"));
                        throw new Exception("RAW processing step 2 failed (ImageMagick). Output: " . $trimmed_magick_output);
                    }
                    
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Step 2 SUCCESS: ImageMagick created final JPG: {$cached_preview_full_path}");
                    $job_result_message = "RAW preview cache created successfully.";

                    // Store original dimensions (from PPM or try to get from RAW)
                    $original_dims = @getimagesize($cached_preview_full_path);
                    if ($original_dims) {
                        $sql_update_dims = "UPDATE jet_cache_jobs SET original_width = ?, original_height = ?, final_cache_path = ? WHERE id = ?";
                        $stmt_update_dims = $pdo->prepare($sql_update_dims);
                        if ($stmt_update_dims->execute([$original_dims[0], $original_dims[1], $cached_preview_full_path, $job_id])) {
                            error_log("[{$timestamp}] [Jet Job {$job_id}] Stored cache path and dimensions for {$image_relative_path}.");
                        } else {
                            error_log("[{$timestamp}] [Jet Job {$job_id}] FAILED to store cache path and dimensions for {$image_relative_path}.");
                        }
                    } else {
                        error_log("[{$timestamp}] [Jet Job {$job_id}] WARNING: Could not get dimensions for cache file. Storing cache path only.");
                        $sql_update_path = "UPDATE jet_cache_jobs SET final_cache_path = ? WHERE id = ?";
                        $stmt_update_path = $pdo->prepare($sql_update_path);
                        $stmt_update_path->execute([$cached_preview_full_path, $job_id]);
                    }

                } catch (Throwable $process_e) {
                    error_log("[{$timestamp}] [Jet Job {$job_id}] EXCEPTION during RAW processing: " . $process_e->getMessage());
                    $job_result_message = "Exception during RAW processing: " . $process_e->getMessage();
                    $job_success = false;
                }
            }

            // --- Update final job status ---
            $final_status = $job_success ? 'completed' : 'failed';

            $sql_finish = "UPDATE jet_cache_jobs SET status = ?, completed_at = ?, result_message = ? WHERE id = ?";
            $stmt_finish = $pdo->prepare($sql_finish);
            $stmt_finish->execute([$final_status, time(), $job_result_message, $job_id]); 
            echo "[{$timestamp}] [Jet Job {$job_id}] Marked job as {$final_status}.\n";

        } else {
            // No jobs found, sleep
            sleep($sleep_interval);
        }

    } catch (Throwable $e) {
        $timestamp = date('Y-m-d H:i:s');
        $error_msg = "[{$timestamp}] [Jet Worker Error] " . $e->getMessage();
        error_log($error_msg);
        echo $error_msg . "\n";
        
        if ($job) {
            // Mark current job as failed
            try {
                $fail_sql = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = ? WHERE id = ?";
                $fail_stmt = $pdo->prepare($fail_sql);
                $fail_stmt->execute([time(), "Worker error: " . $e->getMessage(), $job['id']]);
                echo "[{$timestamp}] [Jet Job {$job['id']}] Marked job as failed due to worker error.\n";
            } catch (Throwable $fail_e) {
                error_log("[{$timestamp}] [Jet Worker] Failed to mark job as failed: " . $fail_e->getMessage());
            }
        }
        
        // Sleep before continuing to avoid rapid error loops
        sleep($sleep_interval);
    }
}

echo "\nJet Cache Worker shutting down - " . date('Y-m-d H:i:s') . "\n";
?> 