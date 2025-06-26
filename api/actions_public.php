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
                            // MODIFICATION: Added server-side search filtering
                            if ($search_term !== null && $search_term !== '') {
                                if (mb_stripos($subdir_name, $search_term, 0, 'UTF-8') === false) {
                                    continue; // Skip this directory if it doesn't match the search term
                                }
                            }
                            // END MODIFICATION

                            $all_subdirs[] = [
                                'name' => $subdir_name,
                                'type' => 'folder',
                                'path' => $subdir_source_prefixed_path,
                                'is_dir' => true,
                                'source_key' => $source_key,
                                'absolute_path' => $fileinfo->getPathname(), // Keep absolute path for potential thumbnail search
                                'mtime' => $fileinfo->getMTime() // Add modification time for sorting
                            ];
                        }
                    } catch (Exception $e) { /* Log error */ error_log("[list_files Root] Error scanning source '{$source_key}': " . $e->getMessage()); }
                }

                // MODIFICATION: Apply filtering if search_term is present
                // This was moved up to be done per directory to avoid iterating twice.
                // The original usort is fine here.
                // END MODIFICATION

                // Sort by modification time (newest first), then by name if same mtime
                usort($all_subdirs, function($a, $b) {
                    // Primary sort: modification time (newest first)
                    $mtime_diff = $b['mtime'] - $a['mtime'];
                    if ($mtime_diff !== 0) {
                        return $mtime_diff; // Return negative if $b is newer (higher mtime)
                    }
                    // Secondary sort: name (alphabetical) if modification times are the same
                    return strnatcasecmp($a['name'], $b['name']);
                });

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

                    // Get cached file count for root folders
                    $file_count = get_directory_file_count($item['source_key'], $item['name']);

                    $folders_data[] = [
                        'name' => $item['name'],
                        'type' => 'folder',
                        'path' => $folder_path_prefixed,
                        'protected' => $subfolder_access['protected'],
                        'authorized' => $subfolder_access['authorized'],
                        'thumbnail' => $thumbnail_source_prefixed_path,
                        'file_count' => $file_count
                    ];
                }

                // $files_data is already prepared as $paginated_files, just ensure keys match frontend expectation
                // The structure of $all_file_items already matches what was previously put into $files_data
                $files_data = $paginated_items; 

                error_log("[list_files DEBUG] For Path: {$subdir_requested}, Requested Page: {$page}, ItemsPerPage: {$items_per_page}");
                error_log("[list_files DEBUG] Total Files Found (before pagination): " . count($all_subdirs));
                error_log("[list_files DEBUG] Calculated Offset: {$offset}");
                error_log("[list_files DEBUG] Files in Paginated Set: " . count($paginated_items));
                if (!empty($paginated_items)) {
                    error_log("[list_files DEBUG] First file in paginated set: " . $paginated_items[0]['name']);
                    error_log("[list_files DEBUG] Last file in paginated set: " . end($paginated_items)['name']);
                } else {
                    error_log("[list_files DEBUG] Paginated set is empty.");
                }

                json_response([
                    'files' => $files_data,
                    'folders' => $folders_data,
                    'breadcrumb' => [],
                    'current_dir' => '',
                    'pagination' => [
                        'current_page' => $page,
                        'total_pages' => $total_pages,
                        'total_items' => $total_items
                    ],
                    'is_root' => true,
                    'is_search' => ($search_term !== null && $search_term !== ''),
                    'current_search_term' => $search_term ?? ''
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
                            $all_folder_items[] = [
                                'name' => $filename, 
                                'type' => 'folder', 
                                'path' => $item_source_prefixed_path, 
                                'is_dir' => true, 
                                'source_key' => $source_key, 
                                'absolute_path' => $fileinfo->getPathname(),
                                'mtime' => $fileinfo->getMTime() // Add modification time
                            ];
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
                                    $item_data['type'] = 'image';
                                    $item_data['width'] = 0; // Default to 0
                                    $item_data['height'] = 0; // Default to 0
                                    // Try to get original dimensions from the latest completed cache job for this item
                                    $stmt_dims = $pdo->prepare("SELECT original_width, original_height FROM cache_jobs WHERE folder_path = ? AND status = 'completed' AND original_width IS NOT NULL AND original_height IS NOT NULL ORDER BY completed_at DESC LIMIT 1");
                                    $stmt_dims->execute([$item_path]);
                                    $dims_row = $stmt_dims->fetch(PDO::FETCH_ASSOC);
                                    if ($dims_row && $dims_row['original_width'] > 0 && $dims_row['original_height'] > 0) {
                                        $item_data['width'] = (int)$dims_row['original_width'];
                                        $item_data['height'] = (int)$dims_row['original_height'];
                                    } else {
                                        // Try to get live dimensions if not in cache or invalid
                                        $live_dims = @getimagesize($fileinfo->getPathname()); // $fileinfo is from the DirectoryIterator
                                        if ($live_dims) {
                                            $item_data['width'] = (int)$live_dims[0];
                                            $item_data['height'] = (int)$live_dims[1];
                                            // Reduce logging: only log failures, not every fetch
                                            // error_log("[list_files] Fetched LIVE dimensions for {$item_path}: {$item_data['width']}x{$item_data['height']}");
                                        } else {
                                            error_log("[list_files] Failed to fetch live dimensions for {$item_path}. Will default to 0x0.");
                                            // Width and height remain 0,0 if live also fails
                                        }
                                    }
                                } elseif (in_array($extension, $video_extensions, true)) {
                                    $item_data['type'] = 'video';
                                    $item_data['width'] = 0; // Default to 0 for videos as well if not found
                                    $item_data['height'] = 0; // Default to 0 for videos as well if not found
                                    // Optionally, try to get video dimensions from cache_jobs too if worker stores them
                                    $stmt_dims_vid = $pdo->prepare("SELECT original_width, original_height FROM cache_jobs WHERE folder_path = ? AND type = 'video' AND status = 'completed' AND original_width IS NOT NULL AND original_height IS NOT NULL ORDER BY completed_at DESC LIMIT 1");
                                    $stmt_dims_vid->execute([$item_path]);
                                    $dims_row_vid = $stmt_dims_vid->fetch(PDO::FETCH_ASSOC);
                                    if ($dims_row_vid) {
                                        $item_data['width'] = (int)$dims_row_vid['original_width'];
                                        $item_data['height'] = (int)$dims_row_vid['original_height'];
                                    } else {
                                        // error_log("[list_files] Video dimensions not found in cache_jobs for {$item_path}. Will default to 0x0.");
                                    }
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

                // Sort folders by modification time (newest first), then by name
                // Sort files by name only (as before)
                usort($all_folder_items, function($a, $b) {
                    // Primary sort: modification time (newest first) for folders
                    if (isset($a['mtime']) && isset($b['mtime'])) {
                        $mtime_diff = $b['mtime'] - $a['mtime'];
                        if ($mtime_diff !== 0) {
                            return $mtime_diff;
                        }
                    }
                    // Secondary sort: name (alphabetical)
                    return strnatcasecmp($a['name'], $b['name']);
                });
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
                    // Construct the path of the subfolder relative to its source root
                    // $item['source_key'] is e.g., "extra_drive"
                    // $item['path'] is e.g., "extra_drive/AlbumX/SubfolderY"
                    // We need "AlbumX/SubfolderY" for find_first_image_in_source's second argument
                    $path_within_source = substr($item['path'], strlen($item['source_key']) + 1);

                    $first_image_relative_to_subdir = find_first_image_in_source($item['source_key'], $path_within_source, $allowed_ext);
                    if ($first_image_relative_to_subdir !== null) {
                        // $item['path'] is the full source-prefixed path to the subfolder itself.
                        // $first_image_relative_to_subdir is just the filename.jpg found within that subfolder.
                        $thumbnail_source_prefixed_path = $item['path'] . '/' . $first_image_relative_to_subdir;
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

                error_log("[list_files DEBUG] For Path: {$current_source_prefixed_path}, Requested Page: {$page}, ItemsPerPage: {$items_per_page}");
                error_log("[list_files DEBUG] Total Files Found (before pagination): " . count($all_file_items));
                error_log("[list_files DEBUG] Calculated Offset: {$offset}");
                error_log("[list_files DEBUG] Files in Paginated Set: " . count($paginated_files));
                if (!empty($paginated_files)) {
                    error_log("[list_files DEBUG] First file in paginated set: " . $paginated_files[0]['name']);
                    error_log("[list_files DEBUG] Last file in paginated set: " . end($paginated_files)['name']);
                } else {
                    error_log("[list_files DEBUG] Paginated set is empty.");
                }

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
                    // Detect if this is a RAW file path by checking if it uses RAW_IMAGE_SOURCES
                    $path_parts = explode('/', $file_path, 2);
                    $source_key = $path_parts[0] ?? '';
                    
                    $path_info = null;
                    
                    // Check if this source key exists in RAW_IMAGE_SOURCES first
                    if (defined('RAW_IMAGE_SOURCES') && isset(RAW_IMAGE_SOURCES[$source_key])) {
                        // Use RAW validation for RAW files
                        $path_info = validate_raw_source_and_file_path($file_path);
                    } else {
                        // Use regular validation for normal image files
                        $path_info = validate_source_and_file_path($file_path);
                    }

                    if (!$path_info) {
                        json_error("Đường dẫn tệp không hợp lệ trong danh sách chọn: " . htmlspecialchars($file_path), 400);
                    }
                    
                    // Access check for the parent directory of the file
                    // For RAW sources, we typically don't use password protection, so skip access check
                    if (defined('RAW_IMAGE_SOURCES') && isset(RAW_IMAGE_SOURCES[$source_key])) {
                        // RAW sources are typically not password protected, skip access check
                        $validated_file_paths[] = $path_info['source_prefixed_path'];
                        continue;
                    }
                    
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

                // ==> ADDED LOGGING HERE
                error_log("[API request_zip MULTI PRE-INSERT] Attempting to insert job. Token: {$job_token}, SourcePath: {$source_path_for_db}, Status: 'pending', ItemsJSON: {$items_json}, ResultMessage(Hint): {$zip_filename_hint}");
                // <== END ADDED LOGGING

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
                if (!$path_info || $path_info['is_root']) { // validate_source_and_path ensures it's a directory if $path_info is not null
                    json_error('Đường dẫn thư mục không hợp lệ hoặc là thư mục gốc.', 400);
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
                // ==> ADDED LOGGING HERE
                error_log("[API request_zip SINGLE PRE-INSERT] Attempting to insert job. Token: {$job_token}, SourcePath: {$current_source_prefixed_path}, Status: 'pending', ResultMessage(Hint): {$zip_filename_hint}");
                // <== END ADDED LOGGING
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
            // MODIFICATION: Fetch items_json as well to determine parent folder for multi-select
            $stmt = $pdo->prepare("SELECT source_path, status, zip_filename, items_json FROM zip_jobs WHERE job_token = ?");
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

                // --- BEGIN MODIFICATION: Record download timestamp ---
                try {
                    $stmt_update_download_time = $pdo->prepare(
                        "UPDATE zip_jobs SET downloaded_at = CURRENT_TIMESTAMP, status = 'downloaded' " .
                        "WHERE job_token = ? AND downloaded_at IS NULL AND status = 'completed'"
                    );
                    $stmt_update_download_time->execute([$job_token]);
                    if ($stmt_update_download_time->rowCount() > 0) {
                        error_log("[API download_final_zip] Recorded first download timestamp for job_token: {$job_token}");
                    } else {
                        // This might happen if downloaded_at was already set, or status wasn't 'completed'
                        error_log("[API download_final_zip] Did not update download_at for job_token: {$job_token}. Already set, or status not 'completed', or job gone. Row count: " . $stmt_update_download_time->rowCount());
                    }
                } catch (PDOException $e) {
                    error_log("[API download_final_zip] PDOException while trying to update downloaded_at for job_token {$job_token}: " . $e->getMessage());
                    // Do not fail the download itself if this update fails.
                }
                // --- END MODIFICATION ---

                // --- BEGIN MODIFICATION: Increment folder_stats.downloads for single folder ZIPs ---
                if (!$is_multi_selected && !empty($job['source_path'])) {
                    try {
                        $original_folder_path = $job['source_path'];
                        $path_parts = explode('/', $original_folder_path);
                        $folder_for_stats = $original_folder_path; // Default to original

                        if (count($path_parts) > 2) { // e.g., source_key/AlbumName/Subfolder
                            $folder_for_stats = $path_parts[0] . '/' . $path_parts[1];
                            error_log("[API download_final_zip STATS_UPDATE] SINGLE FOLDER: Normalized '{$original_folder_path}' to '{$folder_for_stats}' for stats.");
                        } else {
                            error_log("[API download_final_zip STATS_UPDATE] SINGLE FOLDER: Path '{$original_folder_path}' is already top-level or invalid for deeper normalization. Using as is for stats.");
                        }
                        
                        error_log("[API download_final_zip STATS_UPDATE] Attempting to update folder_stats for SINGLE FOLDER. Effective Path for Stats: '{$folder_for_stats}'");
                        $sql_update_folder_downloads = 
                            "INSERT INTO folder_stats (folder_name, folder_path, downloads, views) " .
                            "VALUES (?, ?, 1, 0) " .
                            "ON DUPLICATE KEY UPDATE downloads = downloads + 1";
                        $stmt_update_folder_downloads = $pdo->prepare($sql_update_folder_downloads);
                        $stmt_update_folder_downloads->execute([$folder_for_stats, $folder_for_stats]);
                        
                        if ($stmt_update_folder_downloads->rowCount() > 0) {
                            error_log("[API download_final_zip] Incremented download count for folder: {$folder_for_stats}");
                        } else {
                            error_log("[API download_final_zip] Failed to increment or no change in download count for folder: {$folder_for_stats}. Might be an issue with INSERT/UPDATE logic or folder_name not matching.");
                        }
                    } catch (PDOException $e) {
                        error_log("[API download_final_zip] PDOException while trying to update folder_stats.downloads for original folder {$job['source_path']}: " . $e->getMessage());
                    }
                } elseif ($is_multi_selected && !empty($job['items_json'])) {
                    $items = json_decode($job['items_json'], true);
                    if (is_array($items) && !empty($items)) {
                        $first_file_path = $items[0];
                        $derived_parent_folder_path = dirname($first_file_path); // e.g., source_key/AlbumName or source_key/AlbumName/Subfolder

                        $folder_for_stats_multi = $derived_parent_folder_path; // Default
                        $path_parts_multi = explode('/', $derived_parent_folder_path);

                        if (count($path_parts_multi) > 2) { // e.g., source_key/AlbumName/Subfolder
                            $folder_for_stats_multi = $path_parts_multi[0] . '/' . $path_parts_multi[1];
                            error_log("[API download_final_zip STATS_UPDATE] MULTI-SELECT: Normalized '{$derived_parent_folder_path}' to '{$folder_for_stats_multi}' for stats.");
                        } else {
                             error_log("[API download_final_zip STATS_UPDATE] MULTI-SELECT: Path '{$derived_parent_folder_path}' is already top-level or invalid for deeper normalization. Using as is for stats.");
                        }

                        if ($folder_for_stats_multi && $folder_for_stats_multi !== '.') {
                            try {
                                error_log("[API download_final_zip STATS_UPDATE] Attempting to update folder_stats for MULTI-SELECT. Original first item: '{$first_file_path}', Derived parent path: '{$derived_parent_folder_path}', Effective Path for Stats: '{$folder_for_stats_multi}'");
                                $sql_update_folder_downloads = 
                                    "INSERT INTO folder_stats (folder_name, folder_path, downloads, views) " .
                                    "VALUES (?, ?, 1, 0) " .
                                    "ON DUPLICATE KEY UPDATE downloads = downloads + 1";
                                $stmt_update_folder_downloads = $pdo->prepare($sql_update_folder_downloads);
                                $stmt_update_folder_downloads->execute([$folder_for_stats_multi, $folder_for_stats_multi]);
                                if ($stmt_update_folder_downloads->rowCount() > 0) {
                                    error_log("[API download_final_zip] Incremented download count for multi-select parent folder: {$folder_for_stats_multi}");
                                } else {
                                    error_log("[API download_final_zip] Failed to increment or no change for multi-select parent folder: {$folder_for_stats_multi}.");
                                }
                            } catch (PDOException $e) {
                                error_log("[API download_final_zip] PDOException for multi-select folder_stats.downloads folder {$folder_for_stats_multi}: " . $e->getMessage());
                            }
                        } else {
                             error_log("[API download_final_zip] Could not determine valid top-level parent folder for multi-select from path: {$first_file_path}. Derived parent: '{$derived_parent_folder_path}'");
                        }
                    } else {
                        error_log("[API download_final_zip] items_json was empty or not an array for multi_select job_token: {$job_token}");
                    }
                }
                // --- END MODIFICATION ---

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

            define('THUMBNAIL_JOB_SIZE_LARGE', 750);
            define('THUMBNAIL_JOB_SIZE_STANDARD', 150);

            if (!$image_path_param) {
                json_error('Đường dẫn ảnh không được cung cấp.', 400);
            }

            $file_details = validate_source_and_file_path($image_path_param);
            if (!$file_details) {
                json_error('Ảnh không hợp lệ hoặc không tồn tại.', 404);
            }

            $source_absolute_path = $file_details['absolute_path'];
            $source_prefixed_path_for_hash = $file_details['source_prefixed_path']; // Use this for consistent hash

            $extension = strtolower(pathinfo($source_absolute_path, PATHINFO_EXTENSION));
            $image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']; 
            $video_extensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];

            $is_video = in_array($extension, $video_extensions, true);
            $is_image = in_array($extension, $image_extensions, true);

            if (!$is_image && !$is_video) {
                json_error('Loại file không được hỗ trợ cho thumbnail.', 400);
            }

            if (!in_array($size_param, THUMBNAIL_SIZES_API, true)) {
                json_error('Kích thước thumbnail không hợp lệ.', 400);
            }

            $thumb_filename_safe = sha1($source_prefixed_path_for_hash) . '_' . $size_param . '.jpg';
            $cache_dir_for_size = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size_param;
            $cache_absolute_path = $cache_dir_for_size . DIRECTORY_SEPARATOR . $thumb_filename_safe;

            if (file_exists($cache_absolute_path) && filesize($cache_absolute_path) > 0) {
                serve_file_from_path($cache_absolute_path, 'image/jpeg');
                exit;
            } else {
                // Cache miss, ensure cache subdirectory exists
                if (!is_dir($cache_dir_for_size)) {
                    if (!@mkdir($cache_dir_for_size, 0775, true)) {
                        error_log("GetThumbnail: Failed to create cache subdir: {$cache_dir_for_size}");
                        json_error('Lỗi tạo thư mục cache.', 500);
                    }
                }

                if ($is_image) {
                    if ($size_param == THUMBNAIL_JOB_SIZE_LARGE) {
                        // ADD DIAGNOSTIC LOGGING
                        error_log("[DEBUG GetThumbnail 750px REQUEST] Path Param: " . $image_path_param);
                        error_log("[DEBUG GetThumbnail 750px REQUEST] Validated File Details: " . print_r($file_details, true));
                        error_log("[DEBUG GetThumbnail 750px REQUEST] Source Absolute Path for ops: " . $source_absolute_path);
                        // END DIAGNOSTIC LOGGING

                        // Requested 750px image thumbnail is not cached, queue job and serve 150px.
                        add_thumbnail_job_to_queue($pdo, $source_prefixed_path_for_hash, THUMBNAIL_JOB_SIZE_LARGE, 'image');
                        
                        // Attempt to serve/create 150px thumbnail as fallback
                        error_log("[DEBUG GetThumbnail 750px FALLBACK] Attempting 150px fallback for: {$source_prefixed_path_for_hash}");
                        $thumbnail_cache_path_150 = get_thumbnail_cache_path($source_prefixed_path_for_hash, THUMBNAIL_JOB_SIZE_STANDARD, $is_video);
                        error_log("[DEBUG GetThumbnail 750px FALLBACK] Fallback 150px cache path: " . $thumbnail_cache_path_150);
                        error_log("[DEBUG GetThumbnail 750px FALLBACK] Fallback 150px file_exists before create: " . (file_exists($thumbnail_cache_path_150) ? 'Exists' : 'Not Exists'));

                        if (!file_exists($thumbnail_cache_path_150)) {
                            error_log("[DEBUG GetThumbnail 750px FALLBACK] Creating 150px fallback. Source: {$source_absolute_path}, Dest: {$thumbnail_cache_path_150}");
                            $created_150 = $is_video ? 
                                create_video_thumbnail($source_absolute_path, $thumbnail_cache_path_150, THUMBNAIL_JOB_SIZE_STANDARD, $config['ffmpeg_path'] ?? 'ffmpeg') :
                                create_thumbnail($source_absolute_path, $thumbnail_cache_path_150, THUMBNAIL_JOB_SIZE_STANDARD);
                            error_log("[DEBUG GetThumbnail 750px FALLBACK] Creation result for 150px: " . ($created_150 ? 'Success' : 'Failed'));
                            if (!$created_150) {
                                json_error("Không thể tạo ảnh thumbnail 150px dự phòng.", 500);
                            }
                        }
                        // Add a header indicating this is a placeholder
                        header("X-Thumbnail-Status: placeholder; target-size=" . THUMBNAIL_JOB_SIZE_LARGE . "; actual-size=" . THUMBNAIL_JOB_SIZE_STANDARD);
                        serve_file_from_path($thumbnail_cache_path_150, 'image/jpeg');
                        exit;
                    } else {
                        // For other image sizes (e.g., 150px), create on-the-fly
                        $created = create_thumbnail($source_absolute_path, $cache_absolute_path, $size_param);
                        if ($created) {
                            serve_file_from_path($cache_absolute_path, 'image/jpeg');
                            exit;
                        } else {
                            json_error('Không thể tạo image thumbnail (size: ' . $size_param . ').', 500);
                        }
                    }
                } elseif ($is_video) {
                    // Existing video thumbnail logic (can be refactored similarly if needed for large video thumbs)
                    // For now, assume it might already queue large ones or creates small ones on-the-fly.
                    // This part remains unchanged as per user request focus on 750px *image* thumbs.
                    $created = create_video_thumbnail($source_absolute_path, $cache_absolute_path, $size_param);
                    if ($created) {
                        serve_file_from_path($cache_absolute_path, 'image/jpeg');
                        exit;
                    } else {
                        json_error('Không thể tạo video thumbnail.', 500);
                    }
                }
            }
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

    case 'get_image_metadata':
        try {
            $image_path_param = $_GET['path'] ?? null;
            if (!$image_path_param) {
                json_error('Đường dẫn ảnh không được cung cấp.', 400);
            }

            $file_details = validate_source_and_file_path($image_path_param);
            if (!$file_details) {
                json_error('Ảnh không hợp lệ hoặc không tồn tại để lấy metadata.', 404);
            }

            $source_prefixed_path = $file_details['source_prefixed_path'];
            $filename = basename($source_prefixed_path);
            $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            
            $image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
            $video_extensions = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
            $type = 'file';
            if (in_array($extension, $image_extensions, true)) {
                $type = 'image';
            } elseif (in_array($extension, $video_extensions, true)) {
                $type = 'video';
            }

            $metadata = [
                'path' => $source_prefixed_path,
                'name' => $filename,
                'type' => $type,
                'width' => 0, // Default if not found
                'height' => 0 // Default if not found
            ];

            // Try to get original dimensions from the latest completed cache job for this item
            $stmt_dims = $pdo->prepare("SELECT original_width, original_height FROM cache_jobs WHERE folder_path = ? AND status = 'completed' AND original_width IS NOT NULL AND original_height IS NOT NULL ORDER BY completed_at DESC LIMIT 1");
            $stmt_dims->execute([$source_prefixed_path]);
            $dims_row = $stmt_dims->fetch(PDO::FETCH_ASSOC);

            if ($dims_row) {
                $metadata['width'] = (int)$dims_row['original_width'];
                $metadata['height'] = (int)$dims_row['original_height'];
                error_log("[get_image_metadata] Found dimensions in cache_jobs for {$source_prefixed_path}: {$metadata['width']}x{$metadata['height']}");
            } else {
                error_log("[get_image_metadata] Original dimensions NOT found in cache_jobs for {$source_prefixed_path}. Client might need to infer.");
                // If not found in cache_jobs, attempt to get live dimensions as a final fallback.
                // This adds a small overhead if the cache isn't populated yet but ensures PhotoSwipe gets best possible info.
                // However, be cautious if the source_absolute_path points to very large files.
                // $live_dims = @getimagesize($file_details['absolute_path']);
                // if ($live_dims) {
                //     $metadata['width'] = (int)$live_dims[0];
                //     $metadata['height'] = (int)$live_dims[1];
                //    error_log("[get_image_metadata] Fetched LIVE dimensions for {$source_prefixed_path}: {$metadata['width']}x{$metadata['height']}");
                // } else {
                //    error_log("[get_image_metadata] Failed to fetch live dimensions for {$source_prefixed_path}.");
                // }
            }
            
            json_response(['status' => 'success', 'data' => $metadata]);

        } catch (Exception $e) {
            error_log("Error in get_image_metadata for path '{$_GET['path']}': " . $e->getMessage());
            json_error('Lỗi server khi lấy metadata ảnh.', 500);
        }
        break;

    case 'get_cache_status':
        // Get current cache queue status - enhanced real-time tracking
        try {
            // Get recent jobs (last 10 minutes for better tracking)
            $stmt = $pdo->prepare("
                SELECT 
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs
                FROM cache_jobs 
                WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
            ");
            $stmt->execute();
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // Get currently processing files info
            $stmt_current = $pdo->prepare("
                SELECT 
                    current_file_processing,
                    processed_files,
                    total_files,
                    worker_id,
                    folder_path,
                    TIMESTAMPDIFF(SECOND, processed_at, NOW()) as processing_duration
                FROM cache_jobs 
                WHERE status = 'processing' 
                ORDER BY processed_at DESC
                LIMIT 10
            ");
            $stmt_current->execute();
            $current_processing = $stmt_current->fetchAll(PDO::FETCH_ASSOC);
            
            // Calculate individual file progress (each cache job is for 1 file)
            $stmt_files = $pdo->prepare("
                SELECT 
                    COUNT(*) as total_files,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_files,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files
                FROM cache_jobs 
                WHERE created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
            ");
            $stmt_files->execute();
            $file_result = $stmt_files->fetch(PDO::FETCH_ASSOC);
            
            $total_files = (int)($file_result['total_files'] ?? 0);
            $completed_files = (int)($file_result['completed_files'] ?? 0);
            $processing_files = (int)($file_result['processing_files'] ?? 0);
            $pending_files = (int)($file_result['pending_files'] ?? 0);
            
            // Real progress percentage based on completed files
            $progress_percentage = $total_files > 0 ? 
                round(($completed_files / $total_files) * 100, 1) : 100;
            
            // Check if any work is actually happening
            $is_actually_working = false;
            $current_activity = null;
            
            if (!empty($current_processing)) {
                foreach ($current_processing as $job) {
                    // If processing duration is recent (less than 30 seconds since last update)
                    if ($job['processing_duration'] < 30) {
                        $is_actually_working = true;
                        $current_activity = [
                            'file' => basename($job['current_file_processing'] ?? basename($job['folder_path'] ?? '')),
                            'progress' => 50, // Individual file is being processed
                            'processed' => (int)$job['processed_files'],
                            'total' => (int)$job['total_files'],
                            'worker' => $job['worker_id']
                        ];
                        break;
                    }
                }
            }
            
            // Remaining files calculation
            $remaining_files = $pending_files + $processing_files;
            
            $enhanced_result = [
                'pending_jobs' => (int)($result['pending_jobs'] ?? 0),
                'processing_jobs' => (int)($result['processing_jobs'] ?? 0),
                'completed_jobs' => (int)($result['completed_jobs'] ?? 0),
                'failed_jobs' => (int)($result['failed_jobs'] ?? 0),
                'total_files' => $total_files,
                'completed_files' => $completed_files,
                'processing_files' => $processing_files,
                'pending_files' => $pending_files,
                'remaining_files' => $remaining_files,
                'progress_percentage' => $progress_percentage,
                'is_actually_working' => $is_actually_working,
                'current_activity' => $current_activity,
                'timestamp' => time()
            ];
            
            error_log("[get_cache_status] File-based result: " . json_encode($enhanced_result));
            json_response($enhanced_result);
        } catch (Exception $e) {
            error_log("[get_cache_status] Error: " . $e->getMessage());
            json_response([
                'pending_jobs' => 0,
                'processing_jobs' => 0,
                'completed_jobs' => 0,
                'failed_jobs' => 0,
                'total_files' => 0,
                'completed_files' => 0,
                'processing_files' => 0,
                'pending_files' => 0,
                'remaining_files' => 0,
                'progress_percentage' => 100,
                'is_actually_working' => false,
                'current_activity' => null,
                'timestamp' => time()
            ]);
        }
        break;

    case 'stop_cache_workers':
        // Stop all cache workers for current session/user
        try {
            // Mark recent pending/processing jobs as failed
            $stmt = $pdo->prepare("
                UPDATE cache_jobs 
                SET status = 'cancelled', 
                    result_message = 'Cancelled by user',
                    completed_at = UNIX_TIMESTAMP()
                WHERE status IN ('pending', 'processing') 
                AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
            ");
            $stmt->execute();
            $affected = $stmt->rowCount();
            
            error_log("[stop_cache_workers] Cancelled {$affected} cache jobs");
            json_response([
                'success' => true,
                'cancelled_jobs' => $affected,
                'message' => "Đã hủy {$affected} cache job(s)"
            ]);
        } catch (Exception $e) {
            error_log("[stop_cache_workers] Error: " . $e->getMessage());
            json_response([
                'success' => false,
                'error' => 'Không thể hủy cache workers'
            ]);
        }
        break;

    case 'get_specific_cache_status':
        // Get cache status for specific uploaded files only
        try {
            $file_paths = $_POST['file_paths'] ?? [];
            $upload_timestamp_ms = $_POST['upload_timestamp'] ?? 0;

            error_log("[get_specific_cache_status] Received file_paths: " . json_encode($file_paths));
            error_log("[get_specific_cache_status] Received timestamp (ms): " . $upload_timestamp_ms);
            
            if (empty($file_paths)) {
                // Return empty if no files specified
                json_response([
                    'total_files' => 0, 'completed_files' => 0, 'pending_files' => 0,
                    'processing_files' => 0, 'remaining_files' => 0, 'progress_percentage' => 100,
                    'is_actually_working' => false, 'current_activity' => null, 'timestamp' => time()
                ]);
                return;
            }

            // If timestamp is not provided, fallback to old behavior (should not happen with new JS)
            $time_condition = "AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)";
            $time_params = [];
            
            if (!empty($upload_timestamp_ms) && is_numeric($upload_timestamp_ms)) {
                 // Convert JS timestamp (milliseconds) to MySQL DATETIME format
                 // Subtract a few seconds to account for clock differences / request delay
                $upload_time_sec = ($upload_timestamp_ms / 1000) - 5;
                $mysql_timestamp = date('Y-m-d H:i:s', $upload_time_sec);
                $time_condition = "AND created_at >= ?";
                $time_params[] = $mysql_timestamp;
                error_log("[get_specific_cache_status] Using time condition: created_at >= {$mysql_timestamp}");
            } else {
                error_log("[get_specific_cache_status] WARNING: No upload_timestamp received, falling back to 10 minute window.");
            }
            
            // Build exact file path conditions for cache jobs
            $file_conditions = [];
            $file_params = [];
            
            foreach ($file_paths as $file_path) {
                // Each cache job has folder_path = exact file path
                $file_conditions[] = "folder_path = ?";
                $file_params[] = $file_path;
            }
            
            $where_clause = '(' . implode(' OR ', $file_conditions) . ')';
            
            error_log("[get_specific_cache_status] Query WHERE: $where_clause");
            error_log("[get_specific_cache_status] Query params: " . json_encode($file_params));
            
            // Get cache jobs for these specific files (created in last 10 minutes)
            $stmt = $pdo->prepare("
                SELECT 
                    COUNT(*) as total_files,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_files,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
                    GROUP_CONCAT(CASE WHEN status = 'processing' THEN folder_path END) as processing_files_list
                FROM cache_jobs 
                WHERE $where_clause
                $time_condition
            ");

            $all_params = array_merge($file_params, $time_params);
            $stmt->execute($all_params);
            $file_result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            // Get current processing activity
            $stmt_current = $pdo->prepare("
                SELECT 
                    current_file_processing,
                    folder_path,
                    processed_files,
                    total_files,
                    worker_id,
                    TIMESTAMPDIFF(SECOND, processed_at, NOW()) as processing_duration
                FROM cache_jobs 
                WHERE $where_clause
                AND status = 'processing'
                $time_condition
                ORDER BY processed_at DESC
                LIMIT 1
            ");
            $stmt_current->execute($all_params);
            $current_processing = $stmt_current->fetch(PDO::FETCH_ASSOC);
            
            $db_total_files = (int)($file_result['total_files'] ?? 0);
            $completed_files = (int)($file_result['completed_files'] ?? 0);
            $processing_files = (int)($file_result['processing_files'] ?? 0);
            $pending_files = (int)($file_result['pending_files'] ?? 0);
            
            $expected_count = count($file_paths);
            
            // If no cache jobs found yet, show expected count as pending
            if ($db_total_files === 0) {
                $total_files = $expected_count;
                $pending_files = $expected_count;
                $completed_files = 0;
                $processing_files = 0;
            } else {
                $total_files = $db_total_files;
            }
            
            // Calculate progress
            $progress_percentage = $total_files > 0 ? 
                round(($completed_files / $total_files) * 100, 1) : 0;
                
            error_log("[get_specific_cache_status] Expected: $expected_count, DB found: $db_total_files, Using total: $total_files");
            error_log("[get_specific_cache_status] Completed: $completed_files, Processing: $processing_files, Pending: $pending_files");
            
            // Check if actually working
            $is_actually_working = false;
            $current_activity = null;
            
            if ($current_processing && ($current_processing['processing_duration'] ?? 999) < 60) {
                $is_actually_working = true;
                $current_file = $current_processing['current_file_processing'] ?? 
                               basename($current_processing['folder_path'] ?? '');
                $current_activity = [
                    'file' => basename($current_file),
                    'progress' => 50,
                    'processed' => (int)($current_processing['processed_files'] ?? 0),
                    'total' => (int)($current_processing['total_files'] ?? 1),
                    'worker' => $current_processing['worker_id'] ?? null
                ];
            }
            
            $remaining_files = $pending_files + $processing_files;
            
            $result = [
                'total_files' => $total_files,
                'completed_files' => $completed_files,
                'processing_files' => $processing_files,
                'pending_files' => $pending_files,
                'remaining_files' => $remaining_files,
                'progress_percentage' => $progress_percentage,
                'is_actually_working' => $is_actually_working,
                'current_activity' => $current_activity,
                'timestamp' => time()
            ];
            
            error_log("[get_specific_cache_status] Final result: " . json_encode($result));
            json_response($result);
            
        } catch (Exception $e) {
            error_log("[get_specific_cache_status] Error: " . $e->getMessage());
            json_response([
                'total_files' => 0,
                'completed_files' => 0,
                'processing_files' => 0,
                'pending_files' => 0,
                'remaining_files' => 0,
                'progress_percentage' => 100,
                'is_actually_working' => false,
                'current_activity' => null,
                'timestamp' => time()
            ]);
        }
        break;

    case 'get_session_cache_status':
        // Get cache status for specific upload session only
        try {
            $session_id = $_POST['session_id'] ?? '';
            $upload_time = (int)($_POST['upload_time'] ?? 0);
            $file_paths = $_POST['file_paths'] ?? [];
            
            if (empty($file_paths) || empty($session_id) || $upload_time === 0) {
                json_response([
                    'total_files' => 0,
                    'completed_files' => 0,
                    'pending_files' => 0,
                    'processing_files' => 0,
                    'remaining_files' => 0,
                    'progress_percentage' => 100,
                    'isComplete' => true,
                    'current_activity' => null,
                    'timestamp' => time()
                ]);
                return;
            }
            
            // Get cache jobs for these specific files (no time filtering)
            // Use exact file path matching for accurate results
            $placeholders = str_repeat('?,', count($file_paths) - 1) . '?';
            
            // Get cache jobs for these files, grouped by size
            $stmt = $pdo->prepare("
                SELECT 
                    size,
                    COUNT(*) as total_files,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_files,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files
                FROM cache_jobs 
                WHERE folder_path IN ($placeholders)
                GROUP BY size
                ORDER BY size
            ");
            
            $like_params = $file_paths;
            
            $stmt->execute($like_params);
            $size_results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Initialize counters for each cache size
            $cache_150 = ['total' => 0, 'completed' => 0, 'processing' => 0, 'pending' => 0];
            $cache_750 = ['total' => 0, 'completed' => 0, 'processing' => 0, 'pending' => 0];
            
            // Process results by size
            foreach ($size_results as $result) {
                $size = (int)$result['size'];
                $data = [
                    'total' => (int)$result['total_files'],
                    'completed' => (int)$result['completed_files'],
                    'processing' => (int)$result['processing_files'],
                    'pending' => (int)$result['pending_files']
                ];
                
                if ($size === 150) {
                    $cache_150 = $data;
                } elseif ($size === 750) {
                    $cache_750 = $data;
                }
            }
            
            // Calculate totals
            $total_files = $cache_150['total'] + $cache_750['total'];
            $completed_files = $cache_150['completed'] + $cache_750['completed'];
            $processing_files = $cache_150['processing'] + $cache_750['processing'];
            $pending_files = $cache_150['pending'] + $cache_750['pending'];
            
            // Use expected file count if no cache jobs found yet
            $expected_files = count($file_paths);
            $expected_total = $expected_files * 2; // 2 sizes per file (150px + 750px)
            
            if ($total_files === 0) {
                // No cache jobs found yet, set expected counts
                $cache_150 = ['total' => $expected_files, 'completed' => 0, 'processing' => 0, 'pending' => $expected_files];
                $cache_750 = ['total' => $expected_files, 'completed' => 0, 'processing' => 0, 'pending' => $expected_files];
                $total_files = $expected_total;
                $pending_files = $expected_total;
            }
            
            // Calculate progress for each size
            $progress_150 = $cache_150['total'] > 0 ? 
                round(($cache_150['completed'] / $cache_150['total']) * 100, 1) : 100;
            $progress_750 = $cache_750['total'] > 0 ? 
                round(($cache_750['completed'] / $cache_750['total']) * 100, 1) : 100;
            $progress_percentage = $total_files > 0 ? 
                round(($completed_files / $total_files) * 100, 1) : 100;
            
            // Determine if cache is complete
            $isComplete = ($completed_files >= $expected_total) || 
                         ($total_files > 0 && $pending_files === 0 && $processing_files === 0);
            
            // Get current activity
            $current_activity = null;
            if ($processing_files > 0) {
                $stmt_current = $pdo->prepare("
                    SELECT current_file_processing, folder_path
                    FROM cache_jobs 
                    WHERE folder_path IN ($placeholders)
                    AND status = 'processing'
                    ORDER BY processed_at DESC
                    LIMIT 1
                ");
                
                $stmt_current->execute($file_paths);
                $current_job = $stmt_current->fetch(PDO::FETCH_ASSOC);
                
                if ($current_job && $current_job['current_file_processing']) {
                    $current_activity = basename($current_job['current_file_processing']);
                }
            }
            
            $result = [
                'total_files' => $total_files,
                'completed_files' => $completed_files,
                'pending_files' => $pending_files,
                'processing_files' => $processing_files,
                'remaining_files' => $total_files - $completed_files,
                'progress_percentage' => $progress_percentage,
                'isComplete' => $isComplete,
                'current_activity' => $current_activity,
                'session_id' => $session_id,
                'expected_files' => $expected_files,
                'expected_total' => $expected_total,
                // Detailed breakdown by cache size
                'cache_150' => [
                    'total' => $cache_150['total'],
                    'completed' => $cache_150['completed'],
                    'processing' => $cache_150['processing'],
                    'pending' => $cache_150['pending'],
                    'progress' => $progress_150
                ],
                'cache_750' => [
                    'total' => $cache_750['total'],
                    'completed' => $cache_750['completed'],
                    'processing' => $cache_750['processing'],
                    'pending' => $cache_750['pending'],
                    'progress' => $progress_750
                ],
                'timestamp' => time()
            ];
            
            error_log("[get_session_cache_status] Session: $session_id, Expected: $expected_files, Total: $total_files, 150px: {$cache_150['completed']}/{$cache_150['total']}, 750px: {$cache_750['completed']}/{$cache_750['total']}");
            json_response($result);
            
        } catch (Exception $e) {
            error_log("[get_session_cache_status] Error: " . $e->getMessage());
            json_response([
                'error' => true,
                'message' => 'Failed to get session cache status',
                'total_files' => 0,
                'completed_files' => 0,
                'isComplete' => true
            ]);
        }
        break;

    // AI Content Agent API - Get Featured Images by Category
    case 'ai_get_featured_images':
        try {
            // Get request parameters
            $category_slug = $_GET['category'] ?? null;
            $featured_type = $_GET['type'] ?? null; // 'featured', 'portrait', or null for all
            $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 20;
            $source_key = $_GET['source'] ?? null; // Optional source filter
            $priority_order = $_GET['priority'] ?? 'asc'; // 'asc' or 'desc'
            $include_metadata = isset($_GET['metadata']) ? (bool)$_GET['metadata'] : false;
            
            // Build the query to get featured images with category information
            $sql = "
                SELECT DISTINCT
                    fi.id,
                    fi.source_key,
                    fi.image_relative_path,
                    fi.folder_path,
                    fi.featured_type,
                    fi.priority_order,
                    fi.alt_text,
                    fi.description,
                    fi.created_at,
                    fc.category_name,
                    fc.category_slug,
                    fc.color_code,
                    fc.icon_class
                FROM featured_images fi
                LEFT JOIN folder_category_mapping fcm ON (
                    fi.source_key = fcm.source_key AND 
                    (fi.folder_path = fcm.folder_path OR fi.folder_path LIKE CONCAT(fcm.folder_path, '/%'))
                )
                LEFT JOIN folder_categories fc ON fcm.category_id = fc.id
                WHERE fi.is_featured = 1
            ";
            
            $params = [];
            
            // Filter by category if specified
            if ($category_slug) {
                $sql .= " AND fc.category_slug = ?";
                $params[] = $category_slug;
            }
            
            // Filter by featured type if specified
            if ($featured_type && in_array($featured_type, ['featured', 'portrait'])) {
                $sql .= " AND fi.featured_type = ?";
                $params[] = $featured_type;
            }
            
            // Filter by source if specified
            if ($source_key) {
                $sql .= " AND fi.source_key = ?";
                $params[] = $source_key;
            }
            
            // Order by priority
            $order_direction = ($priority_order === 'desc') ? 'DESC' : 'ASC';
            $sql .= " ORDER BY fi.priority_order {$order_direction}, fi.created_at DESC";
            
            // Add limit
            $sql .= " LIMIT ?";
            $params[] = $limit;
            
            error_log("[ai_get_featured_images] SQL: $sql");
            error_log("[ai_get_featured_images] Params: " . json_encode($params));
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $featured_images = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Process the results to include full URLs and validate file existence
            $processed_images = [];
            foreach ($featured_images as $image) {
                // Construct the full source-prefixed path
                $full_path = $image['source_key'] . '/' . ltrim($image['image_relative_path'], '/');
                
                // Validate that the source exists and file exists
                $path_info = validate_source_and_path($full_path);
                if ($path_info === null || !file_exists($path_info['absolute_path'])) {
                    continue; // Skip if file doesn't exist
                }
                
                // Basic image data
                $image_data = [
                    'id' => (int)$image['id'],
                    'source_key' => $image['source_key'],
                    'image_path' => $image['image_relative_path'],
                    'folder_path' => $image['folder_path'],
                    'featured_type' => $image['featured_type'],
                    'priority_order' => (int)$image['priority_order'],
                    'thumbnail_url' => "/api.php?action=get_thumbnail&path=" . urlencode($full_path) . "&size=750",
                    'full_image_url' => "/api.php?action=get_image&path=" . urlencode($full_path),
                    'category' => [
                        'name' => $image['category_name'],
                        'slug' => $image['category_slug'],
                        'color' => $image['color_code'],
                        'icon' => $image['icon_class']
                    ]
                ];
                
                // Add metadata if requested
                if ($include_metadata) {
                    $file_info = new SplFileInfo($path_info['absolute_path']);
                    $image_data['metadata'] = [
                        'filename' => $file_info->getFilename(),
                        'filesize' => $file_info->getSize(),
                        'modified_date' => date('Y-m-d H:i:s', $file_info->getMTime()),
                        'alt_text' => $image['alt_text'],
                        'description' => $image['description'],
                        'created_at' => $image['created_at']
                    ];
                    
                    // Get image dimensions if possible
                    if (function_exists('getimagesize')) {
                        $dimensions = @getimagesize($path_info['absolute_path']);
                        if ($dimensions) {
                            $image_data['metadata']['width'] = $dimensions[0];
                            $image_data['metadata']['height'] = $dimensions[1];
                            $image_data['metadata']['aspect_ratio'] = round($dimensions[0] / $dimensions[1], 2);
                        }
                    }
                }
                
                $processed_images[] = $image_data;
            }
            
            // Get available categories for reference
            $categories_stmt = $pdo->query("
                SELECT category_name, category_slug, color_code, icon_class, description 
                FROM folder_categories 
                ORDER BY sort_order, category_name
            ");
            $available_categories = $categories_stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get available sources
            $available_sources = [];
            foreach (IMAGE_SOURCES as $key => $config) {
                $available_sources[] = [
                    'key' => $key,
                    'name' => $config['name'] ?? $key
                ];
            }
            
            json_response([
                'success' => true,
                'images' => $processed_images,
                'total_found' => count($processed_images),
                'query_params' => [
                    'category' => $category_slug,
                    'type' => $featured_type,
                    'source' => $source_key,
                    'limit' => $limit,
                    'priority_order' => $priority_order,
                    'include_metadata' => $include_metadata
                ],
                'available_categories' => $available_categories,
                'available_sources' => $available_sources,
                'api_version' => '1.0',
                'timestamp' => date('Y-m-d H:i:s')
            ]);
            
        } catch (Exception $e) {
            error_log("[ai_get_featured_images] Error: " . $e->getMessage());
            json_error('Lỗi khi lấy danh sách ảnh featured: ' . $e->getMessage(), 500);
        }
        break;

    // AI Content Agent API - Get Categories and Statistics
    case 'ai_get_categories':
        try {
            $include_stats = isset($_GET['stats']) ? (bool)$_GET['stats'] : false;
            
            // Get all categories
            $categories_stmt = $pdo->query("
                SELECT 
                    id,
                    category_name,
                    category_slug,
                    description,
                    color_code,
                    icon_class,
                    sort_order,
                    created_at
                FROM folder_categories 
                ORDER BY sort_order, category_name
            ");
            $categories = $categories_stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Add statistics if requested
            if ($include_stats) {
                foreach ($categories as &$category) {
                    // Count folders in this category
                    $folder_count_stmt = $pdo->prepare("
                        SELECT COUNT(*) 
                        FROM folder_category_mapping 
                        WHERE category_id = ?
                    ");
                    $folder_count_stmt->execute([$category['id']]);
                    $category['folder_count'] = (int)$folder_count_stmt->fetchColumn();
                    
                    // Count featured images in this category
                    $featured_count_stmt = $pdo->prepare("
                        SELECT 
                            COUNT(*) as total_featured,
                            COUNT(CASE WHEN fi.featured_type = 'featured' THEN 1 END) as featured_count,
                            COUNT(CASE WHEN fi.featured_type = 'portrait' THEN 1 END) as portrait_count
                        FROM featured_images fi
                        JOIN folder_category_mapping fcm ON (
                            fi.source_key = fcm.source_key AND 
                            (fi.folder_path = fcm.folder_path OR fi.folder_path LIKE CONCAT(fcm.folder_path, '/%'))
                        )
                        WHERE fcm.category_id = ? AND fi.is_featured = 1
                    ");
                    $featured_count_stmt->execute([$category['id']]);
                    $featured_stats = $featured_count_stmt->fetch(PDO::FETCH_ASSOC);
                    
                    $category['featured_images'] = [
                        'total' => (int)$featured_stats['total_featured'],
                        'featured' => (int)$featured_stats['featured_count'],
                        'portrait' => (int)$featured_stats['portrait_count']
                    ];
                }
            }
            
            json_response([
                'success' => true,
                'categories' => $categories,
                'total_categories' => count($categories),
                'includes_stats' => $include_stats,
                'api_version' => '1.0',
                'timestamp' => date('Y-m-d H:i:s')
            ]);
            
        } catch (Exception $e) {
            error_log("[ai_get_categories] Error: " . $e->getMessage());
            json_error('Lỗi khi lấy danh sách categories: ' . $e->getMessage(), 500);
        }
        break;

    default:
        json_error('Hành động không hợp lệ.', 400);
} 