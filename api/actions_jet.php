<?php
// API actions for the Jet Culling App

// Constants like RAW_IMAGE_SOURCES, RAW_IMAGE_EXTENSIONS and functions like json_error()
// are expected to be available globally via api/init.php and api/helpers.php, loaded by the main api.php router.

if (!defined('RAW_IMAGE_SOURCES')) {
    // This is a fallback / error check. init.php should have defined this.
    json_error("Lỗi cấu hình nghiêm trọng: RAW_IMAGE_SOURCES không được tải bởi init.php.", 500);
    exit;
}
if (!function_exists('json_error')) {
    // This is a fallback / error check. init.php (via helpers.php) should have defined this.
    // Attempt to load helpers directly if not found, though this indicates a deeper issue.
    if (file_exists(__DIR__ . '/helpers.php')) {
        require_once __DIR__ . '/helpers.php';
    } 
    if (!function_exists('json_error')) {
        error_log("CRITICAL: json_error function not found and helpers.php could not be loaded directly by actions_jet.php");
        // Fallback to plain text error if json_error is truly unavailable
        header('Content-Type: text/plain');
        http_response_code(500);
        echo "Lỗi máy chủ nghiêm trọng: Chức năng ghi nhật ký lỗi không khả dụng.";
        exit;
    }
}


$jet_action = $_GET['action'] ?? null;

// error_log("[JET_ACTION] Action in actions_jet.php: " . $jet_action); // Optional: for fine-grained debugging

switch ($jet_action) {
    case 'jet_list_images':
        error_log("[JET_LIST_IMAGES] Entered case.");
        $source_key = $_GET['source_key'] ?? null;
        $relative_path = $_GET['path'] ?? ''; 
        error_log("[JET_LIST_IMAGES] Source Key: {$source_key}, Relative Path: {$relative_path}");

        if (!$source_key || !isset(RAW_IMAGE_SOURCES[$source_key])) {
            error_log("[JET_LIST_IMAGES] Error: Invalid source key or not set. Key: " . ($source_key ?? 'NULL'));
            json_error("Nguồn RAW không hợp lệ hoặc không được cung cấp.", 400);
            exit;
        }
        if (!defined('RAW_IMAGE_EXTENSIONS')) {
            error_log("[JET_LIST_IMAGES] Error: RAW_IMAGE_EXTENSIONS not defined.");
            json_error("Lỗi cấu hình: RAW_IMAGE_EXTENSIONS không được xác định.", 500);
            exit;
        }
        error_log("[JET_LIST_IMAGES] Source key and RAW_IMAGE_EXTENSIONS validated.");

        $source_config = RAW_IMAGE_SOURCES[$source_key];
        $base_path = rtrim($source_config['path'], '/\\'); 
        error_log("[JET_LIST_IMAGES] Base path from config: {$base_path}");
        
        // Construct the full path to scan
        $clean_relative_path = '';
        if (!empty($relative_path)) {
            $path_parts = explode('/', str_replace('//', '/', trim($relative_path, '/\\')));
            $safe_parts = [];
            foreach ($path_parts as $part) {
                if ($part !== '' && $part !== '.') { // Keep valid parts
                    // Additionally, explicitly disallow '..' to prevent path traversal above the $base_path
                    if ($part === '..') {
                        error_log("[JET_LIST_IMAGES] Path traversal attempt detected and blocked: '..' in relative_path.");
                        json_error("Đường dẫn không hợp lệ (chứa '..').", 400);
                        exit;
                    }
                    $safe_parts[] = $part; 
                }
            }
            $clean_relative_path = implode('/', $safe_parts);
        }
        error_log("[JET_LIST_IMAGES] Cleaned relative path: {$clean_relative_path}");

        $full_scan_path = $base_path . (empty($clean_relative_path) ? '' : '/' . $clean_relative_path);
        error_log("[JET_LIST_IMAGES] Full scan path before realpath: {$full_scan_path}");
        $full_scan_path_realpath = realpath($full_scan_path);
        error_log("[JET_LIST_IMAGES] Full scan path after realpath: " . ($full_scan_path_realpath ?: 'false'));


        if ($full_scan_path_realpath === false || !is_dir($full_scan_path_realpath)) {
            error_log("[JET_LIST_IMAGES] Error: Invalid or non-existent directory. Path: {$full_scan_path}, Realpath: " . ($full_scan_path_realpath ?: 'false'));
            json_error("Đường dẫn thư mục không hợp lệ hoặc không tồn tại: " . htmlspecialchars($full_scan_path), 404);
            exit;
        }

        // Security check: Ensure the resolved path is still within the defined base_path
        $base_path_realpath = realpath($base_path);
        error_log("[JET_LIST_IMAGES] Base path realpath for security check: " . ($base_path_realpath ?: 'false'));
        if (!$base_path_realpath || strpos($full_scan_path_realpath, $base_path_realpath) !== 0) {
            error_log("[JET_LIST_IMAGES] Error: Path security check failed. Full realpath: " . ($full_scan_path_realpath ?: 'false') . ", Base realpath: " . ($base_path_realpath ?: 'false'));
            json_error("Truy cập đường dẫn bị từ chối (ngoài phạm vi nguồn được phép).", 403);
            exit;
        }
        error_log("[JET_LIST_IMAGES] Path security check passed.");

        $images = [];
        $raw_extensions = array_map('strtolower', RAW_IMAGE_EXTENSIONS);
        error_log("[JET_LIST_IMAGES] About to iterate directory: {$full_scan_path_realpath}");

        // Get current user for checking pick status
        $current_user_for_picks = $_SESSION['admin_username'] ?? null;
        $user_picks = [];
        if ($current_user_for_picks && $pdo) {
            try {
                // Fetch pick_color instead of is_picked
                $sql_picks = "SELECT image_relative_path, pick_color FROM jet_image_picks WHERE user_username = :user_username AND source_key = :source_key";
                $stmt_picks = $pdo->prepare($sql_picks);
                $stmt_picks->bindParam(':user_username', $current_user_for_picks, PDO::PARAM_STR);
                $stmt_picks->bindParam(':source_key', $source_key, PDO::PARAM_STR);
                $stmt_picks->execute();
                while ($row = $stmt_picks->fetch(PDO::FETCH_ASSOC)) {
                    // Store the actual color string, or null if no pick
                    $user_picks[$row['image_relative_path']] = $row['pick_color']; 
                }
            } catch (PDOException $e) {
                error_log("[JET_LIST_IMAGES] Error fetching user picks: " . $e->getMessage());
                // Non-fatal, proceed without pick info for now
            }
        }

        try {
            $iterator = new DirectoryIterator($full_scan_path_realpath);
            foreach ($iterator as $fileinfo) {
                if ($fileinfo->isFile()) {
                    $entry = $fileinfo->getFilename();
                    $extension = strtolower($fileinfo->getExtension());
                    // error_log("[JET_LIST_IMAGES_ITERATOR] Checking file: {$entry}, Extension found: '{$extension}'"); 
                    if (in_array($extension, $raw_extensions)) {
                        $image_full_relative_path = (empty($clean_relative_path) ? '' : $clean_relative_path . '/') . $entry;
                        $images[] = [
                            'name' => $entry,
                            'path' => $image_full_relative_path,
                            'source_key' => $source_key,
                            // Use pick_color, defaulting to null if not set in $user_picks
                            'pick_color' => $user_picks[$image_full_relative_path] ?? null,
                            'modified_timestamp' => $fileinfo->getMTime()
                        ];
                    }
                }
            }
        } catch (Exception $e) {
            error_log("[JET_LIST_IMAGES] Exception during DirectoryIterator: " . $e->getMessage() . " for path: " . $full_scan_path_realpath);
            json_error("Không thể đọc thư mục: " . htmlspecialchars($clean_relative_path) . " Error: " . $e->getMessage(), 500);
            exit;
        }
        error_log("[JET_LIST_IMAGES] Directory iteration complete. Found " . count($images) . " images.");
        
        usort($images, function($a, $b) {
            return strnatcasecmp($a['name'], $b['name']);
        });

        header('Content-Type: application/json');
        echo json_encode(['success' => true, 'images' => $images, 'debug_path' => $full_scan_path_realpath]);
        exit;

    case 'jet_get_raw_preview':
        error_log("[JET_GET_RAW_PREVIEW] Entered case.");
        $source_key = $_GET['source_key'] ?? null;
        $image_relative_path = $_GET['image_path'] ?? null; // e.g., 'folder/image.nef' or 'image.arw'

        if (!$source_key || !isset(RAW_IMAGE_SOURCES[$source_key])) {
            error_log("[JET_GET_RAW_PREVIEW] Error: Invalid source key '{$source_key}'");
            http_response_code(400);
            echo "Invalid RAW source key.";
            exit;
        }
        if (!$image_relative_path) {
            error_log("[JET_GET_RAW_PREVIEW] Error: Missing image_path.");
            http_response_code(400);
            echo "Missing image path.";
            exit;
        }

        $source_config = RAW_IMAGE_SOURCES[$source_key];
        $base_raw_path = rtrim($source_config['path'], '/\\');
        
        // Sanitize image_relative_path (similar to list_images but for a file)
        $path_parts = explode('/', str_replace('\\', '/', $image_relative_path));
        $safe_parts = [];
        foreach ($path_parts as $part) {
            if ($part !== '' && $part !== '.' && $part !== '..') {
                $safe_parts[] = $part;
            }
        }
        $clean_image_relative_path = implode('/', $safe_parts);
        if (empty($clean_image_relative_path) || $clean_image_relative_path !== $image_relative_path) {
             error_log("[JET_GET_RAW_PREVIEW] Error: Invalid characters or structure in image_path '{$image_relative_path}'");
             http_response_code(400);
             echo "Invalid image path structure.";
             exit;
        }

        $full_raw_file_path = $base_raw_path . DIRECTORY_SEPARATOR . $clean_image_relative_path;
        $full_raw_file_path_realpath = realpath($full_raw_file_path);

        if (!$full_raw_file_path_realpath || !is_file($full_raw_file_path_realpath)) {
            error_log("[JET_GET_RAW_PREVIEW] Error: RAW file not found or not a file at '{$full_raw_file_path}' (Realpath: '{$full_raw_file_path_realpath}')");
            http_response_code(404);
            echo "RAW file not found.";
            exit;
        }

        // Security check: ensure real path is within the source base path
        if (strpos($full_raw_file_path_realpath, realpath($base_raw_path)) !== 0) {
            error_log("[JET_GET_RAW_PREVIEW] Error: Path security violation for '{$full_raw_file_path_realpath}'");
            http_response_code(403);
            echo "Access denied to file path.";
            exit;
        }

        $raw_extension = strtolower(pathinfo($full_raw_file_path_realpath, PATHINFO_EXTENSION));
        if (!in_array($raw_extension, RAW_IMAGE_EXTENSIONS)) {
            error_log("[JET_GET_RAW_PREVIEW] Error: File extension '{$raw_extension}' is not an allowed RAW extension for '{$full_raw_file_path_realpath}'");
            http_response_code(400);
            echo "Invalid file type (not an allowed RAW extension).";
            exit;
        }

        // Cache path construction
        // JET_PREVIEW_CACHE_ROOT / SIZE / source_key / relative_dir (if any) / filename.jpg
        $cache_dir_path = JET_PREVIEW_CACHE_ROOT . DIRECTORY_SEPARATOR . JET_PREVIEW_SIZE . DIRECTORY_SEPARATOR . $source_key . DIRECTORY_SEPARATOR . dirname($clean_image_relative_path);
        $cache_file_name = basename($clean_image_relative_path, '.' . $raw_extension) . '.jpg';
        $cached_preview_full_path = rtrim($cache_dir_path, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cache_file_name;

        error_log("[JET_GET_RAW_PREVIEW] RAW file: {$full_raw_file_path_realpath}");
        error_log("[JET_GET_RAW_PREVIEW] Cache path: {$cached_preview_full_path}");

        if (file_exists($cached_preview_full_path) && filesize($cached_preview_full_path) > 0) {
            error_log("[JET_GET_RAW_PREVIEW] Serving from cache: {$cached_preview_full_path}");
            header('Content-Type: image/jpeg');
            readfile($cached_preview_full_path);
            exit;
        }

        // Create cache directory if it doesn't exist
        if (!is_dir($cache_dir_path)) {
            if (!@mkdir($cache_dir_path, 0775, true)) {
                error_log("[JET_GET_RAW_PREVIEW] CRITICAL: Failed to create cache directory: {$cache_dir_path}");
                http_response_code(500);
                echo "Server error: Could not create cache directory.";
                exit;
            }
        }
        
        // Define the full path to dcraw.exe
        // IMPORTANT: User confirmed dcraw.exe is in C:\Program Files\dcraw\
        // Using double backslashes for PHP string literal
        $dcraw_executable_path = "C:\\Program Files\\dcraw\\dcraw.exe";

        // Define full path to magick.exe
        $magick_executable_path = "C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe";
        
        $preview_size = JET_PREVIEW_SIZE;
        $escaped_final_cache_path = escapeshellarg($cached_preview_full_path);

        // --- Two-step conversion using a temporary PPM file --- (This is now the primary method)
        $temp_ppm_filename = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'jet_raw_temp_' . uniqid() . '.ppm';
        $escaped_temp_ppm_path = escapeshellarg($temp_ppm_filename);

        // Step 1: Convert RAW to temporary PPM file
        $dcraw_to_ppm_cmd = "\"{$dcraw_executable_path}\" -c \"{$full_raw_file_path_realpath}\" > {$escaped_temp_ppm_path} 2>&1";
        error_log("[JET_GET_RAW_PREVIEW] Executing Step 1 (dcraw to PPM). CMD: {$dcraw_to_ppm_cmd}");
        $dcraw_output = shell_exec($dcraw_to_ppm_cmd);
        $trimmed_dcraw_output = is_string($dcraw_output) ? trim($dcraw_output) : '';

        if (!file_exists($temp_ppm_filename) || filesize($temp_ppm_filename) === 0) {
            error_log("[JET_GET_RAW_PREVIEW] Step 1 FAILED: dcraw did not create PPM file or PPM is empty. Temp PPM: {$temp_ppm_filename}. dcraw output: " . ($trimmed_dcraw_output ?: "EMPTY"));
            if (file_exists($temp_ppm_filename)) { @unlink($temp_ppm_filename); }
            http_response_code(500);
            echo "Server error: RAW processing step 1 failed (dcraw). Output: " . htmlspecialchars($trimmed_dcraw_output ?: "No output");
            exit;
        }
        error_log("[JET_GET_RAW_PREVIEW] Step 1 SUCCESS: dcraw created PPM file: {$temp_ppm_filename}. Size: " . filesize($temp_ppm_filename) . ". dcraw output: " . ($trimmed_dcraw_output ?: "EMPTY"));

        // Step 2: Convert temporary PPM to final JPG
        // Using > for resize, not \>
        $magick_ppm_to_jpg_cmd = "\"{$magick_executable_path}\" convert {$escaped_temp_ppm_path} -resize {$preview_size}x{$preview_size}> -quality 85 {$escaped_final_cache_path} 2>&1";
        error_log("[JET_GET_RAW_PREVIEW] Executing Step 2 (PPM to JPG). CMD: {$magick_ppm_to_jpg_cmd}");
        $magick_output = shell_exec($magick_ppm_to_jpg_cmd);
        $trimmed_magick_output = is_string($magick_output) ? trim($magick_output) : '';

        // Clean up temporary PPM file immediately
        if (file_exists($temp_ppm_filename)) {
            @unlink($temp_ppm_filename);
            error_log("[JET_GET_RAW_PREVIEW] Temporary PPM file {$temp_ppm_filename} deleted.");
        }

        if (!file_exists($cached_preview_full_path) || filesize($cached_preview_full_path) === 0) {
            error_log("[JET_GET_RAW_PREVIEW] Step 2 FAILED: ImageMagick did not create final JPG or JPG is empty. Final JPG: {$cached_preview_full_path}. Magick output: " . ($trimmed_magick_output ?: "EMPTY"));
            http_response_code(500);
            echo "Server error: RAW processing step 2 failed (ImageMagick). Output: " . htmlspecialchars($trimmed_magick_output ?: "No output");
            exit;
        }
        
        error_log("[JET_GET_RAW_PREVIEW] Step 2 SUCCESS: ImageMagick created final JPG: {$cached_preview_full_path}. Magick output: " . ($trimmed_magick_output ?: "EMPTY"));
        error_log("[JET_GET_RAW_PREVIEW] Preview generated and cached: {$cached_preview_full_path}");
        header('Content-Type: image/jpeg');
        readfile($cached_preview_full_path);
        exit;
        // --- End of two-step conversion ---

        // OLD PIPELINE CODE - COMMENTED OUT FOR NOW
        /*
        // Using -c to output PPM to stdout
        $dcraw_cmd = "\"{$dcraw_executable_path}\" -c \"{$full_raw_file_path_realpath}\""; 

        // Input for magick is from stdin, which dcraw pipes to.
        // ppm:- explicitly tells magick to expect PPM from stdin.
        // If dcraw output is just raw RGB, magick might infer it, but ppm:- is safer.
        $magick_cmd = "\"{$magick_executable_path}\" convert ppm:- -resize {$preview_size}x{$preview_size}\> -quality 85 {$escaped_final_cache_path}";
        
        // Pipe dcraw output to magick. Capture combined stderr from the whole pipe to stdout.
        $full_cmd = "{$dcraw_cmd} | {$magick_cmd} 2>&1";

        error_log("[JET_GET_RAW_PREVIEW] Executing full pipeline. CMD: {$full_cmd}");
        $shell_output = shell_exec($full_cmd);
        
        // Handle potentially null or empty shell_output before trimming
        $trimmed_shell_output = is_string($shell_output) ? trim($shell_output) : '';

        error_log("[JET_GET_RAW_PREVIEW] Full pipeline shell_exec output: " . ($trimmed_shell_output ?: "EMPTY"));

        if (!file_exists($cached_preview_full_path) || filesize($cached_preview_full_path) === 0) {
            error_log("[JET_GET_RAW_PREVIEW] Preview generation failed or produced empty JPEG for: {$cached_preview_full_path}. CMD: {$full_cmd}. Shell output was: " . $trimmed_shell_output);
            http_response_code(500);
            // Try to provide more specific feedback to the client if possible
            $error_detail = $trimmed_shell_output ?: "Unknown processing error.";
            echo "Server error: RAW processing failed. Detail: " . htmlspecialchars($error_detail);
            exit;
        } else {
            error_log("[JET_GET_RAW_PREVIEW] Preview generated and cached: {$cached_preview_full_path}");
            header('Content-Type: image/jpeg');
            readfile($cached_preview_full_path);
            exit;
        }
        */
        break; // End of jet_get_raw_preview

    // Renamed from jet_set_pick_status to jet_set_pick_color
    case 'jet_set_pick_color': 
        error_log("[JET_SET_PICK_COLOR] Entered case.");
        global $pdo; 

        if (empty($_SESSION['admin_username'])) {
            json_error("Lỗi: Người dùng chưa đăng nhập hoặc phiên làm việc đã hết hạn.", 403);
            exit;
        }
        $user_username = $_SESSION['admin_username'];

        $source_key = $_POST['source_key'] ?? null;
        $image_relative_path = $_POST['image_relative_path'] ?? null;
        $pick_color_input = $_POST['pick_color'] ?? null; // Expect 'red', 'green', 'blue', 'grey', or a value like 'none' or empty for unpick

        if (!$source_key || !isset(RAW_IMAGE_SOURCES[$source_key])) {
            json_error("Nguồn RAW không hợp lệ hoặc không được cung cấp.", 400);
            exit;
        }
        if (!$image_relative_path) {
            json_error("Đường dẫn hình ảnh không được cung cấp.", 400);
            exit;
        }

        // Validate pick_color_input
        $allowed_colors = ['red', 'green', 'blue', 'grey'];
        $color_to_store = null; // Default to NULL (unpicked)

        if ($pick_color_input !== null && $pick_color_input !== '' && $pick_color_input !== 'none' && $pick_color_input !== 'null') {
            if (in_array(strtolower($pick_color_input), $allowed_colors)) {
                $color_to_store = strtolower($pick_color_input);
            } else {
                json_error("Màu chọn không hợp lệ: " . htmlspecialchars($pick_color_input), 400);
                exit;
            }
        } // If 'none', empty, or 'null', $color_to_store remains null, effectively unpicking.
        
        // Path sanitization (simple check, ensure it doesn't contain '..')
        if (strpos($image_relative_path, '..') !== false) {
            json_error("Đường dẫn hình ảnh không hợp lệ.", 400);
            exit;
        }

        try {
            $sql = "INSERT INTO jet_image_picks (user_username, source_key, image_relative_path, pick_color, pick_status_updated_at) 
                    VALUES (:user_username, :source_key, :image_relative_path, :pick_color_insert, NOW()) 
                    ON DUPLICATE KEY UPDATE pick_color = :pick_color_update, pick_status_updated_at = NOW()";
            
            $stmt = $pdo->prepare($sql);
            $stmt->bindParam(':user_username', $user_username, PDO::PARAM_STR);
            $stmt->bindParam(':source_key', $source_key, PDO::PARAM_STR);
            $stmt->bindParam(':image_relative_path', $image_relative_path, PDO::PARAM_STR);
            
            // Bind $color_to_store to both placeholders.
            // If it's null, PDO should handle it as NULL for the database for both.
            $param_type = ($color_to_store === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
            $stmt->bindParam(':pick_color_insert', $color_to_store, $param_type);
            $stmt->bindParam(':pick_color_update', $color_to_store, $param_type);

            $stmt->execute();

            if ($stmt->rowCount() > 0) {
                $message = $color_to_store ? "Ảnh đã được chọn màu '{$color_to_store}'." : "Lựa chọn màu của ảnh đã được xóa.";
                json_response(['success' => true, 'message' => $message, 'pick_color' => $color_to_store]);
            } else {
                // This can happen if the color submitted is the same as already in DB, ON DUPLICATE KEY UPDATE affects 0 rows.
                // Still, consider it a success as the state is achieved.
                 $message = $color_to_store ? "Trạng thái màu '{$color_to_store}' của ảnh được giữ nguyên." : "Ảnh không có lựa chọn màu.";
                json_response(['success' => true, 'message' => $message, 'pick_color' => $color_to_store, 'no_change' => true]);
            }
        } catch (PDOException $e) {
            error_log("[JET_SET_PICK_COLOR] Database error: " . $e->getMessage());
            json_error("Lỗi cơ sở dữ liệu khi cập nhật lựa chọn pick: " . $e->getMessage(), 500);
        }
        break;

    default:
        // error_log("[JET_ACTION] Unknown jet action in actions_jet.php: " . $jet_action);
        json_error("Hành động Jet không xác định trong actions_jet.php: " . htmlspecialchars($jet_action ?? 'Không có hành động nào được cung cấp'), 400);
        exit;
}
?> 