<?php
// worker_cache.php - Script chạy nền để xử lý hàng đợi tạo cache thumbnail

echo "Cache Worker Started - " . date('Y-m-d H:i:s') . "\n";

// --- Thiết lập Môi trường --- 
error_reporting(E_ALL);
ini_set('display_errors', 0); // Không hiển thị lỗi ra output CLI
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/worker_php_error.log'); // Log lỗi riêng cho worker

// Tăng giới hạn thời gian chạy và bộ nhớ cho worker
set_time_limit(0); // Chạy vô hạn (hoặc đặt giới hạn rất lớn)
ini_set('memory_limit', '1024M'); 

// Include các file cần thiết (Đường dẫn tương đối từ vị trí worker)
try {
    require_once __DIR__ . '/db_connect.php'; // Kết nối DB, load config, định nghĩa constants
    if (!$pdo) {
        throw new Exception("Database connection failed in worker.");
    }
    require_once __DIR__ . '/api/helpers.php'; // Load các hàm helper
} catch (Throwable $e) {
    $timestamp = date('Y-m-d H:i:s');
    error_log("[{$timestamp}] [Worker Init Error] Failed to include required files: " . $e->getMessage());
    echo "[{$timestamp}] [Worker Init Error] Worker failed to initialize. Check logs/worker_php_error.log\n";
    exit(1); // Thoát với mã lỗi
}

// --- Database Reconnect Configuration ---
const MAX_DB_RECONNECT_ATTEMPTS = 1; // Max attempts for reconnect
const MYSQL_ERROR_CODE_SERVER_GONE_AWAY = 2006;
const MYSQL_ERROR_CODE_LOST_CONNECTION = 2013;

/**
 * Global PDO instance, to be managed by connect/reconnect logic.
 * @var PDO|null $pdo
 */

/**
 * Establishes or re-establishes the database connection.
 * This function relies on db_connect.php to set the global $pdo variable.
 * It also assumes db_connect.php uses if(!defined()) for constants.
 */
function ensure_db_connection() {
    global $pdo;
    if (!$pdo || !$pdo->query('SELECT 1')) { // Check if connection is live
        error_log("[" . date('Y-m-d H:i:s') . "] [Worker DB] Attempting to connect/reconnect to database...");
        // db_connect.php should set the global $pdo and define constants safely
        if (file_exists(__DIR__ . '/db_connect.php')) {
            require __DIR__ . '/db_connect.php'; 
        }
        if (!$pdo) {
            $timestamp = date('Y-m-d H:i:s');
            $error_msg = "[{$timestamp}] [Worker DB Error] CRITICAL: Failed to establish database connection after attempt.";
            error_log($error_msg);
            echo $error_msg . "\n";
            // Optionally exit if DB is critical and cannot be re-established
            // exit(1); 
            throw new Exception("Database connection failed and could not be re-established.");
        } else {
            error_log("[" . date('Y-m-d H:i:s') . "] [Worker DB] Database connection (re)established successfully.");
        }
    }
}

/**
 * Executes a PDOStatement with retry logic for 'MySQL server has gone away' errors.
 *
 * @param PDOStatement $stmt The PDOStatement to execute.
 * @param array $params An array of parameters to pass to execute().
 * @param bool $is_select_fetch For select queries, determines return type (fetch single).
 * @param bool $is_select_fetchall For select queries, determines return type (fetchAll).
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
                error_log("[{$timestamp}] [Worker DB Warning] MySQL server has gone away (Code: {$error_code}). Attempting reconnect ({$attempts}/" . MAX_DB_RECONNECT_ATTEMPTS . "). Error: " . $e->getMessage());
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

// +++ NEW: Reset 'processing' jobs to 'pending' on startup +++
try {
    ensure_db_connection(); // Ensure connection before this startup task
    $sql_reset = "UPDATE cache_jobs SET status = 'pending' WHERE status = 'processing'";
    $stmt_reset = $pdo->prepare($sql_reset);
    $affected_rows = execute_pdo_with_retry($stmt_reset); // NEW: Use retry logic
    if ($affected_rows > 0) {
        $reset_timestamp = date('Y-m-d H:i:s');
        $message = "[{$reset_timestamp}] [Worker Startup] Reset {$affected_rows} stuck 'processing' jobs back to 'pending'.";
        echo $message . "\n";
        error_log($message);
    }
} catch (Throwable $e) {
    $reset_fail_timestamp = date('Y-m-d H:i:s');
    $error_message = "[{$reset_fail_timestamp}] [Worker Startup Error] Failed to reset processing jobs: " . $e->getMessage();
    echo $error_message . "\n";
    error_log($error_message);
    // Continue running even if reset fails, but log the error
}
// +++ END NEW +++

// --- Biến Worker --- 
$sleep_interval = 5; // Số giây chờ giữa các lần kiểm tra hàng đợi (giây)
$running = true;

// --- Hàm xử lý tín hiệu (Graceful Shutdown) --- 
// (Hoạt động tốt hơn trên Linux/macOS, có thể không đáng tin cậy trên Windows qua Task Scheduler)
if (function_exists('pcntl_signal')) {
    declare(ticks = 1);
    function signal_handler($signo) {
        global $running;
        $timestamp = date('Y-m-d H:i:s');
        echo "\n[{$timestamp}] [Worker Signal] Received signal {$signo}. Shutting down gracefully...\n";
        error_log("[{$timestamp}] [Worker Signal] Received signal {$signo}. Initiating shutdown.");
        $running = false;
    }
    pcntl_signal(SIGTERM, 'signal_handler'); // Tín hiệu tắt thông thường
    pcntl_signal(SIGINT, 'signal_handler');  // Tín hiệu Ctrl+C
}

// --- Vòng lặp Chính của Worker --- 
echo "Entering main worker loop...\n";
while ($running) {
    $job = null;
    try {
        ensure_db_connection(); // Ensure DB is connected at the start of each loop iteration
        // --- Lấy Công việc từ Hàng đợi --- 
        $sql_get_job = "SELECT * FROM cache_jobs 
                        WHERE status = 'pending' 
                        ORDER BY created_at ASC 
                        LIMIT 1";
        $stmt_get = $pdo->prepare($sql_get_job);
        $job = execute_pdo_with_retry($stmt_get, [], true, false); // NEW: Use retry, is_select_fetch = true

        if ($job) {
            $job_id = $job['id'];
            $item_source_prefixed_path = $job['folder_path']; // This column now stores item path for single jobs too
            $job_specific_size = isset($job['size']) && is_numeric($job['size']) && $job['size'] > 0 ? (int)$job['size'] : null;
            $job_specific_type = isset($job['type']) && !empty($job['type']) ? $job['type'] : 'image'; // Default to image if type not set

            $timestamp = date('Y-m-d H:i:s');
            error_log("[{$timestamp}] [Job {$job_id}] Found job. Path: {$item_source_prefixed_path}, Specified Size: " . ($job_specific_size ?: 'N/A') . ", Type: {$job_specific_type}");

            usleep(100000); // Sleep for 100 milliseconds

            // --- Cập nhật trạng thái thành 'processing' ---
            $sql_update_status = "UPDATE cache_jobs SET status = 'processing', processed_at = ?, worker_id = ? WHERE id = ?";
            $worker_instance_id = gethostname() . "_" . getmypid(); // Unique ID for this worker instance
            $stmt_update = $pdo->prepare($sql_update_status);
            execute_pdo_with_retry($stmt_update, [time(), $worker_instance_id, $job_id]); // NEW: Use retry
            error_log("[{$timestamp}] [Job {$job_id}] Status updated to processing by worker {$worker_instance_id}.");

            $created_count = 0;
            $skipped_count = 0;
            $error_count = 0;
            $files_processed_counter = 0;
            $job_success = true;
            $job_result_message = '';
            
            $allowed_video_ext = ['mp4', 'mov', 'avi', 'mkv', 'webm']; // Define or get from config

            // Determine if it's a single file job or a folder iteration job
            $single_file_details = null;
            if ($job_specific_size !== null) { // If a size is specified, assume it's a single item job
                // DIAGNOSTIC LOG
        
                
                $single_file_details = validate_source_and_file_path($item_source_prefixed_path);
                if (!$single_file_details) {
                    // DIAGNOSTIC LOG
                    // error_log("[WORKER SINGLE ITEM ERROR - {$job_id}] validate_source_and_file_path FAILED for path: {$item_source_prefixed_path}");
                    throw new Exception("Single item job validation failed for path: {$item_source_prefixed_path}");
                }
                // DIAGNOSTIC LOG

                 error_log("[{$timestamp}] [Job {$job_id}] Identified as SINGLE ITEM job for: {$single_file_details['absolute_path']}");
            }

            if ($single_file_details) {
                // --- SINGLE ITEM PROCESSING ---
                $path_info = $single_file_details; // Use validated file details
                $item_absolute_path = $path_info['absolute_path'];
                $item_ext = strtolower(pathinfo($item_absolute_path, PATHINFO_EXTENSION));
                $current_item_type = $job_specific_type; // Use type from job
                
                // DIAGNOSTIC LOG
    

                // Ensure total_files and processed_files are set correctly for single item
                 $stmt_single_total = $pdo->prepare("UPDATE cache_jobs SET total_files = 1, processed_files = 0 WHERE id = ?");
                 execute_pdo_with_retry($stmt_single_total, [$job_id]); // NEW

                $size_to_generate = $job_specific_size; // Use size from job

                $thumb_filename_safe = sha1($item_source_prefixed_path) . '_' . $size_to_generate . '.jpg';
                $cache_dir_for_size = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size_to_generate;
                $cache_absolute_path = $cache_dir_for_size . DIRECTORY_SEPARATOR . $thumb_filename_safe;

                if (!is_dir($cache_dir_for_size)) {
                    if (!@mkdir($cache_dir_for_size, 0775, true)) {
                        throw new Exception("Failed to create cache subdir for single item: {$cache_dir_for_size}");
                    }
                }

                if (file_exists($cache_absolute_path) && filesize($cache_absolute_path) > 0) {
                    error_log("[{$timestamp}] [Job {$job_id}] Thumbnail already exists for single item: {$cache_absolute_path}. Skipping.");
                    $skipped_count++;
                    $job_result_message = "Thumbnail already existed.";
                } else {
                    try {
                        $creation_success = false;
                        // DIAGNOSTIC LOG
        

                        if ($current_item_type === 'video' || ($current_item_type === 'image' && in_array($item_ext, $allowed_video_ext, true))) {
                            error_log("[{$timestamp}] [Job {$job_id}] Creating VIDEO thumbnail for: {$item_absolute_path} size {$size_to_generate}");
                            $creation_success = create_video_thumbnail($item_absolute_path, $cache_absolute_path, $size_to_generate);
                        } else { // Default to image
                            error_log("[{$timestamp}] [Job {$job_id}] Creating IMAGE thumbnail for: {$item_absolute_path} size {$size_to_generate}");
                            // DIAGNOSTIC LOG
        
                            $creation_success = create_thumbnail($item_absolute_path, $cache_absolute_path, $size_to_generate);
                        }

                        if ($creation_success) {
                            // DIAGNOSTIC LOG
                            // error_log("[WORKER SINGLE ITEM SUCCESS - {$job_id}] Thumbnail creation successful for {$item_absolute_path}.");
                            $created_count++;
                            $job_result_message = "Thumbnail created successfully.";

                            // Store original dimensions
                            $original_dims = @getimagesize($item_absolute_path);
                            if ($original_dims) {
                                $sql_update_dims = "UPDATE cache_jobs SET original_width = ?, original_height = ? WHERE id = ?";
                                $stmt_update_dims = $pdo->prepare($sql_update_dims);
                                execute_pdo_with_retry($stmt_update_dims, [$original_dims[0], $original_dims[1], $job_id]); // NEW
                                error_log("[{$timestamp}] [Job {$job_id}] Stored original dimensions ({$original_dims[0]}x{$original_dims[1]}) for {$item_source_prefixed_path}.");
                            } else {
                                error_log("[{$timestamp}] [Job {$job_id}] WARNING: Could not get original dimensions for {$item_absolute_path}. Storing 0x0.");
                                $sql_update_dims_to_zero = "UPDATE cache_jobs SET original_width = 0, original_height = 0 WHERE id = ?";
                                $stmt_update_dims_to_zero = $pdo->prepare($sql_update_dims_to_zero);
                                execute_pdo_with_retry($stmt_update_dims_to_zero, [$job_id]); // NEW
                                error_log("[{$timestamp}] [Job {$job_id}] Stored 0x0 for original dimensions for {$item_source_prefixed_path} after getimagesize failed.");
                            }
                        } else {
                            // DIAGNOSTIC LOG
                            // error_log("[WORKER SINGLE ITEM ERROR - {$job_id}] Thumbnail creation FAILED for {$item_absolute_path}.");
                            $error_count++;
                            $job_result_message = "Failed to create thumbnail.";
                            $job_success = false;
                        }
                    } catch (Throwable $thumb_e) {
                        // DIAGNOSTIC LOG
                        // error_log("[WORKER SINGLE ITEM EXCEPTION - {$job_id}] Exception during thumbnail creation for {$item_absolute_path}: " . $thumb_e->getMessage() . "\nStack:" . $thumb_e->getTraceAsString());
                        error_log("[{$timestamp}] [Job {$job_id}] EXCEPTION creating thumbnail for {$item_absolute_path}: " . $thumb_e->getMessage());
                        $error_count++;
                        $job_result_message = "Exception during thumbnail creation: " . $thumb_e->getMessage();
                        $job_success = false;
                    }
                }
                $files_processed_counter = 1; // Only one file in this job type

            } else {
                // --- FOLDER ITERATION PROCESSING (Existing Logic Adapted) ---
                error_log("[{$timestamp}] [Job {$job_id}] Identified as FOLDER job for: {$item_source_prefixed_path}");
                $folder_path_info = validate_source_and_path($item_source_prefixed_path);
                if (!$folder_path_info || $folder_path_info['is_root']) {
                    throw new Exception("Folder job validation failed or is root for path: {$item_source_prefixed_path}");
                }
                $source_key = $folder_path_info['source_key'];
                $absolute_folder_path = $folder_path_info['absolute_path'];

                // Count total files in folder (existing logic)
                $total_files_in_folder = 0;
                $allowed_ext_for_folder = ALLOWED_EXTENSIONS; // Includes images and videos
                try {
                    $counter_directory = new RecursiveDirectoryIterator($absolute_folder_path, RecursiveDirectoryIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS);
                    $counter_iterator = new RecursiveIteratorIterator($counter_directory, RecursiveIteratorIterator::LEAVES_ONLY);
                    foreach ($counter_iterator as $counter_fileinfo) {
                        if ($counter_fileinfo->isFile() && $counter_fileinfo->isReadable() && in_array(strtolower($counter_fileinfo->getExtension()), $allowed_ext_for_folder, true)) {
                            $total_files_in_folder++;
                        }
                    }
                     $stmt_folder_total = $pdo->prepare("UPDATE cache_jobs SET total_files = ? WHERE id = ?");
                     execute_pdo_with_retry($stmt_folder_total, [$total_files_in_folder, $job_id]); // NEW
                    error_log("[{$timestamp}] [Job {$job_id}] Counted {$total_files_in_folder} processable items in folder '{$item_source_prefixed_path}'.");
                } catch (Throwable $count_e) {
                    throw new Exception("Failed to pre-count files for folder job {$job_id}: " . $count_e->getMessage());
                }

                // Determine sizes for folder processing (MODIFIED: create both 150 and 750)
                $all_configured_sizes = THUMBNAIL_SIZES;
                $sizes_to_generate_for_folder = [150, 750]; // Always generate both sizes for folders
                
                // Validate that we have sizes to generate
                if (!empty($all_configured_sizes)) {
                    // Use intersection to only generate configured sizes
                    $sizes_to_generate_for_folder = array_intersect($sizes_to_generate_for_folder, $all_configured_sizes);
                }
                
                if (empty($sizes_to_generate_for_folder)) {
                    $sizes_to_generate_for_folder = [150]; // Fallback to at least 150px
                    error_log("[{$timestamp}] [Job {$job_id}] No valid THUMBNAIL_SIZES configured for folder job, defaulting to [150].");
                } 
                
                error_log("[{$timestamp}] [Job {$job_id}] Folder job will generate thumbnails of sizes: " . implode(', ', $sizes_to_generate_for_folder));


                // Iterate and process (existing logic adapted)
                $directory_iterator = new RecursiveDirectoryIterator($absolute_folder_path, RecursiveDirectoryIterator::SKIP_DOTS | FilesystemIterator::FOLLOW_SYMLINKS);
                $iterator = new RecursiveIteratorIterator($directory_iterator, RecursiveIteratorIterator::LEAVES_ONLY);
                
                $update_progress_closure = function($current_file_path_relative = null, $force_update = false)
                                     use ($pdo, $job_id, &$files_processed_counter, $timestamp /*, &$last_progress_update_time, $update_interval_seconds -- these were local to original closure*/)
                {
                    static $last_progress_update_time_static = 0; // Make static to persist across calls for this job
                    static $update_interval_seconds_static = 7;   // Make static
                    $now = time();
                    if ($force_update || ($now - $last_progress_update_time_static >= $update_interval_seconds_static)) {
                        try {
                             $stmt_progress = $pdo->prepare("UPDATE cache_jobs SET processed_files = ?, current_file_processing = ? WHERE id = ?");
                             execute_pdo_with_retry($stmt_progress, [$files_processed_counter, $current_file_path_relative, $job_id]); // NEW
                             $last_progress_update_time_static = $now;
                        } catch (PDOException $e) {
                            error_log("[{$timestamp}] [Job {$job_id}] Error updating folder job progress: " . $e->getMessage());
                        }
                    }
                };


                foreach ($iterator as $fileinfo) {
                    if (!$running) break;
                    $item_absolute_path_iter = $fileinfo->getRealPath();
                    $item_ext_iter = strtolower($fileinfo->getExtension());

                    if ($fileinfo->isFile() && $fileinfo->isReadable() && in_array($item_ext_iter, $allowed_ext_for_folder, true)) {
                        $files_processed_counter++;
                        $item_relative_to_source_iter = ltrim(substr($item_absolute_path_iter, strlen(IMAGE_SOURCES[$source_key]['path'])), '\\/');
                        $item_sp_path_iter = $source_key . '/' . str_replace('\\', '/', $item_relative_to_source_iter);
                        
                        $update_progress_closure($item_relative_to_source_iter);

                        $current_item_type_iter = in_array($item_ext_iter, $allowed_video_ext, true) ? 'video' : 'image';
                        
                        // MODIFIED: Generate thumbnails for all configured sizes
                        $item_created_count = 0;
                        $item_skipped_count = 0;
                        $item_error_count = 0;
                        
                        foreach ($sizes_to_generate_for_folder as $size_to_generate) {
                            $thumb_filename_safe_iter = sha1($item_sp_path_iter) . '_' . $size_to_generate . '.jpg';
                            $cache_dir_for_size_iter = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size_to_generate;
                            $cache_absolute_path_iter = $cache_dir_for_size_iter . DIRECTORY_SEPARATOR . $thumb_filename_safe_iter;

                            if (!is_dir($cache_dir_for_size_iter)) {
                                if(!@mkdir($cache_dir_for_size_iter, 0775, true)) {
                                    error_log("[{$timestamp}] [Job {$job_id}] Failed to create cache subdir: {$cache_dir_for_size_iter} for item {$item_sp_path_iter}");
                                    $item_error_count++;
                                    $job_result_message .= "Error creating cache subdir {$cache_dir_for_size_iter}. ";
                                    continue; // Skip this size, try next
                                }
                            }

                            if (file_exists($cache_absolute_path_iter) && filesize($cache_absolute_path_iter) > 0) {
                                // error_log("[{$timestamp}] [Job {$job_id}] Thumbnail already exists for: {$item_sp_path_iter} size {$size_to_generate}. Skipping.");
                                $item_skipped_count++;
                                continue; // Skip this size, try next
                            }

                            try {
                                $creation_success_iter = false;
                                if ($current_item_type_iter === 'video') {
                                    $creation_success_iter = create_video_thumbnail($item_absolute_path_iter, $cache_absolute_path_iter, $size_to_generate);
                                } else {
                                    $creation_success_iter = create_thumbnail($item_absolute_path_iter, $cache_absolute_path_iter, $size_to_generate);
                                }
                                if ($creation_success_iter) {
                                    $item_created_count++;
                                    // Log successful creation for first size only to avoid spam
                                    if ($size_to_generate === min($sizes_to_generate_for_folder)) {
                                        error_log("[{$timestamp}] [Job {$job_id}] Successfully created thumbnails for: {$item_sp_path_iter}");
                                    }
                                } else {
                                    $item_error_count++;
                                    $job_result_message .= "Failed {$size_to_generate}px for {$item_sp_path_iter}. ";
                                }
                            } catch (Throwable $thumb_e_iter) {
                                error_log("[{$timestamp}] [Job {$job_id}] EXCEPTION creating {$size_to_generate}px thumbnail for {$item_sp_path_iter}: " . $thumb_e_iter->getMessage());
                                $item_error_count++;
                                $job_result_message .= "Exception {$size_to_generate}px for {$item_sp_path_iter}: " . substr($thumb_e_iter->getMessage(), 0, 50) . ". ";
                            }
                        } // End foreach sizes
                        
                        // Update overall counters
                        $created_count += $item_created_count;
                        $skipped_count += $item_skipped_count;
                        $error_count += $item_error_count;
                    }
                }
                if ($error_count > 0) $job_success = false; // Mark folder job as failed if any item had an error.
                $job_result_message = "Folder processed. Created: {$created_count}, Skipped: {$skipped_count}, Errors: {$error_count}. " . $job_result_message;

            } // End FOLDER ITERATION

            // --- Cập nhật trạng thái cuối cùng của công việc ---
            $final_status = $job_success ? 'completed' : 'failed';

            // Update final job status
            $final_status = ($error_count === 0 && $running) ? 'completed' : 'failed'; // Mark failed if errors OR if shutdown was requested
            // If shutdown was requested mid-process, add note to result message
            if (!$running && $final_status === 'failed') {
                $job_result_message .= " (Dừng do yêu cầu tắt worker)";
            }

            // +++ Cập nhật lần cuối với status, message, image_count VÀ xóa current_file_processing +++
            $sql_finish = "UPDATE cache_jobs SET status = ?, completed_at = ?, result_message = ?, image_count = ?, processed_files = ?, current_file_processing = NULL WHERE id = ?";
            $stmt_finish = $pdo->prepare($sql_finish);
            // Dùng $files_processed_counter thay vì $files_processed (không còn tồn tại)
            execute_pdo_with_retry($stmt_finish, [$final_status, time(), $job_result_message, $files_processed_counter, $files_processed_counter, $job_id]); // NEW
            echo "[{$timestamp}] [Job {$job_id}] Marked job as {$final_status}.\n";

            // Cập nhật last_cached_fully_at chỉ khi hoàn thành không lỗi VÀ worker không bị dừng
            if ($final_status === 'completed') {
                try {
                    ensure_db_connection(); // Ensure connection before this operation
                    // MySQL compatible INSERT ... ON DUPLICATE KEY UPDATE
                    // folder_stats requires folder_path, which is $folder_path_param (source_prefixed_path)
                    $sql_update_stats = "INSERT INTO folder_stats (folder_name, folder_path, views, downloads, last_cached_fully_at) 
                                           VALUES (?, ?, 0, 0, ?) 
                                           ON DUPLICATE KEY UPDATE 
                                               last_cached_fully_at = VALUES(last_cached_fully_at),
                                               views = views, 
                                               downloads = downloads";
                    $stmt_update_stats = $pdo->prepare($sql_update_stats);
                    $current_timestamp = time(); 
                    // Execute with folder_name, folder_path, and timestamp
                    execute_pdo_with_retry($stmt_update_stats, [$item_source_prefixed_path, $item_source_prefixed_path, $current_timestamp]); // NEW
                    error_log("[{$timestamp}] [Job {$job_id}] Successfully updated last_cached_fully_at for '{$item_source_prefixed_path}'.");
                } catch (Throwable $e_stats) {
                    error_log("[{$timestamp}] [Job {$job_id}] Error updating folder_stats for '{$item_source_prefixed_path}': " . $e_stats->getMessage());
                }
            }
            
        } else {
            // Không có công việc nào đang chờ
            if ($running) { // Chỉ sleep nếu worker vẫn đang chạy
                // echo "."; // In dấu chấm để biết worker còn sống
                sleep($sleep_interval);
                 // Kiểm tra tín hiệu tắt trong lúc sleep
                 if (function_exists('pcntl_signal_dispatch')) pcntl_signal_dispatch();
            }
        }
        
        // Kiểm tra tín hiệu tắt sau mỗi vòng lặp
        if (function_exists('pcntl_signal_dispatch')) pcntl_signal_dispatch();
        
    } catch (Throwable $e) {
        // Lỗi nghiêm trọng trong vòng lặp chính của worker (ví dụ: mất kết nối DB)
        $timestamp = date('Y-m-d H:i:s');
        error_log("[{$timestamp}] [Worker Main Loop Error] " . $e->getMessage());
        error_log("[{$timestamp}] [Worker Main Loop Error] Stack Trace: \n" . $e->getTraceAsString());
        echo "\n[{$timestamp}] [Worker Main Loop Error] Worker encountered a critical error. Check logs. Attempting to reconnect/restart loop after delay...\n";
        // Cố gắng đóng kết nối cũ (nếu có thể) và chờ trước khi thử lại
        $pdo = null; 
        sleep(30); // Chờ 30 giây trước khi thử kết nối lại
        try {
             require __DIR__ . '/db_connect.php'; // Thử kết nối lại
             if (!$pdo) throw new Exception("Reconnect failed.");
              echo "[{$timestamp}] [Worker Main Loop Error] Reconnected to DB successfully.\n";
        } catch (Throwable $reconnect_e) {
             error_log("[{$timestamp}] [Worker Main Loop Error] Failed to reconnect DB after error. Shutting down worker.");
             echo "[{$timestamp}] [Worker Main Loop Error] Failed to reconnect. Worker shutting down.\n";
             $running = false; // Dừng worker
        }
    }
} // End while($running)

$timestamp = date('Y-m-d H:i:s');
echo "[{$timestamp}] [Worker Shutdown] Worker loop exited.\n";
error_log("[{$timestamp}] [Worker Shutdown] Worker loop finished.");
exit(0); // Kết thúc thành công
?> 