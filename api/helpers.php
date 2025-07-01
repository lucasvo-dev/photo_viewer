<?php
// api/helpers.php

// Dependencies: 
// - Assumes $pdo is available globally for check_folder_access.
// - Assumes IMAGE_SOURCES and CACHE_THUMB_ROOT constants are defined (from init.php).
// - Assumes $action is available globally for json_response logging.
// - Assumes $allowed_ext is available globally for find_first_image_in_source.

/** Gửi JSON phản hồi thành công */
function json_response($data, $code = 200)
{
    global $action; // Access the global action variable for logging specific cases
    http_response_code($code);

    // Log data specifically for admin_list_folders before encoding (example)
    if (isset($action) && $action === 'admin_list_folders') {
        // Consider passing $action explicitly if globals are avoided later
        error_log("Data before json_encode for admin_list_folders: " . print_r($data, true));
    }

    $json_output = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json_output === false) {
        $error_msg = 'JSON Encode Error: ' . json_last_error_msg() . " | Data was: " . print_r($data, true);
        error_log($error_msg);
        // Fallback if encoding failed after setting headers
        http_response_code(500);
        $json_output = json_encode(['error' => 'Lỗi mã hóa JSON nội bộ.', 'details' => $error_msg]);
        if ($json_output === false) { // Total failure
            $json_output = '{"error": "Lỗi mã hóa JSON nghiêm trọng."}';
        }
    }

    // Clear any previous output buffer before sending the final JSON
    if (ob_get_level() > 0) {
        ob_end_clean();
    }
    echo $json_output;
    exit;
}

/** Gửi JSON lỗi */
function json_error($msg, $code = 400)
{
    json_response(['error' => $msg], $code);
}

/** Gửi JSON thành công */
function json_success($data = null)
{
    $response = ['success' => true];
    if ($data !== null) {
        $response = array_merge($response, $data);
    }
    json_response($response, 200);
}

/**
 * Chuẩn hóa và làm sạch đường dẫn đầu vào (loại bỏ .., \, null bytes, dấu / dư thừa).
 */
function normalize_path_input(?string $path): string
{
    if ($path === null) {
        return '';
    }
    // 1. Thay thế \\ bằng /
    $normalized = str_replace('\\', '/', $path);
    // 2. Loại bỏ .. và null byte (để đơn giản và an toàn)
    $normalized = str_replace(['..', "\0"], '', $normalized);
    // 3. Loại bỏ các dấu / lặp lại
    $normalized = preg_replace('#/+#', '/', $normalized);
    // 4. Loại bỏ dấu / ở đầu và cuối
    return trim($normalized, '/');
}

/**
 * Làm sạch, xác thực đường dẫn thư mục con và trả về thông tin nguồn.
 * Accepts a source-prefixed relative path (e.g., "main/album/sub" or "extra_drive/stuff").
 * Returns null if invalid, or an array ['source_key', 'relative_path', 'absolute_path', 'source_prefixed_path', 'is_root' => bool] on success.
 * The returned 'relative_path' is relative to the source's base path.
 * SECURITY: Crucial for preventing path traversal.
 */
function validate_source_and_path(?string $source_prefixed_path)
{
    // Access constant directly
    if (!defined('IMAGE_SOURCES')) {
        error_log("[validate_source_and_path] Error: IMAGE_SOURCES constant not defined.");
        return null;
    }

    $normalized_input = normalize_path_input($source_prefixed_path);

    if ($normalized_input === '') {
        return ['source_key' => null, 'relative_path' => '', 'absolute_path' => null, 'source_prefixed_path' => '', 'is_root' => true];
    }

    // 1. Split normalized path
    $parts = explode('/', $normalized_input, 2);
    $source_key = $parts[0];
    $relative_path_in_source = $parts[1] ?? ''; // Đã được chuẩn hóa bởi normalize_path_input

    // 2. Check source key existence
    if (!isset(IMAGE_SOURCES[$source_key])) {
        error_log("Path validation failed: Invalid source key '{$source_key}' in path '{$source_prefixed_path}'");
        return null;
    }
    $source_config = IMAGE_SOURCES[$source_key];
    $source_base_path = $source_config['path'];

    // 3. Check if the source base path itself is valid
    $resolved_source_base_path = @realpath($source_base_path);
    if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
        error_log("[validate_source_and_path] Source base path is invalid or not accessible for key '{$source_key}': {$source_base_path} (Resolved: " . ($resolved_source_base_path ?: 'false') . ")");
        return null;
    }
    $source_base_path = $resolved_source_base_path; // Use the resolved path

    // 4. Construct target absolute path
    $target_absolute_path = $source_base_path . ($relative_path_in_source ? DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative_path_in_source) : '');

    // 5. Get real path of the target and validate
    $real_target_path = @realpath($target_absolute_path);

    // 6. Final checks: Must resolve, be a DIRECTORY, and be within the source base
    if (
        $real_target_path === false ||
        !is_dir($real_target_path) ||
        strpos($real_target_path, $source_base_path . DIRECTORY_SEPARATOR) !== 0 && $real_target_path !== $source_base_path // Allow exact match for source root
    ) {
        // Log details for debugging
        /* BỎ LOG CŨ
        error_log(sprintf(
            "[validate_source_and_path] Directory validation failed for '%s' (Source '%s'): real_target_path=%s, is_dir=%s, real_source_base=%s, check_base=%s",
            $source_prefixed_path,
            $source_key,
            $real_target_path === false ? 'false' : $real_target_path,
            is_dir($real_target_path) ? 'true' : 'false',
            $source_base_path,
            (strpos($real_target_path, $source_base_path . DIRECTORY_SEPARATOR) === 0 || $real_target_path === $source_base_path) ? 'true' : 'false'
        ));
        */
        return null;
    }

    // 7. Calculate final relative path based on realpath
    $final_relative_path = substr($real_target_path, strlen($source_base_path));
    $final_relative_path = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $final_relative_path), '/');

    // 8. Return valid info
    return [
        'source_key' => $source_key,
        'relative_path' => $final_relative_path,
        'absolute_path' => $real_target_path,
        'source_prefixed_path' => $final_relative_path === '' ? $source_key : $source_key . '/' . $final_relative_path,
        'is_root' => false
    ];
}

/**
 * Validate a source-prefixed path points to a valid, readable FILE within the correct source.
 *
 * @param string $source_prefixed_path e.g., "main/album/image.jpg"
 * @return array|null ['source_key', 'relative_path', 'absolute_path', 'source_prefixed_path'] or null if invalid.
 */
function validate_source_and_file_path(?string $source_prefixed_path)
{
    // Access constant directly
    if (!defined('IMAGE_SOURCES')) {
        error_log("[validate_source_and_file_path] Error: IMAGE_SOURCES constant not defined.");
        return null;
    }

    $normalized_input = normalize_path_input($source_prefixed_path);

    if ($normalized_input === '') {
        error_log("File validation failed: Normalized path is empty.");
        return null;
    }

    // 1. Split normalized path
    $parts = explode('/', $normalized_input, 2);
    $source_key = $parts[0];
    $relative_path_in_source = $parts[1] ?? ''; // Đã được chuẩn hóa

    if ($relative_path_in_source === '') {
        error_log("File validation failed: Path refers only to a source key, not a file: {$source_prefixed_path}");
        return null;
    }

    // 2. Check source key existence
    if (!isset(IMAGE_SOURCES[$source_key])) {
        error_log("File validation failed: Invalid source key '{$source_key}' in path '{$source_prefixed_path}'");
        return null;
    }
    $source_config = IMAGE_SOURCES[$source_key];
    $source_base_path = $source_config['path'];

    // 3. Check source base path validity
    $resolved_source_base_path = @realpath($source_base_path);
    if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
        error_log("[validate_source_and_file_path] Source base path invalid/inaccessible for key '{$source_key}': {$source_base_path}");
        return null;
    }
    $source_base_path = $resolved_source_base_path;

    // 4. Construct target absolute path
    $target_absolute_path = $source_base_path . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative_path_in_source);

    // 5. Get real path of the target
    $real_target_path = @realpath($target_absolute_path);

    // 6. Final checks for FILE: Must resolve, be a FILE, be READABLE, and within source base
    if (
        $real_target_path === false ||
        !is_file($real_target_path) ||
        !is_readable($real_target_path) ||
        strpos($real_target_path, $source_base_path . DIRECTORY_SEPARATOR) !== 0
    ) {
        // Log details for debugging
        /* BỎ LOG CŨ
        error_log(sprintf(
            "[validate_source_and_file_path] File validation failed for '%s' (Source '%s'): real_target_path=%s, is_file=%s, is_readable=%s, real_source_base=%s, check_base=%s",
            $source_prefixed_path,
            $source_key,
            $real_target_path === false ? 'false' : $real_target_path,
            is_file($real_target_path) ? 'true' : 'false',
            is_readable($real_target_path) ? 'true' : 'false',
            $source_base_path,
            (strpos($real_target_path, $source_base_path . DIRECTORY_SEPARATOR) === 0) ? 'true' : 'false'
        ));
        */
        return null;
    }

    // 7. Calculate final relative path based on realpath
    $final_relative_path = substr($real_target_path, strlen($source_base_path));
    $final_relative_path = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $final_relative_path), '/');

    // 8. Return valid info
    return [
        'source_key' => $source_key,
        'relative_path' => $final_relative_path,
        'absolute_path' => $real_target_path,
        'source_prefixed_path' => $source_key . '/' . $final_relative_path // Reconstruct canonical path
    ];
}

/**
 * Validate a RAW source-prefixed file path (for Jet Culling App)
 * Similar to validate_source_and_file_path but uses RAW_IMAGE_SOURCES instead of IMAGE_SOURCES
 * 
 * @param string|null $source_prefixed_path Path in format "source_key/relative/path/to/file.raw"
 * @return array|null Returns path info array or null if validation fails
 */
function validate_raw_source_and_file_path(?string $source_prefixed_path)
{
    // Access RAW constant directly
    if (!defined('RAW_IMAGE_SOURCES')) {
        error_log("[validate_raw_source_and_file_path] Error: RAW_IMAGE_SOURCES constant not defined.");
        return null;
    }

    $normalized_input = normalize_path_input($source_prefixed_path);

    if ($normalized_input === '') {
        error_log("RAW file validation failed: Normalized path is empty.");
        return null;
    }

    // 1. Split normalized path
    $parts = explode('/', $normalized_input, 2);
    $source_key = $parts[0];
    $relative_path_in_source = $parts[1] ?? '';

    if ($relative_path_in_source === '') {
        error_log("RAW file validation failed: Path refers only to a source key, not a file: {$source_prefixed_path}");
        return null;
    }

    // 2. Check RAW source key existence
    if (!isset(RAW_IMAGE_SOURCES[$source_key])) {
        error_log("RAW file validation failed: Invalid RAW source key '{$source_key}' in path '{$source_prefixed_path}'");
        return null;
    }
    $source_config = RAW_IMAGE_SOURCES[$source_key];
    $source_base_path = $source_config['path'];

    // 3. Check source base path validity
    $resolved_source_base_path = @realpath($source_base_path);
    if ($resolved_source_base_path === false || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
        error_log("[validate_raw_source_and_file_path] RAW source base path invalid/inaccessible for key '{$source_key}': {$source_base_path}");
        return null;
    }
    $source_base_path = $resolved_source_base_path;

    // 4. Construct target absolute path
    $target_absolute_path = $source_base_path . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative_path_in_source);

    // 5. Get real path of the target
    $real_target_path = @realpath($target_absolute_path);

    // 6. Final checks for RAW FILE: Must resolve, be a FILE, be READABLE, and within source base
    if (
        $real_target_path === false ||
        !is_file($real_target_path) ||
        !is_readable($real_target_path) ||
        strpos($real_target_path, $source_base_path . DIRECTORY_SEPARATOR) !== 0
    ) {
        error_log("[validate_raw_source_and_file_path] RAW file validation failed for '{$source_prefixed_path}' - file not found, not readable, or outside source base");
        return null;
    }

    // 7. Additional check: Verify it's actually a RAW file by extension
    if (defined('RAW_FILE_EXTENSIONS')) {
        $file_extension = strtolower(pathinfo($real_target_path, PATHINFO_EXTENSION));
        $raw_extensions = array_map('strtolower', RAW_FILE_EXTENSIONS);
        if (!in_array($file_extension, $raw_extensions)) {
            error_log("[validate_raw_source_and_file_path] File '{$source_prefixed_path}' is not a valid RAW file (extension: {$file_extension})");
            return null;
        }
    }

    // 8. Calculate final relative path based on realpath
    $final_relative_path = substr($real_target_path, strlen($source_base_path));
    $final_relative_path = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $final_relative_path), '/');

    // 9. Return valid info
    return [
        'source_key' => $source_key,
        'relative_path' => $final_relative_path,
        'absolute_path' => $real_target_path,
        'source_prefixed_path' => $source_key . '/' . $final_relative_path // Reconstruct canonical path
    ];
}

/**
 * Kiểm tra quyền truy cập thư mục (dựa vào DB và Session)
 * IMPORTANT: $folder_source_prefixed_path MUST be the source-prefixed path.
 * Assumes $pdo is globally available.
 */
function check_folder_access($folder_source_prefixed_path)
{
    global $pdo; // Assuming $pdo is available from init.php

    if (!isset($pdo)) {
        error_log("[check_folder_access] FATAL: PDO object not available.");
        return ['protected' => true, 'authorized' => false, 'error' => 'Lỗi server nghiêm trọng (DB unavailable).'];
    }

    // Root access (listing sources) is always allowed
    if (empty($folder_source_prefixed_path)) {
        return ['protected' => false, 'authorized' => true, 'password_required' => false];
    }

    try {
        $stmt = $pdo->prepare("SELECT password_hash FROM folder_passwords WHERE folder_name = ? LIMIT 1");
        $stmt->execute([$folder_source_prefixed_path]);
        $row = $stmt->fetch();
        $is_protected = ($row !== false);

        if (!$is_protected) {
            return ['protected' => false, 'authorized' => true, 'password_required' => false];
        }

        // If protected, check session authorization
        $session_key = 'authorized_folders';
        $is_authorized_in_session = !empty($_SESSION[$session_key][$folder_source_prefixed_path]);

        if ($is_authorized_in_session) {
            return ['protected' => true, 'authorized' => true, 'password_required' => false];
        }

        // Protected and not authorized in session
        return ['protected' => true, 'authorized' => false, 'password_required' => true];

    } catch (PDOException $e) {
        error_log("DB Error checking folder access for '{$folder_source_prefixed_path}': " . $e->getMessage());
        return ['protected' => true, 'authorized' => false, 'error' => 'Lỗi server khi kiểm tra quyền truy cập.'];
    }
}

/**
 * Find the first image recursively within a specific directory of a specific source.
 *
 * @param string $source_key The key of the source.
 * @param string $relative_dir_path Path relative to the source's base path. Use '' for source root.
 * @param array $allowed_ext Reference to allowed extensions array (now passed explicitly).
 * @return string|null Source-prefixed relative path of the first image found, or null.
 */
function find_first_image_in_source($source_key, $relative_dir_path, array &$allowed_ext)
{
    if (!defined('IMAGE_SOURCES') || !isset(IMAGE_SOURCES[$source_key])) {
        error_log("[find_first_image_in_source] Invalid source key: '{$source_key}'");
        return null;
    }
    $source_config = IMAGE_SOURCES[$source_key];
    $source_base_path = $source_config['path'];
    $resolved_source_base_path = realpath($source_base_path);

    if ($resolved_source_base_path === false) {
        error_log("[find_first_image_in_source] Source base path does not resolve for key '{$source_key}': {$source_base_path}");
        return null;
    }

    $normalized_relative_dir = trim(str_replace(['..', '\\', "\0"], '', $relative_dir_path), '/');
    $target_dir_absolute = $resolved_source_base_path . (empty($normalized_relative_dir) ? '' : DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normalized_relative_dir));
    $resolved_target_dir_absolute = realpath($target_dir_absolute);

    if ($resolved_target_dir_absolute === false || !is_dir($resolved_target_dir_absolute) || !is_readable($resolved_target_dir_absolute)) {
    
        return null; // Directory doesn't exist or isn't readable
    }

    if (strpos($resolved_target_dir_absolute, $resolved_source_base_path) !== 0) {
        error_log("[find_first_image_in_source] Security Check Failed: Target '{$resolved_target_dir_absolute}' outside source base '{$resolved_source_base_path}'.");
        return null;
    }



    try {
        // *** Use Recursive Iterator for finding the first image recursively ***
        $directory = new RecursiveDirectoryIterator(
            $resolved_target_dir_absolute,
            RecursiveDirectoryIterator::SKIP_DOTS | RecursiveDirectoryIterator::FOLLOW_SYMLINKS
        );
        $iterator = new RecursiveIteratorIterator($directory, RecursiveIteratorIterator::LEAVES_ONLY);

        $image_files = [];
        // $files_scanned_count = 0; // REMOVED COUNTER
        foreach ($iterator as $fileinfo) {
            // $files_scanned_count++; // REMOVED COUNTER
            if ($fileinfo->isFile() && $fileinfo->isReadable()) {
                $extension = strtolower($fileinfo->getExtension());
                if (in_array($extension, $allowed_ext, true)) {
                    $image_real_path = $fileinfo->getRealPath();
                    // Calculate relative path from the TARGET directory being scanned
                    $image_relative_to_target_dir = substr($image_real_path, strlen($resolved_target_dir_absolute));
                    $image_relative_to_target_dir = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $image_relative_to_target_dir), '/');

                    $image_files[$image_relative_to_target_dir] = true; 
                }
            }
        }
        

        if (!empty($image_files)) {
            uksort($image_files, 'strnatcasecmp');
            $first_image_relative_path = key($image_files);

            return $first_image_relative_path;
        }

    } catch (Exception $e) {
        error_log("[find_first_image ERROR] Exception scanning directory '{$resolved_target_dir_absolute}': " . $e->getMessage()); // Keep error log
        return null;
    }

    
    return null; // No image found
}


/**
 * Create a thumbnail image using GD library.
 *
 * @param string $source_path Absolute path to the source image.
 * @param string $cache_path Absolute path to save the thumbnail.
 * @param int $thumb_size Desired width/height.
 * @return bool True on success.
 * @throws Exception If thumbnail creation fails for any reason (GD error, file I/O).
 */
function create_thumbnail($source_path, $cache_path, $thumb_size = 150)
{
    try {
        // Basic validation
        if (!file_exists($source_path) || !is_readable($source_path)) {
            throw new Exception("Source file does not exist or is not readable: " . $source_path);
        }
        if (!$thumb_size || !is_numeric($thumb_size) || $thumb_size <= 0) {
             throw new Exception("Invalid thumbnail size specified: " . $thumb_size);
        }
        // Ensure cache directory exists
        $cache_dir = dirname($cache_path);
        if (!is_dir($cache_dir)) {
            if (!@mkdir($cache_dir, 0775, true)) {
                 throw new Exception("Failed to create cache directory: " . $cache_dir);
            }
        }
        if (!is_writable($cache_dir)) {
             throw new Exception("Cache directory is not writable: " . $cache_dir);
        }

        // Get image info
        $image_info = @getimagesize($source_path);
        if (!$image_info) {
            throw new Exception("Failed to get image size (unsupported format or corrupt?): " . $source_path);
        }
        $width = $image_info[0];
        $height = $image_info[1];
        $mime = $image_info['mime'];

        // Load image based on MIME type
        $image = null;
        switch ($mime) {
            case 'image/jpeg':
            case 'image/jpg':
                $image = @imagecreatefromjpeg($source_path);
                break;
            case 'image/png':
                $image = @imagecreatefrompng($source_path);
                break;
            case 'image/gif':
                $image = @imagecreatefromgif($source_path);
                break;
            case 'image/bmp':
            case 'image/x-ms-bmp':
                $image = @imagecreatefrombmp($source_path); // Requires GD >= 7.2.0
                break;
            case 'image/webp':
                $image = @imagecreatefromwebp($source_path); // Requires GD >= 7.0.0 with WebP support
                break;
            default:
                 throw new Exception("Unsupported image type: {$mime} for file " . $source_path);
        }

        if (!$image) {
            // Check for memory limit issues if loading failed
            $last_error = error_get_last();
            $error_detail = $last_error ? " (Last Error: " . $last_error['message'] . ")" : "";
             throw new Exception("Failed to load image resource (memory limit? corrupt file?): {$mime}{$error_detail} from " . $source_path);
        }

        // Calculate thumbnail dimensions (maintaining aspect ratio)
        $aspect_ratio = $width / $height;
        if ($width > $height) {
            // Landscape or Square
            $new_width = $thumb_size;
            $new_height = $new_width / $aspect_ratio;
        } else {
            // Portrait
            $new_height = $thumb_size;
            $new_width = $new_height * $aspect_ratio;
        }

        // Create new image resource for the thumbnail
        $thumb = @imagecreatetruecolor((int)$new_width, (int)$new_height);
        if (!$thumb) {
             imagedestroy($image); // Clean up original image resource
             throw new Exception("Failed to create true color image resource for thumbnail (width: {$new_width}, height: {$new_height}).");
        }

        // Handle transparency for PNG and GIF
        if ($mime == 'image/png' || $mime == 'image/gif') {
            @imagealphablending($thumb, false);
            @imagesavealpha($thumb, true);
            $transparent_color = @imagecolorallocatealpha($thumb, 0, 0, 0, 127);
            if ($transparent_color !== false) {
                 @imagefill($thumb, 0, 0, $transparent_color);
            } else {
                error_log("[create_thumbnail] Warning: Failed to allocate transparent color for {$source_path}");
            }
        }

        // Resize original image into the thumbnail resource
        // Use imagecopyresampled for better quality
        if (!@imagecopyresampled($thumb, $image, 0, 0, 0, 0, (int)$new_width, (int)$new_height, $width, $height)) {
            imagedestroy($image);
            imagedestroy($thumb);
             throw new Exception("Failed to resample image for thumbnail: " . $source_path);
        }

        // Save the thumbnail as JPEG (common format for cache)
        $quality = 85; // Adjust quality (0-100)
        if (!@imagejpeg($thumb, $cache_path, $quality)) {
             imagedestroy($image);
             imagedestroy($thumb);
             throw new Exception("Failed to save thumbnail JPEG to: " . $cache_path);
        }

        // Clean up resources
        imagedestroy($image);
        imagedestroy($thumb);

        return true; // Success

    } catch (Throwable $e) { // Catch any error or exception
         error_log("[create_thumbnail] Error for source '{$source_path}' -> cache '{$cache_path}': " . $e->getMessage());
         // Rethrow the exception to be caught by the caller (worker)
         throw new Exception("Thumbnail generation failed for '{$source_path}': " . $e->getMessage(), 0, $e);
    }
}

/**
 * Creates a thumbnail for a video file using FFmpeg.
 *
 * @param string $video_source_path Absolute path to the source video file.
 * @param string $cache_path Absolute path where the thumbnail (JPEG) should be saved.
 * @param int $thumb_size Target width for the thumbnail. Height will be scaled proportionally.
 * @param string $ffmpeg_path Path to the FFmpeg executable (optional, defaults to 'ffmpeg').
 * @return bool True on success, false on failure.
 */
function create_video_thumbnail($video_source_path, $cache_path, $thumb_size = 150, $ffmpeg_path = 'ffmpeg') {
    if (!is_file($video_source_path) || !is_readable($video_source_path)) {
        error_log("[create_video_thumbnail] Source video not found or not readable: {$video_source_path}");
        return false;
    }

    // Ensure cache directory exists
    $cache_dir = dirname($cache_path);
    if (!is_dir($cache_dir)) {
        if (!@mkdir($cache_dir, 0775, true)) {
            error_log("[create_video_thumbnail] Failed to create cache directory: {$cache_dir}");
            return false;
        }
    }

    // Delete existing cache file to ensure fresh thumbnail
    if (file_exists($cache_path)) {
        @unlink($cache_path);
    }

    // FFmpeg command to extract a frame, scale it, and save as JPEG
    // -y: overwrite output files without asking
    // Seeking to 3 seconds to get a more representative frame.
    // format=yuvj420p is often needed for broad JPEG compatibility.
    // -q:v 3 is a good quality setting for JPEG output.
    $cmd = sprintf('%s -ss 00:00:03 -i "%s" -frames:v 1 -vf "scale=%d:-1,format=yuvj420p" -q:v 3 "%s" 2>&1',
        escapeshellcmd($ffmpeg_path),      // Sanitize ffmpeg path
        escapeshellarg($video_source_path), // Sanitize source path
        $thumb_size,
        escapeshellarg($cache_path)        // Sanitize cache path
    );

    $output = [];
    $return_var = -1;
    exec($cmd, $output, $return_var);

    if ($return_var !== 0) {
        error_log("[create_video_thumbnail] FFmpeg failed for '{$video_source_path}'. Return var: {$return_var}. Output: " . implode("\n", $output));
        if (file_exists($cache_path)) { @unlink($cache_path); } // Clean up failed attempt
        return false;
    }

    if (!file_exists($cache_path) || filesize($cache_path) === 0) {
        error_log("[create_video_thumbnail] FFmpeg command seemed to succeed, but output file '{$cache_path}' was not created or is empty.");
        if (file_exists($cache_path)) { @unlink($cache_path); } // Clean up
        return false;
    }

    // Optionally, verify it's a valid image (though FFmpeg should handle this)
    // if (!@getimagesize($cache_path)) {
    //     error_log("[create_video_thumbnail] Output file '{$cache_path}' is not a valid image.");
    //     if (file_exists($cache_path)) { @unlink($cache_path); }
    //     return false;
    // }
    
    error_log("[create_video_thumbnail] Successfully created thumbnail for '{$video_source_path}' at '{$cache_path}'");
    return true;
}


// --- Cache Management ---

/**
 * Generates the standardized absolute cache path for a thumbnail.
 *
 * @param string $source_prefixed_path The source-prefixed path of the original item (e.g., "main/album/image.jpg").
 * @param int $size The target thumbnail size (e.g., 150, 750).
 * @param bool $is_video (Currently unused, as worker saves all as .jpg, but kept for potential future use)
 * @return string The absolute path to where the thumbnail should be cached.
 */
function get_thumbnail_cache_path(string $source_prefixed_path, int $size, bool $is_video = false): string
{
    // Use source-prefixed path for hashing to ensure uniqueness across different sources
    // This matches the hashing logic used in the worker (worker_cache.php)
    $cache_hash = sha1($source_prefixed_path);
    
    // Filename convention: hash_size.jpg (worker always saves as .jpg)
    $thumb_filename = $cache_hash . '_' . $size . '.jpg';
    
    // Directory structure: CACHE_THUMB_ROOT / size_value / filename
    $cache_dir_for_size = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size;
    
    // Full absolute path
    return $cache_dir_for_size . DIRECTORY_SEPARATOR . $thumb_filename;
}

/**
 * Adds a thumbnail generation job to the cache_jobs queue.
 * Checks for existing pending/recent jobs to avoid duplicates.
 *
 * @param PDO $pdo The PDO database connection object.
 * @param string $image_source_prefixed_path The source-prefixed path of the original image.
 * @param int $size The target thumbnail size.
 * @param string $type 'image' or 'video'.
 * @return bool True if a job was added or already effectively exists/was recently handled, false on DB error or if job creation was skipped due to recent failure.
 */
function add_thumbnail_job_to_queue(PDO $pdo, string $image_source_prefixed_path, int $size, string $type = 'image'): bool
{
    // Check for existing pending or processing job for this exact image and size
    try {
        // Use 'folder_path' instead of 'source_path'
        $stmt_check = $pdo->prepare("SELECT status FROM cache_jobs WHERE folder_path = ? AND size = ? AND type = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1");
        $stmt_check->execute([$image_source_prefixed_path, $size, $type]);
        if ($stmt_check->fetch()) {
            error_log("[Cache Job Queue] Job for '{$image_source_prefixed_path}' size {$size} type '{$type}' already pending/processing.");
            return true; // Job already exists or is being processed
        }

        // Check for recently completed or failed job for this exact image and size to avoid re-queueing too quickly
        /*
        $stmt_recent = $pdo->prepare("SELECT status, created_at FROM cache_jobs WHERE folder_path = ? AND size = ? AND type = ? AND created_at > (NOW() - INTERVAL 5 MINUTE) ORDER BY created_at DESC LIMIT 1");
        $stmt_recent->execute([$image_source_prefixed_path, $size, $type]);
        $recent_job = $stmt_recent->fetch(PDO::FETCH_ASSOC);
        if ($recent_job) {
            if ($recent_job['status'] === 'completed') {
                error_log("[Cache Job Queue] Job for '{$image_source_prefixed_path}' size {$size} type '{$type}' was completed recently. Skipping duplicate queue.");
                return true; 
            }
            // If recently failed, maybe don't re-queue immediately to avoid hammering a problematic file,
            // but for now, we'll allow re-queueing after a short interval (implied by not returning false here if failed).
            // A more sophisticated retry mechanism could be added later (e.g., exponential backoff, max retries).
        }
        */

    } catch (PDOException $e) {
        error_log("[Cache Job Queue] DB Error checking existing jobs for '{$image_source_prefixed_path}' size {$size} type '{$type}': " . $e->getMessage());
        return false; // DB error
    }

    // If no existing/recent relevant job, add a new one
    try {
        // Use 'folder_path' instead of 'source_path'
        // Set total_files = 1 since this is for a single file
        // Use UTC timestamp format consistent with database schema
        $timestamp = gmdate('YmdHis');
        $sql = "INSERT INTO cache_jobs (folder_path, size, type, status, total_files, processed_files, created_at) VALUES (?, ?, ?, 'pending', 1, 0, ?)";
        $stmt = $pdo->prepare($sql);
        $success = $stmt->execute([$image_source_prefixed_path, $size, $type, $timestamp]);
        if ($success) {
            error_log("[Cache Job Queue] Successfully added job for: {$image_source_prefixed_path}, Size: {$size}, Type: {$type}");
            return true;
        } else {
            error_log("[Cache Job Queue] Failed to add job for: {$image_source_prefixed_path}, Size: {$size}, Type: {$type} (execute returned false)");
            return false;
        }
    } catch (PDOException $e) {
        // Log specific MySQL errors if available
        $error_code = $e->getCode();
        $error_info = $e->errorInfo;
        error_log("[Cache Job Queue] DB Error for '{$image_source_prefixed_path}' size {$size} type '{$type}': " . $e->getMessage() . " (SQLSTATE: {$error_code} / Driver Code: " . ($error_info[1] ?? 'N/A') . " - " . ($error_info[2] ?? 'N/A') .")");
        return false; // DB error
    }
}

/**
 * Adds a RAW image cache job to the jet_cache_jobs queue.
 * Checks for existing pending/recent jobs to avoid duplicates.
 *
 * @param PDO $pdo The PDO database connection object.
 * @param string $source_key The RAW source key.
 * @param string $image_relative_path The relative path within the source.
 * @param int $cache_size The target cache size (e.g., 750 for preview, 120 for filmstrip).
 * @return bool True if a job was added or already exists, false on DB error.
 */
function add_jet_cache_job_to_queue(PDO $pdo, string $source_key, string $image_relative_path, int $cache_size): bool
{
    // Check for existing pending or processing job for this exact image and size
    try {
        $stmt_check = $pdo->prepare("SELECT status FROM jet_cache_jobs WHERE source_key = ? AND image_relative_path = ? AND cache_size = ? AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1");
        $stmt_check->execute([$source_key, $image_relative_path, $cache_size]);
        if ($stmt_check->fetch()) {
            error_log("[Jet Cache Job Queue] Job for '{$source_key}/{$image_relative_path}' size {$cache_size} already pending/processing.");
            return true; // Job already exists or is being processed
        }

        // Check for recently completed job to avoid re-queueing
        $stmt_recent = $pdo->prepare("SELECT status, created_at FROM jet_cache_jobs WHERE source_key = ? AND image_relative_path = ? AND cache_size = ? AND created_at > (NOW() - INTERVAL 5 MINUTE) ORDER BY created_at DESC LIMIT 1");
        $stmt_recent->execute([$source_key, $image_relative_path, $cache_size]);
        $recent_job = $stmt_recent->fetch(PDO::FETCH_ASSOC);
        if ($recent_job && $recent_job['status'] === 'completed') {
            error_log("[Jet Cache Job Queue] Job for '{$source_key}/{$image_relative_path}' size {$cache_size} was completed recently. Skipping duplicate queue.");
            return true; 
        }

    } catch (PDOException $e) {
        error_log("[Jet Cache Job Queue] DB Error checking existing jobs for '{$source_key}/{$image_relative_path}' size {$cache_size}: " . $e->getMessage());
        return false; // DB error
    }

    // If no existing/recent relevant job, add a new one
    try {
        $raw_file_path = $source_key . '/' . $image_relative_path; // Source-prefixed path
        $sql = "INSERT INTO jet_cache_jobs (raw_file_path, source_key, image_relative_path, cache_size, status, created_at) VALUES (?, ?, ?, ?, 'pending', NOW())";
        $stmt = $pdo->prepare($sql);
        $success = $stmt->execute([$raw_file_path, $source_key, $image_relative_path, $cache_size]);
        if ($success) {
            error_log("[Jet Cache Job Queue] Successfully added job for: {$source_key}/{$image_relative_path}, Size: {$cache_size}");
            return true;
        } else {
            error_log("[Jet Cache Job Queue] Failed to add job for: {$source_key}/{$image_relative_path}, Size: {$cache_size} (execute returned false)");
            return false;
        }
    } catch (PDOException $e) {
        error_log("[Jet Cache Job Queue] DB Error for '{$source_key}/{$image_relative_path}' size {$cache_size}: " . $e->getMessage());
        return false; // DB error
    }
}

/**
 * Gets the cache path for a RAW image preview using hash-based system (same as regular thumbnails).
 *
 * @param string $source_key The RAW source key.
 * @param string $image_relative_path The relative path within the source.
 * @param int $cache_size The target cache size.
 * @return string The absolute path to where the cache should be stored.
 */
function get_jet_cache_path(string $source_key, string $image_relative_path, int $cache_size): string
{
    // Create source-prefixed path for consistent hashing
    $source_prefixed_path = $source_key . '/' . $image_relative_path;
    
    // Use same hash system as regular thumbnails
    $cache_hash = sha1($source_prefixed_path);
    
    // Filename convention: hash_size_raw.jpg (add _raw to distinguish from regular thumbnails)
    $cache_filename = $cache_hash . '_' . $cache_size . '_raw.jpg';
    
    // Directory structure: JET_PREVIEW_CACHE_ROOT / size_value / filename
    $cache_dir_for_size = JET_PREVIEW_CACHE_ROOT . DIRECTORY_SEPARATOR . $cache_size;
    
    // Full absolute path
    return $cache_dir_for_size . DIRECTORY_SEPARATOR . $cache_filename;
}

/**
 * Serves a file with appropriate headers.
 *
 * @param string $file_path Absolute path to the file.
 * @param string $content_type The MIME type of the file.
 * @param bool $enable_client_cache Whether to send client-side caching headers.
 * @param int $cache_duration Duration for client-side cache in seconds (default 30 days).
 */
function serve_file_from_path(string $file_path, string $content_type = 'application/octet-stream', bool $enable_client_cache = true, int $cache_duration = 2592000)
{
    if (!file_exists($file_path) || !is_readable($file_path)) {
        // This function assumes the file exists and is readable; calling code should check.
        // However, as a safeguard:
        error_log("[Serve File] Attempted to serve non-existent or unreadable file: {$file_path}");
        // Cannot use json_error as headers might be partially sent or it's not a JSON context.
        http_response_code(404);
        echo "File not found or not readable.";
        exit;
    }

    if (ob_get_level() > 0) {
        ob_end_clean(); // Clean any existing output buffer
    }

    header('Content-Type: ' . $content_type);
    header('Content-Length: ' . filesize($file_path));

    if ($enable_client_cache) {
        header('Cache-Control: public, max-age=' . $cache_duration);
        header('Expires: ' . gmdate('D, d M Y H:i:s', time() + $cache_duration) . ' GMT');
    } else {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
    }
    
    // Release session lock before sending file, if session was active
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    readfile($file_path);
    exit;
}

/**
 * Recursively delete a directory and all its contents.
 *
 * @param string $directory_path The absolute path to the directory to delete.
 * @return bool True if the directory was successfully deleted, false otherwise.
 */
function deleteDirectory(string $directory_path): bool
{
    if (!is_dir($directory_path)) {
        return false;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory_path, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );

    try {
        foreach ($iterator as $file) {
            if ($file->isDir()) {
                if (!rmdir($file->getRealPath())) {
                    error_log("[deleteDirectory] Failed to remove directory: " . $file->getRealPath());
                    return false;
                }
            } else {
                if (!unlink($file->getRealPath())) {
                    error_log("[deleteDirectory] Failed to remove file: " . $file->getRealPath());
                    return false;
                }
            }
        }
        
        // Remove the root directory itself
        return rmdir($directory_path);
    } catch (Exception $e) {
        error_log("[deleteDirectory] Error deleting directory {$directory_path}: " . $e->getMessage());
        return false;
    }
}

/**
 * Recursively count files in a directory and all subdirectories.
 * Only counts files with allowed extensions.
 *
 * @param string $directory_path The absolute path to the directory to count files in.
 * @return int The total number of files found.
 */
function count_files_recursive(string $directory_path): int
{
    if (!is_dir($directory_path) || !is_readable($directory_path)) {
        return 0;
    }

    $count = 0;
    
    try {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($directory_path, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $extension = strtolower($file->getExtension());
                // Count only files with allowed extensions (images and videos)
                if (in_array($extension, ALLOWED_EXTENSIONS) || 
                    in_array($extension, ['mp4', 'mov', 'avi', 'mkv', 'webm'])) {
                    $count++;
                }
            }
        }
    } catch (Exception $e) {
        error_log("[count_files_recursive] Error counting files in {$directory_path}: " . $e->getMessage());
        return 0;
    }

    return $count;
}

/**
 * Get cached file count for a directory, with fallback to real-time counting
 * 
 * @param string $source_key Source key (e.g., 'main', 'extra_drive')
 * @param string $directory_path Relative path within source
 * @param bool $force_refresh Force refresh cache
 * @return int File count
 */
function get_directory_file_count($source_key, $directory_path, $force_refresh = false) {
    global $pdo;
    
    try {
        // Normalize directory path
        $directory_path = trim($directory_path, '/');
        
        // Check cache first (unless force refresh)
        if (!$force_refresh) {
            $stmt = $pdo->prepare("
                SELECT file_count, last_scanned_at, is_scanning 
                FROM directory_file_counts 
                WHERE source_key = ? AND directory_path = ?
            ");
            $stmt->execute([$source_key, $directory_path]);
            $cached = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($cached) {
                $cache_age_hours = (time() - strtotime($cached['last_scanned_at'])) / 3600;
                
                // Return cached count if:
                // 1. Cache is less than 24 hours old, OR
                // 2. Currently scanning (avoid duplicate scans)
                if ($cache_age_hours < 24 || $cached['is_scanning']) {
                    return (int)$cached['file_count'];
                }
            }
        }
        
        // Get absolute path for counting
        $absolute_path = get_absolute_path_for_source($source_key, $directory_path);
        if (!$absolute_path || !is_dir($absolute_path)) {
            return 0;
        }
        
        // Mark as scanning to prevent duplicate scans
        $stmt = $pdo->prepare("
            INSERT INTO directory_file_counts (source_key, directory_path, is_scanning) 
            VALUES (?, ?, 1)
            ON DUPLICATE KEY UPDATE is_scanning = 1, updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$source_key, $directory_path]);
        
        // Count files with timing
        $start_time = microtime(true);
        $file_count = count_files_recursive($absolute_path);
        $scan_duration_ms = round((microtime(true) - $start_time) * 1000);
        
        // Update cache with results
        $stmt = $pdo->prepare("
            INSERT INTO directory_file_counts 
            (source_key, directory_path, file_count, scan_duration_ms, is_scanning, last_scanned_at) 
            VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE 
            file_count = VALUES(file_count),
            scan_duration_ms = VALUES(scan_duration_ms),
            is_scanning = 0,
            last_scanned_at = CURRENT_TIMESTAMP,
            scan_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([$source_key, $directory_path, $file_count, $scan_duration_ms]);
        
        error_log("[FileCount] Scanned {$source_key}/{$directory_path}: {$file_count} files in {$scan_duration_ms}ms");
        return $file_count;
        
    } catch (Exception $e) {
        error_log("[FileCount] Error counting files for {$source_key}/{$directory_path}: " . $e->getMessage());
        
        // Mark scan as failed
        try {
            $stmt = $pdo->prepare("
                UPDATE directory_file_counts 
                SET is_scanning = 0, scan_error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE source_key = ? AND directory_path = ?
            ");
            $stmt->execute([$e->getMessage(), $source_key, $directory_path]);
        } catch (Exception $update_error) {
            error_log("[FileCount] Failed to update error status: " . $update_error->getMessage());
        }
        
        return 0;
    }
}

/**
 * Get absolute path for a source and relative path
 */
function get_absolute_path_for_source($source_key, $relative_path) {
    if (!isset(IMAGE_SOURCES[$source_key])) {
        return null;
    }
    
    $source_config = IMAGE_SOURCES[$source_key];
    $source_base_path = $source_config['path'];
    
    if (empty($relative_path) || $relative_path === '/') {
        return realpath($source_base_path);
    }
    
    $full_path = $source_base_path . DIRECTORY_SEPARATOR . ltrim($relative_path, '/\\');
    return realpath($full_path);
}

/**
 * Batch update file counts for multiple directories (background processing)
 * 
 * @param array $directories Array of ['source_key' => string, 'directory_path' => string]
 * @param int $max_scan_time_seconds Maximum time to spend scanning
 * @return array Results with counts and timing
 */
function batch_update_file_counts($directories, $max_scan_time_seconds = 30) {
    global $pdo;
    
    $start_time = time();
    $results = [];
    $processed = 0;
    
    foreach ($directories as $dir) {
        // Check time limit
        if (time() - $start_time >= $max_scan_time_seconds) {
            error_log("[BatchFileCount] Time limit reached after {$processed} directories");
            break;
        }
        
        $source_key = $dir['source_key'];
        $directory_path = $dir['directory_path'];
        
        try {
            $file_count = get_directory_file_count($source_key, $directory_path, true);
            $results[] = [
                'source_key' => $source_key,
                'directory_path' => $directory_path,
                'file_count' => $file_count,
                'status' => 'success'
            ];
            $processed++;
            
        } catch (Exception $e) {
            $results[] = [
                'source_key' => $source_key,
                'directory_path' => $directory_path,
                'file_count' => 0,
                'status' => 'error',
                'error' => $e->getMessage()
            ];
        }
    }
    
    error_log("[BatchFileCount] Processed {$processed} directories in " . (time() - $start_time) . " seconds");
    return $results;
}

/**
 * Get file count statistics for admin dashboard
 */
function get_file_count_statistics() {
    global $pdo;
    
    try {
        $stmt = $pdo->query("
            SELECT 
                COUNT(*) as total_directories,
                SUM(file_count) as total_files,
                AVG(file_count) as avg_files_per_dir,
                MAX(file_count) as max_files_in_dir,
                AVG(scan_duration_ms) as avg_scan_time_ms,
                COUNT(CASE WHEN is_scanning = 1 THEN 1 END) as currently_scanning,
                COUNT(CASE WHEN scan_error IS NOT NULL THEN 1 END) as scan_errors,
                COUNT(CASE WHEN last_scanned_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as scanned_today
            FROM directory_file_counts
        ");
        
        return $stmt->fetch(PDO::FETCH_ASSOC);
        
    } catch (Exception $e) {
        error_log("[FileCountStats] Error getting statistics: " . $e->getMessage());
        return null;
    }
}

/**
 * Clean up old file count cache entries
 * 
 * @param int $days_old Remove entries older than this many days
 * @return int Number of entries removed
 */
function cleanup_file_count_cache($days_old = 30) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("
            DELETE FROM directory_file_counts 
            WHERE last_scanned_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            AND is_scanning = 0
        ");
        $stmt->execute([$days_old]);
        
        $deleted = $stmt->rowCount();
        error_log("[FileCountCleanup] Removed {$deleted} old cache entries (older than {$days_old} days)");
        return $deleted;
        
    } catch (Exception $e) {
        error_log("[FileCountCleanup] Error cleaning up cache: " . $e->getMessage());
        return 0;
    }
}

function clear_all_pending_jet_cache_jobs() {
    global $pdo;
    if (!$pdo) {
        error_log("PDO connection not available in clear_all_pending_jet_cache_jobs");
        return false;
    }
    
    try {
        $stmt = $pdo->prepare("DELETE FROM jet_cache_jobs WHERE status = 'pending'");
        $stmt->execute();
        $deleted_count = $stmt->rowCount();
        error_log("Cleared {$deleted_count} pending jet cache jobs");
        return $deleted_count;
    } catch (PDOException $e) {
        error_log("Error clearing pending jet cache jobs: " . $e->getMessage());
        return false;
    }
}

// --- NEW HELPER FUNCTIONS FOR CATEGORY AND FEATURED IMAGES ---

/**
 * Get category for a given path by checking parent folders
 */
function getCategoryForPath($source_key, $folder_path) {
    global $pdo;
    
    if (!$pdo) {
        error_log("PDO connection not available in getCategoryForPath");
        return null;
    }
    
    // Split path into parts
    $path_parts = explode('/', trim($folder_path, '/'));
    
    // Check from current path up to root
    while (!empty($path_parts)) {
        $current_path = implode('/', $path_parts);
        
        try {
            $stmt = $pdo->prepare("
                SELECT fc.id, fc.category_name, fc.category_slug, fc.color_code, fc.icon_class
                FROM folder_category_mapping fcm
                JOIN folder_categories fc ON fcm.category_id = fc.id
                WHERE fcm.source_key = ? AND fcm.folder_path = ?
                LIMIT 1
            ");
            $stmt->execute([$source_key, $current_path]);
            
            $category = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($category) {
                return $category;
            }
        } catch (PDOException $e) {
            error_log("Error in getCategoryForPath: " . $e->getMessage());
        }
        
        // Go up one level
        array_pop($path_parts);
    }
    
    return null; // No category found
}

/**
 * Get featured status for an image
 */
function getFeaturedStatus($source_key, $image_path) {
    global $pdo;
    
    if (!$pdo) {
        return null;
    }
    
    try {
        $stmt = $pdo->prepare("
            SELECT featured_type, priority_order, alt_text, description
            FROM featured_images 
            WHERE source_key = ? AND image_relative_path = ?
        ");
        $stmt->execute([$source_key, $image_path]);
        
        return $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        error_log("Error in getFeaturedStatus: " . $e->getMessage());
        return null;
    }
}

/**
 * ========== DIRECTORY INDEXING SYSTEM FOR PERFORMANCE ==========
 * These functions provide a complete directory caching system to dramatically
 * improve search and browse performance with large numbers of directories.
 */

/**
 * Get or build directory index from cache for fast search operations
 * This replaces the slow filesystem scanning in list_files root request
 * 
 * @param string|null $search_term Optional search filter
 * @param int $page Page number for pagination
 * @param int $items_per_page Items per page
 * @return array Paginated directory results with metadata
 */
function get_directory_index($search_term = null, $page = 1, $items_per_page = 100) {
    global $pdo;
    
    try {
        // Build the base query
        $sql = "
            SELECT 
                di.source_key,
                di.directory_name,
                di.directory_path,
                di.relative_path,
                di.first_image_path,
                di.file_count,
                di.last_modified,
                di.is_protected,
                di.has_thumbnail,
                di.created_at as indexed_at
            FROM directory_index di
            WHERE di.is_active = 1
        ";
        
        $params = [];
        
        // Apply search filter if provided
        if ($search_term !== null && trim($search_term) !== '') {
            $sql .= " AND di.directory_name LIKE ?";
            $params[] = '%' . trim($search_term) . '%';
        }
        
        // Order by last modified (newest first), then by name
        $sql .= " ORDER BY di.last_modified DESC, di.directory_name ASC";
        
        // Get total count for pagination
        $countSql = str_replace(
            "SELECT di.source_key, di.directory_name, di.directory_path, di.relative_path, di.first_image_path, di.file_count, di.last_modified, di.is_protected, di.has_thumbnail, di.created_at as indexed_at FROM directory_index di",
            "SELECT COUNT(*) FROM directory_index di",
            $sql
        );
        
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($params);
        $total_items = (int)$countStmt->fetchColumn(); // Ensure integer type
        
        // Apply pagination
        $offset = ($page - 1) * $items_per_page;
        $sql .= " LIMIT ? OFFSET ?";
        $params[] = $items_per_page;
        $params[] = $offset;
        
        // Execute main query
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $directories = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Calculate pagination info
        $total_pages = ceil($total_items / $items_per_page);
        
        error_log("[DirectoryIndex] Retrieved " . count($directories) . "/{$total_items} directories from cache (page {$page})");
        
        return [
            'directories' => $directories,
            'pagination' => [
                'current_page' => $page,
                'total_pages' => $total_pages,
                'total_items' => (int)$total_items,
                'items_per_page' => $items_per_page
            ],
            'from_cache' => true
        ];
        
    } catch (Exception $e) {
        error_log("[DirectoryIndex] Error getting directory index: " . $e->getMessage());
        
        // Fallback to filesystem scan with limited results for safety
        return [
            'directories' => [],
            'pagination' => [
                'current_page' => 1,
                'total_pages' => 0,
                'total_items' => 0,
                'items_per_page' => $items_per_page
            ],
            'from_cache' => false,
            'error' => 'Directory index unavailable'
        ];
    }
}

/**
 * Build or refresh the directory index for all sources
 * This should be run via background process/cron for best performance
 * 
 * @param string|null $specific_source_key Only scan specific source
 * @param int $max_scan_time_seconds Maximum time to spend scanning
 * @return array Scan results with statistics
 */
function build_directory_index($specific_source_key = null, $max_scan_time_seconds = 300) {
    global $pdo;
    
    $start_time = time();
    $scan_stats = [
        'sources_scanned' => 0,
        'directories_found' => 0,
        'directories_updated' => 0,
        'directories_created' => 0,
        'thumbnails_found' => 0,
        'protected_folders' => 0,
        'scan_duration' => 0,
        'memory_peak' => 0
    ];
    
    try {
        error_log("[DirectoryIndexBuilder] Starting directory index build" . 
                 ($specific_source_key ? " for source: {$specific_source_key}" : " for all sources"));
        
        // Get protected folders list once
        $protected_folders = [];
        try {
            $stmt = $pdo->query("SELECT folder_name FROM folder_passwords");
            while ($folder = $stmt->fetchColumn()) {
                $protected_folders[$folder] = true;
            }
        } catch (PDOException $e) {
            error_log("[DirectoryIndexBuilder] Error fetching protected folders: " . $e->getMessage());
        }
        
        // Mark start of batch update
        $batch_id = uniqid('batch_', true);
        
        foreach (IMAGE_SOURCES as $source_key => $source_config) {
            // Skip if scanning specific source and this isn't it
            if ($specific_source_key && $source_key !== $specific_source_key) {
                continue;
            }
            
            // Check time limit
            if (time() - $start_time >= $max_scan_time_seconds) {
                error_log("[DirectoryIndexBuilder] Time limit reached, stopping scan");
                break;
            }
            
            if (!is_array($source_config) || !isset($source_config['path'])) {
                continue;
            }
            
            $source_base_path = $source_config['path'];
            $resolved_source_base_path = realpath($source_base_path);
            
            if (!$resolved_source_base_path || !is_dir($resolved_source_base_path) || !is_readable($resolved_source_base_path)) {
                error_log("[DirectoryIndexBuilder] Skipping invalid source '{$source_key}': {$source_base_path}");
                continue;
            }
            
            $scan_stats['sources_scanned']++;
            error_log("[DirectoryIndexBuilder] Scanning source: {$source_key} at {$resolved_source_base_path}");
            
            try {
                $iterator = new DirectoryIterator($resolved_source_base_path);
                foreach ($iterator as $fileinfo) {
                    if ($fileinfo->isDot() || !$fileinfo->isDir()) {
                        continue;
                    }
                    
                    // Check time limit again during intensive scanning
                    if (time() - $start_time >= $max_scan_time_seconds) {
                        break 2; // Break out of both loops
                    }
                    
                    $dir_name = $fileinfo->getFilename();
                    $relative_path = $dir_name;
                    $source_prefixed_path = $source_key . '/' . $dir_name;
                    $absolute_path = $fileinfo->getPathname();
                    $last_modified = $fileinfo->getMTime();
                    
                    $scan_stats['directories_found']++;
                    
                    // Check if protected
                    $is_protected = isset($protected_folders[$dir_name]);
                    if ($is_protected) {
                        $scan_stats['protected_folders']++;
                    }
                    
                    // Find first image and thumbnail efficiently
                    $first_image_path = null;
                    $has_thumbnail = false;
                    
                    try {
                        // Use a limited scan for first image to avoid deep recursion
                        $first_image_path = find_first_image_fast($absolute_path, 10); // Limit to 10 files max
                        
                        if ($first_image_path) {
                            $thumbnail_source_prefixed = $source_prefixed_path . '/' . $first_image_path;
                            $thumbnail_cache_path = get_thumbnail_cache_path($thumbnail_source_prefixed, 150, false);
                            $has_thumbnail = file_exists($thumbnail_cache_path) && filesize($thumbnail_cache_path) > 0;
                            
                            if ($has_thumbnail) {
                                $scan_stats['thumbnails_found']++;
                            }
                        }
                    } catch (Exception $e) {
                        error_log("[DirectoryIndexBuilder] Error finding first image in {$source_prefixed_path}: " . $e->getMessage());
                    }
                    
                    // Get or estimate file count (use cached if available, otherwise estimate)
                    $file_count = 0;
                    try {
                        // Try to get from existing cache first
                        $stmt = $pdo->prepare("
                            SELECT file_count FROM directory_file_counts 
                            WHERE source_key = ? AND directory_path = ? 
                            AND last_scanned_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
                        ");
                        $stmt->execute([$source_key, $relative_path]);
                        $cached_count = $stmt->fetchColumn();
                        
                        if ($cached_count !== false) {
                            $file_count = (int)$cached_count;
                        } else {
                            // Quick estimate: count only immediate files, not recursive
                            $file_count = count_immediate_image_files($absolute_path);
                        }
                    } catch (Exception $e) {
                        error_log("[DirectoryIndexBuilder] Error getting file count for {$source_prefixed_path}: " . $e->getMessage());
                    }
                    
                    // Insert or update directory index
                    try {
                        $stmt = $pdo->prepare("
                            INSERT INTO directory_index 
                            (source_key, directory_name, directory_path, relative_path, first_image_path, 
                             file_count, last_modified, is_protected, has_thumbnail, batch_id, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), ?, ?, ?, CURRENT_TIMESTAMP)
                            ON DUPLICATE KEY UPDATE
                            first_image_path = VALUES(first_image_path),
                            file_count = VALUES(file_count),
                            last_modified = VALUES(last_modified),
                            is_protected = VALUES(is_protected),
                            has_thumbnail = VALUES(has_thumbnail),
                            batch_id = VALUES(batch_id),
                            updated_at = CURRENT_TIMESTAMP,
                            is_active = 1
                        ");
                        
                        $affected = $stmt->execute([
                            $source_key,
                            $dir_name,
                            $source_prefixed_path,
                            $relative_path,
                            $first_image_path,
                            $file_count,
                            $last_modified,
                            $is_protected ? 1 : 0,
                            $has_thumbnail ? 1 : 0,
                            $batch_id
                        ]);
                        
                        if ($stmt->rowCount() > 0) {
                            // Check if it was an INSERT or UPDATE
                            $check_stmt = $pdo->prepare("
                                SELECT COUNT(*) FROM directory_index 
                                WHERE source_key = ? AND relative_path = ? AND batch_id != ?
                            ");
                            $check_stmt->execute([$source_key, $relative_path, $batch_id]);
                            
                            if ($check_stmt->fetchColumn() > 0) {
                                $scan_stats['directories_updated']++;
                            } else {
                                $scan_stats['directories_created']++;
                            }
                        }
                        
                    } catch (PDOException $e) {
                        error_log("[DirectoryIndexBuilder] Error updating directory index for {$source_prefixed_path}: " . $e->getMessage());
                    }
                    
                    // Memory management
                    if ($scan_stats['directories_found'] % 100 === 0) {
                        $current_memory = memory_get_peak_usage(true);
                        $scan_stats['memory_peak'] = max($scan_stats['memory_peak'], $current_memory);
                        error_log("[DirectoryIndexBuilder] Progress: {$scan_stats['directories_found']} dirs, Memory: " . 
                                 round($current_memory / 1024 / 1024, 2) . "MB");
                    }
                }
                
            } catch (Exception $e) {
                error_log("[DirectoryIndexBuilder] Error scanning source '{$source_key}': " . $e->getMessage());
            }
        }
        
        // Mark old entries as inactive (not in this batch)
        try {
            $stmt = $pdo->prepare("
                UPDATE directory_index 
                SET is_active = 0 
                WHERE batch_id != ? AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ");
            $stmt->execute([$batch_id]);
            $deactivated = $stmt->rowCount();
            error_log("[DirectoryIndexBuilder] Marked {$deactivated} old entries as inactive");
        } catch (PDOException $e) {
            error_log("[DirectoryIndexBuilder] Error marking old entries inactive: " . $e->getMessage());
        }
        
        $scan_stats['scan_duration'] = time() - $start_time;
        $scan_stats['memory_peak'] = memory_get_peak_usage(true);
        
        error_log("[DirectoryIndexBuilder] Completed: " . json_encode($scan_stats));
        
        return $scan_stats;
        
    } catch (Exception $e) {
        error_log("[DirectoryIndexBuilder] Fatal error: " . $e->getMessage());
        $scan_stats['error'] = $e->getMessage();
        $scan_stats['scan_duration'] = time() - $start_time;
        return $scan_stats;
    }
}

/**
 * Fast first image finder with limited recursion to avoid performance issues
 * 
 * @param string $directory_path Absolute directory path
 * @param int $max_files Maximum files to check before giving up
 * @return string|null Relative path to first image found
 */
function find_first_image_fast($directory_path, $max_files = 10) {
    if (!is_dir($directory_path) || !is_readable($directory_path)) {
        return null;
    }
    
    $files_checked = 0;
    $allowed_extensions = ALLOWED_EXTENSIONS;
    
    try {
        // First try immediate directory
        $iterator = new DirectoryIterator($directory_path);
        foreach ($iterator as $fileinfo) {
            if ($fileinfo->isDot() || !$fileinfo->isFile()) {
                continue;
            }
            
            $extension = strtolower($fileinfo->getExtension());
            if (in_array($extension, $allowed_extensions, true)) {
                return $fileinfo->getFilename();
            }
            
            $files_checked++;
            if ($files_checked >= $max_files) {
                break;
            }
        }
        
        // If no immediate images found, try first level subdirectories
        if ($files_checked < $max_files) {
            $iterator->rewind();
            foreach ($iterator as $fileinfo) {
                if ($fileinfo->isDot() || !$fileinfo->isDir()) {
                    continue;
                }
                
                $subdir_path = $fileinfo->getPathname();
                try {
                    $subdir_iterator = new DirectoryIterator($subdir_path);
                    foreach ($subdir_iterator as $subfile) {
                        if ($subfile->isDot() || !$subfile->isFile()) {
                            continue;
                        }
                        
                        $extension = strtolower($subfile->getExtension());
                        if (in_array($extension, $allowed_extensions, true)) {
                            return $fileinfo->getFilename() . '/' . $subfile->getFilename();
                        }
                        
                        $files_checked++;
                        if ($files_checked >= $max_files) {
                            break 2;
                        }
                    }
                } catch (Exception $e) {
                    // Skip problematic subdirectories
                    continue;
                }
            }
        }
        
    } catch (Exception $e) {
        error_log("[FindFirstImageFast] Error scanning {$directory_path}: " . $e->getMessage());
        return null;
    }
    
    return null;
}

/**
 * Count immediate image files in directory (non-recursive for speed)
 * 
 * @param string $directory_path Absolute directory path
 * @return int Number of image files found
 */
function count_immediate_image_files($directory_path) {
    if (!is_dir($directory_path) || !is_readable($directory_path)) {
        return 0;
    }
    
    $count = 0;
    $allowed_extensions = array_merge(ALLOWED_EXTENSIONS, ['mp4', 'mov', 'avi', 'mkv', 'webm']);
    
    try {
        $iterator = new DirectoryIterator($directory_path);
        foreach ($iterator as $fileinfo) {
            if ($fileinfo->isDot() || !$fileinfo->isFile()) {
                continue;
            }
            
            $extension = strtolower($fileinfo->getExtension());
            if (in_array($extension, $allowed_extensions, true)) {
                $count++;
            }
        }
    } catch (Exception $e) {
        error_log("[CountImmediateFiles] Error counting files in {$directory_path}: " . $e->getMessage());
        return 0;
    }
    
    return $count;
}

/**
 * Get directory index statistics for monitoring
 * 
 * @return array Statistics about the directory index
 */
function get_directory_index_stats() {
    global $pdo;
    
    try {
        $stmt = $pdo->query("
            SELECT 
                COUNT(*) as total_directories,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_directories,
                COUNT(CASE WHEN has_thumbnail = 1 THEN 1 END) as with_thumbnails,
                COUNT(CASE WHEN is_protected = 1 THEN 1 END) as protected_directories,
                COUNT(DISTINCT source_key) as sources_indexed,
                SUM(file_count) as total_files_estimated,
                AVG(file_count) as avg_files_per_directory,
                MAX(updated_at) as last_update_time,
                MIN(updated_at) as first_index_time
            FROM directory_index
        ");
        
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        // Get index health score
        $health_score = 100;
        if ($stats['total_directories'] > 0) {
            $active_ratio = $stats['active_directories'] / $stats['total_directories'];
            $thumbnail_ratio = $stats['with_thumbnails'] / $stats['active_directories'];
            
            $health_score = round(($active_ratio * 0.7 + $thumbnail_ratio * 0.3) * 100);
        }
        
        $stats['health_score'] = $health_score;
        $stats['needs_rebuild'] = $health_score < 80;
        
        return $stats;
        
    } catch (Exception $e) {
        error_log("[DirectoryIndexStats] Error: " . $e->getMessage());
        return [
            'error' => $e->getMessage(),
            'total_directories' => 0,
            'health_score' => 0,
            'needs_rebuild' => true
        ];
    }
}

// Ensure this is at the very end of the file or before a closing PHP tag if any.
// If there are other functions after this, make sure there's no accidental output. 