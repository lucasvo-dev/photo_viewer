<?php
// --- Database Connection Configuration ---

// Load central configuration
$config = require_once __DIR__ . '/config.php';

if (!$config) {
    error_log("CRITICAL CONFIG ERROR: Failed to load config.php");
    die("Server Configuration Error: Could not load configuration file.");
}

// Use settings from config
$db_type = $config['type'] ?? 'mysql'; // Use type from config, fallback to MySQL if not specified
$db_host = $config['host'] ?? 'localhost';
$db_name = $config['name'] ?? 'photo_gallery';
$db_user = $config['user'] ?? 'root';
$db_pass = $config['pass'] ?? '';

// For MySQL, use host, name, user, and pass from config
$db_dsn = "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4";

// --- Image Source Configuration (Get from config) ---
// Validate IMAGE_SOURCES paths from config
$valid_image_sources = [];
if (isset($config['image_sources']) && is_array($config['image_sources'])) {
    foreach ($config['image_sources'] as $key => $source_config) {
        if (isset($source_config['path'])) {
            // Resolve path relative to config file location if needed, or use absolute path
            $resolved_path = realpath($source_config['path']); 
            if ($resolved_path && is_dir($resolved_path) && is_readable($resolved_path)) {
                // Use the resolved path for the source configuration
                $valid_image_sources[$key] = [
                    'path' => $resolved_path,
                    'name' => $source_config['name'] ?? $key // Use name from config or key as fallback
                ];
            } else {
                error_log("CONFIG WARNING: Image source '{$key}' path '{$source_config['path']}' is invalid or not readable. Skipping.");
            }
        } else {
             error_log("CONFIG WARNING: Image source '{$key}' is missing 'path'. Skipping.");
        }
    }
} else {
     error_log("CRITICAL CONFIG ERROR: 'image_sources' is not defined or not an array in config.php");
     // Potentially die here if sources are absolutely required
     // die("Server Configuration Error: Image sources configuration missing or invalid.");
}

// Define the constant with VALIDATED sources only
define('IMAGE_SOURCES', $valid_image_sources);

// --- Cache and Thumbnail Configuration (Get from config) ---
$allowed_extensions = $config['allowed_extensions'] ?? ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
$thumbnail_sizes = $config['thumbnail_sizes'] ?? [150, 750];

// Define constants for use in API etc.
define('ALLOWED_EXTENSIONS', $allowed_extensions);
define('THUMBNAIL_SIZES', $thumbnail_sizes);

try {
    // Resolve path relative to config file location
    $cache_thumb_root_path = $config['cache_thumb_root'] ?? (__DIR__ . '/cache/thumbnails');
    $resolved_cache_path = realpath($cache_thumb_root_path);

    if (!$resolved_cache_path) {
        // Attempt to create cache directories if realpath failed
        $cacheBase = dirname($cache_thumb_root_path);
        $thumbDir = $cache_thumb_root_path;
        error_log("Attempting to create cache directories: Base='{$cacheBase}', Thumb='{$thumbDir}'");
        if (!is_dir($cacheBase)) @mkdir($cacheBase, 0775, true);
        if (!is_dir($thumbDir)) @mkdir($thumbDir, 0775, true);
        clearstatcache(); // Clear cache after creating directory
        $resolved_cache_path = realpath($thumbDir);
    }

    if (!$resolved_cache_path || !is_dir($resolved_cache_path) || !is_writable($resolved_cache_path)) {
        throw new Exception("Failed to resolve, create, or write to CACHE_THUMB_ROOT path: '" . htmlspecialchars($cache_thumb_root_path) . "'. Check permissions and path in config.php. Resolved to: " . ($resolved_cache_path ?: 'false'));
    }
    define('CACHE_THUMB_ROOT', $resolved_cache_path);

    // Pre-create size directories if they don't exist
    foreach ($thumbnail_sizes as $size) {
        $size_dir = CACHE_THUMB_ROOT . DIRECTORY_SEPARATOR . $size;
        if (!is_dir($size_dir)) {
            if (!@mkdir($size_dir, 0775, true)) { // Added recursive flag
                error_log("Warning: Failed to automatically create thumbnail size directory: {$size_dir}");
            }
        }
    }

} catch (Throwable $e) {
    $error_msg = "CRITICAL CONFIG ERROR: Failed to configure cache paths - " . $e->getMessage();
    error_log($error_msg);
    if (!headers_sent()) {
        header('Content-Type: text/plain; charset=utf-8', true, 500);
    }
    die("Server Configuration Error: Cache path setup failed. Please check server logs and permissions.");
}

// --- PDO Connection Options ---
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // Throw exceptions on error
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,       // Fetch associative arrays by default
    PDO::ATTR_EMULATE_PREPARES   => false,                  // Use native prepared statements
    PDO::ATTR_TIMEOUT => 20 // Increased timeout to 20 seconds (was 15)
];

// --- Establish Connection ---
$dsn = '';
$pdo = null;

try {
    if ($db_type === 'mysql') {
        $dsn = $db_dsn;
        $pdo = new PDO($dsn, $db_user, $db_pass, $options);
    } else {
        throw new Exception("Unsupported database type configured: {$db_type}");
    }

    // Connection successful (optional: log success)
    // error_log("Database connection successful ({$db_type}).");

} catch (PDOException $e) {
    // Log the detailed error but show a generic message to the user/API.
    error_log("Database Connection Error: " . $e->getMessage() . " (DSN: {$dsn})"); // Log DSN
    if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {
         http_response_code(500);
         die("Database connection error. Please check server logs.");
    }
    // If included, let the including script handle the error (e.g., api.php will send JSON error)
    // We might set a global flag or re-throw exception if needed by caller.

} catch (Exception $e) {
    error_log("Configuration Error: " . $e->getMessage());
     if (basename($_SERVER['PHP_SELF']) == basename(__FILE__)) {
         http_response_code(500);
         die("Database configuration error.");
     }
}

// $pdo variable is now available for use in including scripts (like api.php)

// Ensure folder_stats table exists
try {
    if ($pdo) { // Only proceed if connection was successful
        // Create folder_stats table
        $pdo->exec("CREATE TABLE IF NOT EXISTS folder_stats (
            folder_name VARCHAR(255) PRIMARY KEY,
            folder_path TEXT NOT NULL,
            views INT DEFAULT 0,
            downloads INT DEFAULT 0,
            last_cached_fully_at BIGINT NULL,
            KEY idx_folder_stats_folder_path (folder_path(255))
        )");

        // Create folder_passwords table
        $pdo->exec("CREATE TABLE IF NOT EXISTS folder_passwords (
            folder_name VARCHAR(255) PRIMARY KEY,
            folder_path TEXT NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            KEY idx_folder_passwords_folder_path (folder_path(255))
        )");

        // Create cache_jobs table
        $pdo->exec("CREATE TABLE IF NOT EXISTS cache_jobs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            folder_path TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            created_at BIGINT NOT NULL,
            processed_at BIGINT DEFAULT NULL,
            completed_at BIGINT DEFAULT NULL,
            result_message TEXT DEFAULT NULL,
            image_count INT DEFAULT NULL,
            total_files INT DEFAULT 0,
            processed_files INT DEFAULT 0,
            current_file_processing TEXT DEFAULT NULL,
            KEY idx_cache_jobs_status (status),
            KEY idx_cache_jobs_folder_path (folder_path(255))
        )");

        // Create zip_jobs table
        $pdo->exec("CREATE TABLE IF NOT EXISTS zip_jobs (
            id INT PRIMARY KEY AUTO_INCREMENT,
            source_path TEXT NOT NULL,
            job_token VARCHAR(255) NOT NULL UNIQUE,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            total_files INT DEFAULT 0,
            processed_files INT DEFAULT 0,
            current_file_processing TEXT DEFAULT NULL,
            zip_filename VARCHAR(255) DEFAULT NULL,
            zip_filesize BIGINT DEFAULT 0,
            error_message TEXT DEFAULT NULL,
            result_message TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            finished_at DATETIME DEFAULT NULL,
            KEY idx_zip_jobs_status (status),
            KEY idx_zip_jobs_job_token (job_token),
            KEY idx_zip_jobs_source_path (source_path(255))
        )");

    }
} catch (PDOException $e) {
    error_log("Failed to create or check database tables (folder_stats, folder_passwords): " . $e->getMessage());
    // Depending on requirements, you might want to throw this error
    // or handle it gracefully, allowing the script to continue without stats table.
}

?>