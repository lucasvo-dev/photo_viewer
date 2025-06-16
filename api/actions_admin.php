<?php
// api/actions_admin.php

// Dependencies:
// - Assumes $action, $pdo, $search_term are available (from init.php)
// - Assumes all helper functions are available (from helpers.php)
// - Assumes IMAGE_SOURCES constant is defined

// Prevent direct access
if (!isset($action)) {
    die('Invalid access.');
}

// Check if the user is logged in for all admin actions (except login and debug actions)
$allowed_no_auth_actions = ['admin_login', 'admin_check_auth', 'admin_debug_session'];
if (!in_array($action, $allowed_no_auth_actions) && (!isset($_SESSION['user_role']) || !in_array($_SESSION['user_role'], ['admin', 'designer']))) {
    json_error("Truy cập bị từ chối. Yêu cầu quyền admin.", 403);
    exit;
}

switch ($action) {
    case 'admin_debug_session':
        // Debug endpoint for session checking
        $debug_info = [
            'session_started' => session_status() === PHP_SESSION_ACTIVE,
            'session_data' => $_SESSION ?? [],
            'user_role' => $_SESSION['user_role'] ?? null,
            'username' => $_SESSION['username'] ?? null,
            'auth_check' => isset($_SESSION['user_role']) && in_array($_SESSION['user_role'], ['admin', 'designer'])
        ];
        json_response($debug_info);
        break;
        
    case 'file_manager_get_sources':
        // Get available image sources for file manager
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền truy cập.", 403);
        }
        
        $sources = [];
        foreach (IMAGE_SOURCES as $key => $config) {
            $sources[] = [
                'key' => $key,
                'name' => $config['name']
            ];
        }
        
        json_response(['sources' => $sources]);
        break;

    case 'admin_login':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';

        // This API action is deprecated - login is now handled in login.php
        // But we'll keep it for backward compatibility
        error_log("[Admin Login API] Deprecated admin_login action called. Login should be handled in login.php");
        json_error('Vui lòng sử dụng trang đăng nhập chính thức.', 400);
        break;

    case 'admin_logout':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        // This API action is deprecated - logout is now handled in individual pages
        // But we'll keep it for backward compatibility
        $username = $_SESSION['username'] ?? ($_SESSION['admin_username'] ?? 'unknown');
        session_unset();
        session_destroy();
        error_log("[Admin Logout API] Logout successful for user: {$username}");
        json_response(['success' => true]);
        break;

    case 'admin_check_auth':
        if (isset($_SESSION['user_role']) && in_array($_SESSION['user_role'], ['admin', 'designer'])) {
            json_response(['logged_in' => true, 'username' => $_SESSION['username'] ?? '', 'role' => $_SESSION['user_role']]);
        } else {
            json_response(['logged_in' => false]);
        }
        break;

    case 'admin_list_folders':
        // $search_term is available from init.php
        $admin_search_term = $search_term;
        // Handle specific path filter for polling/info modal - Initialize to null
        $path_filter = $_GET['path_filter'] ?? null;

        try {
            $folders_data = [];
            $protected_status = [];
            $folder_stats = [];

            // Fetch protected folders
            $stmt = $pdo->query("SELECT folder_name FROM folder_passwords");
            while ($row = $stmt->fetchColumn()) {
                $protected_status[$row] = true;
            }

            // Fetch folder stats
            try {
                $stmt = $pdo->query("SELECT folder_name, views, downloads, last_cached_fully_at FROM folder_stats");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $folder_stats[$row['folder_name']] = [
                        'views' => $row['views'], 
                        'downloads' => $row['downloads'],
                        'last_cached_fully_at' => $row['last_cached_fully_at']
                    ];
                }
            } catch (PDOException $e) {
                error_log("ERROR fetching folder stats for admin: " . $e->getMessage());
            }

            // +++ NEW: Fetch active cache job statuses +++
            $active_cache_jobs = [];
            try {
                 // Lấy thêm các trường tiến trình
                 $sql_jobs = "SELECT folder_path, status, total_files, processed_files, current_file_processing 
                              FROM cache_jobs 
                              WHERE status IN ('pending', 'processing')";
                 $stmt_jobs = $pdo->query($sql_jobs);
                 while ($job_row = $stmt_jobs->fetch(PDO::FETCH_ASSOC)) {
                     $active_cache_jobs[$job_row['folder_path']] = [
                         'status' => $job_row['status'],
                         'total_files' => (int)$job_row['total_files'],
                         'processed_files' => (int)$job_row['processed_files'],
                         'current_file' => $job_row['current_file_processing']
                     ];
                 }
            } catch (PDOException $e) {
                 error_log("ERROR fetching active cache job statuses for admin: " . $e->getMessage());
                 // Continue without job status if query fails
            }
            // +++ END NEW +++

            // Fetch latest job result messages (NO LONGER PRE-FETCHED)
            // $latest_job_results = []; 
            // try { ... } catch ...

            // Iterate through IMAGE_SOURCES
            foreach (IMAGE_SOURCES as $source_key => $source_config) {
                if (!is_array($source_config) || !isset($source_config['path'])) continue;
                $source_base_path = $source_config['path'];
                $resolved_source_base_path = realpath($source_base_path);

                if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
                    error_log("[admin_list_folders] Skipping source '{$source_key}': Path invalid or not readable.");
                    continue;
                }

                try {
                    $iterator = new DirectoryIterator($resolved_source_base_path);
                    foreach ($iterator as $fileinfo) {
                        if ($fileinfo->isDot() || !$fileinfo->isDir()) {
                            continue;
                        }

                        $dir_name = $fileinfo->getFilename();
                        $source_prefixed_path = $source_key . '/' . $dir_name;

                        // Apply path filter if provided
                        $is_target_folder = ($path_filter === null || $source_prefixed_path === $path_filter);

                        // Apply search filter if provided (and no path filter or it's the target folder)
                        $passes_search = ($admin_search_term === null || mb_stripos($dir_name, $admin_search_term, 0, 'UTF-8') !== false);

                        // Only proceed if it's the target folder (if filtering) AND passes search (if searching)
                        if ($is_target_folder && $passes_search) {
                            $stats = $folder_stats[$source_prefixed_path] ?? [
                                'views' => 0,
                                'downloads' => 0,
                                'last_cached_fully_at' => null
                            ];
                            $latest_job_info = [
                                'message' => null,
                                'image_count' => null,
                                'created_at' => null,
                                'status' => null,
                                'total_files' => 0,       // Default value
                                'processed_files' => 0, // Default value
                                'current_file' => null  // Default value
                            ];

                            // ---> FETCH LATEST JOB INFO INSIDE LOOP <--- (Including progress fields)
                            try {
                                // Lấy thêm các trường tiến trình từ job gần nhất (bất kể status)
                                $sql_latest_job = "SELECT cj.result_message, cj.image_count, cj.created_at, cj.status, 
                                                       cj.total_files, cj.processed_files, cj.current_file_processing
                                                    FROM cache_jobs cj 
                                                    WHERE cj.folder_path = ? 
                                                    ORDER BY cj.id DESC 
                                                    LIMIT 1";
                                $stmt_latest_job = $pdo->prepare($sql_latest_job);
                                $stmt_latest_job->execute([$source_prefixed_path]);
                                $job_row = $stmt_latest_job->fetch(PDO::FETCH_ASSOC);
                                if ($job_row) {
                                    $latest_job_info['message'] = $job_row['result_message'];
                                    $latest_job_info['image_count'] = $job_row['image_count'] ? (int)$job_row['image_count'] : null;
                                    $latest_job_info['created_at'] = $job_row['created_at'];
                                    $latest_job_info['status'] = $job_row['status'];
                                    // Lấy thông tin tiến trình từ job gần nhất
                                    $latest_job_info['total_files'] = (int)$job_row['total_files'];
                                    $latest_job_info['processed_files'] = (int)$job_row['processed_files'];
                                    // Chỉ lấy current_file nếu job đó đang processing (vì nó được xóa khi hoàn thành/lỗi)
                                    $latest_job_info['current_file'] = ($job_row['status'] === 'processing') ? $job_row['current_file_processing'] : null;
                                }
                            } catch (PDOException $e_job) {
                                 error_log("[admin_list_folders] Error fetching latest job info for {$source_prefixed_path}: " . $e_job->getMessage());
                                 // Continue without job info
                            }
                            // ---> END FETCH LATEST JOB INFO <---

                            // Determine which image count to use
                            $last_cached_image_count = null; // Initialize
                            if ($stats['last_cached_fully_at']) { // Check if stats has a valid timestamp first
                                if ($latest_job_info['created_at']) {
                                     $job_time = strtotime($latest_job_info['created_at']);
                                     // Use job count if job is newer or equal to stats timestamp
                                     if ($job_time && $job_time >= $stats['last_cached_fully_at']) {
                                         $last_cached_image_count = $latest_job_info['image_count'];
                                     } else {
                                         // If stats is newer, we need a way to know the count from stats.
                                         // Currently, folder_stats table doesn't store count.
                                         // For now, maybe keep using the latest job's count even if older?
                                         // Or set to null if stats is newer and we don't have a count?
                                         // Let's use latest job count for now if available, otherwise null.
                                          $last_cached_image_count = $latest_job_info['image_count']; 
                                     }
                                } else {
                                     // Stats exist, but no job info - count is unknown from stats table
                                     $last_cached_image_count = null; 
                                }
                            } else if ($latest_job_info['created_at']) {
                                 // No stats timestamp, but job exists: use job count
                                 $last_cached_image_count = $latest_job_info['image_count'];
                            }
                           
                            $current_job_status = $active_cache_jobs[$source_prefixed_path]['status'] ?? null;
                            // Lấy thông tin tiến trình từ active job nếu có, nếu không thì từ job gần nhất
                            $progress_info = $active_cache_jobs[$source_prefixed_path] ?? $latest_job_info;

                            // Add folder data ONLY if it meets the criteria
                            $folders_data[] = [
                                'name' => $dir_name,
                                'path' => $source_prefixed_path,
                                'source' => $source_key,
                                'is_password_protected' => isset($protected_status[$source_prefixed_path]),
                                'views' => (int)($stats['views'] ?? 0),
                                'zip_downloads' => (int)($stats['downloads'] ?? 0),
                                'last_cached_fully_at' => $stats['last_cached_fully_at'] ? (int)$stats['last_cached_fully_at'] : null,
                                'current_cache_job_status' => $current_job_status,
                                'latest_job_result_message' => $latest_job_info['message'],
                                'last_cached_image_count' => $last_cached_image_count ? (int)$last_cached_image_count : null,
                                'latest_job_status' => $latest_job_info['status'], // Add job status
                                // Thêm các trường tiến trình vào response
                                'total_files' => (int)$progress_info['total_files'],
                                'processed_files' => (int)$progress_info['processed_files'],
                                'current_file_processing' => $current_job_status === 'processing' ? $progress_info['current_file'] : null // Chỉ gửi file hiện tại nếu đang processing
                            ];
                        }
                    }
                } catch (Exception $e) {
                    error_log("[admin_list_folders] Error scanning source '{$source_key}': " . $e->getMessage());
                }
            } // End foreach IMAGE_SOURCES

            usort($folders_data, fn ($a, $b) => strnatcasecmp($a['name'], $b['name']));

            // === End Calculation ===

            json_response([
                'folders' => $folders_data,
                // 'total_cache_files' => $total_cache_files // REMOVED from response
            ]);

        } catch (Throwable $e) {
            error_log("FATAL ERROR in admin_list_folders: " . $e->getMessage() . "\nStack Trace:\n" . $e->getTraceAsString());
            json_error("Không thể lấy danh sách thư mục quản lý. Lỗi: " . $e->getMessage(), 500);
        }
        break;

    case 'admin_set_password':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $folder_param = $_POST['folder'] ?? null;
        $password = $_POST['password'] ?? null;

        if ($folder_param === null || $password === null) {
            json_error('Thiếu thông tin thư mục hoặc mật khẩu.', 400);
        }
        if ($password === '') {
            json_error('Mật khẩu không được để trống.', 400);
        }

        // Validate the FOLDER path using helper
        $folder_path_info = validate_source_and_path($folder_param);
        if ($folder_path_info === null || $folder_path_info['is_root']) {
            json_error('Tên thư mục không hợp lệ hoặc không thể đặt mật khẩu cho thư mục gốc.', 400);
        }
        $source_prefixed_path = $folder_path_info['source_prefixed_path'];

        try {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            if ($hash === false) {
                throw new Exception('Không thể tạo hash mật khẩu.');
            }

            // SQLite: INSERT OR REPLACE INTO folder_passwords (folder_name, password_hash) VALUES (?, ?)
            // MySQL: REPLACE INTO folder_passwords (folder_name, folder_path, password_hash) VALUES (?, ?, ?)
            // The folder_path column is NOT NULL in folder_passwords table.
            $sql = "REPLACE INTO folder_passwords (folder_name, folder_path, password_hash) VALUES (?, ?, ?)";
            $stmt = $pdo->prepare($sql);
            // Use $source_prefixed_path for both folder_name and folder_path
            if ($stmt->execute([$source_prefixed_path, $source_prefixed_path, $hash])) {
                unset($_SESSION['authorized_folders'][$source_prefixed_path]); // Clear any existing public auth
                json_response(['success' => true, 'message' => "Đặt/Cập nhật mật khẩu thành công cho '" . htmlspecialchars($source_prefixed_path) . "'."]);
            } else {
                throw new Exception('Lỗi thực thi truy vấn CSDL.');
            }
        } catch (Throwable $e) {
            error_log("admin_set_password: Error for '{$source_prefixed_path}': " . $e->getMessage());
            json_error('Lỗi server khi đặt mật khẩu: ' . $e->getMessage(), 500);
        }
        break;

    case 'admin_remove_password':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $folder_param = $_POST['folder'] ?? null;
        if ($folder_param === null) {
            json_error('Thiếu thông tin thư mục.', 400);
        }

        // Validate path format using helper (folder might not exist anymore, but path format should be valid)
        $folder_path_info = validate_source_and_path($folder_param);
         // We need to check the *format*, even if the directory doesn't resolve perfectly now.
         // A simpler check for format might be better here if validate_source_and_path fails for non-existent dirs.
         $path_parts_remove = explode('/', trim(str_replace(['..', '\\', "\0"], '', $folder_param), '/'), 2);
         if (count($path_parts_remove) < 2 || !isset(IMAGE_SOURCES[$path_parts_remove[0]])) {
             json_error('Định dạng tên thư mục không hợp lệ.', 400);
         }
         $source_prefixed_path = $path_parts_remove[0] . '/' . $path_parts_remove[1]; // Use the formatted path

        // if ($folder_path_info === null || $folder_path_info['is_root']) {
        //     json_error('Đường dẫn thư mục không hợp lệ.', 400);
        // }
        // $source_prefixed_path = $folder_path_info['source_prefixed_path']; // Use the validated path if validation required existence

        try {
            $sql = "DELETE FROM folder_passwords WHERE folder_name = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$source_prefixed_path]);
            $affected_rows = $stmt->rowCount();

            unset($_SESSION['authorized_folders'][$source_prefixed_path]); // Clear any existing public auth

            json_response(['success' => true, 'message' => "Đã xóa mật khẩu (nếu có) cho '" . htmlspecialchars($source_prefixed_path) . "'. Bị ảnh hưởng: {$affected_rows} dòng."]);
        } catch (Throwable $e) {
            error_log("[admin_remove_password] FATAL ERROR for '{$source_prefixed_path}': " . $e->getMessage());
            json_error('Lỗi server khi xóa mật khẩu: ' . $e->getMessage(), 500);
        }
        break;

    // +++ ACTION: Manually cache thumbnails for a folder (NOW ASYNC) +++
    case 'admin_cache_folder':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Method Not Allowed', 405);
        }
        $folder_path_param = $_POST['path'] ?? null;
        if (!$folder_path_param) {
            json_error('Missing folder path parameter.', 400);
        }

        $path_info = validate_source_and_path($folder_path_param);
        if (!$path_info || $path_info['is_root']) {
            json_error('Invalid or root folder path provided.', 400);
        }
        $source_prefixed_path_to_queue = $path_info['source_prefixed_path']; // Use validated path

        try {
            // Check if a job for this folder is already pending or processing
            $sql_check = "SELECT status FROM cache_jobs WHERE folder_path = ? AND status IN ('pending', 'processing') LIMIT 1";
            $stmt_check = $pdo->prepare($sql_check);
            $stmt_check->execute([$source_prefixed_path_to_queue]);
            $existing_job = $stmt_check->fetch();

            if ($existing_job) {
                $status_msg = ($existing_job['status'] === 'processing') ? 'đang được xử lý' : 'đã có trong hàng đợi';
                json_response(['success' => true, 'message' => "Yêu cầu cache cho '{$source_prefixed_path_to_queue}' {$status_msg}." , 'status' => 'already_queued']);
                exit;
            }

            // Insert new job into the queue
            $sql_insert = "INSERT INTO cache_jobs (folder_path, created_at) VALUES (?, ?)";
            $stmt_insert = $pdo->prepare($sql_insert);
            $current_time = time();
            if ($stmt_insert->execute([$source_prefixed_path_to_queue, $current_time])) {
                json_response(['success' => true, 'message' => "Đã thêm yêu cầu tạo cache cho '{$source_prefixed_path_to_queue}' vào hàng đợi.", 'status' => 'queued']);
            } else {
                throw new Exception('Không thể thêm công việc vào hàng đợi CSDL.');
            }

        } catch (Throwable $e) {
            error_log("[Admin Cache Enqueue] Error processing folder '{$source_prefixed_path_to_queue}': " . $e->getMessage());
            json_error("Đã xảy ra lỗi khi đưa yêu cầu vào hàng đợi: " . $e->getMessage(), 500);
        }
        break;
    // +++ END ASYNC CACHE ACTION +++

    // +++ ACTION: Get specific folder cache status (for polling) +++
    case 'get_folder_cache_status':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') { // Use GET for status check
            json_error('Method Not Allowed', 405);
        }
        $folder_path_param = $_GET['path'] ?? null;
        if (!$folder_path_param) {
            json_error('Missing folder path parameter.', 400);
        }

        // Basic validation, might not need full validate_source_and_path if just checking DB
        $path_parts = explode('/', trim(str_replace(['..', '\\', "\0"], '', $folder_path_param), '/'), 2);
        if (count($path_parts) < 2 || !isset(IMAGE_SOURCES[$path_parts[0]])) {
            json_error('Invalid folder path format.', 400);
        }
        $validated_folder_path = $path_parts[0] . '/' . $path_parts[1]; // Use validated format

        try {
            $current_job_status = null;
            $last_cached_at = null;

            // Check for active job
            $sql_job = "SELECT status FROM cache_jobs WHERE folder_path = ? AND status IN ('pending', 'processing') LIMIT 1";
            $stmt_job = $pdo->prepare($sql_job);
            $stmt_job->execute([$validated_folder_path]);
            $current_job_status = $stmt_job->fetchColumn() ?: null; // Fetch status or null

            // Get last cache time
            $sql_stat = "SELECT last_cached_fully_at FROM folder_stats WHERE folder_name = ? LIMIT 1";
            $stmt_stat = $pdo->prepare($sql_stat);
            $stmt_stat->execute([$validated_folder_path]);
            $last_cached_at = $stmt_stat->fetchColumn() ?: null; // Fetch timestamp or null
            
            // Ensure last_cached_at is integer or null
            if ($last_cached_at !== null) {
                $last_cached_at = (int)$last_cached_at;
            }

            json_response([
                'success' => true, 
                'job_status' => $current_job_status, 
                'last_cached_at' => $last_cached_at
            ]);

        } catch (Throwable $e) {
            error_log("[Get Cache Status] Error for '{$validated_folder_path}': " . $e->getMessage());
            json_error("Đã xảy ra lỗi khi kiểm tra trạng thái cache: " . $e->getMessage(), 500);
        }
        break;
    // +++ END GET STATUS ACTION +++

    case 'admin_queue_cache':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $folder_path = $_POST['folder_path'] ?? '';

        if (empty($folder_path)) {
            json_error('Thiếu đường dẫn thư mục.', 400);
        }

        // Validate path structure (source_key/dir_name)
        if (!preg_match('/^[a-zA-Z0-9_\-]+\/[^\/\\\:\*\?\"<>\|]+$/', $folder_path)) {
            json_error('Định dạng đường dẫn không hợp lệ.', 400);
        }
        
        // Ensure the source key exists in config
        list($source_key, ) = explode('/', $folder_path, 2);
        if (!isset(IMAGE_SOURCES[$source_key])) {
             json_error('Nguồn ảnh không tồn tại.', 404);
        }

        try {
            // +++ CHECK FOR EXISTING PENDING/PROCESSING JOB +++
            $sql_check = "SELECT id FROM cache_jobs WHERE folder_path = ? AND status IN ('pending', 'processing') LIMIT 1";
            $stmt_check = $pdo->prepare($sql_check);
            $stmt_check->execute([$folder_path]);
            if ($stmt_check->fetchColumn()) {
                // Job already exists and is pending or processing
                json_error('Đã có yêu cầu tạo cache cho thư mục này đang chờ hoặc đang xử lý.', 409); // 409 Conflict
            }
            // +++ END CHECK +++

            // No active job found, proceed to insert a new one with initial values
            $sql = "INSERT INTO cache_jobs (
                        folder_path, created_at, status, 
                        processed_at, completed_at, result_message, image_count, 
                        total_files, processed_files, current_file_processing
                    ) VALUES (?, ?, 'pending', NULL, NULL, NULL, NULL, 0, 0, NULL)";
            
            $stmt = $pdo->prepare($sql);
            if ($stmt->execute([$folder_path, time()])) {
                error_log("[admin_queue_cache] Queued cache job for: {$folder_path}");
                json_response(['success' => true, 'message' => 'Đã thêm yêu cầu tạo cache vào hàng đợi.']);
            } else {
                json_error('Không thể thêm yêu cầu vào hàng đợi.', 500);
            }
        } catch (PDOException $e) {
             // Log the detailed PDO exception
            error_log("[admin_queue_cache] PDOException for {$folder_path}: " . $e->getMessage());
            // Provide a generic error to the user
            json_error('Đã xảy ra lỗi khi đưa yêu cầu vào hàng đợi: Lỗi cơ sở dữ liệu.', 500);
        } catch (Exception $e) {
             error_log("[admin_queue_cache] Exception for {$folder_path}: " . $e->getMessage());
             json_error('Đã xảy ra lỗi không mong muốn khi đưa yêu cầu vào hàng đợi.', 500);
        }
        break;

    case 'admin_update_jet_cache':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Method Not Allowed', 405);
        }

        // Ensure RAW_IMAGE_SOURCES and RAW_FILE_EXTENSIONS are defined
        if (!defined('RAW_IMAGE_SOURCES') || !is_array(RAW_IMAGE_SOURCES)) {
             json_error('Server configuration error: RAW_IMAGE_SOURCES not defined.', 500);
        }
         if (!defined('RAW_FILE_EXTENSIONS') || !is_array(RAW_FILE_EXTENSIONS)) {
             json_error('Server configuration error: RAW_FILE_EXTENSIONS not defined.', 500);
        }

        $raw_image_sources = RAW_IMAGE_SOURCES;
        $raw_file_extensions = RAW_FILE_EXTENSIONS;
        $jobs_added_count = 0;

        try {
            // Iterate through RAW_IMAGE_SOURCES
            foreach ($raw_image_sources as $source_key => $source_config) {
                if (!is_array($source_config) || !isset($source_config['path'])) continue;
                $source_base_path = $source_config['path'];
                $resolved_source_base_path = realpath($source_base_path);

                if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
                    error_log("[admin_update_jet_cache] Skipping RAW source '{$source_key}': Path invalid or not readable.");
                    continue;
                }

                // Recursively find all RAW files in the source directory
                $iterator = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($resolved_source_base_path, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::LEAVES_ONLY
                );

                foreach ($iterator as $fileinfo) {
                    if (!$fileinfo->isFile() || !$fileinfo->isReadable()) {
                        continue;
                    }

                    $file_path = $fileinfo->getPathname();
                    $extension = strtolower($fileinfo->getExtension());

                    // Check if the file extension is in the allowed RAW extensions
                    if (in_array($extension, $raw_file_extensions)) {
                        // Get the relative path from the source base path
                        $relative_path = str_replace($resolved_source_base_path . DIRECTORY_SEPARATOR, '', $file_path);
                        $source_prefixed_path = $source_key . '/' . str_replace('\\', '/', $relative_path); // Use forward slashes

                        // Add job to jet_cache_jobs table (check for duplicates)
                        // Only create 750px jobs (no more 120px generation)
                        $target_sizes = [];
                        if (defined('JET_PREVIEW_SIZE')) $target_sizes[] = JET_PREVIEW_SIZE;

                        foreach ($target_sizes as $size) {
                            // Check for existing pending or processing job for this file and size
                            $sql_check = "SELECT id FROM jet_cache_jobs WHERE source_prefixed_path = ? AND cache_size = ? AND status IN ('pending', 'processing') LIMIT 1";
                            $stmt_check = $pdo->prepare($sql_check);
                            $stmt_check->execute([$source_prefixed_path, $size]);
                            $existing_job = $stmt_check->fetch();

                            if (!$existing_job) {
                                // Insert new job
                                $sql_insert = "INSERT INTO jet_cache_jobs (source_prefixed_path, cache_size, status, created_at) VALUES (?, ?, ?, ?)";
                                $stmt_insert = $pdo->prepare($sql_insert);
                                $current_time = time();
                                if ($stmt_insert->execute([$source_prefixed_path, $size, 'pending', $current_time])) {
                                    $jobs_added_count++;
                                } else {
                                    error_log("[admin_update_jet_cache] Failed to insert job for {$source_prefixed_path} size {$size}");
                                }
                            }
                        }
                    }
                }
            }

            json_response(['success' => true, 'message' => "Đã thêm {$jobs_added_count} công việc tạo cache JET vào hàng đợi.", 'jobs_added' => $jobs_added_count]);

        } catch (Throwable $e) {
            error_log("FATAL ERROR in admin_update_jet_cache: " . $e->getMessage() . "\nStack Trace:\n" . $e->getTraceAsString());
            json_error("Không thể cập nhật cache JET. Lỗi: " . $e->getMessage(), 500);
        }
        break;

    case 'admin_delete_cache_job':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $job_id = $_POST['job_id'] ?? null;
        if ($job_id === null) {
            json_error('Thiếu thông tin ID công việc.', 400);
        }

        try {
            $sql = "DELETE FROM cache_jobs WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$job_id]);
            $affected_rows = $stmt->rowCount();

            json_response(['success' => true, 'message' => "Đã xóa công việc cache với ID: {$job_id}. Bị ảnh hưởng: {$affected_rows} dòng."]);
        } catch (Throwable $e) {
            error_log("[admin_delete_cache_job] FATAL ERROR for job ID: {$job_id}: " . $e->getMessage());
            json_error('Lỗi server khi xóa công việc cache: ' . $e->getMessage(), 500);
        }
        break;

    case 'admin_list_users':
        try {
            $sql = "SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at DESC";
            $stmt = $pdo->query($sql);
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            json_response(['success' => true, 'users' => $users]);
        } catch (PDOException $e) {
            error_log("[admin_list_users] Database error: " . $e->getMessage());
            json_error('Lỗi khi tải danh sách người dùng.', 500);
        }
        break;

    case 'admin_create_user':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        
        $username = trim($_POST['username'] ?? '');
        $password = $_POST['password'] ?? '';
        $role = $_POST['role'] ?? 'designer';
        
        if (empty($username) || empty($password)) {
            json_error('Tên đăng nhập và mật khẩu không được để trống.', 400);
        }
        
        if (!in_array($role, ['admin', 'designer'])) {
            json_error('Vai trò không hợp lệ.', 400);
        }
        
        // Check permissions - only admin can create users
        $current_user_role = $_SESSION['user_role'];
        if ($current_user_role !== 'admin') {
            json_error('Chỉ admin mới có thể tạo tài khoản người dùng.', 403);
        }
        
        if (strlen($username) < 3 || strlen($username) > 20) {
            json_error('Tên đăng nhập phải từ 3-20 ký tự.', 400);
        }
        
        if (strlen($password) < 6) {
            json_error('Mật khẩu phải có ít nhất 6 ký tự.', 400);
        }
        
        try {
            // Check if username already exists
            $sql_check = "SELECT id FROM users WHERE username = ? LIMIT 1";
            $stmt_check = $pdo->prepare($sql_check);
            $stmt_check->execute([$username]);
            
            if ($stmt_check->fetch()) {
                json_error('Tên đăng nhập đã tồn tại.', 409);
            }
            
            // Create new user
            $password_hash = password_hash($password, PASSWORD_DEFAULT);
            $sql_insert = "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, NOW())";
            $stmt_insert = $pdo->prepare($sql_insert);
            
            if ($stmt_insert->execute([$username, $password_hash, $role])) {
                error_log("[admin_create_user] Created new user: {$username} with role: {$role} by {$current_user_role}: " . ($_SESSION['username'] ?? 'unknown'));
                json_response(['success' => true, 'message' => "Đã tạo tài khoản {$role} '{$username}' thành công."]);
            } else {
                json_error('Không thể tạo tài khoản.', 500);
            }
            
        } catch (PDOException $e) {
            error_log("[admin_create_user] Database error: " . $e->getMessage());
            json_error('Lỗi cơ sở dữ liệu khi tạo tài khoản.', 500);
        }
        break;

    case 'admin_change_user_password':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        
        $user_id = $_POST['user_id'] ?? '';
        $new_password = $_POST['new_password'] ?? '';
        
        if (empty($user_id) || empty($new_password)) {
            json_error('Thiếu thông tin người dùng hoặc mật khẩu.', 400);
        }
        
        if (strlen($new_password) < 6) {
            json_error('Mật khẩu phải có ít nhất 6 ký tự.', 400);
        }
        
        try {
            // Check if user exists and get their role
            $sql_check = "SELECT username, role FROM users WHERE id = ? LIMIT 1";
            $stmt_check = $pdo->prepare($sql_check);
            $stmt_check->execute([$user_id]);
            $user = $stmt_check->fetch();
            
            if (!$user) {
                json_error('Không tìm thấy người dùng.', 404);
            }
            
            // Check permissions - only admin can change passwords
            $current_user_role = $_SESSION['user_role'];
            if ($current_user_role !== 'admin') {
                json_error('Chỉ admin mới có thể đổi mật khẩu người dùng.', 403);
            }
            
            // Update password
            $password_hash = password_hash($new_password, PASSWORD_DEFAULT);
            $sql_update = "UPDATE users SET password_hash = ? WHERE id = ?";
            $stmt_update = $pdo->prepare($sql_update);
            
            if ($stmt_update->execute([$password_hash, $user_id])) {
                error_log("[admin_change_user_password] Changed password for user: {$user['username']} by {$current_user_role}: " . ($_SESSION['username'] ?? 'unknown'));
                json_response(['success' => true, 'message' => "Đã đổi mật khẩu cho '{$user['username']}' thành công."]);
            } else {
                json_error('Không thể đổi mật khẩu.', 500);
            }
            
        } catch (PDOException $e) {
            error_log("[admin_change_user_password] Database error: " . $e->getMessage());
            json_error('Lỗi cơ sở dữ liệu khi đổi mật khẩu.', 500);
        }
        break;

    case 'admin_get_user_stats':
        $user_id = $_GET['user_id'] ?? '';
        
        if (empty($user_id)) {
            json_error('Thiếu thông tin người dùng.', 400);
        }
        
        try {
            // Get user info
            $sql_user = "SELECT username, role FROM users WHERE id = ? LIMIT 1";
            $stmt_user = $pdo->prepare($sql_user);
            $stmt_user->execute([$user_id]);
            $user = $stmt_user->fetch();
            
            if (!$user) {
                json_error('Không tìm thấy người dùng.', 404);
            }
            
            $stats = [
                'username' => $user['username'],
                'role' => $user['role'],
                'album_count' => 0,
                'picks_by_color' => []
            ];
            
            // If it's a designer, get their Jet stats
            if ($user['role'] === 'designer') {
                // Count albums worked on
                $sql_albums = "SELECT COUNT(DISTINCT SUBSTRING_INDEX(source_prefixed_path, '/', -2)) as album_count 
                              FROM jet_image_picks 
                              WHERE user_id = ?";
                $stmt_albums = $pdo->prepare($sql_albums);
                $stmt_albums->execute([$user_id]);
                $album_result = $stmt_albums->fetch();
                $stats['album_count'] = $album_result['album_count'] ?? 0;
                
                // Get pick counts by color
                $sql_picks = "SELECT pick_color, COUNT(*) as count 
                             FROM jet_image_picks 
                             WHERE user_id = ? AND pick_color IS NOT NULL 
                             GROUP BY pick_color";
                $stmt_picks = $pdo->prepare($sql_picks);
                $stmt_picks->execute([$user_id]);
                $stats['picks_by_color'] = $stmt_picks->fetchAll(PDO::FETCH_ASSOC);
            }
            
            json_response(['success' => true] + $stats);
            
        } catch (PDOException $e) {
            error_log("[admin_get_user_stats] Database error: " . $e->getMessage());
            json_error('Lỗi khi tải thống kê người dùng.', 500);
        }
        break;

    case 'admin_delete_user':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        
        $user_id = $_POST['user_id'] ?? '';
        
        if (empty($user_id)) {
            json_error('Thiếu thông tin người dùng.', 400);
        }
        
        // Prevent admin from deleting themselves
        if ($user_id == $_SESSION['user_id']) {
            json_error('Không thể xóa tài khoản của chính mình.', 400);
        }
        
        try {
            // Check if user exists and get info
            $sql_check = "SELECT username, role FROM users WHERE id = ? LIMIT 1";
            $stmt_check = $pdo->prepare($sql_check);
            $stmt_check->execute([$user_id]);
            $user = $stmt_check->fetch();
            
            if (!$user) {
                json_error('Không tìm thấy người dùng.', 404);
            }
            
            // Check permissions - only admin can delete users
            $current_user_role = $_SESSION['user_role'];
            if ($current_user_role !== 'admin') {
                json_error('Chỉ admin mới có thể xóa tài khoản người dùng.', 403);
            }
            
            // Prevent deleting the last admin
            if ($user['role'] === 'admin') {
                $admin_count_stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin'");
                $admin_count_stmt->execute();
                $admin_count = $admin_count_stmt->fetchColumn();
                
                if ($admin_count <= 1) {
                    json_error('Không thể xóa admin cuối cùng trong hệ thống.', 400);
                }
            }
            
            // Delete user (CASCADE will handle related records in jet_image_picks)
            $sql_delete = "DELETE FROM users WHERE id = ?";
            $stmt_delete = $pdo->prepare($sql_delete);
            
            if ($stmt_delete->execute([$user_id])) {
                error_log("[admin_delete_user] Deleted user: {$user['username']} (ID: {$user_id}) by {$current_user_role}: " . ($_SESSION['username'] ?? 'unknown'));
                json_response(['success' => true, 'message' => "Đã xóa người dùng '{$user['username']}' thành công."]);
            } else {
                json_error('Không thể xóa người dùng.', 500);
            }
            
        } catch (PDOException $e) {
            error_log("[admin_delete_user] Database error: " . $e->getMessage());
            json_error('Lỗi cơ sở dữ liệu khi xóa người dùng.', 500);
        }
        break;

    case 'file_manager_browse':
        // Browse directories and files in a source
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền quản lý file.", 403);
        }

        $source_key = $_GET['source'] ?? null;
        $path = $_GET['path'] ?? '';

        error_log("[file_manager_browse] Request - Source: '{$source_key}', Path: '{$path}'");

        if (!$source_key || !isset(IMAGE_SOURCES[$source_key])) {
            error_log("[file_manager_browse] Invalid source key: " . ($source_key ?: 'null'));
            json_error("Nguồn ảnh không hợp lệ: " . ($source_key ?: 'null'), 400);
        }

        // Build source-prefixed path
        $source_prefixed_path = $source_key;
        if (!empty($path)) {
            $source_prefixed_path .= '/' . ltrim($path, '/');
        }

        error_log("[file_manager_browse] Source prefixed path: '{$source_prefixed_path}'");

        $path_info = validate_source_and_path($source_prefixed_path);

        if (!$path_info) {
            error_log("[file_manager_browse] Path validation failed for: " . $source_prefixed_path);
            
            // Additional debug: check if source exists
            $source_root = IMAGE_SOURCES[$source_key]['path'] ?? 'N/A';
            error_log("[file_manager_browse] Source root path: '{$source_root}', exists: " . (file_exists($source_root) ? 'YES' : 'NO'));
            
            json_error("Đường dẫn không hợp lệ hoặc không thể truy cập.", 400);
        }

        $directory = $path_info['absolute_path'];
        error_log("[file_manager_browse] Absolute directory path: '{$directory}'");
        $items = [];

        try {
            if (!is_readable($directory)) {
                error_log("[file_manager_browse] Directory not readable: '{$directory}'");
                throw new Exception("Thư mục không có quyền đọc: " . $directory);
            }

            if (!is_dir($directory)) {
                error_log("[file_manager_browse] Path is not a directory: '{$directory}'");
                throw new Exception("Đường dẫn không phải là thư mục: " . $directory);
            }

            $iterator = new DirectoryIterator($directory);
            $item_count = 0;
            
            foreach ($iterator as $fileinfo) {
                if ($fileinfo->isDot()) continue;

                // Build relative path for item
                $item_relative_path = empty($path) ? $fileinfo->getFilename() : ltrim($path, '/') . '/' . $fileinfo->getFilename();

                $item = [
                    'name' => $fileinfo->getFilename(),
                    'type' => $fileinfo->isDir() ? 'directory' : 'file',
                    'size' => $fileinfo->isFile() ? $fileinfo->getSize() : null,
                    'modified' => $fileinfo->getMTime(),
                    'path' => $item_relative_path
                ];

                if ($fileinfo->isFile()) {
                    $extension = strtolower($fileinfo->getExtension());
                    $item['extension'] = $extension;
                    $item['is_image'] = in_array($extension, ALLOWED_EXTENSIONS);
                    $item['is_video'] = in_array($extension, ['mp4', 'mov', 'avi', 'mkv', 'webm']);
                } else {
                    // For directories, don't count files at root level for performance
                    // Only count when we're already inside a specific directory
                    if (!empty($path)) {
                        $item['file_count'] = count_files_recursive($fileinfo->getPathname());
                    }
                }

                $items[] = $item;
                $item_count++;
            }

            error_log("[file_manager_browse] Found {$item_count} items in directory");

            // Sort: directories first, then by name
            usort($items, function($a, $b) {
                if ($a['type'] !== $b['type']) {
                    return $a['type'] === 'directory' ? -1 : 1;
                }
                return strcmp($a['name'], $b['name']);
            });

            $response_data = [
                'items' => $items,
                'current_path' => $path,
                'source_key' => $source_key,
                'source_name' => IMAGE_SOURCES[$source_key]['name'],
                'absolute_path' => $directory
            ];

            error_log("[file_manager_browse] Success - returning " . count($items) . " items");
            json_response($response_data);

        } catch (Exception $e) {
            error_log("[file_manager_browse] Error for source '{$source_key}' path '{$path}': " . $e->getMessage());
            error_log("[file_manager_browse] Exception trace: " . $e->getTraceAsString());
            json_error("Không thể đọc thư mục: " . $e->getMessage());
        }
        break;

    case 'file_manager_upload':
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền upload.", 403);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }

        // Enhanced logging for debugging
        error_log("[file_manager_upload] ===== UPLOAD REQUEST START =====");
        error_log("[file_manager_upload] POST data: " . print_r($_POST, true));
        error_log("[file_manager_upload] FILES structure: " . print_r($_FILES, true));
        error_log("[file_manager_upload] Content Length: " . ($_SERVER['CONTENT_LENGTH'] ?? 'unknown'));
        error_log("[file_manager_upload] Request URI: " . $_SERVER['REQUEST_URI']);
        error_log("[file_manager_upload] Request Method: " . $_SERVER['REQUEST_METHOD']);

        // Check for upload errors at PHP level
        if (empty($_FILES)) {
            error_log("[file_manager_upload] ERROR: No files in \$_FILES array");
            json_error("Không có file nào được upload. Có thể file quá lớn hoặc vượt quá giới hạn upload.", 400);
        }

        // Check for post_max_size exceeded (this truncates $_POST and $_FILES)
        if (empty($_POST) && empty($_FILES) && $_SERVER['CONTENT_LENGTH'] > 0) {
            $postMaxSize = ini_get('post_max_size');
            error_log("[file_manager_upload] ERROR: Possible post_max_size exceeded. post_max_size: {$postMaxSize}, content_length: " . $_SERVER['CONTENT_LENGTH']);
            json_error("Dữ liệu upload quá lớn. Vui lòng giảm số lượng file hoặc kích thước file.", 413);
        }

        $source_key = $_POST['source'] ?? null;
        $target_path = $_POST['path'] ?? '';
        $overwrite_mode = $_POST['overwrite_mode'] ?? 'ask';

        error_log("[file_manager_upload] Source key: {$source_key}");
        error_log("[file_manager_upload] Target path: {$target_path}");
        error_log("[file_manager_upload] Overwrite mode: {$overwrite_mode}");
        error_log("[file_manager_upload] IMAGE_SOURCES available: " . print_r(array_keys(IMAGE_SOURCES), true));

        if (!$source_key || !isset(IMAGE_SOURCES[$source_key])) {
            error_log("[file_manager_upload] ERROR: Invalid source key");
            json_error("Nguồn ảnh không hợp lệ.", 400);
        }

        // More detailed FILES validation
        if (!isset($_FILES['files'])) {
            error_log("[file_manager_upload] ERROR: No 'files' key in \$_FILES");
            json_error("Không có file nào được upload.", 400);
        }

        // Handle both single file and array formats
        $files_data = $_FILES['files'];
        if (!is_array($files_data['name'])) {
            // Convert single file to array format
            $files_data = [
                'name' => [$files_data['name']],
                'tmp_name' => [$files_data['tmp_name']],
                'error' => [$files_data['error']],
                'size' => [$files_data['size']],
                'type' => [$files_data['type']]
            ];
        }

        $file_count = count($files_data['name']);
        error_log("[file_manager_upload] Processing {$file_count} files");

        if ($file_count === 0) {
            error_log("[file_manager_upload] ERROR: No files to process");
            json_error("Không có file nào được upload.", 400);
        }

        // Check for any upload errors
        $has_upload_errors = false;
        for ($i = 0; $i < $file_count; $i++) {
            if ($files_data['error'][$i] !== UPLOAD_ERR_OK) {
                $has_upload_errors = true;
                error_log("[file_manager_upload] Upload error for file {$i} ({$files_data['name'][$i]}): " . $files_data['error'][$i]);
            }
        }

        if ($has_upload_errors) {
            error_log("[file_manager_upload] WARNING: Some files have upload errors, but continuing with valid files");
        }

        $source_prefixed_path = $source_key . ($target_path ? '/' . ltrim($target_path, '/') : '');
        error_log("[file_manager_upload] Source prefixed path: {$source_prefixed_path}");
        
        $path_info = validate_source_and_path($source_prefixed_path);
        error_log("[file_manager_upload] Path validation result: " . print_r($path_info, true));

        if (!$path_info) {
            error_log("[file_manager_upload] ERROR: Invalid target path");
            json_error("Đường dẫn đích không hợp lệ.", 400);
        }

        $target_directory = $path_info['absolute_path'];
        error_log("[file_manager_upload] Target directory: {$target_directory}");
        error_log("[file_manager_upload] Directory exists: " . (is_dir($target_directory) ? 'YES' : 'NO'));
        error_log("[file_manager_upload] Directory writable: " . (is_writable($target_directory) ? 'YES' : 'NO'));
        
        if (!is_writable($target_directory)) {
            error_log("[file_manager_upload] ERROR: Directory not writable");
            json_error("Thư mục đích không có quyền ghi.", 403);
        }

        $uploaded_files = [];
        $errors = [];
        $duplicates = [];

        // First pass: check for duplicates if mode is 'ask'
        if ($overwrite_mode === 'ask') {
            error_log("[file_manager_upload] Checking for duplicates...");
            for ($i = 0; $i < $file_count; $i++) {
                if ($files_data['error'][$i] !== UPLOAD_ERR_OK) continue;
                
                $filename = $files_data['name'][$i];
                $safe_filename = preg_replace('/[^a-zA-Z0-9\._-]/', '_', $filename);
                $destination = $target_directory . DIRECTORY_SEPARATOR . $safe_filename;
                
                if (file_exists($destination)) {
                    $duplicates[] = $filename;
                    error_log("[file_manager_upload] Duplicate found: {$filename}");
                }
            }
            
            // If duplicates found, return them for user decision
            if (!empty($duplicates)) {
                error_log("[file_manager_upload] Returning duplicates for user decision: " . implode(', ', $duplicates));
                json_response([
                    'duplicates' => $duplicates,
                    'message' => 'File(s) đã tồn tại, cần quyết định ghi đè hay đổi tên.'
                ]);
                return;
            }
        }

        // Process uploads
        error_log("[file_manager_upload] Starting file processing...");
        for ($i = 0; $i < $file_count; $i++) {
            error_log("[file_manager_upload] Processing file {$i}/{$file_count}");
            
            if ($files_data['error'][$i] !== UPLOAD_ERR_OK) {
                $error_msg = "Upload error for {$files_data['name'][$i]}: ";
                switch ($files_data['error'][$i]) {
                    case UPLOAD_ERR_INI_SIZE:
                        $error_msg .= "File quá lớn (vượt quá upload_max_filesize)";
                        break;
                    case UPLOAD_ERR_FORM_SIZE:
                        $error_msg .= "File quá lớn (vượt quá MAX_FILE_SIZE)";
                        break;
                    case UPLOAD_ERR_PARTIAL:
                        $error_msg .= "Upload bị gián đoạn";
                        break;
                    case UPLOAD_ERR_NO_FILE:
                        $error_msg .= "Không có file";
                        break;
                    case UPLOAD_ERR_NO_TMP_DIR:
                        $error_msg .= "Không có thư mục temp";
                        break;
                    case UPLOAD_ERR_CANT_WRITE:
                        $error_msg .= "Không thể ghi file";
                        break;
                    case UPLOAD_ERR_EXTENSION:
                        $error_msg .= "Extension bị cấm";
                        break;
                    default:
                        $error_msg .= "Lỗi không xác định ({$files_data['error'][$i]})";
                }
                error_log("[file_manager_upload] " . $error_msg);
                $errors[] = $error_msg;
                continue;
            }

            $filename = $files_data['name'][$i];
            $temp_path = $files_data['tmp_name'][$i];
            $file_size = $files_data['size'][$i];

            error_log("[file_manager_upload] File details - Name: {$filename}, Size: {$file_size}, Temp: {$temp_path}");

            // Validate file extension
            $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            if (!in_array($extension, ALLOWED_EXTENSIONS)) {
                $error_msg = "File {$filename}: Định dạng không được hỗ trợ ({$extension})";
                error_log("[file_manager_upload] " . $error_msg);
                $errors[] = $error_msg;
                continue;
            }

            // Skip file size validation - no limits

            // Generate safe filename
            $safe_filename = preg_replace('/[^a-zA-Z0-9\._-]/', '_', $filename);
            $destination = $target_directory . DIRECTORY_SEPARATOR . $safe_filename;

            // Handle duplicate filenames based on mode
            if (file_exists($destination)) {
                if ($overwrite_mode === 'overwrite') {
                    error_log("[file_manager_upload] File exists, overwriting: {$safe_filename}");
                    // Keep the same filename, file will be overwritten
                } elseif ($overwrite_mode === 'rename') {
                    // Auto-rename with counter
                    $counter = 1;
                    $name_part = pathinfo($safe_filename, PATHINFO_FILENAME);
                    $ext_part = pathinfo($safe_filename, PATHINFO_EXTENSION);
                    
                    do {
                        $safe_filename = $name_part . "_{$counter}." . $ext_part;
                        $destination = $target_directory . DIRECTORY_SEPARATOR . $safe_filename;
                        $counter++;
                    } while (file_exists($destination));
                    
                    error_log("[file_manager_upload] File exists, renamed to: {$safe_filename}");
                }
                // If mode is 'ask', duplicates should have been handled earlier
            }

            error_log("[file_manager_upload] Attempting to move file from {$temp_path} to {$destination}");
            
            if (move_uploaded_file($temp_path, $destination)) {
                error_log("[file_manager_upload] Successfully moved file {$filename}");
                
                $uploaded_files[] = [
                    'original_name' => $filename,
                    'saved_name' => $safe_filename,
                    'size' => $file_size,
                    'path' => $target_path . '/' . $safe_filename
                ];

                // Verify file was actually saved
                if (file_exists($destination)) {
                    $saved_size = filesize($destination);
                    error_log("[file_manager_upload] File verified to exist at destination: {$saved_size} bytes");
                } else {
                    error_log("[file_manager_upload] WARNING: File not found at destination after move_uploaded_file succeeded!");
                }

                // Automatically add to thumbnail generation queue
                try {
                    $file_source_prefixed_path = $source_key . '/' . ltrim($target_path . '/' . $safe_filename, '/');
                    
                    // --- DEBUGGING ---
                    error_log("[file_manager_upload] DEBUG: Checking THUMBNAIL_SIZES before loop. Count: " . count(THUMBNAIL_SIZES) . ", Values: " . implode(', ', THUMBNAIL_SIZES));
                    // --- END DEBUGGING ---

                    // Add jobs for all thumbnail sizes
                    foreach (THUMBNAIL_SIZES as $size) {
                        $is_video = in_array($extension, ['mp4', 'mov', 'avi', 'mkv', 'webm']);
                        add_thumbnail_job_to_queue($pdo, $file_source_prefixed_path, $size, $is_video ? 'video' : 'image');
                    }
                    
                    error_log("[file_manager_upload] Added thumbnail jobs for uploaded file: {$file_source_prefixed_path}");
                } catch (Exception $e) {
                    error_log("[file_manager_upload] Failed to add thumbnail jobs: " . $e->getMessage());
                }

            } else {
                $error_msg = "Không thể lưu file {$filename}";
                error_log("[file_manager_upload] Failed to move file {$filename} from {$temp_path} to {$destination}");
                $errors[] = $error_msg;
            }
        }

        $response_data = [
            'uploaded_files' => $uploaded_files,
            'errors' => $errors,
            'success_count' => count($uploaded_files),
            'error_count' => count($errors)
        ];
        
        error_log("[file_manager_upload] Final response: " . print_r($response_data, true));
        error_log("[file_manager_upload] ===== UPLOAD REQUEST END =====");
        json_response($response_data);
        break;



    case 'file_manager_create_folder':
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền tạo thư mục.", 403);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }

        $source_key = $_POST['source'] ?? null;
        $parent_path = $_POST['parent_path'] ?? '';
        $folder_name = $_POST['folder_name'] ?? '';

        if (!$source_key || !isset(IMAGE_SOURCES[$source_key])) {
            json_error("Nguồn ảnh không hợp lệ.", 400);
        }

        if (empty($folder_name) || !preg_match('/^[a-zA-Z0-9\s\._-]+$/', $folder_name)) {
            json_error("Tên thư mục không hợp lệ. Chỉ cho phép chữ, số, dấu cách, dấu chấm, gạch dưới và gạch ngang.", 400);
        }

        $source_prefixed_path = $source_key . ($parent_path ? '/' . ltrim($parent_path, '/') : '');
        $path_info = validate_source_and_path($source_prefixed_path);

        if (!$path_info) {
            json_error("Đường dẫn cha không hợp lệ.", 400);
        }

        $parent_directory = $path_info['absolute_path'];
        $new_folder_path = $parent_directory . DIRECTORY_SEPARATOR . $folder_name;

        if (file_exists($new_folder_path)) {
            json_error("Thư mục đã tồn tại.", 409);
        }

        if (!is_writable($parent_directory)) {
            json_error("Không có quyền tạo thư mục trong thư mục cha.", 403);
        }

        if (mkdir($new_folder_path, 0755)) {
            json_response([
                'folder_name' => $folder_name,
                'folder_path' => $parent_path . '/' . $folder_name,
                'created_at' => time()
            ]);
        } else {
            json_error("Không thể tạo thư mục.");
        }
        break;

    case 'file_manager_delete':
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền xóa file/thư mục.", 403);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }

        $source_key = $_POST['source'] ?? null;
        $items_raw = $_POST['items'] ?? [];
        
        // Parse JSON if it's a string
        if (is_string($items_raw)) {
            $items = json_decode($items_raw, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                json_error("Dữ liệu items không hợp lệ.", 400);
            }
        } else {
            $items = $items_raw;
        }

        if (!$source_key || !isset(IMAGE_SOURCES[$source_key])) {
            json_error("Nguồn ảnh không hợp lệ.", 400);
        }

        if (empty($items) || !is_array($items)) {
            json_error("Không có item nào được chọn để xóa.", 400);
        }

        $deleted_items = [];
        $errors = [];

        foreach ($items as $item_path) {
            try {
                // Build full path from source root, not from current directory
                $source_prefixed_path = $source_key . '/' . ltrim($item_path, '/');
                error_log("[file_manager_delete] Processing item: {$item_path}");
                error_log("[file_manager_delete] Source prefixed path: {$source_prefixed_path}");
                
                // Try both directory and file validation
                $path_info = validate_source_and_path($source_prefixed_path);
                if (!$path_info) {
                    // If directory validation fails, try file validation
                    $path_info = validate_source_and_file_path($source_prefixed_path);
                    error_log("[file_manager_delete] Tried file validation: " . ($path_info ? 'VALID' : 'INVALID'));
                } else {
                    error_log("[file_manager_delete] Directory validation: VALID");
                }
                
                if ($path_info) {
                    error_log("[file_manager_delete] Absolute path: " . $path_info['absolute_path']);
                } else {
                    error_log("[file_manager_delete] Both directory and file validation failed for: {$source_prefixed_path}");
                }

                if (!$path_info) {
                    $errors[] = "Đường dẫn không hợp lệ: {$item_path}";
                    continue;
                }

                $target_path = $path_info['absolute_path'];

                if (!file_exists($target_path)) {
                    $errors[] = "File/thư mục không tồn tại: {$item_path}";
                    continue;
                }

                if (is_dir($target_path)) {
                    // Recursive delete directory
                    error_log("[file_manager_delete] Attempting to delete directory: {$target_path}");
                    
                    if (deleteDirectory($target_path)) {
                        $deleted_items[] = ['path' => $item_path, 'type' => 'directory'];
                        error_log("[file_manager_delete] Successfully deleted directory: {$item_path}");
                    } else {
                        $error_msg = "Không thể xóa thư mục: {$item_path}";
                        $errors[] = $error_msg;
                        error_log("[file_manager_delete] Failed to delete directory: {$item_path}");
                    }
                } else {
                    // Delete file
                    error_log("[file_manager_delete] Attempting to delete file: {$target_path}");
                    
                    if (unlink($target_path)) {
                        $deleted_items[] = ['path' => $item_path, 'type' => 'file'];
                        error_log("[file_manager_delete] Successfully deleted file: {$item_path}");
                        
                        // Clean up associated thumbnails
                        try {
                            foreach (THUMBNAIL_SIZES as $size) {
                                $cache_path = get_thumbnail_cache_path($source_prefixed_path, $size);
                                if (file_exists($cache_path)) {
                                    unlink($cache_path);
                                    error_log("[file_manager_delete] Cleaned thumbnail cache: {$cache_path}");
                                }
                            }
                        } catch (Exception $e) {
                            error_log("[file_manager_delete] Failed to clean thumbnails for {$source_prefixed_path}: " . $e->getMessage());
                        }
                        
                        // Clean up associated cache jobs from database
                        try {
                            $stmt = $pdo->prepare("DELETE FROM cache_jobs WHERE folder_path = ?");
                            $stmt->execute([$source_prefixed_path]);
                            $deleted_jobs = $stmt->rowCount();
                            if ($deleted_jobs > 0) {
                                error_log("[file_manager_delete] Cleaned {$deleted_jobs} cache jobs for: {$source_prefixed_path}");
                            }
                        } catch (Exception $e) {
                            error_log("[file_manager_delete] Failed to clean cache jobs for {$source_prefixed_path}: " . $e->getMessage());
                        }
                    } else {
                        $error_msg = "Không thể xóa file: {$item_path}";
                        $errors[] = $error_msg;
                        error_log("[file_manager_delete] Failed to delete file: {$item_path}");
                    }
                }
            } catch (Exception $e) {
                $errors[] = "Lỗi khi xóa {$item_path}: " . $e->getMessage();
            }
        }

        json_response([
            'deleted_items' => $deleted_items,
            'errors' => $errors,
            'success_count' => count($deleted_items),
            'error_count' => count($errors)
        ]);
        break;

    case 'file_manager_rename':
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền đổi tên file/thư mục.", 403);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }

        $source_key = $_POST['source'] ?? null;
        $old_path = $_POST['old_path'] ?? '';
        $new_name = $_POST['new_name'] ?? '';

        if (!$source_key || !isset(IMAGE_SOURCES[$source_key])) {
            json_error("Nguồn ảnh không hợp lệ.", 400);
        }

        if (empty($new_name) || !preg_match('/^[a-zA-Z0-9\s\._-]+$/', $new_name)) {
            json_error("Tên mới không hợp lệ. Chỉ cho phép chữ, số, dấu cách, dấu chấm, gạch dưới và gạch ngang.", 400);
        }

        $source_prefixed_path = $source_key . '/' . ltrim($old_path, '/');
        $path_info = validate_source_and_path($source_prefixed_path);

        if (!$path_info) {
            json_error("Đường dẫn cũ không hợp lệ.", 400);
        }

        $old_absolute_path = $path_info['absolute_path'];
        $parent_directory = dirname($old_absolute_path);
        $new_absolute_path = $parent_directory . DIRECTORY_SEPARATOR . $new_name;

        if (!file_exists($old_absolute_path)) {
            json_error("File/thư mục không tồn tại.", 404);
        }

        if (file_exists($new_absolute_path)) {
            json_error("Tên mới đã tồn tại.", 409);
        }

        if (rename($old_absolute_path, $new_absolute_path)) {
            $new_relative_path = dirname($old_path) . '/' . $new_name;
            $new_relative_path = ltrim($new_relative_path, './');

            json_response([
                'old_path' => $old_path,
                'new_path' => $new_relative_path,
                'new_name' => $new_name
            ]);
        } else {
            json_error("Không thể đổi tên file/thư mục.");
        }
        break;

    case 'stop_cache_workers':
        if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
            json_error("Chỉ admin mới có quyền dừng cache workers.", 403);
        }

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }

        try {
            // Cancel all pending and processing cache jobs
            $stmt_cancel = $pdo->prepare("UPDATE cache_jobs SET status = 'cancelled', result_message = 'Cancelled by user' WHERE status IN ('pending', 'processing')");
            $stmt_cancel->execute();
            $cancelled_jobs = $stmt_cancel->rowCount();
            
            error_log("[stop_cache_workers] Cancelled {$cancelled_jobs} cache jobs");
            
            json_response([
                'success' => true,
                'cancelled_jobs' => $cancelled_jobs,
                'message' => $cancelled_jobs > 0 ? "Đã hủy {$cancelled_jobs} cache job(s)" : "Không có cache job nào để hủy"
            ]);
        } catch (Exception $e) {
            error_log("[stop_cache_workers] Error: " . $e->getMessage());
            json_error("Lỗi khi dừng cache workers: " . $e->getMessage());
        }
        break;

    // Default case for unknown admin actions
    default:
        // If the action starts with 'admin_' or 'file_manager_' but isn't handled above
        if (strpos($action, 'admin_') === 0 || strpos($action, 'file_manager_') === 0) {
            json_error("Hành động admin không xác định: " . htmlspecialchars($action), 400);
        }
        // Otherwise, fall through (handled by api.php main or actions_public.php default)
        break;
} 