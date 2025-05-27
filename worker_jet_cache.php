<?php
// worker_jet_cache.php - Optimized RAW cache worker with dcraw only

echo "Optimized Jet Cache Worker Started (dcraw only) - " . date('Y-m-d H:i:s') . "\n";

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
const JPEG_QUALITY = 85;  // Slightly lower for speed
const JPEG_STRIP_METADATA = true;

// Optimized dcraw processing options for speed
const DCRAW_QUALITY = 3;         // Quality level 0-3 (3=highest, but 2 is faster)
const DCRAW_USE_EMBEDDED_PROFILE = true;  // Use camera's color profile for accuracy
const DCRAW_AUTO_WHITE_BALANCE = true;    // Enable automatic white balance
const DCRAW_FAST_INTERPOLATION = true;    // Use faster but good quality interpolation

// File validation constants
const MIN_RAW_FILE_SIZE = 1024 * 1024;  // 1MB minimum for valid RAW files
const MAX_RAW_FILE_SIZE = 500 * 1024 * 1024; // 500MB maximum reasonable RAW file size

// Output validation constants
const MIN_JPEG_OUTPUT_SIZE = 1024;      // 1KB minimum for valid JPEG output
const JPEG_MAGIC_BYTES = [0xFF, 0xD8, 0xFF]; // JPEG file signature

// --- Executable Paths ---
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
 * Check if dcraw is available and working
 */
function check_dcraw_availability($dcraw_path) {
    if (!file_exists($dcraw_path)) {
        return false;
    }
    
    $test_cmd = "\"{$dcraw_path}\" 2>&1";
    $output = shell_exec($test_cmd);
    return (strpos($output, 'dcraw') !== false || strpos($output, 'Usage') !== false);
}

/**
 * Validates RAW file integrity before processing
 * Based on research recommendations for input validation
 */
function validate_raw_file_integrity($file_path, $timestamp, $job_id) {
    // Check if file exists and is readable
    if (!file_exists($file_path) || !is_readable($file_path)) {
        throw new Exception("RAW file does not exist or is not readable: {$file_path}");
    }
    
    // Check file size constraints
    $file_size = filesize($file_path);
    if ($file_size < MIN_RAW_FILE_SIZE) {
        throw new Exception("RAW file too small ({$file_size} bytes), likely corrupted or incomplete");
    }
    
    if ($file_size > MAX_RAW_FILE_SIZE) {
        throw new Exception("RAW file too large ({$file_size} bytes), exceeds reasonable limits");
    }
    
    // Check basic file signature/magic bytes for common RAW formats
    $handle = fopen($file_path, 'rb');
    if (!$handle) {
        throw new Exception("Cannot open RAW file for validation: {$file_path}");
    }
    
    $header = fread($handle, 16);
    fclose($handle);
    
    if (strlen($header) < 4) {
        throw new Exception("RAW file header too short, likely corrupted");
    }
    
    // Basic RAW format signature validation
    $is_valid_raw = false;
    $format_detected = 'unknown';
    
    // Canon CR2: "II" + 42 + "CR" 
    if (substr($header, 0, 2) === 'II' && ord($header[2]) === 42 && substr($header, 8, 2) === 'CR') {
        $is_valid_raw = true;
        $format_detected = 'Canon CR2';
    }
    // Canon CRW: "HEAPCCDR"
    elseif (substr($header, 6, 8) === 'HEAPCCDR') {
        $is_valid_raw = true;
        $format_detected = 'Canon CRW';
    }
    // Nikon NEF: "MM" + 42
    elseif (substr($header, 0, 2) === 'MM' && ord($header[2]) === 0 && ord($header[3]) === 42) {
        $is_valid_raw = true;
        $format_detected = 'Nikon NEF';
    }
    // Sony ARW: "II" + 42
    elseif (substr($header, 0, 2) === 'II' && ord($header[2]) === 42 && ord($header[3]) === 0) {
        $is_valid_raw = true;
        $format_detected = 'Sony ARW/TIFF-based';
    }
    // Add more format checks as needed...
    
    if (!$is_valid_raw) {
        // Log the header for debugging
        $header_hex = bin2hex($header);
        error_log("[{$timestamp}] [Jet Job {$job_id}] Unrecognized RAW format. Header: {$header_hex}");
        
        // Don't fail completely - libvips might still handle it
        error_log("[{$timestamp}] [Jet Job {$job_id}] Warning: RAW format not recognized, proceeding with caution");
    } else {
        error_log("[{$timestamp}] [Jet Job {$job_id}] RAW format detected: {$format_detected}, size: {$file_size} bytes");
    }
    
    return [
        'size' => $file_size,
        'format' => $format_detected,
        'valid' => $is_valid_raw
    ];
}

/**
 * Validates JPEG output file integrity
 * Based on research recommendations for output validation
 */
function validate_jpeg_output($file_path, $timestamp, $job_id) {
    if (!file_exists($file_path)) {
        throw new Exception("Output JPEG file was not created: {$file_path}");
    }
    
    $file_size = filesize($file_path);
    if ($file_size < MIN_JPEG_OUTPUT_SIZE) {
        throw new Exception("Output JPEG file too small ({$file_size} bytes), likely corrupted");
    }
    
    // Check JPEG magic bytes
    $handle = fopen($file_path, 'rb');
    if (!$handle) {
        throw new Exception("Cannot open output JPEG for validation: {$file_path}");
    }
    
    $header = fread($handle, 3);
    fclose($handle);
    
    $header_bytes = array_values(unpack('C*', $header));
    if ($header_bytes !== JPEG_MAGIC_BYTES) {
        $header_hex = bin2hex($header);
        throw new Exception("Output file does not have valid JPEG signature. Got: {$header_hex}");
    }
    
    // Try to get basic image dimensions to verify it's a valid JPEG
    $image_info = @getimagesize($file_path);
    if (!$image_info || $image_info[2] !== IMAGETYPE_JPEG) {
        throw new Exception("Output file is not a valid JPEG image");
    }
    
    // Enhanced validation: Try to actually decode the entire JPEG to ensure it's not corrupted
    $test_image = @imagecreatefromjpeg($file_path);
    if (!$test_image) {
        throw new Exception("JPEG file exists but cannot be decoded - likely corrupted");
    }
    
    // Get actual decoded dimensions to verify they match header
    $decoded_width = imagesx($test_image);
    $decoded_height = imagesy($test_image);
    imagedestroy($test_image);
    
    if ($decoded_width !== $image_info[0] || $decoded_height !== $image_info[1]) {
        throw new Exception("JPEG header dimensions ({$image_info[0]}x{$image_info[1]}) don't match decoded dimensions ({$decoded_width}x{$decoded_height}) - file corrupted");
    }
    
    error_log("[{$timestamp}] [Jet Job {$job_id}] Output JPEG fully validated: {$file_size} bytes, {$image_info[0]}x{$image_info[1]}, decodable");
    
    return [
        'size' => $file_size,
        'width' => $image_info[0],
        'height' => $image_info[1]
    ];
}

/**
 * Process RAW file using optimized dcraw + ImageMagick pipeline
 * Optimized for speed while maintaining quality
 */
function process_raw_with_optimized_dcraw($dcraw_path, $magick_path, $raw_file_path, $output_path, $target_height, $timestamp, $job_id) {
    $escaped_final_cache_path = escapeshellarg($output_path);
    
    // Create optimized temporary TIFF file in memory-efficient location
    $temp_tiff_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_opt_' . uniqid() . '.tiff';
    $escaped_temp_tiff_path = escapeshellarg($temp_tiff_filename);
    
    try {
        // Step 1: Simplified dcraw command that works reliably
        $dcraw_options = [];
        
        // Use basic reliable options
        $dcraw_options[] = "-q 1";     // AHD interpolation (good speed/quality balance)
        $dcraw_options[] = "-a";       // Auto white balance
        $dcraw_options[] = "-w";       // Use camera white balance (more compatible than -p embed)
        $dcraw_options[] = "-T";       // Output TIFF instead of PPM for better reliability
        
        $dcraw_opts_string = implode(' ', $dcraw_options);
        
        $dcraw_to_tiff_cmd = "\"{$dcraw_path}\" {$dcraw_opts_string} -c \"{$raw_file_path}\" > {$escaped_temp_tiff_path}";
        
        echo "[{$timestamp}] [Job {$job_id}] Executing optimized dcraw...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing optimized dcraw Step 1. CMD: {$dcraw_to_tiff_cmd}");
        
        $dcraw_output = shell_exec($dcraw_to_tiff_cmd);
        $trimmed_dcraw_output = trim((string)$dcraw_output);
        
        if (!file_exists($temp_tiff_filename) || filesize($temp_tiff_filename) === 0) {
            error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw Step 1 FAILED: TIFF file not created or empty. Output: " . ($trimmed_dcraw_output ?: "EMPTY"));
            throw new Exception("dcraw step 1 failed. Output: " . $trimmed_dcraw_output);
        }
        
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw Step 1 SUCCESS: TIFF file created with size: " . filesize($temp_tiff_filename));
        
        // Step 2: Optimized ImageMagick conversion for speed
        $magick_options = [];
        $magick_options[] = "-resize x{$target_height}";  // Resize by height only
        $magick_options[] = "-quality " . JPEG_QUALITY;
        $magick_options[] = "-sampling-factor 4:2:0";    // Optimize JPEG compression
        $magick_options[] = "-colorspace sRGB";          // Ensure sRGB output
        
        // Speed optimizations
        $magick_options[] = "-define jpeg:optimize-coding=false";  // Skip optimization for speed
        $magick_options[] = "-interlace none";           // No interlacing for speed
        
        if (JPEG_STRIP_METADATA) {
            $magick_options[] = "-strip";
        }
        
        $magick_opts_string = implode(' ', $magick_options);
        
        $magick_tiff_to_jpg_cmd = "\"{$magick_path}\" {$escaped_temp_tiff_path} {$magick_opts_string} {$escaped_final_cache_path}";
        
        echo "[{$timestamp}] [Job {$job_id}] Executing optimized ImageMagick resize...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing optimized dcraw Step 2. CMD: {$magick_tiff_to_jpg_cmd}");
        
        $magick_output = shell_exec($magick_tiff_to_jpg_cmd);
        $trimmed_magick_output = trim((string)$magick_output);
        
        if (!file_exists($output_path) || filesize($output_path) === 0) {
            error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw Step 2 FAILED: Final JPEG not created or empty. Output: " . ($trimmed_magick_output ?: "EMPTY"));
            throw new Exception("dcraw step 2 failed. Output: " . $trimmed_magick_output);
        }
        
        echo "[{$timestamp}] [Job {$job_id}] dcraw SUCCESS: Created cache file: {$output_path}\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw SUCCESS: Created cache file with size: " . filesize($output_path));
        
        return "RAW cache created successfully using optimized dcraw pipeline.";
        
    } finally {
        // Always clean up temporary file
        if (file_exists($temp_tiff_filename)) {
            @unlink($temp_tiff_filename);
            error_log("[{$timestamp}] [Jet Job {$job_id}] Temporary TIFF file {$temp_tiff_filename} deleted.");
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
$dcraw_available = check_dcraw_availability($dcraw_executable_path);
$magick_available = file_exists($magick_executable_path);

echo "Tool availability check:\n";
echo "  - dcraw: " . ($dcraw_available ? "AVAILABLE" : "NOT AVAILABLE") . "\n";
echo "  - ImageMagick: " . ($magick_available ? "AVAILABLE" : "NOT AVAILABLE") . "\n";

error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker Startup] Tool availability - dcraw: " . ($dcraw_available ? "YES" : "NO") . ", ImageMagick: " . ($magick_available ? "YES" : "NO"));

if (!$dcraw_available || !$magick_available) {
    echo "ERROR: Required processing tools not available. Need dcraw AND ImageMagick.\n";
    error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker Startup Error] Required processing tools not available.");
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
echo "Entering optimized Jet cache worker loop with dcraw processing...\n";
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

            // Enhanced input file validation based on research recommendations
            try {
                $input_validation = validate_raw_file_integrity($full_raw_file_path_realpath, $timestamp, $job_id);
                echo "[{$timestamp}] [Job {$job_id}] Input validation passed: {$input_validation['format']} ({$input_validation['size']} bytes)\n";
            } catch (Exception $validation_error) {
                throw new Exception("Input file validation failed: " . $validation_error->getMessage());
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
                // Validate existing cache file integrity
                try {
                    validate_jpeg_output($cached_preview_full_path, $timestamp, $job_id);
                    echo "[{$timestamp}] [Job {$job_id}] Valid cache file already exists. Skipping processing.\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Valid cache file already exists. Skipping processing.");
                    $job_result_message = "Valid cache file already existed.";
                    $processing_method = "skipped";
                } catch (Exception $cache_validation_error) {
                    echo "[{$timestamp}] [Job {$job_id}] Existing cache file is invalid: {$cache_validation_error->getMessage()}. Reprocessing...\n";
                    error_log("[{$timestamp}] [Jet Job {$job_id}] Existing cache file invalid, will reprocess: " . $cache_validation_error->getMessage());
                    @unlink($cached_preview_full_path); // Remove invalid cache file
                    // Continue to processing below
                }
            }
            
            // Process RAW file if no valid cache exists
            if (!file_exists($cached_preview_full_path) || filesize($cached_preview_full_path) === 0) {
                // Process RAW file using optimized dcraw pipeline
                try {
                    $job_result_message = process_raw_with_optimized_dcraw(
                        $dcraw_executable_path,
                        $magick_executable_path,
                        $full_raw_file_path_realpath,
                        $cached_preview_full_path,
                        $cache_size,
                        $timestamp,
                        $job_id
                    );
                    $processing_method = "optimized_dcraw";
                    
                    // Validate dcraw output
                    try {
                        validate_jpeg_output($cached_preview_full_path, $timestamp, $job_id);
                    } catch (Exception $dcraw_validation_error) {
                        @unlink($cached_preview_full_path);
                        throw new Exception("dcraw output validation failed: " . $dcraw_validation_error->getMessage());
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