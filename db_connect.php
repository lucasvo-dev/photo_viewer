<?php
// --- Database Connection Configuration ---

// Load central configuration
$config = require __DIR__ . '/config.php';

if (!$config) {
    error_log("CRITICAL CONFIG ERROR: Failed to load config.php");
    die("Server Configuration Error: Could not load configuration file.");
}

// --- Helper Functions for DB Schema Modification ---
// Moved these function definitions to the top to ensure they are available when called.

if (!function_exists('column_exists')) {
    function column_exists($pdo, $table, $column) {
        try {
            // Use DATABASE() to refer to the current database; ensure table and column names are escaped if they can contain special chars (though less likely for table/column names)
            // Quote table name for safety, column name used in LIKE can be quoted by PDO manually for `quote()` if complex.
            $stmt = $pdo->query("SHOW COLUMNS FROM `" . $table . "` LIKE " . $pdo->quote($column));
            return $stmt && $stmt->rowCount() > 0;
        } catch (PDOException $e) {
            error_log("Error checking column existence for {$table}.{$column}: " . $e->getMessage());
            return false; 
        }
    }
}

if (!function_exists('add_column_if_not_exists')) {
    function add_column_if_not_exists($pdo, $table, $column, $definition) {
        if (!column_exists($pdo, $table, $column)) {
            try {
                $pdo->exec("ALTER TABLE `" . $table . "` ADD COLUMN `" . $column . "` " . $definition);
                error_log("[DB Schema] Added column '{$column}' to table '{$table}'.");
            } catch (PDOException $e) {
                error_log("[DB Schema] FAILED to add column '{$column}' to table '{$table}': " . $e->getMessage());
            }
        } else {
            // error_log("[DB Schema] Column '{$column}' already exists in table '{$table}'. Skipping add."); // Optional: log if already exists
        }
    }
}
// --- END Helper Functions ---

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
                // Commented out to reduce log noise - only logged once per config load
                // error_log("CONFIG WARNING: Image source '{$key}' path '{$source_config['path']}' is invalid or not readable. Skipping.");
            }
        } else {
             // error_log("CONFIG WARNING: Image source '{$key}' is missing 'path'. Skipping.");
        }
    }
} else {
     error_log("CRITICAL CONFIG ERROR: 'image_sources' is not defined or not an array in config.php");
     // Potentially die here if sources are absolutely required
     // die("Server Configuration Error: Image sources configuration missing or invalid.");
}

// Define the constant with VALIDATED sources only
define('IMAGE_SOURCES', $valid_image_sources);

// --- RAW Image Source Configuration (Get from config) ---
// Validate RAW_IMAGE_SOURCES paths from config
$valid_raw_image_sources = [];
if (isset($config['raw_image_sources']) && is_array($config['raw_image_sources'])) {
    foreach ($config['raw_image_sources'] as $key => $source_config) { // Can be simple key => path string or key => [path=>, name=>]
        $path_to_check = null;
        $source_name = $key; // Default name is the key

        if (is_string($source_config)) { // Simple format: 'key' => '/path/to/raws'
            $path_to_check = $source_config;
        } elseif (is_array($source_config) && isset($source_config['path'])) { // Advanced format: 'key' => ['path' => '/path', 'name' => 'My RAWs']
            $path_to_check = $source_config['path'];
            if (isset($source_config['name'])) {
                $source_name = $source_config['name'];
            }
        }

        if ($path_to_check) {
            $resolved_path = realpath($path_to_check);
            if ($resolved_path && is_dir($resolved_path) && is_readable($resolved_path)) {
                $valid_raw_image_sources[$key] = [
                    'path' => $resolved_path,
                    'name' => $source_name
                ];
            } else {
                error_log("CONFIG WARNING: RAW Image source '{$key}' path '{$path_to_check}' is invalid or not readable. Realpath result: " . ($resolved_path ?: 'false') . ". Is_dir: " . (is_dir($path_to_check) ? 'true' : 'false') . ". Is_readable: " . (is_readable($path_to_check) ? 'true' : 'false'));
            }
        } else {
             error_log("CONFIG WARNING: RAW Image source '{$key}' is missing path or has incorrect format. Skipping.");
        }
    }
} else {
     error_log("CONFIG WARNING: 'raw_image_sources' is not defined or not an array in config.php. Jet app might not find sources.");
     // Not a critical error for the main app, but Jet app will be affected.
}

// Define the constant with VALIDATED RAW sources only
define('RAW_IMAGE_SOURCES', $valid_raw_image_sources);

// --- RAW Image Extensions (Get from config) ---
// Default RAW extensions WITHOUT leading dots
$default_raw_extensions = ['arw', 'nef', 'cr2', 'cr3', 'raf', 'dng', 'orf', 'pef', 'rw2']; 

// Get from config or use the dot-less default
$loaded_raw_extensions = $config['raw_image_extensions'] ?? $default_raw_extensions;

// Ensure all extensions are lowercase and have no leading dots
$processed_raw_extensions = array_map(function($ext) {
    return strtolower(ltrim(trim($ext), '.'));
}, $loaded_raw_extensions);

define('RAW_IMAGE_EXTENSIONS', $processed_raw_extensions);

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

// --- Jet App Preview Cache Configuration ---
$jet_preview_size = $config['jet_preview_size'] ?? 750;
define('JET_PREVIEW_SIZE', $jet_preview_size);

try {
    $jet_cache_root_path = $config['jet_preview_cache_root'] ?? (__DIR__ . '/cache/jet_previews');
    $resolved_jet_cache_path = realpath($jet_cache_root_path);

    if (!$resolved_jet_cache_path) {
        if (!is_dir(dirname($jet_cache_root_path))) @mkdir(dirname($jet_cache_root_path), 0775, true);
        if (!is_dir($jet_cache_root_path)) @mkdir($jet_cache_root_path, 0775, true);
        clearstatcache();
        $resolved_jet_cache_path = realpath($jet_cache_root_path);
    }

    if (!$resolved_jet_cache_path || !is_dir($resolved_jet_cache_path) || !is_writable($resolved_jet_cache_path)) {
        throw new Exception("Failed to resolve, create, or write to JET_PREVIEW_CACHE_ROOT path: '" . htmlspecialchars($jet_cache_root_path) . "'. Resolved to: " . ($resolved_jet_cache_path ?: 'false'));
    }
    define('JET_PREVIEW_CACHE_ROOT', $resolved_jet_cache_path);

    // Pre-create size directory for Jet previews if it doesn't exist
    $jet_size_dir = JET_PREVIEW_CACHE_ROOT . DIRECTORY_SEPARATOR . JET_PREVIEW_SIZE;
    if (!is_dir($jet_size_dir)) {
        if (!@mkdir($jet_size_dir, 0775, true)) {
            error_log("Warning: Failed to automatically create Jet preview size directory: {$jet_size_dir}");
        }
    }

} catch (Throwable $e) {
    $error_msg = "CRITICAL JET CONFIG ERROR: Failed to configure Jet preview cache paths - " . $e->getMessage();
    error_log($error_msg);
    // For now, we won't die, but Jet previews might fail.
    // Consider if this should be a fatal error for the Jet app context.
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
    // If this script is included, re-throw to let the caller handle it,
    // or handle it based on context (e.g., API might return JSON error).
    throw $e; // Re-throw if not directly accessed
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
            id INT AUTO_INCREMENT PRIMARY KEY,
            folder_path VARCHAR(1024) NOT NULL, -- Stores the source-prefixed path to the item or folder
            status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at BIGINT NULL,
            completed_at BIGINT NULL,
            total_files INT DEFAULT 0,
            processed_files INT DEFAULT 0,
            image_count INT DEFAULT 0,
            current_file_processing VARCHAR(1024) NULL,
            result_message TEXT NULL,
            worker_id VARCHAR(255) NULL DEFAULT NULL,
            original_width INT DEFAULT NULL,
            original_height INT DEFAULT NULL,
            INDEX idx_cache_jobs_status (status),
            INDEX idx_cache_jobs_folder_path (folder_path(255)),
            INDEX idx_cache_jobs_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        // Add 'size' and 'type' columns to cache_jobs if they don't exist
        add_column_if_not_exists($pdo, 'cache_jobs', 'size', 'INT DEFAULT NULL AFTER folder_path');
        add_column_if_not_exists($pdo, 'cache_jobs', 'type', "VARCHAR(10) DEFAULT 'image' AFTER size");
        add_column_if_not_exists($pdo, 'cache_jobs', 'worker_id', "VARCHAR(255) NULL DEFAULT NULL AFTER result_message");
        add_column_if_not_exists($pdo, 'cache_jobs', 'image_count', "INT DEFAULT 0 AFTER processed_files");
        add_column_if_not_exists($pdo, 'cache_jobs', 'original_width', "INT DEFAULT NULL AFTER worker_id");
        add_column_if_not_exists($pdo, 'cache_jobs', 'original_height', "INT DEFAULT NULL AFTER original_width");

        // Create zip_jobs table
        $pdo->exec("CREATE TABLE IF NOT EXISTS zip_jobs (
            token VARCHAR(255) PRIMARY KEY,
            source_path TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending', /* pending, processing, completed, failed, downloaded, cleaned */
            progress INT DEFAULT 0, /* 0-100 */
            file_count INT DEFAULT 0,
            total_size BIGINT DEFAULT 0,
            final_zip_name VARCHAR(255) NULL,
            final_zip_path TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            items_json TEXT NULL, /* JSON array of selected file paths if source_path is _multiple_selected_ */
            result_message TEXT NULL, /* Store detailed success/error message from worker */
            downloaded_at TIMESTAMP NULL DEFAULT NULL /* Timestamp of first successful download */,
            cleanup_attempts TINYINT UNSIGNED DEFAULT 0 NOT NULL COMMENT 'Number of times cleanup has been attempted for this job ZIP file'
        )");

        // Create users table if not exists
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'designer') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL
        )");

        // Create jet_image_picks table if not exists (for storing designer's picks)
        $pdo->exec("CREATE TABLE IF NOT EXISTS jet_image_picks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            source_key VARCHAR(50) NOT NULL,
            image_relative_path VARCHAR(255) NOT NULL,
            pick_color VARCHAR(20) DEFAULT NULL,
            pick_status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_pick (user_id, source_key, image_relative_path)
        )");

        // Alter jet_image_picks table if it has the old structure
        if (column_exists($pdo, 'jet_image_picks', 'is_picked')) {
            if (!column_exists($pdo, 'jet_image_picks', 'pick_color')) {
                error_log("Altering jet_image_picks table: adding pick_color column.");
                $pdo->exec("ALTER TABLE jet_image_picks ADD COLUMN pick_color VARCHAR(20) DEFAULT NULL AFTER image_relative_path");
            }
            // Ensure pick_status_updated_at column exists if we are altering from the old structure
            if (!column_exists($pdo, 'jet_image_picks', 'pick_status_updated_at')) {
                error_log("Altering jet_image_picks table: adding pick_status_updated_at column.");
                // Add it after pick_color, or as the last sensible column
                $pdo->exec("ALTER TABLE jet_image_picks ADD COLUMN pick_status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER pick_color");
            }
            error_log("Altering jet_image_picks table: dropping old is_picked column.");
            $pdo->exec("ALTER TABLE jet_image_picks DROP COLUMN is_picked");
            
            // Also, the old table had a `picked_at` column, which is now `pick_status_updated_at`.
            // If `picked_at` exists and `pick_status_updated_at` was just added, we might want to drop `picked_at`.
            // However, the CREATE TABLE uses the correct new name. This logic focuses on `is_picked` presence.
            // For safety, explicitly drop `picked_at` if it exists from a very old schema.
            if (column_exists($pdo, 'jet_image_picks', 'picked_at')) {
                 error_log("Altering jet_image_picks table: dropping old picked_at column.");
                 $pdo->exec("ALTER TABLE jet_image_picks DROP COLUMN picked_at");
            }
        } else {
            // If 'is_picked' does not exist, ensure the new columns are there if the table somehow exists partially.
            // This is more of a sanity check for developing, the CREATE TABLE should handle it.
            if (!column_exists($pdo, 'jet_image_picks', 'pick_color')) {
                 error_log("Ensuring jet_image_picks table: adding pick_color column as is_picked was not found either.");
                 $pdo->exec("ALTER TABLE jet_image_picks ADD COLUMN pick_color VARCHAR(20) DEFAULT NULL AFTER image_relative_path");
            }
            if (!column_exists($pdo, 'jet_image_picks', 'pick_status_updated_at')) {
                 error_log("Ensuring jet_image_picks table: adding pick_status_updated_at column as is_picked was not found either.");
                 $pdo->exec("ALTER TABLE jet_image_picks ADD COLUMN pick_status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER pick_color");
            }
        }

        // Fix column name mismatch: image_path should be image_relative_path
        if (column_exists($pdo, 'jet_image_picks', 'image_path') && !column_exists($pdo, 'jet_image_picks', 'image_relative_path')) {
            error_log("Migrating jet_image_picks table: renaming image_path to image_relative_path.");
            // Drop the old unique constraint first
            $pdo->exec("ALTER TABLE jet_image_picks DROP INDEX unique_pick");
            // Rename the column
            $pdo->exec("ALTER TABLE jet_image_picks CHANGE COLUMN image_path image_relative_path VARCHAR(255) NOT NULL");
            // Add the new unique constraint
            $pdo->exec("ALTER TABLE jet_image_picks ADD UNIQUE KEY unique_pick (user_id, source_key, image_relative_path)");
        }

        // Comprehensive table cleanup for jet_image_picks
        try {
            // Check if we have a messy table state and need to recreate it
            $show_create_stmt = $pdo->prepare("SHOW CREATE TABLE jet_image_picks");
            $show_create_stmt->execute();
            $create_result = $show_create_stmt->fetch();
            $create_table = $create_result['Create Table'];
            
            // Check if table has incorrect unique constraint or columns
            $needs_cleanup = (
                strpos($create_table, 'user_username') !== false ||
                (strpos($create_table, 'image_path') !== false && strpos($create_table, 'image_relative_path') !== false) ||
                strpos($create_table, 'picked_at') !== false
            );
            
            if ($needs_cleanup) {
                error_log("Cleaning up jet_image_picks table structure...");
                
                // Backup existing data
                $backup_stmt = $pdo->query("SELECT * FROM jet_image_picks");
                $backup_data = $backup_stmt->fetchAll();
                
                // Drop and recreate the table with correct structure
                $pdo->exec("DROP TABLE jet_image_picks");
                $pdo->exec("CREATE TABLE jet_image_picks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    source_key VARCHAR(50) NOT NULL,
                    image_relative_path VARCHAR(255) NOT NULL,
                    pick_color VARCHAR(20) DEFAULT NULL,
                    pick_status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE KEY unique_pick (user_id, source_key, image_relative_path)
                )");
                
                // Restore data
                if (!empty($backup_data)) {
                    $restore_stmt = $pdo->prepare("INSERT INTO jet_image_picks (user_id, source_key, image_relative_path, pick_color, pick_status_updated_at) VALUES (?, ?, ?, ?, ?)");
                    foreach ($backup_data as $row) {
                        $user_id = $row['user_id'] ?? 1; // Default to admin if missing
                        $source_key = $row['source_key'] ?? '';
                        $image_path = $row['image_relative_path'] ?? $row['image_path'] ?? ''; // Try both column names
                        $pick_color = $row['pick_color'] ?? null;
                        $updated_at = $row['pick_status_updated_at'] ?? $row['picked_at'] ?? null;
                        
                        if ($image_path && $source_key) {
                            try {
                                $restore_stmt->execute([$user_id, $source_key, $image_path, $pick_color, $updated_at]);
                            } catch (PDOException $e) {
                                error_log("Error restoring pick data for image {$image_path}: " . $e->getMessage());
                            }
                        }
                    }
                }
                
                error_log("jet_image_picks table cleanup completed.");
            }
        } catch (PDOException $e) {
            error_log("Error during jet_image_picks table cleanup: " . $e->getMessage());
        }

        // --- AUTO-MIGRATION: Ensure new columns exist ---
        add_column_if_not_exists($pdo, 'zip_jobs', 'items_json', 'TEXT DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'result_message', 'TEXT NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'downloaded_at', 'TIMESTAMP NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'final_zip_path', 'TEXT NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'final_zip_name', 'VARCHAR(255) NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'total_size', 'BIGINT DEFAULT 0');
        add_column_if_not_exists($pdo, 'zip_jobs', 'cleanup_attempts', 'TINYINT UNSIGNED DEFAULT 0 NOT NULL COMMENT \'Number of times cleanup has been attempted for this job ZIP file\' AFTER downloaded_at');

    }
} catch (PDOException $e) {
    error_log("Failed to create or check database tables (folder_stats, folder_passwords): " . $e->getMessage());
    // Depending on requirements, you might want to throw this error
    // or handle it gracefully, allowing the script to continue without stats table.
}

?>