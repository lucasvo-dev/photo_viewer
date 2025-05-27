<?php
// worker_jet_cache.php - Enhanced RAW cache worker with libvips priority and dcraw fallback

echo "Enhanced Jet Cache Worker Started - " . date('Y-m-d H:i:s') . "\n";

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

// --- Configuration Constants ---
const JPEG_QUALITY = 90;
const JPEG_STRIP_METADATA = true;
const VIPS_KERNEL = 'lanczos3'; // High-quality resampling kernel

// New VIPS specific processing options
const VIPS_USE_LINEAR_PROCESSING = true; // Use for high quality, but can be slower
const VIPS_APPLY_SHARPENING = true;      // Whether to apply sharpening
const VIPS_SHARPEN_SIGMA = 0.75;         // Sharpening strength (lower is less, e.g., 0.5 to 1.0)
// VIPS_SHARPEN_M1 and M2 are not directly used by vipsthumbnail's simple --sharpen sigma

// New VIPS specific JPEG output options (complementing JPEG_QUALITY and JPEG_STRIP_METADATA)
const VIPS_JPEG_OPTIMIZE_CODING = true;
const VIPS_JPEG_INTERLACE = true;

// --- Executable Paths ---
$vips_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "vips" . DIRECTORY_SEPARATOR . "bin" . DIRECTORY_SEPARATOR . "vips.exe"; // Changed back to vips.exe
$dcraw_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "dcraw.exe";
$magick_executable_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "magick.exe";

// --- Database Reconnect Configuration ---
const MAX_DB_RECONNECT_ATTEMPTS = 1;
const MYSQL_ERROR_CODE_SERVER_GONE_AWAY = 2006;
const MYSQL_ERROR_CODE_LOST_CONNECTION = 2013;

/**
 * Global PDO instance, to be managed by connect/reconnect logic.
 * @var PDO|null $pdo
 */

/**
 * Establishes or re-establishes the database connection.
 * This function relies on db_connect.php to set the global $pdo variable.
 */
function ensure_db_connection() {
    global $pdo;
    if (!$pdo || !$pdo->query('SELECT 1')) { // Check if connection is live
        error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker DB] Attempting to connect/reconnect to database...");
        // db_connect.php should set the global $pdo
        // Ensure db_connect.php can be re-included or its connection logic re-run
        // For simplicity, assuming it can be re-required if $pdo is not an object or connection dead
        if (file_exists(__DIR__ . '/db_connect.php')) {
            require __DIR__ . '/db_connect.php'; 
        }
        if (!$pdo) {
            $timestamp = date('Y-m-d H:i:s');
            $error_msg = "[{$timestamp}] [Jet Worker DB Error] CRITICAL: Failed to establish database connection after attempt.";
            error_log($error_msg);
            echo $error_msg . "\n";
            // Optionally exit if DB is critical and cannot be re-established
            // exit(1);
            throw new Exception("Database connection failed and could not be re-established.");
        } else {
            error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker DB] Database connection (re)established successfully.");
        }
    }
}

/**
 * Executes a PDOStatement with retry logic for 'MySQL server has gone away' errors.
 *
 * @param PDOStatement $stmt The PDOStatement to execute.
 * @param array $params An array of parameters to pass to execute().
 * @param bool $is_select For select queries, determines return type.
 * @return mixed The result of fetch/fetchAll for SELECTs, or rowCount for others.
 * @throws PDOException if execution fails after retries.
 */
function execute_pdo_with_retry(PDOStatement $stmt, array $params = [], bool $is_select_fetch = false, bool $is_select_fetchall = false) {
    global $pdo; // Ensure $pdo is accessible
    $attempts = 0;
    while (true) {
        try {
            ensure_db_connection(); // Ensure connection is active before executing
            $stmt->execute($params);
            if ($is_select_fetch) {
                return $stmt->fetch(PDO::FETCH_ASSOC);
            }
            if ($is_select_fetchall) {
                return $stmt->fetchAll(PDO::FETCH_ASSOC);
            }
            return $stmt->rowCount(); // For INSERT, UPDATE, DELETE
        } catch (PDOException $e) {
            $attempts++;
            $error_code = $e->errorInfo[1] ?? null;
            $is_gone_away = ($error_code === MYSQL_ERROR_CODE_SERVER_GONE_AWAY || $error_code === MYSQL_ERROR_CODE_LOST_CONNECTION);

            if ($is_gone_away && $attempts <= MAX_DB_RECONNECT_ATTEMPTS) {
                $timestamp = date('Y-m-d H:i:s');
                error_log("[{$timestamp}] [Jet Worker DB Warning] MySQL server has gone away (Code: {$error_code}). Attempting reconnect ({$attempts}/" . MAX_DB_RECONNECT_ATTEMPTS . "). Error: " . $e->getMessage());
                $pdo = null; // Force re-connection by ensure_db_connection()
                // Optional: short delay before reconnecting
                // sleep(1);
                continue; // Retry the loop (which will call ensure_db_connection and then execute)
            } else {
                // Non-recoverable error or max attempts reached
                throw $e; // Re-throw the original or last exception
            }
        }
    }
}

// --- Helper Functions ---

/**
 * Check if libvips is available and working
 */
function check_vips_availability($vips_path) {
    if (!file_exists($vips_path)) {
        return false;
    }
    
    $test_cmd = "\"{$vips_path}\" --version 2>&1";
    $output = shell_exec($test_cmd);
    return (strpos($output, 'vips') !== false);
}

/**
 * Process RAW file using libvips with optimal settings for sharp JPEG output
 */
function process_raw_with_vips($vips_path, $raw_file_path, $output_path, $target_height, $timestamp, $job_id) {
    $escaped_raw_path = escapeshellarg($raw_file_path);
    
    // For vips thumbnail, output options are appended to the output filename string.
    $output_options = "[Q=" . JPEG_QUALITY;
    if (VIPS_JPEG_OPTIMIZE_CODING) {
        // Note: vips docs suggest optimize_coding is for GIF/PNG usually.
        // For JPEGs, trellis_quant, overshoot_deringing, optimize_scans are more common.
        // We'll keep it if it was intended, but consider if these other options are better.
        // For now, sticking to what was similar to vipsthumbnail options.
    }
    if (VIPS_JPEG_INTERLACE) {
        $output_options .= ",interlace=line"; // jpeg interlace is often specified as 'line' or 'plane'
    }
    if (JPEG_STRIP_METADATA) {
        $output_options .= ",strip";
    }
    $output_options .= "]";
    
    $escaped_output_with_options = escapeshellarg($output_path . $output_options);

    // Command structure: vips thumbnail <input> <output_with_options> <size_integer> --height <size_integer> [options]
    $vips_cmd = sprintf(
        '"%s" thumbnail %s %s %d --height %d',
        $vips_path,
        $escaped_raw_path,
        $escaped_output_with_options,
        $target_height, // <size> for vips thumbnail is max dimension
        $target_height  // --height to ensure height is constrained
    );

    if (VIPS_USE_LINEAR_PROCESSING) {
        $vips_cmd .= " --linear";
    }

    // --export-profile and --intent are valid for `vips thumbnail`
    $vips_cmd .= " --export-profile srgb";
    $vips_cmd .= " --intent perceptual";

    // For `vips thumbnail`, sharpening can be a simple --sharpen sigma or more complex.
    // if (VIPS_APPLY_SHARPENING && defined('VIPS_SHARPEN_SIGMA') && VIPS_SHARPEN_SIGMA > 0) { // REMOVING SHARPEN OPTION
        // Simple sigma based sharpen for vips thumbnail is just --sharpen <sigma>
        // $vips_cmd .= " --sharpen " . escapeshellarg((string)VIPS_SHARPEN_SIGMA);
    // } else {
        // To disable default sharpening in vips thumbnail if any: --sharpen none
        // However, vips thumbnail doesn't sharpen by default unless an option is given.
    // }
    
    $vips_cmd .= " 2>&1"; // Redirect stderr to stdout

    echo "[{$timestamp}] [Job {$job_id}] Executing vips thumbnail...\n";
    error_log("[{$timestamp}] [Jet Job {$job_id}] Executing vips thumbnail. CMD: {$vips_cmd}");
    
    $vips_output = shell_exec($vips_cmd);
    $trimmed_vips_output = trim((string)$vips_output);
    
    // Check if output file was created successfully
    // Log output regardless of file existence for better debugging if vips fails
    if (!empty($trimmed_vips_output) && (!file_exists($output_path) || filesize($output_path) === 0)) {
        error_log("[{$timestamp}] [Jet Job {$job_id}] vips command output: " . $trimmed_vips_output);
    }

    if (!file_exists($output_path) || filesize($output_path) === 0) {
        error_log("[{$timestamp}] [Jet Job {$job_id}] vips FAILED: Output file not created or empty. Detailed VIPS Output above if available. Falling back.");
        throw new Exception("vips processing failed. Output: " . $trimmed_vips_output);
    }
    
    echo "[{$timestamp}] [Job {$job_id}] vips SUCCESS: Created cache file: {$output_path}\n";
    error_log("[{$timestamp}] [Jet Job {$job_id}] vips SUCCESS: Created cache file with size: " . filesize($output_path));
    
    return "RAW cache created successfully using vips.";
}

/**
 * Process RAW file using dcraw + ImageMagick fallback
 */
function process_raw_with_dcraw_fallback($dcraw_path, $magick_path, $raw_file_path, $output_path, $target_height, $timestamp, $job_id) {
    $escaped_final_cache_path = escapeshellarg($output_path);
    
    // Create temporary PPM file
    $temp_ppm_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_worker_temp_' . uniqid() . '.ppm';
    $escaped_temp_ppm_path = escapeshellarg($temp_ppm_filename);
    
    try {
        // Step 1: Convert RAW to temporary PPM file using dcraw
        $dcraw_to_ppm_cmd = "\"{$dcraw_path}\" -c \"{$raw_file_path}\" > {$escaped_temp_ppm_path} 2>&1";
        echo "[{$timestamp}] [Job {$job_id}] Executing dcraw (fallback)...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing dcraw fallback Step 1. CMD: {$dcraw_to_ppm_cmd}");
        
        $dcraw_output = shell_exec($dcraw_to_ppm_cmd);
        $trimmed_dcraw_output = trim((string)$dcraw_output);
        
        if (!file_exists($temp_ppm_filename) || filesize($temp_ppm_filename) === 0) {
            error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw fallback Step 1 FAILED: PPM file not created or empty. Output: " . ($trimmed_dcraw_output ?: "EMPTY"));
            throw new Exception("dcraw fallback step 1 failed. Output: " . $trimmed_dcraw_output);
        }
        
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw fallback Step 1 SUCCESS: PPM file created with size: " . filesize($temp_ppm_filename));
        
        // Step 2: Convert PPM to JPEG using ImageMagick with sharpening
        $magick_ppm_to_jpg_cmd = "\"{$magick_path}\" convert {$escaped_temp_ppm_path} " .
                                 "-resize x{$target_height} " .
                                 "-unsharp 0x1+1.0+0.05 " .  // Sharpening filter
                                 "-quality " . JPEG_QUALITY . " " .
                                 "-interlace Plane " .
                                 (JPEG_STRIP_METADATA ? "-strip " : "") .
                                 "{$escaped_final_cache_path} 2>&1";
        
        echo "[{$timestamp}] [Job {$job_id}] Executing ImageMagick resize (fallback)...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing dcraw fallback Step 2. CMD: {$magick_ppm_to_jpg_cmd}");
        
        $magick_output = shell_exec($magick_ppm_to_jpg_cmd);
        $trimmed_magick_output = trim((string)$magick_output);
        
        if (!file_exists($output_path) || filesize($output_path) === 0) {
            error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw fallback Step 2 FAILED: Final JPEG not created or empty. Output: " . ($trimmed_magick_output ?: "EMPTY"));
            throw new Exception("dcraw fallback step 2 failed. Output: " . $trimmed_magick_output);
        }
        
        echo "[{$timestamp}] [Job {$job_id}] dcraw fallback SUCCESS: Created cache file: {$output_path}\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw fallback SUCCESS: Created cache file with size: " . filesize($output_path));
        
        return "RAW cache created successfully using dcraw fallback.";
        
    } finally {
        // Always clean up temporary file
        if (file_exists($temp_ppm_filename)) {
            @unlink($temp_ppm_filename);
            error_log("[{$timestamp}] [Jet Job {$job_id}] Temporary PPM file {$temp_ppm_filename} deleted.");
        }
    }
}

// Reset stuck processing jobs on startup
try {
    ensure_db_connection(); // Ensure connection before this startup task
    $sql_reset = "UPDATE jet_cache_jobs SET status = 'pending' WHERE status = 'processing'";
    $stmt_reset = $pdo->prepare($sql_reset);
    $affected_rows = execute_pdo_with_retry($stmt_reset); // No params, not a select
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

// Check tool availability
$vips_available = check_vips_availability($vips_executable_path);
$dcraw_available = file_exists($dcraw_executable_path);
$magick_available = file_exists($magick_executable_path);

echo "Tool availability check:\n";
echo "  - vips: " . ($vips_available ? "AVAILABLE" : "NOT AVAILABLE") . "\n";
echo "  - dcraw: " . ($dcraw_available ? "AVAILABLE" : "NOT AVAILABLE") . "\n";
echo "  - ImageMagick: " . ($magick_available ? "AVAILABLE" : "NOT AVAILABLE") . "\n";

error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker Startup] Tool availability - vips: " . ($vips_available ? "YES" : "NO") . ", dcraw: " . ($dcraw_available ? "YES" : "NO") . ", ImageMagick: " . ($magick_available ? "YES" : "NO"));

if (!$vips_available && (!$dcraw_available || !$magick_available)) {
    echo "ERROR: No processing tools available. Need either vips OR (dcraw + ImageMagick).\n";
    error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker Startup Error] No processing tools available.");
    exit(1);
}

// Worker variables
$sleep_interval = 3;
$running = true;
$run_once = isset($_ENV['WORKER_RUN_ONCE']) && $_ENV['WORKER_RUN_ONCE'] === '1';

if ($run_once) {
    echo "Worker running in 'run once' mode - will exit after processing available jobs.\n";
}

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
echo "Entering enhanced Jet cache worker loop with vips priority...\n";
while ($running) {
    $job = null;
    try {
        ensure_db_connection(); // Ensure DB is connected at the start of each loop iteration
        // Get next pending job
        $sql_get_job = "SELECT * FROM jet_cache_jobs 
                        WHERE status = 'pending' 
                        ORDER BY created_at ASC 
                        LIMIT 1";
        $stmt_get = $pdo->prepare($sql_get_job);
        $job = execute_pdo_with_retry($stmt_get, [], true, false); // is_select_fetch = true

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
            execute_pdo_with_retry($stmt_update, [time(), $worker_id, $job_id]);

            $job_success = true;
            $job_result_message = '';
            $processing_method = '';
            
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
                $processing_method = "skipped";
            } else {
                // Process RAW file with priority: vips first, then dcraw fallback
                try {
                    if ($vips_available) {
                        // Try vips first (preferred method)
                        try {
                            $job_result_message = process_raw_with_vips(
                                $vips_executable_path, 
                                $full_raw_file_path_realpath, 
                                $cached_preview_full_path, 
                                $cache_size, 
                                $timestamp, 
                                $job_id
                            );
                            $processing_method = "vips";
                        } catch (Throwable $vips_e) {
                            echo "[{$timestamp}] [Job {$job_id}] vips failed, trying dcraw fallback: " . $vips_e->getMessage() . "\n";
                            error_log("[{$timestamp}] [Jet Job {$job_id}] vips failed, trying dcraw fallback: " . $vips_e->getMessage());
                            
                            // Clean up any partial file from vips
                            if (file_exists($cached_preview_full_path)) {
                                @unlink($cached_preview_full_path);
                            }
                            
                            // Fall back to dcraw + ImageMagick
                            if ($dcraw_available && $magick_available) {
                                $job_result_message = process_raw_with_dcraw_fallback(
                                    $dcraw_executable_path,
                                    $magick_executable_path,
                                    $full_raw_file_path_realpath,
                                    $cached_preview_full_path,
                                    $cache_size,
                                    $timestamp,
                                    $job_id
                                );
                                $processing_method = "dcraw_fallback";
                            } else {
                                throw new Exception("vips failed and dcraw fallback not available: " . $vips_e->getMessage());
                            }
                        }
                    } else {
                        // Use dcraw + ImageMagick directly if vips not available
                        if ($dcraw_available && $magick_available) {
                            $job_result_message = process_raw_with_dcraw_fallback(
                                $dcraw_executable_path,
                                $magick_executable_path,
                                $full_raw_file_path_realpath,
                                $cached_preview_full_path,
                                $cache_size,
                                $timestamp,
                                $job_id
                            );
                            $processing_method = "dcraw_only";
                        } else {
                            throw new Exception("No processing tools available");
                        }
                    }

                    // Store cache path and dimensions for metadata
                    $original_dims = @getimagesize($cached_preview_full_path);
                    if ($original_dims) {
                        $sql_update_dims = "UPDATE jet_cache_jobs SET original_width = ?, original_height = ?, final_cache_path = ?, processing_method = ? WHERE id = ?";
                        $stmt_update_dims = $pdo->prepare($sql_update_dims);
                        execute_pdo_with_retry($stmt_update_dims, [$original_dims[0], $original_dims[1], $cached_preview_full_path, $processing_method, $job_id]);
                    } else {
                        $sql_update_path = "UPDATE jet_cache_jobs SET final_cache_path = ?, processing_method = ? WHERE id = ?";
                        $stmt_update_path = $pdo->prepare($sql_update_path);
                        execute_pdo_with_retry($stmt_update_path, [$cached_preview_full_path, $processing_method, $job_id]);
                    }

                } catch (Throwable $process_e) {
                    echo "[{$timestamp}] [Job {$job_id}] PROCESSING EXCEPTION: " . $process_e->getMessage() . "\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Processing exception: " . $process_e->getMessage());
                    $job_result_message = "Exception during RAW processing: " . $process_e->getMessage();
                    $job_success = false;
                    $processing_method = "failed";
                }
            }

            // Update final job status
            $final_status = $job_success ? 'completed' : 'failed';
            $sql_finish = "UPDATE jet_cache_jobs SET status = ?, completed_at = ?, result_message = ? WHERE id = ?";
            $stmt_finish = $pdo->prepare($sql_finish);
            execute_pdo_with_retry($stmt_finish, [$final_status, time(), $job_result_message, $job_id]); 
            echo "[{$timestamp}] [Job {$job_id}] Marked as {$final_status} (method: {$processing_method}).\n";
            error_log("[{$timestamp}] [Jet Job {$job_id}] Job completed with status: {$final_status}, method: {$processing_method}");

        } else {
            // No jobs found
            if ($run_once) {
                echo "No more jobs to process. Exiting (run once mode).\n";
                $running = false;
            } else {
                // Sleep and continue in continuous mode
                sleep($sleep_interval);
            }
        }

    } catch (Throwable $e) {
        $error_timestamp = date('Y-m-d H:i:s');
        echo "[{$error_timestamp}] [Worker Error] " . $e->getMessage() . "\n";
        error_log("[{$error_timestamp}] [Jet Worker Error] " . $e->getMessage());
        
        // If we have a job, mark it as failed
        if ($job && isset($job['id'])) {
            try {
                ensure_db_connection(); // Ensure connection before this critical update
                $sql_fail = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = ? WHERE id = ?";
                $stmt_fail = $pdo->prepare($sql_fail);
                execute_pdo_with_retry($stmt_fail, [time(), "Worker error: " . $e->getMessage(), $job['id']]);
            } catch (Throwable $fail_e) {
                error_log("[{$error_timestamp}] [Jet Worker Error] Failed to mark job as failed after primary error: " . $fail_e->getMessage());
            }
        }
        
        // Sleep before retrying to avoid rapid error loops
        sleep($sleep_interval);
    }
}

echo "Enhanced Jet Cache Worker Shutting Down - " . date('Y-m-d H:i:s') . "\n";
error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker] Enhanced worker shutdown completed.");
?> 