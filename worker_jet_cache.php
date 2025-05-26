<?php
// worker_jet_cache.php - Simplified RAW cache worker (750px only)

echo "Jet Cache Worker Started - " . date('Y-m-d H:i:s') . "\n";

// --- Environment Setup ---
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/worker_jet_php_error.log');

// Increase limits for RAW processing
set_time_limit(0);
ini_set('memory_limit', '2048M');

// Include necessary files
try {
    require_once __DIR__ . '/db_connect.php';
    if (!$pdo) {
        throw new Exception("Database connection failed in worker.");
    }
    require_once __DIR__ . '/api/helpers.php';
} catch (Throwable $e) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[{$timestamp}] [Jet Worker Init Error] Failed to include required files: " . $e->getMessage());
    echo "[{$timestamp}] [Jet Worker Init Error] Worker failed to initialize.\n";
    exit(1);
}

// Reset stuck processing jobs on startup
try {
    $sql_reset = "UPDATE jet_cache_jobs SET status = 'pending' WHERE status = 'processing'";
    $stmt_reset = $pdo->prepare($sql_reset);
    $affected_rows = $stmt_reset->execute() ? $stmt_reset->rowCount() : 0;
    if ($affected_rows > 0) {
        $reset_timestamp = date('Y-m-d H:i:s');
        echo "[{$reset_timestamp}] Reset {$affected_rows} stuck 'processing' jobs back to 'pending'.\n";
        error_log("[{$reset_timestamp}] [Jet Worker Startup] Reset {$affected_rows} stuck 'processing' jobs back to 'pending'.");
    }
} catch (Throwable $e) {
    $reset_fail_timestamp = date('Y-m-d H:i:s');
    echo "[{$reset_fail_timestamp}] Failed to reset processing jobs: " . $e->getMessage() . "\n";
    error_log("[{$reset_fail_timestamp}] [Jet Worker Startup Error] Failed to reset processing jobs: " . $e->getMessage());
}

// Worker variables
$sleep_interval = 3;
$running = true;

// Signal handling for graceful shutdown
if (function_exists('pcntl_signal')) {
    declare(ticks = 1);
    function signal_handler($signo) {
        global $running;
        $timestamp = date('Y-m-d H:i:s');
        echo "\n[{$timestamp}] Received signal {$signo}. Shutting down gracefully...\n";
        error_log("[{$timestamp}] [Jet Worker Signal] Received signal {$signo}. Initiating shutdown.");
        $running = false;
    }
    pcntl_signal(SIGTERM, 'signal_handler');
    pcntl_signal(SIGINT, 'signal_handler');
}

// Main worker loop
echo "Entering Jet cache worker loop (750px only)...\n";
while ($running) {
    $job = null;
    try {
        // Get next pending job
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

            $timestamp = date('Y-m-d H:i:s');
            echo "[{$timestamp}] [Job {$job_id}] Processing: {$source_key}/{$image_relative_path} (size: {$cache_size})\n";
            error_log("[{$timestamp}] [Jet Job {$job_id}] Found job. Source: {$source_key}, Path: {$image_relative_path}, Size: {$cache_size}");

            // Update status to processing
            $worker_id = gethostname() . "_" . getmypid();
            $sql_update = "UPDATE jet_cache_jobs SET status = 'processing', processed_at = ?, worker_id = ? WHERE id = ?";
            $stmt_update = $pdo->prepare($sql_update);
            $stmt_update->execute([time(), $worker_id, $job_id]);

            $job_success = true;
            $job_result_message = '';
            
            // Validate RAW source
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

            // Get cache path using helper function
            $cached_preview_full_path = get_jet_cache_path($source_key, $image_relative_path, $cache_size);
            $cache_dir_path = dirname($cached_preview_full_path);

            error_log("[{$timestamp}] [Jet Job {$job_id}] RAW file: {$full_raw_file_path_realpath}");
            error_log("[{$timestamp}] [Jet Job {$job_id}] Cache path: {$cached_preview_full_path}");

            // Create cache directory if needed
            if (!is_dir($cache_dir_path)) {
                if (!@mkdir($cache_dir_path, 0775, true)) {
                    throw new Exception("Failed to create cache directory: {$cache_dir_path}");
                }
            }

            // Check if file already exists and verify it's valid
            if (file_exists($cached_preview_full_path) && filesize($cached_preview_full_path) > 0) {
                echo "[{$timestamp}] [Job {$job_id}] Cache file already exists. Skipping processing.\n";
                error_log("[{$timestamp}] [Jet Job {$job_id}] Cache file already exists. Skipping processing.");
                $job_result_message = "Cache file already existed.";
            } else {
                // Process RAW file
                try {
                    $dcraw_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "dcraw.exe";
                    $magick_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "magick.exe";
                    
                    $escaped_final_cache_path = escapeshellarg($cached_preview_full_path);

                    // Two-step conversion using temporary PPM file
                    $temp_ppm_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_worker_temp_' . uniqid() . '.ppm';
                    $escaped_temp_ppm_path = escapeshellarg($temp_ppm_filename);

                    // Step 1: Convert RAW to temporary PPM file
                    $dcraw_to_ppm_cmd = "\"{$dcraw_executable_path}\" -c \"{$full_raw_file_path_realpath}\" > {$escaped_temp_ppm_path} 2>&1";
                    echo "[{$timestamp}] [Job {$job_id}] Executing dcraw...\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Executing Step 1 (dcraw to PPM). CMD: {$dcraw_to_ppm_cmd}");
                    $dcraw_output = shell_exec($dcraw_to_ppm_cmd);
                    $trimmed_dcraw_output = is_string($dcraw_output) ? trim($dcraw_output) : '';

                    if (!file_exists($temp_ppm_filename) || filesize($temp_ppm_filename) === 0) {
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Step 1 FAILED: dcraw did not create PPM file or PPM is empty. dcraw output: " . ($trimmed_dcraw_output ?: "EMPTY"));
                        if (file_exists($temp_ppm_filename)) { @unlink($temp_ppm_filename); }
                        throw new Exception("RAW processing step 1 failed (dcraw). Output: " . $trimmed_dcraw_output);
                    }
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Step 1 SUCCESS: dcraw created PPM file: {$temp_ppm_filename}. Size: " . filesize($temp_ppm_filename));

                    // Step 2: Convert PPM to final JPG with height constraint for consistent height
                    $magick_ppm_to_jpg_cmd = "\"{$magick_executable_path}\" convert {$escaped_temp_ppm_path} -resize x{$cache_size} -quality 85 {$escaped_final_cache_path} 2>&1";
                    echo "[{$timestamp}] [Job {$job_id}] Executing ImageMagick resize...\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Executing Step 2 (PPM to JPG). CMD: {$magick_ppm_to_jpg_cmd}");
                    $magick_output = shell_exec($magick_ppm_to_jpg_cmd);
                    $trimmed_magick_output = is_string($magick_output) ? trim($magick_output) : '';

                    // Clean up temporary file immediately
                    if (file_exists($temp_ppm_filename)) {
                        @unlink($temp_ppm_filename);
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Temporary PPM file {$temp_ppm_filename} deleted.");
                    }

                    if (!file_exists($cached_preview_full_path) || filesize($cached_preview_full_path) === 0) {
                        error_log("[{$timestamp}] [Jet Job {$job_id}] Step 2 FAILED: ImageMagick did not create final JPG or JPG is empty. Magick output: " . ($trimmed_magick_output ?: "EMPTY"));
                        throw new Exception("RAW processing step 2 failed (ImageMagick). Output: " . $trimmed_magick_output);
                    }
                    
                    echo "[{$timestamp}] [Job {$job_id}] SUCCESS: Created cache file: {$cached_preview_full_path}\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Step 2 SUCCESS: ImageMagick created final JPG: {$cached_preview_full_path}");
                    $job_result_message = "RAW cache created successfully.";

                    // Store cache path and dimensions for metadata
                    $original_dims = @getimagesize($cached_preview_full_path);
                    if ($original_dims) {
                        $sql_update_dims = "UPDATE jet_cache_jobs SET original_width = ?, original_height = ?, final_cache_path = ? WHERE id = ?";
                        $stmt_update_dims = $pdo->prepare($sql_update_dims);
                        $stmt_update_dims->execute([$original_dims[0], $original_dims[1], $cached_preview_full_path, $job_id]);
                    } else {
                        $sql_update_path = "UPDATE jet_cache_jobs SET final_cache_path = ? WHERE id = ?";
                        $stmt_update_path = $pdo->prepare($sql_update_path);
                        $stmt_update_path->execute([$cached_preview_full_path, $job_id]);
                    }

                } catch (Throwable $process_e) {
                    echo "[{$timestamp}] [Job {$job_id}] EXCEPTION: " . $process_e->getMessage() . "\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Processing exception: " . $process_e->getMessage());
                    $job_result_message = "Exception during RAW processing: " . $process_e->getMessage();
                    $job_success = false;
                }
            }

            // Update final job status
            $final_status = $job_success ? 'completed' : 'failed';
            $sql_finish = "UPDATE jet_cache_jobs SET status = ?, completed_at = ?, result_message = ? WHERE id = ?";
            $stmt_finish = $pdo->prepare($sql_finish);
            $stmt_finish->execute([$final_status, time(), $job_result_message, $job_id]); 
            echo "[{$timestamp}] [Job {$job_id}] Marked as {$final_status}.\n";
            error_log("[{$timestamp}] [Jet Job {$job_id}] Job completed with status: {$final_status}");

        } else {
            // No jobs found, sleep and continue
            sleep($sleep_interval);
        }

    } catch (Throwable $e) {
        $error_timestamp = date('Y-m-d H:i:s');
        echo "[{$error_timestamp}] [Worker Error] " . $e->getMessage() . "\n";
        error_log("[{$error_timestamp}] [Jet Worker Error] " . $e->getMessage());
        
        // If we have a job, mark it as failed
        if ($job && isset($job['id'])) {
            try {
                $sql_fail = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = ? WHERE id = ?";
                $stmt_fail = $pdo->prepare($sql_fail);
                $stmt_fail->execute([time(), "Worker error: " . $e->getMessage(), $job['id']]);
            } catch (Throwable $fail_e) {
                error_log("[{$error_timestamp}] [Jet Worker Error] Failed to mark job as failed: " . $fail_e->getMessage());
            }
        }
        
        // Sleep before retrying to avoid rapid error loops
        sleep($sleep_interval);
    }
}

echo "Jet Cache Worker Shutting Down - " . date('Y-m-d H:i:s') . "\n";
error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker] Worker shutdown completed.");
?> 