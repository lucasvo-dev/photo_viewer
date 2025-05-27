<?php
// worker_jet_cache.php - Optimized RAW cache worker with dcraw only

echo "Optimized Jet Cache Worker Started (dcraw only) - " . date('Y-m-d H:i:s') . "\n";

// --- Environment Setup ---
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/worker_jet_php_error.log');

// Increase limits for RAW processing - optimized for 5 concurrent processes
set_time_limit(0);
ini_set('memory_limit', '2048M'); // 2GB for main process (reduced for 5 processes)

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
const JPEG_QUALITY = 90;  // Slightly lower for speed
const JPEG_STRIP_METADATA = true;

// Balanced speed/quality dcraw processing options (5 processes)
const DCRAW_QUALITY = 1;         // Quality level 1 = AHD interpolation (good balance)
const DCRAW_USE_EMBEDDED_PROFILE = true;  // Keep color profile for quality
const DCRAW_AUTO_WHITE_BALANCE = true;    // Auto white balance for proper colors
const DCRAW_FAST_INTERPOLATION = true;    // Use good quality interpolation

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
 * Process RAW file using maximum speed dcraw + ImageMagick pipeline
 * Optimized for maximum speed over quality
 */
function process_raw_with_optimized_dcraw($dcraw_path, $magick_path, $raw_file_path, $output_path, $target_height, $timestamp, $job_id) {
    $escaped_final_cache_path = escapeshellarg($output_path);
    
    // Create optimized temporary TIFF file in memory-efficient location
    $temp_tiff_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_opt_' . uniqid() . '.tiff';
    $escaped_temp_tiff_path = escapeshellarg($temp_tiff_filename);
    
    try {
        // Step 1: Balanced speed dcraw command with proper colors
        $dcraw_options = [];
        
        // Quality vs speed balance
        $dcraw_options[] = "-q 1";     // AHD interpolation (good speed/quality balance)
        $dcraw_options[] = "-a";       // Auto white balance for proper colors
        $dcraw_options[] = "-o 1";     // sRGB color space for normal colors
        $dcraw_options[] = "-w";       // Use camera white balance
        $dcraw_options[] = "-T";       // Output TIFF for better color handling
        
        $dcraw_opts_string = implode(' ', $dcraw_options);
        
        $dcraw_to_tiff_cmd = "\"{$dcraw_path}\" {$dcraw_opts_string} -c \"{$raw_file_path}\" > {$escaped_temp_tiff_path}";
        
        echo "[{$timestamp}] [Job {$job_id}] Executing balanced speed dcraw...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing balanced speed dcraw Step 1. CMD: {$dcraw_to_tiff_cmd}");
        
        // Set CPU priority for parallel processing (lower for 10 concurrent processes)
        $dcraw_isolated_cmd = "start /HIGH /AFFINITY 0x3 /B /WAIT cmd /c \"" . $dcraw_to_tiff_cmd . "\"";
        
        // Execute dcraw with maximum hardware utilization
        error_log("[{$timestamp}] [Jet Job {$job_id}] High priority CMD: {$dcraw_isolated_cmd}");
        $start_time = microtime(true);
        $dcraw_output = shell_exec($dcraw_isolated_cmd);
        $dcraw_time = round((microtime(true) - $start_time) * 1000, 2);
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw execution time: {$dcraw_time}ms");
        $trimmed_dcraw_output = trim((string)$dcraw_output);
        
        if (!file_exists($temp_tiff_filename) || filesize($temp_tiff_filename) === 0) {
            error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw Step 1 FAILED: TIFF file not created or empty. Output: " . ($trimmed_dcraw_output ?: "EMPTY"));
            throw new Exception("dcraw step 1 failed. Output: " . $trimmed_dcraw_output);
        }
        
        error_log("[{$timestamp}] [Jet Job {$job_id}] dcraw Step 1 SUCCESS: TIFF file created with size: " . filesize($temp_tiff_filename));
        
        // Step 2: Optimized ImageMagick conversion for parallel processing
        $magick_options = [];
        $magick_options[] = "-resize x{$target_height}";   // Resize by height (remove !)
        $magick_options[] = "-quality " . JPEG_QUALITY;
        $magick_options[] = "-sampling-factor 4:2:0";      // Optimize JPEG compression
        $magick_options[] = "-colorspace sRGB";            // Ensure proper color space
        
        // Balanced speed optimizations for parallel processing
        $magick_options[] = "-define jpeg:optimize-coding=false";  // Skip optimization for speed
        $magick_options[] = "-define jpeg:dct-method=fast";        // Fast DCT method
        $magick_options[] = "-interlace none";                     // No interlacing for speed
        $magick_options[] = "-filter Lanczos";                     // Better quality than Point but still fast
        $magick_options[] = "-limit memory 256MB";                 // Lower memory for 10 concurrent processes
        $magick_options[] = "-limit map 256MB";                    // Lower memory mapping
        
        if (JPEG_STRIP_METADATA) {
            $magick_options[] = "-strip";
        }
        
        $magick_opts_string = implode(' ', $magick_options);
        
        $magick_tiff_to_jpg_cmd = "\"{$magick_path}\" {$escaped_temp_tiff_path} {$magick_opts_string} {$escaped_final_cache_path}";
        
        echo "[{$timestamp}] [Job {$job_id}] Executing optimized ImageMagick resize...\n";
        error_log("[{$timestamp}] [Jet Job {$job_id}] Executing optimized dcraw Step 2. CMD: {$magick_tiff_to_jpg_cmd}");
        
        // Set moderate priority for ImageMagick for parallel processing
        $magick_isolated_cmd = "start /NORMAL /AFFINITY 0x3 /B /WAIT cmd /c \"" . $magick_tiff_to_jpg_cmd . "\"";
        $start_time = microtime(true);
        $magick_output = shell_exec($magick_isolated_cmd);
        $magick_time = round((microtime(true) - $start_time) * 1000, 2);
        error_log("[{$timestamp}] [Jet Job {$job_id}] ImageMagick execution time: {$magick_time}ms");
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

// Worker variables - optimized for 5 concurrent processes
$sleep_interval = 1; // Polling interval for 5 processes (1 second)
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

// Main worker loop with parallel processing
echo "Entering parallel Jet cache worker loop (5 concurrent dcraw processes - optimized for speed)...\n";
while ($running) {
    $jobs = [];
            try {
            ensure_db_connection(); // Ensure DB is connected at the start of each loop iteration
            // Get next 5 pending jobs for parallel processing (reduced for stability)
            $sql_get_jobs = "SELECT * FROM jet_cache_jobs 
                            WHERE status = 'pending' 
                            ORDER BY created_at ASC 
                            LIMIT 5";
            $stmt_get = $pdo->prepare($sql_get_jobs);
            $jobs = execute_pdo_with_retry($stmt_get, [], false, true); // is_select_fetchall = true

                if (!empty($jobs)) {
            $timestamp = date('Y-m-d H:i:s');
            $worker_id = gethostname() . "_" . getmypid();
            $job_count = count($jobs);
            echo "[{$timestamp}] Starting parallel processing of {$job_count} jobs (5 concurrent dcraw processes)...\n";
            
            // Update all jobs to processing status first
            $job_ids = [];
            foreach ($jobs as $job) {
                $job_ids[] = $job['id'];
                try {
                    $sql_update = "UPDATE jet_cache_jobs SET status = 'processing', processed_at = ?, worker_id = ? WHERE id = ?";
                    $stmt_update = $pdo->prepare($sql_update);
                    $stmt_update->execute([time(), $worker_id, $job['id']]);
                } catch (Exception $db_e) {
                    error_log("[{$timestamp}] [Jet Job {$job['id']}] DB update warning: " . $db_e->getMessage());
                }
            }
            
            // Process all jobs in parallel
            $parallel_processes = [];
            foreach ($jobs as $job_index => $job) {
                $job_id = $job['id'];
                $source_key = $job['source_key'];
                $image_relative_path = $job['image_relative_path'];
                $cache_size = $job['cache_size'];
                
                echo "[{$timestamp}] [Job {$job_id}] Starting parallel processing: {$source_key}/{$image_relative_path}\n";
                
                // Validate RAW source
                if (!isset(RAW_IMAGE_SOURCES[$source_key])) {
                    echo "[{$timestamp}] [Job {$job_id}] ERROR: Invalid RAW source key: {$source_key}\n";
                    continue;
                }

                $source_config = RAW_IMAGE_SOURCES[$source_key];
                $base_raw_path = rtrim($source_config['path'], '/\\');
                
                // Construct full file path
                $full_raw_file_path = $base_raw_path . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $image_relative_path);
                $full_raw_file_path_realpath = realpath($full_raw_file_path);

                if (!$full_raw_file_path_realpath || !is_file($full_raw_file_path_realpath)) {
                    echo "[{$timestamp}] [Job {$job_id}] ERROR: RAW file not found: {$full_raw_file_path}\n";
                    continue;
                }

                // Get cache path using helper function
                $cached_preview_full_path = get_jet_cache_path($source_key, $image_relative_path, $cache_size);
                $cache_dir_path = dirname($cached_preview_full_path);

                // Create cache directory if needed
                if (!is_dir($cache_dir_path)) {
                    @mkdir($cache_dir_path, 0775, true);
                }

                // Check if file already exists
                if (file_exists($cached_preview_full_path) && filesize($cached_preview_full_path) > 0) {
                    echo "[{$timestamp}] [Job {$job_id}] Cache file already exists, skipping.\n";
                    continue;
                }
                
                // Create balanced dcraw command with good speed/quality (5 processes)
                $cpu_affinity = 0x1 << ($job_index % 5); // Distribute across 5 cores for 5 processes
                $cpu_affinity_hex = dechex($cpu_affinity);
                $dcraw_cmd = "start /HIGH /AFFINITY 0x{$cpu_affinity_hex} /B cmd /c \"" . 
                    "\"{$dcraw_executable_path}\" -q 1 -a -o 1 -w -T -c \"{$full_raw_file_path_realpath}\" | " .
                    "\"{$magick_executable_path}\" - -resize x{$cache_size} -quality " . JPEG_QUALITY . " " .
                    "-sampling-factor 4:2:0 -colorspace sRGB -define jpeg:optimize-coding=false " .
                    "-define jpeg:dct-method=fast -interlace none -filter Lanczos -limit memory 800MB " .
                    "-limit map 800MB -limit thread 1 -strip \"{$cached_preview_full_path}\"\"";
                
                $parallel_processes[] = [
                    'job_id' => $job_id,
                    'cmd' => $dcraw_cmd,
                    'output_path' => $cached_preview_full_path,
                    'start_time' => microtime(true)
                ];
                
                echo "[{$timestamp}] [Job {$job_id}] Queued for parallel processing (Core: " . ($job_index % 5) . ")\n";
            }
            
            // Execute all processes in parallel using Windows background execution
            echo "[{$timestamp}] Executing " . count($parallel_processes) . " dcraw processes in parallel...\n";
            $process_handles = [];
            foreach ($parallel_processes as $key => $process) {
                // Use proc_open for true parallel execution on Windows
                $descriptorspec = array(
                    0 => array("pipe", "r"),  // stdin
                    1 => array("pipe", "w"),  // stdout
                    2 => array("pipe", "w")   // stderr
                );
                
                $handle = proc_open($process['cmd'], $descriptorspec, $pipes);
                if (is_resource($handle)) {
                    $process_handles[$key] = [
                        'handle' => $handle,
                        'pipes' => $pipes,
                        'job_id' => $process['job_id'],
                        'output_path' => $process['output_path'],
                        'start_time' => $process['start_time']
                    ];
                    
                    // Close stdin immediately as we don't need it
                    fclose($pipes[0]);
                    
                    echo "[{$timestamp}] [Job {$process['job_id']}] Process started in background\n";
                } else {
                    echo "[{$timestamp}] [Job {$process['job_id']}] ERROR: Failed to start process\n";
                }
            }
            
            // Wait for all processes to complete and update status (5 processes max)
            $max_wait_time = 120; // 2 minutes max wait (reduced for 5 processes)
            $start_wait = time();
            
            while (count($process_handles) > 0 && (time() - $start_wait) < $max_wait_time) {
                foreach ($process_handles as $key => $proc_info) {
                    $status = proc_get_status($proc_info['handle']);
                    
                    // Check if process has finished
                    if (!$status['running']) {
                        $processing_time = round((microtime(true) - $proc_info['start_time']) * 1000, 2);
                        
                        // Read any output/errors
                        $stdout = stream_get_contents($proc_info['pipes'][1]);
                        $stderr = stream_get_contents($proc_info['pipes'][2]);
                        
                        // Close pipes and process
                        fclose($proc_info['pipes'][1]);
                        fclose($proc_info['pipes'][2]);
                        $return_code = proc_close($proc_info['handle']);
                        
                        // Check if output file was created successfully
                        if (file_exists($proc_info['output_path']) && filesize($proc_info['output_path']) > 0) {
                            echo "[{$timestamp}] [Job {$proc_info['job_id']}] SUCCESS: Completed in {$processing_time}ms\n";
                            
                            // Update job status to completed with final_cache_path
                            try {
                                $sql_finish = "UPDATE jet_cache_jobs SET status = 'completed', completed_at = ?, result_message = 'Parallel dcraw processing completed', final_cache_path = ? WHERE id = ?";
                                $stmt_finish = $pdo->prepare($sql_finish);
                                $stmt_finish->execute([time(), $proc_info['output_path'], $proc_info['job_id']]);
                            } catch (Exception $db_e) {
                                error_log("[{$timestamp}] [Job {$proc_info['job_id']}] DB update warning: " . $db_e->getMessage());
                            }
                        } else {
                            echo "[{$timestamp}] [Job {$proc_info['job_id']}] FAILED: No output file (Code: {$return_code})\n";
                            if ($stderr) {
                                echo "[{$timestamp}] [Job {$proc_info['job_id']}] Error: " . trim($stderr) . "\n";
                            }
                            
                            // Update job status to failed
                            try {
                                $sql_fail = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = ? WHERE id = ?";
                                $stmt_fail = $pdo->prepare($sql_fail);
                                $stmt_fail->execute([time(), "Process failed: " . trim($stderr ?: "Unknown error"), $proc_info['job_id']]);
                            } catch (Exception $db_e) {
                                error_log("[{$timestamp}] [Job {$proc_info['job_id']}] DB fail update warning: " . $db_e->getMessage());
                            }
                        }
                        
                        unset($process_handles[$key]);
                    }
                }
                
                if (count($process_handles) > 0) {
                    usleep(100000); // Wait 0.1 seconds before checking again (more responsive for 5 processes)
                }
            }
            
            // Handle any remaining processes that timed out
            foreach ($process_handles as $proc_info) {
                echo "[{$timestamp}] [Job {$proc_info['job_id']}] TIMEOUT: Terminating process\n";
                
                // Force terminate the process
                if (is_resource($proc_info['handle'])) {
                    // Try to read any remaining output before terminating
                    $stderr = stream_get_contents($proc_info['pipes'][2]);
                    
                    fclose($proc_info['pipes'][1]);
                    fclose($proc_info['pipes'][2]);
                    proc_terminate($proc_info['handle']);
                    proc_close($proc_info['handle']);
                }
                
                try {
                    $sql_fail = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = 'Processing timeout (>2 minutes)' WHERE id = ?";
                    $stmt_fail = $pdo->prepare($sql_fail);
                    $stmt_fail->execute([time(), $proc_info['job_id']]);
                } catch (Exception $db_e) {
                    error_log("[{$timestamp}] [Job {$proc_info['job_id']}] DB timeout update warning: " . $db_e->getMessage());
                }
            }
            
            echo "[{$timestamp}] Parallel batch processing completed.\n";

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
        
        // If we have jobs, mark them as failed
        if (!empty($jobs)) {
            try {
                ensure_db_connection(); // Ensure connection before this critical update
                foreach ($jobs as $job) {
                    $sql_fail = "UPDATE jet_cache_jobs SET status = 'failed', completed_at = ?, result_message = ? WHERE id = ?";
                    $stmt_fail = $pdo->prepare($sql_fail);
                    $stmt_fail->execute([time(), "Worker error: " . $e->getMessage(), $job['id']]);
                }
            } catch (Throwable $fail_e) {
                error_log("[{$error_timestamp}] [Jet Worker Error] Failed to mark jobs as failed after primary error: " . $fail_e->getMessage());
            }
        }
        
        // Sleep before retrying to avoid rapid error loops
        sleep($sleep_interval);
    }
}

echo "Enhanced Jet Cache Worker Shutting Down - " . date('Y-m-d H:i:s') . "\n";
error_log("[" . date('Y-m-d H:i:s') . "] [Jet Worker] Enhanced worker shutdown completed.");
?> 