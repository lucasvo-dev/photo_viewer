<?php
// Script chạy bằng Cron Job để dọn dẹp cache thumbnail mồ côi

// --- Basic Setup ---
ini_set('display_errors', 1); // Hiển thị lỗi khi chạy từ CLI
ini_set('log_errors', 1); // Vẫn ghi log lỗi
ini_set('error_log', __DIR__ . '/logs/cron-error.log'); // Log lỗi riêng cho cron
error_reporting(E_ALL);
set_time_limit(0); // Cho phép script chạy không giới hạn thời gian (quan trọng cho cron)
ignore_user_abort(true); // Tiếp tục chạy ngay cả khi kết nối bị ngắt

echo "Cron Thumbnail Cleanup started at: " . date('Y-m-d H:i:s') . "\n";

// --- Constants and Config ---
try {
    // Include the database connection and config file
    require_once __DIR__ . '/db_connect.php';

    // IMAGE_SOURCES is now defined in db_connect.php
    if (!defined('IMAGE_SOURCES') || !is_array(IMAGE_SOURCES)) {
         throw new Exception("IMAGE_SOURCES is not defined or not an array in db_connect.php.");
    }
    if (empty(IMAGE_SOURCES)) {
         throw new Exception("IMAGE_SOURCES is empty in db_connect.php. No image sources to process.");
    }

    // Validate CACHE_THUMB_ROOT existence (already defined in db_connect.php)
    if (!defined('CACHE_THUMB_ROOT') || !CACHE_THUMB_ROOT || !is_dir(CACHE_THUMB_ROOT) || !is_writable(CACHE_THUMB_ROOT)) {
         throw new Exception("CACHE_THUMB_ROOT ('" . (defined('CACHE_THUMB_ROOT') ? CACHE_THUMB_ROOT : 'N/A') . "') is not defined, not a directory, or not writable. Check config and permissions.");
    }

    // Validate JET_PREVIEW_CACHE_ROOT existence for RAW cache cleanup
    if (!defined('JET_PREVIEW_CACHE_ROOT') || !JET_PREVIEW_CACHE_ROOT || !is_dir(JET_PREVIEW_CACHE_ROOT) || !is_writable(JET_PREVIEW_CACHE_ROOT)) {
         echo "[Warning] JET_PREVIEW_CACHE_ROOT not properly configured - RAW cache cleanup will be skipped.\n";
         $jet_cache_available = false;
    } else {
         $jet_cache_available = true;
    }

} catch (Throwable $e) {
    $errorMsg = "CRON FATAL ERROR: Failed setup - " . $e->getMessage();
    error_log($errorMsg);
    echo $errorMsg . "\nCheck logs.\n";
    exit(1); // Exit with error code
}
// Use allowed extensions from db_connect.php
if (!defined('ALLOWED_EXTENSIONS') || !is_array(ALLOWED_EXTENSIONS)) {
    error_log("CRON WARNING: ALLOWED_EXTENSIONS not defined in db_connect.php, using default list.");
    $allowed_ext_local = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']; // Local fallback
} else {
    $allowed_ext_local = ALLOWED_EXTENSIONS;
}
// Use thumbnail sizes from db_connect.php
if (!defined('THUMBNAIL_SIZES') || !is_array(THUMBNAIL_SIZES)) {
     error_log("CRON WARNING: THUMBNAIL_SIZES not defined in db_connect.php, using default list.");
     define('THUMBNAIL_SIZES_LOCAL', [150, 750]); // Local fallback
} else {
     define('THUMBNAIL_SIZES_LOCAL', THUMBNAIL_SIZES);
}


// --- Helper Functions ---

/**
 * Find all valid original image files recursively across all defined IMAGE_SOURCES
 * and return their source-prefixed relative paths.
 *
 * @return array List of source-prefixed relative paths of valid image files (e.g., 'main/album/pic.jpg', 'extra/photo.png'). Uses '/'.
 */
function findAllValidSourcePrefixedRelativePaths(): array {
    global $allowed_ext_local; // Use the locally scoped allowed extensions
    $validImagePaths = [];

    foreach (IMAGE_SOURCES as $sourceKey => $sourceConfig) {
        $sourceBasePath = $sourceConfig['path'];
        echo "[Info] Scanning source '{$sourceKey}' at path: {$sourceBasePath}\n";

        if (!is_dir($sourceBasePath) || !is_readable($sourceBasePath)) {
            error_log("[Cron Cleanup] Source path for key '{$sourceKey}' is not a directory or not readable: {$sourceBasePath}");
            echo "[Warning] Skipping source '{$sourceKey}' - path not found or not readable.\n";
            continue;
        }

        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($sourceBasePath, RecursiveDirectoryIterator::SKIP_DOTS | RecursiveDirectoryIterator::FOLLOW_SYMLINKS), // Follow symlinks within source
                RecursiveIteratorIterator::LEAVES_ONLY
            );

            foreach ($iterator as $fileinfo) {
                 // Basic check to prevent processing files outside the defined source path (security paranoia)
                $realPath = $fileinfo->getRealPath();
                if (!$realPath || strpos($realPath, $sourceBasePath) !== 0) {
                    error_log("[Cron Cleanup] Warning: File path '{$fileinfo->getPathname()}' seems to be outside its source root '{$sourceBasePath}'. Skipping.");
                    continue;
                }

                if ($fileinfo->isFile() && $fileinfo->isReadable()) {
                    $extension = strtolower($fileinfo->getExtension());
                    if (in_array($extension, $allowed_ext_local, true)) {
                        $relativePath = substr($realPath, strlen($sourceBasePath));
                        $relativePath = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $relativePath), '/');
                        $sourcePrefixedPath = $sourceKey . '/' . $relativePath; // Add the source key prefix
                        $validImagePaths[] = $sourcePrefixedPath;
                    }
                }
            }
        } catch (Exception $e) {
            error_log("[Cron Cleanup] Error scanning source '{$sourceKey}' path {$sourceBasePath}: " . $e->getMessage());
            echo "[Error] Error scanning source '{$sourceKey}'. Check logs.\n";
        }
        echo "[Info] Finished scanning source '{$sourceKey}'. Found " . count($validImagePaths) . " valid images so far.\n";
    }
    return $validImagePaths;
}

/**
 * Find all valid RAW files recursively across all defined RAW_IMAGE_SOURCES
 * and return their source-prefixed relative paths.
 *
 * @return array List of source-prefixed relative paths of valid RAW files (e.g., 'my_raw_drive_g/folder/image.nef'). Uses '/'.
 */
function findAllValidRawSourcePrefixedPaths(): array {
    $validRawPaths = [];

    // Check if RAW_IMAGE_SOURCES is defined
    if (!defined('RAW_IMAGE_SOURCES') || !is_array(RAW_IMAGE_SOURCES)) {
        echo "[Info] RAW_IMAGE_SOURCES not defined - no RAW files to scan.\n";
        return $validRawPaths;
    }

    if (empty(RAW_IMAGE_SOURCES)) {
        echo "[Info] RAW_IMAGE_SOURCES is empty - no RAW sources to scan.\n";
        return $validRawPaths;
    }

    // Get RAW extensions
    $raw_extensions = defined('RAW_IMAGE_EXTENSIONS') ? RAW_IMAGE_EXTENSIONS : ['arw', 'nef', 'cr2', 'cr3', 'raf', 'dng', 'orf', 'pef', 'rw2'];

    foreach (RAW_IMAGE_SOURCES as $sourceKey => $sourceConfig) {
        $sourceBasePath = $sourceConfig['path'];
        echo "[Info] Scanning RAW source '{$sourceKey}' at path: {$sourceBasePath}\n";

        if (!is_dir($sourceBasePath) || !is_readable($sourceBasePath)) {
            error_log("[Cron Cleanup] RAW source path for key '{$sourceKey}' is not a directory or not readable: {$sourceBasePath}");
            echo "[Warning] Skipping RAW source '{$sourceKey}' - path not found or not readable.\n";
            continue;
        }

        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($sourceBasePath, RecursiveDirectoryIterator::SKIP_DOTS | RecursiveDirectoryIterator::FOLLOW_SYMLINKS),
                RecursiveIteratorIterator::LEAVES_ONLY
            );

            foreach ($iterator as $fileinfo) {
                $realPath = $fileinfo->getRealPath();
                if (!$realPath || strpos($realPath, $sourceBasePath) !== 0) {
                    error_log("[Cron Cleanup] Warning: RAW file path '{$fileinfo->getPathname()}' seems to be outside its source root '{$sourceBasePath}'. Skipping.");
                    continue;
                }

                if ($fileinfo->isFile() && $fileinfo->isReadable()) {
                    $extension = strtolower($fileinfo->getExtension());
                    if (in_array($extension, $raw_extensions, true)) {
                        $relativePath = substr($realPath, strlen($sourceBasePath));
                        $relativePath = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', $relativePath), '/');
                        $sourcePrefixedPath = $sourceKey . '/' . $relativePath;
                        $validRawPaths[] = $sourcePrefixedPath;
                    }
                }
            }
        } catch (Exception $e) {
            error_log("[Cron Cleanup] Error scanning RAW source '{$sourceKey}' path {$sourceBasePath}: " . $e->getMessage());
            echo "[Error] Error scanning RAW source '{$sourceKey}'. Check logs.\n";
        }
        echo "[Info] Finished scanning RAW source '{$sourceKey}'. Found " . count($validRawPaths) . " valid RAW files so far.\n";
    }
    return $validRawPaths;
}

/**
 * Dọn dẹp các file thumbnail mồ côi trong thư mục cache.
 */
function cleanupOrphanedThumbnails(): void {
    echo "Starting orphaned thumbnail cleanup...\n";
    $cacheThumbRoot = CACHE_THUMB_ROOT; // Already validated

    // Get all valid source-prefixed relative paths
    $validSourcePrefixedRelativePaths = findAllValidSourcePrefixedRelativePaths();

    // +++ SAFETY CHECK +++
    // If no valid source images were found (due to config error, unmounted drives, etc.),
    // ABORT the cleanup to prevent deleting ALL thumbnails.
    if (empty($validSourcePrefixedRelativePaths)) {
        $errorMsg = "[Cron Cleanup CRITICAL] No valid source images found. Aborting cleanup to prevent deleting all thumbnails. Check IMAGE_SOURCES configuration, paths, and permissions.";
        error_log($errorMsg);
        echo $errorMsg . "\n";
        // Optionally, you might want to exit the entire script here too:
        // exit(1); 
        // For now, just exiting the cleanup function.
        echo "Orphaned thumbnail cleanup aborted due to safety check.\n";
        return; // Exit the function
    }
    // --- END SAFETY CHECK ---

    echo "[Info] Found a total of " . count($validSourcePrefixedRelativePaths) . " valid images across all sources.\n";

    $validThumbnailAbsolutePaths = [];
    foreach ($validSourcePrefixedRelativePaths as $sourcePrefixedPath) {
        // Use the source-prefixed path for hashing to ensure uniqueness across sources
        $cacheHash = sha1($sourcePrefixedPath);
        // No, worker appends size before extension: sha1_size.jpg
        // $cacheFilename = $cacheHash . '.jpg'; // WRONG

        foreach (THUMBNAIL_SIZES_LOCAL as $size) { // Use locally defined sizes
            $sizeDir = $cacheThumbRoot . DIRECTORY_SEPARATOR . $size;
            // Construct filename EXACTLY like the worker does
            $thumbFilename = $cacheHash . '_' . $size . '.jpg'; 
            $thumbPath = $sizeDir . DIRECTORY_SEPARATOR . $thumbFilename;
            $validThumbnailAbsolutePaths[$thumbPath] = true; // Store absolute path for quick lookup
        }
    }
    echo "[Info] Expecting max " . count($validThumbnailAbsolutePaths) . " potential thumbnails based on found images and sizes.\n";

    $deletedCount = 0;
    $scannedCount = 0;
    try {
        // Cache root directory existence is already checked
        $cacheIterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($cacheThumbRoot, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($cacheIterator as $fileinfo) {
            if ($fileinfo->isFile() && $fileinfo->isReadable()) {
                $scannedCount++;
                $cachedFilePath = $fileinfo->getRealPath();
                if (!$cachedFilePath) continue; // Skip if realpath fails

                // Check if this cached file corresponds to a valid, existing original image
                if (!isset($validThumbnailAbsolutePaths[$cachedFilePath])) {
                    echo "[Cron Cleanup] Deleting orphaned thumbnail: {$cachedFilePath}\n";
                    if (@unlink($cachedFilePath)) {
                        $deletedCount++;
                    } else {
                        $errorMsg = "[Cron Cleanup] Failed to delete orphaned thumbnail: {$cachedFilePath}";
                        error_log($errorMsg);
                        echo $errorMsg . "\n";
                    }
                }
            } else if ($fileinfo->isDir()) {
                 // Optional: Clean up empty size directories? Maybe not, API might expect them.
                 // Let's skip for now to avoid unintended consequences.
            }
        }
    } catch (UnexpectedValueException $e) {
         // Specific exception for RecursiveDirectoryIterator if path disappears during iteration
         $errorMsg = "[Cron Cleanup] Error scanning thumbnail cache directory (path might have changed): " . $e->getMessage();
         error_log($errorMsg);
         echo $errorMsg . "\nCheck logs and cache directory state.\n";
    }
     catch (Exception $e) {
        $errorMsg = "[Cron Cleanup] General error scanning thumbnail cache directory: " . $e->getMessage();
        error_log($errorMsg);
        echo $errorMsg . "\nCheck logs.\n";
    }
    echo "Scanned {$scannedCount} files in cache. Deleted {$deletedCount} orphaned thumbnails.\n";

    // Optional: Clean up empty size directories after deleting files
    echo "Checking for empty thumbnail size directories...\n";
    $deletedDirs = 0;
    foreach (THUMBNAIL_SIZES_LOCAL as $size) {
        $sizeDir = $cacheThumbRoot . DIRECTORY_SEPARATOR . $size;
        if (is_dir($sizeDir) && !(new FilesystemIterator($sizeDir))->valid()) {
             echo "[Cron Cleanup] Deleting empty size directory: {$sizeDir}\n";
             if (@rmdir($sizeDir)) {
                 $deletedDirs++;
             } else {
                  error_log("[Cron Cleanup] Failed to delete empty size directory: {$sizeDir}");
                  echo "[Cron Cleanup] FAILED to delete empty size directory: {$sizeDir}\n";
             }
        }
    }
     echo "Deleted {$deletedDirs} empty size directories.\n";


    echo "Orphaned thumbnail cleanup finished.\n";
}

/**
 * Clean up orphaned RAW cache files in the JET preview cache directory.
 */
function cleanupOrphanedRawCache(): void {
    global $jet_cache_available;

    if (!$jet_cache_available) {
        echo "Skipping RAW cache cleanup - JET_PREVIEW_CACHE_ROOT not available.\n";
        return;
    }

    echo "Starting orphaned RAW cache cleanup...\n";
    $jetCacheRoot = JET_PREVIEW_CACHE_ROOT;

    // Get all valid RAW source-prefixed relative paths
    $validRawSourcePrefixedPaths = findAllValidRawSourcePrefixedPaths();

    // Safety check
    if (empty($validRawSourcePrefixedPaths)) {
        $errorMsg = "[RAW Cache Cleanup CRITICAL] No valid RAW files found. Aborting cleanup to prevent deleting all RAW cache files. Check RAW_IMAGE_SOURCES configuration, paths, and permissions.";
        error_log($errorMsg);
        echo $errorMsg . "\n";
        echo "Orphaned RAW cache cleanup aborted due to safety check.\n";
        return;
    }

    echo "[Info] Found a total of " . count($validRawSourcePrefixedPaths) . " valid RAW files across all sources.\n";

    // Get RAW cache sizes (only 750px now)
    $raw_cache_sizes = [];
    if (defined('JET_PREVIEW_SIZE')) {
        $raw_cache_sizes[] = JET_PREVIEW_SIZE;
    }
    if (empty($raw_cache_sizes)) {
        $raw_cache_sizes = [750]; // Default fallback (no more 120px)
        echo "[Warning] RAW cache sizes not defined, using default: 750\n";
    }
    
    // Clean up legacy 120px cache directory if it exists
    $legacy_120_dir = $jetCacheRoot . DIRECTORY_SEPARATOR . "120";
    if (is_dir($legacy_120_dir)) {
        echo "[Info] Found legacy 120px cache directory, cleaning up...\n";
        error_log("[RAW Cache Cleanup] Removing legacy 120px cache directory: {$legacy_120_dir}");
        
        // Remove all files in 120px directory
        $deleted_120_files = 0;
        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($legacy_120_dir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            foreach ($iterator as $file) {
                if ($file->isFile()) {
                    if (@unlink($file->getRealPath())) {
                        $deleted_120_files++;
                    }
                } elseif ($file->isDir()) {
                    @rmdir($file->getRealPath());
                }
            }
            
            // Remove the 120 directory itself
            if (@rmdir($legacy_120_dir)) {
                echo "[Info] Successfully removed legacy 120px cache directory and {$deleted_120_files} files.\n";
                error_log("[RAW Cache Cleanup] Successfully removed legacy 120px cache directory and {$deleted_120_files} files.");
            } else {
                echo "[Warning] Failed to remove legacy 120px cache directory.\n";
                error_log("[RAW Cache Cleanup] Failed to remove legacy 120px cache directory: {$legacy_120_dir}");
            }
        } catch (Exception $e) {
            echo "[Warning] Error cleaning up legacy 120px cache directory: " . $e->getMessage() . "\n";
            error_log("[RAW Cache Cleanup] Error cleaning up legacy 120px cache directory: " . $e->getMessage());
        }
    }

    $validRawCacheAbsolutePaths = [];
    foreach ($validRawSourcePrefixedPaths as $sourcePrefixedPath) {
        // Use the same hash system as the helper function
        $cacheHash = sha1($sourcePrefixedPath);

        foreach ($raw_cache_sizes as $size) {
            $sizeDir = $jetCacheRoot . DIRECTORY_SEPARATOR . $size;
            // Construct filename EXACTLY like get_jet_cache_path does: hash_size_raw.jpg
            $cacheFilename = $cacheHash . '_' . $size . '_raw.jpg';
            $cachePath = $sizeDir . DIRECTORY_SEPARATOR . $cacheFilename;
            $validRawCacheAbsolutePaths[$cachePath] = true;
        }
    }
    echo "[Info] Expecting max " . count($validRawCacheAbsolutePaths) . " potential RAW cache files based on found files and sizes.\n";

    $deletedCount = 0;
    $scannedCount = 0;
    try {
        if (!is_dir($jetCacheRoot)) {
            echo "[Info] RAW cache directory does not exist: {$jetCacheRoot}\n";
            return;
        }

        $cacheIterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($jetCacheRoot, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($cacheIterator as $fileinfo) {
            if ($fileinfo->isFile() && $fileinfo->isReadable()) {
                $scannedCount++;
                $cachedFilePath = $fileinfo->getRealPath();
                if (!$cachedFilePath) continue;

                // Only process files that match RAW cache pattern: hash_size_raw.jpg
                $filename = $fileinfo->getFilename();
                if (!preg_match('/^[a-f0-9]{40}_\d+_raw\.jpg$/', $filename)) {
                    // Not a RAW cache file, skip
                    continue;
                }

                // Check if this cached file corresponds to a valid, existing original RAW file
                if (!isset($validRawCacheAbsolutePaths[$cachedFilePath])) {
                    echo "[RAW Cache Cleanup] Deleting orphaned RAW cache: {$cachedFilePath}\n";
                    if (@unlink($cachedFilePath)) {
                        $deletedCount++;
                    } else {
                        $errorMsg = "[RAW Cache Cleanup] Failed to delete orphaned RAW cache: {$cachedFilePath}";
                        error_log($errorMsg);
                        echo $errorMsg . "\n";
                    }
                }
            }
        }
    } catch (UnexpectedValueException $e) {
        $errorMsg = "[RAW Cache Cleanup] Error scanning RAW cache directory (path might have changed): " . $e->getMessage();
        error_log($errorMsg);
        echo $errorMsg . "\nCheck logs and cache directory state.\n";
    } catch (Exception $e) {
        $errorMsg = "[RAW Cache Cleanup] General error scanning RAW cache directory: " . $e->getMessage();
        error_log($errorMsg);
        echo $errorMsg . "\nCheck logs.\n";
    }

    echo "Scanned {$scannedCount} files in RAW cache. Deleted {$deletedCount} orphaned RAW cache files.\n";

    // Clean up empty RAW cache size directories
    echo "Checking for empty RAW cache size directories...\n";
    $deletedDirs = 0;
    foreach ($raw_cache_sizes as $size) {
        $sizeDir = $jetCacheRoot . DIRECTORY_SEPARATOR . $size;
        if (is_dir($sizeDir) && !(new FilesystemIterator($sizeDir))->valid()) {
            echo "[RAW Cache Cleanup] Deleting empty RAW cache size directory: {$sizeDir}\n";
            if (@rmdir($sizeDir)) {
                $deletedDirs++;
            } else {
                error_log("[RAW Cache Cleanup] Failed to delete empty RAW cache size directory: {$sizeDir}");
                echo "[RAW Cache Cleanup] FAILED to delete empty RAW cache size directory: {$sizeDir}\n";
            }
        }
    }
    echo "Deleted {$deletedDirs} empty RAW cache size directories.\n";

    echo "Orphaned RAW cache cleanup finished.\n";
}

// --- Main Execution ---
cleanupOrphanedThumbnails();

// Run RAW cache cleanup
cleanupOrphanedRawCache();

echo "\nCron Cache Cleanup (Thumbnails + RAW) finished at: " . date('Y-m-d H:i:s') . "\n";

exit(0); // Exit successfully
?> 