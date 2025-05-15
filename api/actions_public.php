<?php
// api/actions_public.php

// Dependencies: 
// - Assumes $action, $pdo, $allowed_ext, $search_term are available (from init.php)
// - Assumes all helper functions are available (from helpers.php)
// - Assumes THUMBNAIL_SIZES_API, CACHE_THUMB_ROOT, IMAGE_SOURCES constants are defined

// Prevent direct access
if (!isset($action)) {
    die('Invalid access.');
}

// Helper function to generate a unique token
if (!function_exists('generate_job_token')) {
    function generate_job_token($length = 32) {
        if (function_exists('random_bytes')) {
            return bin2hex(random_bytes($length / 2));
        } elseif (function_exists('openssl_random_pseudo_bytes')) {
            return bin2hex(openssl_random_pseudo_bytes($length / 2));
        } else {
            // Fallback for older PHP versions (less secure)
            $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            $charactersLength = strlen($characters);
            $randomString = '';
            for ($i = 0; $i < $length; $i++) {
                $randomString .= $characters[rand(0, $charactersLength - 1)];
            }
            return $randomString . uniqid(); // Add uniqid for more uniqueness
        }
    }
}

switch ($action) {

    case 'list_files':
        try {
            $subdir_requested = $_GET['path'] ?? '';
            $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
            // Use a reasonable default/configurable limit, but allow API override?
            // Let's use 100 as default to match original logic, but maybe make this configurable later.
            $items_per_page = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100; // Default 100, max 500

            $path_info = validate_source_and_path($subdir_requested);

            if ($path_info === null) {
                json_error('Thư mục không hợp lệ hoặc không tồn tại.', 404);
            }

            // --- Handle Root Request (List Sources/Top-Level Dirs) ---
            if ($path_info['is_root']) {
                $all_subdirs = [];
                // Fetch all protected folder names once
                $all_protected_folders = [];
                try {
                    $stmt = $pdo->query("SELECT folder_name FROM folder_passwords");
                    while ($protected_folder = $stmt->fetchColumn()) {
                        $all_protected_folders[$protected_folder] = true;
                    }
                } catch (PDOException $e) { /* Log error, continue */ error_log("[list_files Root] Error fetching protected: " . $e->getMessage()); }

                foreach (IMAGE_SOURCES as $source_key => $source_config) {
                    if (!is_array($source_config) || !isset($source_config['path'])) continue;
                    $source_base_path = $source_config['path'];
                    $resolved_source_base_path = realpath($source_base_path);

                    if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
                        error_log("[list_files Root] Skipping source '{$source_key}': Path invalid or not readable.");
                        continue;
                    }

                    try {
                        $iterator = new DirectoryIterator($resolved_source_base_path);
                        foreach ($iterator as $fileinfo) {
                            if ($fileinfo->isDot() || !$fileinfo->isDir()) continue;

                            $subdir_name = $fileinfo->getFilename();
                            $subdir_source_prefixed_path = $source_key . '/' . $subdir_name;

                            // Client-side filtering is usually done in JS (loadTopLevelDirectories)
                            // If server-side search for root is needed, implement here using $search_term

                            $all_subdirs[] = [
                                'name' => $subdir_name,
                                'type' => 'folder',
                                'path' => $subdir_source_prefixed_path,
                                'is_dir' => true,
                                'source_key' => $source_key,
                                'absolute_path' => $fileinfo->getPathname() // Keep absolute path for potential thumbnail search
                            ];
                        }
                    } catch (Exception $e) { /* Log error */ error_log("[list_files Root] Error scanning source '{$source_key}': " . $e->getMessage()); }
                }

                usort($all_subdirs, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));

                $total_items = count($all_subdirs);
                $total_pages = ceil($total_items / $items_per_page);
                $offset = ($page - 1) * $items_per_page;
                $paginated_items = array_slice($all_subdirs, $offset, $items_per_page);

                $folders_data = [];
                foreach ($paginated_items as $item) {
                    $folder_path_prefixed = $item['path'];
                    $subfolder_access = check_folder_access($folder_path_prefixed); // Check access

                    // Find thumbnail
                    $thumbnail_source_prefixed_path = null;
                    // Pass $allowed_ext to the helper function
                    $first_image_relative_to_subdir = find_first_image_in_source($item['source_key'], $item['name'], $allowed_ext);
                    if ($first_image_relative_to_subdir !== null) {
                        $thumbnail_source_prefixed_path = $folder_path_prefixed . '/' . $first_image_relative_to_subdir;
                        $thumbnail_source_prefixed_path = str_replace('//', '/', $thumbnail_source_prefixed_path); // Normalize
                    }

                    $folders_data[] = [
                        'name' => $item['name'],
                        'type' => 'folder',
                        'path' => $folder_path_prefixed,
                        'protected' => $subfolder_access['protected'],
                        'authorized' => $subfolder_access['authorized'],
                        'thumbnail' => $thumbnail_source_prefixed_path
                    ];
                }

                json_response([
                    'files' => [],
                    'folders' => $folders_data,
                    'breadcrumb' => [],
                    'current_dir' => '',
                    'pagination' => [
                        'current_page' => $page,
                        'total_pages' => $total_pages,
                        'total_items' => $total_items
                    ],
                    'is_root' => true
                ]);
                // No need to break here, as try block ends after this
            } else { // --- Handle Specific Directory Request ---
                $source_key = $path_info['source_key'];
                $current_relative_path = $path_info['relative_path'];
                $current_absolute_path = $path_info['absolute_path'];
                $current_source_prefixed_path = $path_info['source_prefixed_path'];

                $access = check_folder_access($current_source_prefixed_path);
                if (!$access['authorized']) {
                    if (!empty($access['password_required'])) {
                        json_error('Yêu cầu mật khẩu.', 401);
                    } else {
                        json_error($access['error'] ?? 'Không có quyền truy cập.', 403);
                    }
                }

                // Increment View Count (only on first page load of top-level albums)
                if ($page === 1 && substr_count($current_source_prefixed_path, '/') === 1) {
                    try {
                        // MySQL compatible INSERT ... ON DUPLICATE KEY UPDATE
                        $sql = "INSERT INTO folder_stats (folder_name, folder_path, views) VALUES (?, ?, 1)
                                ON DUPLICATE KEY UPDATE views = views + 1";
                        $stmt = $pdo->prepare($sql);
                        // Execute with folder_name and folder_path (using $current_source_prefixed_path for both as per table structure)
                        $stmt->execute([$current_source_prefixed_path, $current_source_prefixed_path]);
                    } catch (PDOException $e) { /* Log warning */ error_log("[list_files ViewCount] DB Error for '{$current_source_prefixed_path}': " . $e->getMessage());}
                }

                // Build Breadcrumb
                $breadcrumb = [];
                if ($current_source_prefixed_path) {
                    $parts = explode('/', $current_source_prefixed_path);
                    $current_crumb_path = '';
                    foreach ($parts as $part) {
                        $current_crumb_path = $current_crumb_path ? $current_crumb_path . '/' . $part : $part;
                        $breadcrumb[] = ['name' => $part, 'path' => $current_crumb_path];
                    }
                }

                // Scan Directory
                $all_folder_items = [];
                $all_file_items = [];
                // This inner try-catch handles errors specifically during directory iteration
                try {
                    $iterator = new DirectoryIterator($current_absolute_path);
                    foreach ($iterator as $fileinfo) {
                        if ($fileinfo->isDot()) continue;
                        $filename = $fileinfo->getFilename();
                        $item_source_prefixed_path = $current_relative_path ? $source_key . '/' . $current_relative_path . '/' . $filename : $source_key . '/' . $filename;

                        if ($fileinfo->isDir()) {
                            $all_folder_items[] = ['name' => $filename, 'type' => 'folder', 'path' => $item_source_prefixed_path, 'is_dir' => true, 'source_key' => $source_key, 'absolute_path' => $fileinfo->getPathname()];
                        } elseif ($fileinfo->isFile()) {
                            $extension = strtolower($fileinfo->getExtension());
                            if (in_array($extension, $allowed_ext, true)) {
                                $item_path = $item_source_prefixed_path;
                                $item_data = [
                                    'name' => $filename,
                                    'path' => $item_path,
                                    'is_dir' => false, // For sorting consistency if ever merged, though not strictly needed now
                                    'size_bytes' => $fileinfo->getSize()
                                ];

                                $image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']; 
                                $video_extensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

                                if (in_array($extension, $image_extensions, true)) {
                                    $dims = @getimagesize($fileinfo->getPathname());
                                    $item_data['type'] = 'image';
                                    $item_data['width'] = $dims[0] ?? 0;
                                    $item_data['height'] = $dims[1] ?? 0;
                                } elseif (in_array($extension, $video_extensions, true)) {
                                    $item_data['type'] = 'video';
                                    $item_data['width'] = 0; // Placeholder
                                    $item_data['height'] = 0; // Placeholder
                                }
                                $all_file_items[] = $item_data;
                            }
                        }
                    }
                } catch (Exception $e) {
                    // This specific catch is for DirectoryIterator or file system issues during the scan
                    error_log("Error scanning directory '{$current_absolute_path}' during list_files: " . $e->getMessage());
                    // We re-throw to be caught by the outer try-catch, or let the outer one handle it if not re-thrown
                    throw $e; // Or json_error directly if preferred for this specific case
                }

                // Sort folders and files separately by name
                usort($all_folder_items, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));
                usort($all_file_items, fn($a, $b) => strnatcasecmp($a['name'], $b['name']));

                // Pagination for files
                $total_files = count($all_file_items);
                $total_pages = ceil($total_files / $items_per_page);
                $offset = ($page - 1) * $items_per_page;
                $paginated_files = array_slice($all_file_items, $offset, $items_per_page);

                // Process all folders (not paginated for typical display)
                $folders_data = [];
                foreach ($all_folder_items as $item) {
                    $folder_path_prefixed = $item['path'];
                    $subfolder_access = check_folder_access($folder_path_prefixed);
                    
                    $thumbnail_source_prefixed_path = null;
                    $first_image_relative_to_subdir = find_first_image_in_source($item['source_key'], $item['name'], $allowed_ext);
                    if ($first_image_relative_to_subdir !== null) {
                        $thumbnail_source_prefixed_path = $folder_path_prefixed . '/' . $first_image_relative_to_subdir;
                        $thumbnail_source_prefixed_path = str_replace('//', '/', $thumbnail_source_prefixed_path); 
                    }

                    $folders_data[] = [
                        'name' => $item['name'],
                        'type' => 'folder',
                        'path' => $folder_path_prefixed,
                        'protected' => $subfolder_access['protected'],
                        'authorized' => $subfolder_access['authorized'],
                        'thumbnail' => $thumbnail_source_prefixed_path
                    ];
                }

                // $files_data is already prepared as $paginated_files, just ensure keys match frontend expectation
                // The structure of $all_file_items already matches what was previously put into $files_data
                $files_data = $paginated_files; 

                json_response([
                    'files' => $files_data,
                    'folders' => $folders_data,
                    'breadcrumb' => $breadcrumb,
                    'current_dir' => $current_source_prefixed_path,
                    'pagination' => [
                        'current_page' => $page,
                        'total_pages' => $total_pages,
                        'total_items' => $total_files // This now correctly refers to total files
                    ],
                    'is_root' => false,
                    'is_search' => (bool)$search_term, // Add is_search flag
                    'current_search_term' => $search_term // Add current search term
                ]);
            } // End specific directory handling
        } catch (Throwable $e) {
            // Log detailed error for server-side debugging
            error_log("[list_files Action Error] Path: '{$subdir_requested}'. Error: " . $e->getMessage() . "\nStack Trace:\n" . $e->getTraceAsString());
            
            // Return a generic error to the client
            // For PDOExceptions, you might want to avoid sending detailed SQL errors to the client
            if ($e instanceof PDOException) {
                json_error('Lỗi cơ sở dữ liệu khi tải danh sách tệp.', 500);
            } else {
                json_error('Lỗi máy chủ không xác định khi tải danh sách tệp: ' . $e->getMessage(), 500);
            }
        }
        break;

    case 'request_zip':
        try {
            // Correctly determine the request type based on 'source_path' for multi-select
            // and 'path' for single folder select.
            $multi_select_indicator = $_POST['source_path'] ?? null;
            $single_folder_path_param = $_POST['path'] ?? null;
            
            $file_paths_for_selection = $_POST['file_paths'] ?? [];
            $zip_filename_hint = $_POST['zip_filename_hint'] ?? null;

            if ($multi_select_indicator === '_multiple_selected_') {
                // This is a request for multiple selected files
                error_log("[API request_zip] Multi-file selection detected. Files: " . count($file_paths_for_selection) . ", Hint: {$zip_filename_hint}");
                if (empty($file_paths_for_selection) || !is_array($file_paths_for_selection)) {
                    json_error('Không có tệp nào được chọn hoặc dữ liệu không hợp lệ.', 400);
                }

                $validated_file_paths = [];
                foreach ($file_paths_for_selection as $file_path) {
                    // Use validate_source_and_FILE_path for individual files
                    $path_info = validate_source_and_file_path($file_path); 

                    if (!$path_info) { // validate_source_and_file_path returns null on any validation failure (not found, not a file, not readable, not in source)
                        json_error("Đường dẫn tệp không hợp lệ trong danh sách chọn: " . htmlspecialchars($file_path), 400);
                    }
                    
                    // Access check for the parent directory of the file
                    // dirname() on a source-prefixed path like 'main/foo/bar.jpg' gives 'main/foo'
                    // If the path is 'main/bar.jpg', dirname gives 'main'.
                    // If the path is just 'main' (not possible for a file usually), dirname gives '.'.
                    $parent_dir_for_access_check = dirname($path_info['source_prefixed_path']);
                    if ($parent_dir_for_access_check === '.') { // This case should ideally not happen if path_info is for a file within a source
                        // If path_info['source_prefixed_path'] was like 'sourcekey/file.jpg', dirname is 'sourcekey'
                        // If it was somehow just 'file.jpg' (which validate_source_and_file_path should prevent by requiring source_key),
                        // this logic might need review, but validate_source_and_file_path checks for source_key.
                        // For a path like 'main/image.jpg', dirname('main/image.jpg') is 'main'. check_folder_access('main') is fine.
                         error_log("[API request_zip] Unusual parent directory '{$parent_dir_for_access_check}' for file '{$path_info['source_prefixed_path']}'. Review access check logic if problems arise.");
                         // Default to checking the source key itself if dirname results in something unexpected for top-level files in a source
                         if (!isset(IMAGE_SOURCES[$parent_dir_for_access_check])) { // if dirname isn't a source key
                            $parent_dir_for_access_check = $path_info['source_key'];
                         }
                    }

                    $access = check_folder_access($parent_dir_for_access_check);
                    if (!$access['authorized']) {
                        json_error('Không có quyền truy cập thư mục chứa một hoặc nhiều tệp đã chọn: (' . htmlspecialchars($parent_dir_for_access_check) . ' cho tệp ' . htmlspecialchars($file_path) . ')', $access['password_required'] ? 401 : 403);
                    }
                    $validated_file_paths[] = $path_info['source_prefixed_path'];
                }

                if (empty($validated_file_paths)) {
                    json_error('Không có tệp hợp lệ nào được tìm thấy sau khi xác thực các tệp đã chọn.', 400);
                }
                
                $job_token = generate_job_token();
                $items_json = json_encode($validated_file_paths);
                $source_path_for_db = '_multiple_selected_';

                // Enhanced logging before DB insert
                error_log("[API request_zip MULTI] Preparing to insert job. Token: {$job_token}");
                error_log("[API request_zip MULTI] Source Path for DB: {$source_path_for_db} (Type: " . gettype($source_path_for_db) . ")");
                error_log("[API request_zip MULTI] Items JSON length: " . strlen($items_json) . " (Type: " . gettype($items_json) . ")");
                // Log a snippet of items_json to see its structure, be careful with very long strings in logs
                $items_json_snippet = (strlen($items_json) > 200) ? substr($items_json, 0, 200) . '...' : $items_json;
                error_log("[API request_zip MULTI] Items JSON snippet: {$items_json_snippet}");
                error_log("[API request_zip MULTI] ZIP Filename Hint: '{$zip_filename_hint}' (Type: " . gettype($zip_filename_hint) . ")");

                try {
                    $sql = "INSERT INTO zip_jobs (source_path, job_token, status, items_json, result_message) VALUES (?, ?, 'pending', ?, ?)";
                    $stmt = $pdo->prepare($sql);
                    if ($stmt->execute([$source_path_for_db, $job_token, $items_json, $zip_filename_hint])) {
                        json_response([
                            'message' => 'Yêu cầu tạo ZIP cho các tệp đã chọn đã được nhận.',
                            'job_token' => $job_token,
                            'status' => 'pending',
                            'source_path' => $source_path_for_db,
                            'file_count' => count($validated_file_paths)
                        ], 202);
                    } else {
                        json_error('Không thể tạo yêu cầu ZIP cho các tệp đã chọn (lỗi thực thi DB).', 500);
                    }
                } catch (PDOException $e) {
                    error_log("API Error (request_zip - insert multi-file job): " . $e->getMessage());
                    json_error('Lỗi máy chủ khi tạo yêu cầu ZIP cho các tệp đã chọn (DB).', 500);
                }

            } else {
                // This is a request for a single folder
                error_log("[API request_zip] Single folder selection detected. Path: {$single_folder_path_param}, Hint: {$zip_filename_hint}");
                $folder_to_zip = $single_folder_path_param;
                if (empty($folder_to_zip)) {
                    json_error('Đường dẫn thư mục không được cung cấp.', 400); // This error is correct for this branch
                }

                $path_info = validate_source_and_path($folder_to_zip);
                if (!$path_info || $path_info['is_root'] || $path_info['is_file']) { // Ensure it's a directory
                    json_error('Đường dẫn thư mục không hợp lệ, là thư mục gốc hoặc là một tệp.', 400);
                }

                $current_source_prefixed_path = $path_info['source_prefixed_path'];
                $access = check_folder_access($current_source_prefixed_path);
                if (!$access['authorized']) {
                    json_error($access['error'] ?? 'Không có quyền truy cập thư mục này để tạo ZIP.', $access['password_required'] ? 401 : 403);
                }

                // Check for existing active or recent completed job for this single folder
                try {
                    $stmt_check_active = $pdo->prepare("SELECT job_token, status FROM zip_jobs WHERE source_path = ? AND items_json IS NULL AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1");
                    $stmt_check_active->execute([$current_source_prefixed_path]);
                    $active_job = $stmt_check_active->fetch(PDO::FETCH_ASSOC);
                    if ($active_job) {
                        json_response([
                            'message' => 'Một yêu cầu tạo ZIP cho thư mục này đã tồn tại và đang được xử lý hoặc chờ xử lý.',
                            'job_token' => $active_job['job_token'],
                            'status' => $active_job['status']
                        ], 202);
                        return;
                    }

                    $stmt_check_completed = $pdo->prepare("SELECT job_token, status, zip_filename FROM zip_jobs WHERE source_path = ? AND items_json IS NULL AND status = 'completed' AND created_at > (NOW() - INTERVAL 5 MINUTE) ORDER BY created_at DESC LIMIT 1");
                    $stmt_check_completed->execute([$current_source_prefixed_path]);
                    $completed_job = $stmt_check_completed->fetch(PDO::FETCH_ASSOC);
                    if ($completed_job && !empty($completed_job['zip_filename'])) {
                        if (!defined('ZIP_CACHE_DIR_API_REQ')) {
                            define('ZIP_CACHE_DIR_API_REQ', __DIR__ . '/../cache/zips/');
                        }
                        $existing_zip_filepath = realpath(ZIP_CACHE_DIR_API_REQ . $completed_job['zip_filename']);
                        if ($existing_zip_filepath && is_file($existing_zip_filepath)) {
                            json_response([
                                'message' => 'Một file ZIP đã được tạo gần đây cho thư mục này và vẫn tồn tại.',
                                'job_token' => $completed_job['job_token'],
                                'status' => 'completed',
                                'zip_filename' => $completed_job['zip_filename']
                            ], 200);
                            return;
                        } else {
                            error_log("[API request_zip] Recent completed job for folder '{$current_source_prefixed_path}' found (token: {$completed_job['job_token']}), but physical file '{$completed_job['zip_filename']}' is missing. Proceeding to create new job.");
                        }
                    }
                } catch (PDOException $e) {
                    error_log("API Error (request_zip - check existing folder job for '{$current_source_prefixed_path}'): " . $e->getMessage());
                }

                $job_token = generate_job_token();
                try {
                    $sql = "INSERT INTO zip_jobs (source_path, job_token, status, result_message) VALUES (?, ?, 'pending', ?)"; // items_json is NULL by default for folder jobs
                    $stmt = $pdo->prepare($sql);
                    if ($stmt->execute([$current_source_prefixed_path, $job_token, $zip_filename_hint])) {
                        json_response([
                            'message' => 'Yêu cầu tạo ZIP đã được nhận. Quá trình sẽ bắt đầu sớm.',
                            'job_token' => $job_token,
                            'status' => 'pending'
                        ], 202);
                    } else {
                        json_error('Không thể tạo yêu cầu ZIP cho thư mục trong cơ sở dữ liệu (lỗi thực thi không xác định).', 500);
                    }
                } catch (PDOException $e) {
                    error_log("API Error (request_zip - insert new folder job for '{$current_source_prefixed_path}'): " . $e->getMessage() . " SQLSTATE: " . ($e->errorInfo[1] ?? $e->getCode()));
                    if (($e->errorInfo[1] ?? null) == 1062) { 
                         json_error('Lỗi tạo mã định danh công việc duy nhất. Vui lòng thử lại sau ít phút.', 500);
                    } else {
                         json_error('Lỗi máy chủ khi tạo yêu cầu ZIP cho thư mục (PDO).', 500);
                    }
                }
            } // End of single folder vs multiple files logic
        } catch (Throwable $e) {
            $request_path_for_log = $_POST['path'] ?? ($_POST['source_path'] ?? 'N/A');
            error_log("[request_zip Action Error] Triggering Path/Indicator: '{$request_path_for_log}'. Error: " . $e->getMessage() . "\nStack Trace:\n" . $e->getTraceAsString());
            
            if ($e instanceof PDOException) {
                json_error('Lỗi cơ sở dữ liệu khi yêu cầu tạo ZIP.', 500);
            } else {
                 $clientErrorMessage = ($e->getCode() >= 400 && $e->getCode() < 500 && !empty($e->getMessage())) ? $e->getMessage() : 'Lỗi máy chủ không xác định khi yêu cầu tạo ZIP.';
                json_error($clientErrorMessage, $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500);
            }
        }
        break;

    case 'get_zip_status':
        $job_token = $_GET['token'] ?? '';
        if (empty($job_token)) {
            json_error('Job token không được cung cấp.', 400);
        }

        try {
            $stmt = $pdo->prepare("SELECT job_token, source_path, status, total_files, processed_files, current_file_processing, zip_filename, zip_filesize, error_message, created_at, updated_at FROM zip_jobs WHERE job_token = ?");
            $stmt->execute([$job_token]);
            $job_details = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($job_details) {
                // Ensure path is still accessible by current user for status check too? (Optional, adds overhead)
                // $path_info_status = validate_source_and_path($job_details['source_path']);
                // $access_status = check_folder_access($job_details['source_path']);
                // if (!$access_status['authorized']) {
                //     json_error('Không có quyền xem trạng thái cho công việc này.', 403);
                // }
                json_response($job_details, 200);
            } else {
                json_error('Không tìm thấy công việc ZIP với token được cung cấp.', 404);
            }
        } catch (PDOException $e) {
            error_log("API Error (get_zip_status): " . $e->getMessage());
            json_error('Lỗi máy chủ khi truy vấn trạng thái ZIP.', 500);
        }
        break;

    case 'download_final_zip':
        $job_token = $_GET['token'] ?? '';
        error_log("[API download_final_zip] Received token: " . $job_token);

        if (empty($job_token)) {
            json_error('Job token không được cung cấp để tải về.', 400);
        }

        define('ZIP_CACHE_DIR_API', __DIR__ . '/../cache/zips/'); // Path relative to api/actions_public.php
        error_log("[API download_final_zip] ZIP_CACHE_DIR_API defined as: " . ZIP_CACHE_DIR_API);

        try {
            $stmt = $pdo->prepare("SELECT source_path, status, zip_filename FROM zip_jobs WHERE job_token = ?");
            $stmt->execute([$job_token]);
            $job = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$job) {
                error_log("[API download_final_zip] Job not found for token: " . $job_token);
                json_error('Không tìm thấy công việc ZIP.', 404);
                return; 
            }
            error_log("[API download_final_zip] Job details: " . print_r($job, true));

            if ($job['status'] !== 'completed' || empty($job['zip_filename'])) {
                error_log("[API download_final_zip] Job not completed or zip_filename empty. Status: " . $job['status'] . ", Filename: " . $job['zip_filename']);
                json_error('File ZIP chưa sẵn sàng hoặc đã xảy ra lỗi trong quá trình tạo.', 409); // 409 Conflict
                return;
            }
            
            $zip_filename_from_db = $job['zip_filename'];
            $zip_filepath = realpath(ZIP_CACHE_DIR_API . $zip_filename_from_db);
            error_log("[API download_final_zip] Attempting to serve file. DB Filename: '{$zip_filename_from_db}', Resolved Path: '" . ($zip_filepath ?: 'false (realpath failed)') . "'");

            // --- FIX: Skip access check for multi-file jobs ---
            $is_multi_selected = ($job['source_path'] === '_multiple_selected_');
            if (!$is_multi_selected) {
                $path_info_dl = validate_source_and_path($job['source_path']);
                if (!$path_info_dl || $path_info_dl['is_root']) { 
                    error_log("[API download_final_zip] Invalid original path for ZIP: " . $job['source_path']);
                    json_error('Đường dẫn gốc của file ZIP không hợp lệ.', 403);
                    return;
                }
                $access_dl = check_folder_access($path_info_dl['source_prefixed_path']);
                if (!$access_dl['authorized']) {
                    error_log("[API download_final_zip] Access denied for original path: " . $job['source_path']);
                    json_error('Không có quyền tải file ZIP này.', $access_dl['password_required'] ? 401 : 403);
                    return;
                }
            }
            // --- END FIX ---

            if ($zip_filepath && is_file($zip_filepath) && is_readable($zip_filepath)) {
                error_log("[API download_final_zip] File found and readable: {$zip_filepath}. Sending headers.");
                if (ob_get_level() > 0) {
                    ob_end_clean(); // Clean any existing output buffer
                }

                // Set headers
                header('Content-Description: File Transfer');
                header('Content-Type: application/zip');
                header('Content-Disposition: attachment; filename="' . basename($zip_filename_from_db) . '"');
                header('Expires: 0');
                header('Cache-Control: must-revalidate');
                header('Pragma: public');
                header('Content-Length: ' . filesize($zip_filepath));
                // Prevent PHP from timing out during large file download
                set_time_limit(0);
                
                error_log("[API download_final_zip] Headers sent. Starting chunked readfile for: {$zip_filepath}");

                // Stream the file in chunks
                $file_handle = fopen($zip_filepath, 'rb'); // Open in binary read mode
                if (!$file_handle) {
                    error_log("[API download_final_zip] Failed to open file for reading: {$zip_filepath}");
                    // We can't use json_error here as headers are already sent.
                    // The client will likely receive an incomplete or corrupted download.
                    http_response_code(500);
                    exit;
                }

                $bytes_sent = 0;
                while (!feof($file_handle) && connection_status() === CONNECTION_NORMAL) {
                    // Read 8KB chunks (or adjust chunk size as needed)
                    print(fread($file_handle, 8192));
                    flush(); // Flush PHP output buffer to the browser
                    if (ob_get_level() > 0) { // Ensure outer buffers are flushed too if any
                        ob_flush();
                    }
                    $bytes_sent += 8192; // Approximate, actual read might be less at EOF
                }
                fclose($file_handle);
                error_log("[API download_final_zip] Finished streaming file. Approximate bytes handled by loop: {$bytes_sent}");
                exit;
            } else {
                error_log("[API download_final_zip] File NOT found or NOT readable. Resolved Path: '" . ($zip_filepath ?: 'false') . "'. is_file: " . (is_file($zip_filepath) ? 'yes' : 'no') . ", is_readable: " . (is_readable($zip_filepath) ? 'yes' : 'no'));
                json_error('File ZIP không tìm thấy trên máy chủ hoặc không thể đọc được.', 404);
            }

        } catch (PDOException $e) {
            error_log("API Error (download_final_zip - PDO): " . $e->getMessage());
            json_error('Lỗi cơ sở dữ liệu khi cố gắng tải file ZIP.', 500);
        } catch (Throwable $e) {
            error_log("API Error (download_final_zip - General): " . $e->getMessage());
            json_error('Lỗi không xác định khi cố gắng tải file ZIP.', 500);
        }
        break;

    case 'get_thumbnail':
        try {
            $image_path_param = $_GET['path'] ?? null;
            $size_param = isset($_GET['size']) ? (int)$_GET['size'] : 150;

            if (!$image_path_param) {
                json_error('Đường dẫn ảnh không được cung cấp.', 400);
            }

            $file_details = validate_source_and_file_path($image_path_param);
            if (!$file_details) {
                json_error('Ảnh không hợp lệ hoặc không tồn tại.', 404);
            }

            $source_absolute_path = $file_details['absolute_path'];
            $source_prefixed_path_for_hash = $file_details['source_prefixed_path']; // Use this for consistent hash

            // Determine if it's a video or image based on extension
            $extension = strtolower(pathinfo($source_absolute_path, PATHINFO_EXTENSION));
            $image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']; 
            $video_extensions = ['mp4', 'mov', 'avi', 'mkv', 'webm']; // Keep in sync with config.php & list_files

            $is_video = in_array($extension, $video_extensions, true);
            $is_image = in_array($extension, $image_extensions, true);

            if (!$is_image && !$is_video) {
                json_error('Loại file không được hỗ trợ cho thumbnail.', 400);
            }

            // Validate size against configured sizes
            if (!in_array($size_param, THUMBNAIL_SIZES_API, true)) {
                json_error('Kích thước thumbnail không hợp lệ.', 400);
            }

            // Generate cache path (Consistent with worker)
            $thumb_filename_safe = sha1($source_prefixed_path_for_hash) . '_' . $size_param . '.jpg'; // Videos will also have .jpg thumbs
            $cache_dir_for_size = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size_param;
            $cache_absolute_path = $cache_dir_for_size . DIRECTORY_SEPARATOR . $thumb_filename_safe;

            if (!file_exists($cache_absolute_path) || filesize($cache_absolute_path) === 0) {
                if (!is_dir($cache_dir_for_size)) {
                    if (!@mkdir($cache_dir_for_size, 0775, true)) {
                        error_log("GetThumbnail: Failed to create cache subdir: {$cache_dir_for_size}");
                        json_error('Lỗi tạo thư mục cache.', 500);
                    }
                }

                $created = false;
                if ($is_image) {
                    $created = create_thumbnail($source_absolute_path, $cache_absolute_path, $size_param);
                } elseif ($is_video) {
                    // Assuming ffmpeg is in PATH or $ffmpeg_path is configured elsewhere if needed
                    $created = create_video_thumbnail($source_absolute_path, $cache_absolute_path, $size_param);
                }

                if (!$created) {
                    // Output a placeholder if creation failed, to prevent repeated attempts on broken files
                    // Consider if a more specific error image is needed or if 404 is better
                    // For now, let's send a 500 as it's a server-side creation failure.
                    json_error('Không thể tạo thumbnail.', 500);
                }
            }

            // Serve the thumbnail
            // Set appropriate content type header
            header('Content-Type: image/jpeg');
            header('Content-Length: ' . filesize($cache_absolute_path));
            header('Cache-Control: public, max-age=2592000'); // Cache for 30 days
            header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 2592000) . ' GMT');
            
            // Release session lock before sending file
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }

            // Clear output buffer before reading file
            if (ob_get_level()) {
                ob_end_clean();
            }
            readfile($cache_absolute_path);
            exit;

        } catch (Exception $e) {
            error_log("Error in get_thumbnail: " . $e->getMessage());
            json_error('Lỗi server khi lấy thumbnail.', 500);
        }
        break;

    case 'get_image': // Serving full images OR ACTUAL VIDEO FILES
        try {
            $image_path_param = $_GET['path'] ?? null;
            if (!$image_path_param) {
                json_error('Đường dẫn file không được cung cấp.', 400);
            }

            $file_details = validate_source_and_file_path($image_path_param);
            if (!$file_details) {
                json_error('File không hợp lệ hoặc không tồn tại.', 404);
            }
            $source_absolute_path = $file_details['absolute_path'];

            // Check folder access for the parent directory of the file
            $parent_folder_source_prefixed_path = dirname($file_details['source_prefixed_path']);
            if ($parent_folder_source_prefixed_path === '.' || $parent_folder_source_prefixed_path === $file_details['source_key']) { // File is in source root
                $parent_folder_source_prefixed_path = $file_details['source_key'];
            }
            
            $access = check_folder_access($parent_folder_source_prefixed_path);
            if (!$access['authorized']) {
                 if (!empty($access['password_required'])) {
                    json_error('Yêu cầu mật khẩu để truy cập file này.', 401);
                } else {
                    json_error($access['error'] ?? 'Không có quyền truy cập file này.', 403);
                }
            }

            // Determine content type
            $extension = strtolower(pathinfo($source_absolute_path, PATHINFO_EXTENSION));
            $mime_type = 'application/octet-stream'; // Default MIME type
            // Common image MIME types
            $image_mimes = [
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'png' => 'image/png',
                'gif' => 'image/gif',
                'bmp' => 'image/bmp',
                'webp' => 'image/webp'
            ];
            // Common video MIME types
            $video_mimes = [
                'mp4' => 'video/mp4',
                'webm' => 'video/webm',
                'ogv' => 'video/ogg', // Ogg video
                'mov' => 'video/quicktime',
                'avi' => 'video/x-msvideo',
                'mkv' => 'video/x-matroska' // Added MKV
                // Add more as needed
            ];

            if (isset($image_mimes[$extension])) {
                $mime_type = $image_mimes[$extension];
            } elseif (isset($video_mimes[$extension])) {
                $mime_type = $video_mimes[$extension];
            }

            header('Content-Type: ' . $mime_type);
            header('Content-Length: ' . filesize($source_absolute_path));
            header('Cache-Control: public, max-age=86400'); // Cache for 1 day
            header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 86400) . ' GMT');
            // Release session lock early if possible, before potentially long file transfer
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }

            // For videos, support byte-range requests if the client asks for it
            if (isset($_SERVER['HTTP_RANGE']) && $mime_type !== 'application/octet-stream' && strpos($mime_type, 'video/') === 0) {
                // Basic range request handling. For a full implementation, a library might be better.
                // This is a simplified version.
                $size = filesize($source_absolute_path);
                $length = $size;
                $start = 0;
                $end = $size - 1;
                
                header("Accept-Ranges: bytes");

                if (preg_match('/bytes=(\d*)-(\d*)/i', $_SERVER['HTTP_RANGE'], $matches)) {
                    $start = intval($matches[1]);
                    if ($matches[2] !== '') {
                        $end = intval($matches[2]);
                    } else {
                        // If no end is specified, serve until the end of the file, but within a reasonable chunk.
                        // Or, some servers might just serve the rest of the file. Let's serve a chunk.
                        // $end = $start + (1024 * 1024 * 2) -1; // e.g., 2MB chunk
                        // For simplicity now, if no end, serve to file end. 
                        // Browsers are usually specific.
                         $end = $size - 1;
                    }
                }

                if ($start > $end || $start >= $size || $end >= $size) {
                    header('HTTP/1.1 416 Requested Range Not Satisfiable');
                    header("Content-Range: bytes */{$size}");
                    exit;
                }

                header('HTTP/1.1 206 Partial Content');
                header("Content-Range: bytes {$start}-{$end}/{$size}");
                $length = $end - $start + 1;
                header("Content-Length: {$length}");

                // Ensure no output buffering is interfering
                if (ob_get_level() > 0) {
                    ob_end_clean();
                }

                $fh = @fopen($source_absolute_path, 'rb');
                if ($fh) {
                    fseek($fh, $start);
                    $bytes_sent = 0;
                    while ($bytes_sent < $length && !feof($fh) && connection_status() === CONNECTION_NORMAL) {
                        $bytes_to_read = min($length - $bytes_sent, 8192); // Read up to 8KB or remaining bytes
                        if ($bytes_to_read <= 0) break; // Should not happen if $length is correct, but as a safeguard

                        $buffer = fread($fh, $bytes_to_read);
                        if ($buffer === false || strlen($buffer) === 0) break; // Error or EOF

                        echo $buffer;
                        flush(); // Flush system output buffer
                        $bytes_sent += strlen($buffer);
                    }
                    fclose($fh);

                    // If loop terminated early but headers were sent, this might still lead to mismatch
                    // However, this loop is more robust in trying to send exactly $length bytes.
                    if ($bytes_sent !== $length && connection_status() === CONNECTION_NORMAL) {
                        // This case indicates an issue, possibly file shorter than expected or read error
                        // Log this, as it will likely cause ERR_CONTENT_LENGTH_MISMATCH on client
                        error_log("[get_image Range Request] Content-Length Mismatch: Expected {$length} but sent {$bytes_sent} for file {$source_absolute_path}, range {$start}-{$end}");
                        // It's hard to recover here as headers (including Content-Length) are already sent.
                        // The client will likely experience an error.
                    }

                } else {
                    json_error('Không thể mở file.', 500);
                }

            } else {
                // For images or if no range request, send the whole file
                if (ob_get_level()) {
                    ob_end_clean();
                }
                readfile($source_absolute_path);
            }
            exit;

        } catch (Exception $e) {
            error_log("Error in get_image: " . $e->getMessage());
            json_error('Lỗi server khi lấy file.', 500);
        }
        break;

    case 'authenticate': // Public action to authorize a protected folder
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_error('Phương thức không hợp lệ.', 405);
        }
        $folder_param = $_POST['folder'] ?? null;
        $password = $_POST['password'] ?? null;

        if ($folder_param === null || $password === null) {
            json_error('Thiếu thông tin thư mục hoặc mật khẩu.', 400);
        }

        // Validate folder path format (doesn't need to exist, just valid source/format)
        // Use validate_source_and_path, but ignore the absolute path result for auth.
        $path_parts = explode('/', trim(str_replace(['..', '\\', "\0"], '', $folder_param), '/'), 2);
        if (count($path_parts) < 2 || !isset(IMAGE_SOURCES[$path_parts[0]])) {
             json_error('Định dạng tên thư mục không hợp lệ.', 400);
        }
        $source_prefixed_path = $path_parts[0] . '/' . $path_parts[1]; // Reconstruct validated format

        try {
            $stmt = $pdo->prepare("SELECT password_hash FROM folder_passwords WHERE folder_name = ? LIMIT 1");
            $stmt->execute([$source_prefixed_path]);
            $row = $stmt->fetch();

            if ($row && password_verify($password, $row['password_hash'])) {
                // Password is correct, store authorization in session
                $session_key = 'authorized_folders';
                if (!isset($_SESSION[$session_key])) {
                    $_SESSION[$session_key] = [];
                }
                $_SESSION[$session_key][$source_prefixed_path] = true;
                error_log("[Authenticate] Success for folder: {$source_prefixed_path}");
                json_response(['success' => true]);
            } else {
                // Incorrect password or folder not protected
                error_log("[Authenticate] Failed for folder: {$source_prefixed_path} - Incorrect password or not protected.");
                json_error('Mật khẩu không đúng hoặc thư mục không được bảo vệ.', 401);
            }
        } catch (PDOException $e) {
            error_log("[Authenticate] DB Error for '{$source_prefixed_path}': " . $e->getMessage());
            json_error('Lỗi server khi xác thực.', 500);
        }
        break;

    default:
        json_error('Hành động không hợp lệ.', 400);
} 