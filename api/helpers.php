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

    } catch (PDOException $e) {
        error_log("[Cache Job Queue] DB Error checking existing jobs for '{$image_source_prefixed_path}' size {$size} type '{$type}': " . $e->getMessage());
        return false; // DB error
    }

    // If no existing/recent relevant job, add a new one
    try {
        // Use 'folder_path' instead of 'source_path'
        $sql = "INSERT INTO cache_jobs (folder_path, size, type, status, created_at) VALUES (?, ?, ?, 'pending', NOW())";
        $stmt = $pdo->prepare($sql);
        $success = $stmt->execute([$image_source_prefixed_path, $size, $type]);
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

// Ensure this is at the very end of the file or before a closing PHP tag if any.
// If there are other functions after this, make sure there's no accidental output. 