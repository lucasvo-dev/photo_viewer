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
if (!defined('IMAGE_SOURCES')) {
    define('IMAGE_SOURCES', $valid_image_sources);
}

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
if (!defined('RAW_IMAGE_SOURCES')) {
    define('RAW_IMAGE_SOURCES', $valid_raw_image_sources);
}

// --- RAW Image Extensions (Get from config) ---
// Default RAW extensions WITHOUT leading dots
$default_raw_extensions = ['arw', 'nef', 'cr2', 'cr3', 'raf', 'dng', 'orf', 'pef', 'rw2']; 

// Get from config or use the dot-less default
$loaded_raw_extensions = $config['raw_file_extensions'] ?? $default_raw_extensions;

// Ensure all extensions are lowercase and have no leading dots
$processed_raw_extensions = array_map(function($ext) {
    return strtolower(ltrim(trim($ext), '.'));
}, $loaded_raw_extensions);

if (!defined('RAW_FILE_EXTENSIONS')) {
    define('RAW_FILE_EXTENSIONS', $processed_raw_extensions);
}

// --- Cache and Thumbnail Configuration (Get from config) ---
$allowed_extensions = $config['allowed_extensions'] ?? ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
$thumbnail_sizes = $config['thumbnail_sizes'] ?? [150, 750];

// Define constants for use in API etc.
if (!defined('ALLOWED_EXTENSIONS')) {
    define('ALLOWED_EXTENSIONS', $allowed_extensions);
}
if (!defined('THUMBNAIL_SIZES')) {
    define('THUMBNAIL_SIZES', $thumbnail_sizes);
}

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
    if (!defined('CACHE_THUMB_ROOT')) {
        define('CACHE_THUMB_ROOT', $resolved_cache_path);
    }

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
$jet_filmstrip_thumb_size = $config['jet_filmstrip_thumb_size'] ?? 120;
if (!defined('JET_PREVIEW_SIZE')) {
    define('JET_PREVIEW_SIZE', $jet_preview_size);
}
if (!defined('JET_FILMSTRIP_THUMB_SIZE')) {
    define('JET_FILMSTRIP_THUMB_SIZE', $jet_filmstrip_thumb_size);
}

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
    if (!defined('JET_PREVIEW_CACHE_ROOT')) {
        define('JET_PREVIEW_CACHE_ROOT', $resolved_jet_cache_path);
    }

    // Pre-create size directory for Jet previews if it doesn't exist (only 750px)
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

        // Create users table if not exists (main unified table)
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('admin', 'designer') DEFAULT 'designer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL
        )");

        // Migration: Copy data from admin_users to users if users is empty but admin_users has data
        try {
            $users_count_stmt = $pdo->query("SELECT COUNT(*) FROM users");
            $users_count = $users_count_stmt->fetchColumn();
            
            // Check if admin_users table exists and has data
            $admin_users_exists = false;
            $admin_users_count = 0;
            try {
                $admin_users_count_stmt = $pdo->query("SELECT COUNT(*) FROM admin_users");
                $admin_users_count = $admin_users_count_stmt->fetchColumn();
                $admin_users_exists = true;
            } catch (PDOException $e) {
                // admin_users table doesn't exist, which is fine
            }

            if ($users_count == 0 && $admin_users_exists && $admin_users_count > 0) {
                // Migrate data from admin_users back to users
                error_log("Migrating users from 'admin_users' table back to 'users' table...");
                
                $migrate_stmt = $pdo->prepare("
                    INSERT INTO users (username, password_hash, role, created_at, last_login)
                    SELECT username, password_hash, role, 
                           FROM_UNIXTIME(created_at), 
                           CASE WHEN last_login_at IS NOT NULL THEN FROM_UNIXTIME(last_login_at) ELSE NULL END
                    FROM admin_users
                ");
                $migrate_stmt->execute();
                $migrated_count = $migrate_stmt->rowCount();
                
                error_log("Successfully migrated {$migrated_count} users from 'admin_users' back to 'users' table.");
            }
        } catch (PDOException $e) {
            error_log("Migration error: " . $e->getMessage());
        }

        // Update jet_image_picks to use users instead of admin_users
        try {
            // Check if the foreign key constraint exists and points to admin_users
            $fk_check = $pdo->query("
                SELECT CONSTRAINT_NAME 
                FROM information_schema.KEY_COLUMN_USAGE 
                WHERE TABLE_NAME = 'jet_image_picks' 
                AND COLUMN_NAME = 'user_id' 
                AND REFERENCED_TABLE_NAME = 'admin_users'
            ");
            
            if ($fk_check->fetch()) {
                error_log("Updating jet_image_picks foreign key to reference users...");
                
                // Drop the old foreign key constraint
                $pdo->exec("ALTER TABLE jet_image_picks DROP FOREIGN KEY jet_image_picks_ibfk_1");
                
                // Add new foreign key to users
                $pdo->exec("ALTER TABLE jet_image_picks ADD CONSTRAINT jet_image_picks_ibfk_1 
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE");
                
                error_log("Updated jet_image_picks foreign key to reference users.");
            }
        } catch (PDOException $e) {
            error_log("Foreign key update error (this may be normal): " . $e->getMessage());
        }

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

        // Create jet_cache_jobs table for RAW image preview caching
        $pdo->exec("CREATE TABLE IF NOT EXISTS jet_cache_jobs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            raw_file_path VARCHAR(1024) NOT NULL, -- Stores the source-prefixed path to the RAW file
            source_key VARCHAR(50) NOT NULL,
            image_relative_path VARCHAR(255) NOT NULL,
            cache_size INT NOT NULL, -- Target cache size (e.g., 750 for preview, 120 for filmstrip)
            status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at BIGINT NULL,
            completed_at BIGINT NULL,
            result_message TEXT NULL,
            worker_id VARCHAR(255) NULL DEFAULT NULL,
            final_cache_path VARCHAR(1024) NULL, -- Path to the generated cache file
            original_width INT DEFAULT NULL,
            original_height INT DEFAULT NULL,
            INDEX idx_jet_cache_jobs_status (status),
            INDEX idx_jet_cache_jobs_source_key (source_key),
            INDEX idx_jet_cache_jobs_path (image_relative_path(255)),
            INDEX idx_jet_cache_jobs_created_at (created_at),
            UNIQUE KEY unique_cache_job (source_key, image_relative_path, cache_size)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

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

        // --- NEW TABLES FOR CATEGORY AND FEATURED IMAGES ---
        
        // Create folder_categories table
        $pdo->exec("CREATE TABLE IF NOT EXISTS folder_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category_name VARCHAR(100) NOT NULL UNIQUE,
            category_slug VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            color_code VARCHAR(7) DEFAULT '#3B82F6',
            icon_class VARCHAR(50) DEFAULT 'fas fa-folder',
            sort_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )");
        
        // Create folder_category_mapping table  
        $pdo->exec("CREATE TABLE IF NOT EXISTS folder_category_mapping (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_key VARCHAR(50) NOT NULL,
            folder_path VARCHAR(500) NOT NULL,
            category_id INT NOT NULL,
            is_inherited BOOLEAN DEFAULT FALSE,
            created_by INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES folder_categories(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE KEY unique_folder_category (source_key, folder_path(255)),
            KEY idx_source_folder (source_key, folder_path(255))
        )");
        
        // Create featured_images table
        $pdo->exec("CREATE TABLE IF NOT EXISTS featured_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_key VARCHAR(50) NOT NULL,
            image_relative_path VARCHAR(500) NOT NULL,
            folder_path VARCHAR(500) NOT NULL,
            featured_type ENUM('featured', 'portrait') DEFAULT 'featured',
            is_featured BOOLEAN DEFAULT TRUE,
            priority_order INT DEFAULT 0,
            featured_by INT DEFAULT NULL,
            alt_text VARCHAR(255),
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (featured_by) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE KEY unique_featured_image (source_key, image_relative_path(255)),
            KEY idx_folder_featured (source_key, folder_path(255), is_featured),
            KEY idx_featured_type (featured_type, is_featured)
        )");
        
        // Insert default photography categories if not exists
        $check_categories = $pdo->query("SELECT COUNT(*) FROM folder_categories")->fetchColumn();
        if ($check_categories == 0) {
            $pdo->exec("INSERT INTO folder_categories (category_name, category_slug, description, color_code, sort_order) VALUES
                ('Đám Cưới', 'wedding', 'Cưới chính thức, lễ cưới, tiệc cưới', '#EF4444', 1),
                ('Pre-Wedding', 'pre-wedding', 'Cưới chụp trước ngày cưới, concept romantic', '#F97316', 2),
                ('Kỷ Yếu', 'graduation', 'Kỷ yếu học sinh sinh viên, concept và trường học', '#3B82F6', 3),
                ('Doanh Nghiệp', 'corporate', 'Doanh nghiệp, profile, team building, sự kiện công ty', '#6B7280', 4),
                ('Thẻ', 'id-photo', 'Thẻ, hồ sơ, chân dung chính thức', '#10B981', 5)
            ");
            error_log("Inserted default photography categories.");
        } else {
            // Update existing categories to new naming scheme
            try {
                $pdo->exec("UPDATE folder_categories SET 
                    category_name = 'Đám Cưới', 
                    description = 'Cưới chính thức, lễ cưới, tiệc cưới'
                    WHERE category_slug = 'wedding' AND category_name LIKE '%Ảnh%'");
                
                $pdo->exec("UPDATE folder_categories SET 
                    category_name = 'Pre-Wedding', 
                    description = 'Cưới chụp trước ngày cưới, concept romantic'
                    WHERE category_slug = 'pre-wedding' AND category_name LIKE '%Ảnh%'");
                
                // Merge graduation categories
                $stmt = $pdo->prepare("SELECT id FROM folder_categories WHERE category_slug = 'graduation-school' LIMIT 1");
                $stmt->execute();
                $school_id = $stmt->fetchColumn();
                
                $stmt = $pdo->prepare("SELECT id FROM folder_categories WHERE category_slug = 'graduation-concept' LIMIT 1");
                $stmt->execute();
                $concept_id = $stmt->fetchColumn();
                
                if ($school_id && $concept_id) {
                    // Update mappings from concept to school category
                    $pdo->prepare("UPDATE folder_category_mapping SET category_id = ? WHERE category_id = ?")
                        ->execute([$school_id, $concept_id]);
                    
                    // Delete concept category
                    $pdo->prepare("DELETE FROM folder_categories WHERE id = ?")->execute([$concept_id]);
                }
                
                // Update remaining categories
                $pdo->exec("UPDATE folder_categories SET 
                    category_name = 'Kỷ Yếu', 
                    category_slug = 'graduation',
                    description = 'Kỷ yếu học sinh sinh viên, concept và trường học'
                    WHERE category_slug IN ('graduation-school', 'graduation-concept')");
                
                $pdo->exec("UPDATE folder_categories SET 
                    category_name = 'Doanh Nghiệp', 
                    description = 'Doanh nghiệp, profile, team building, sự kiện công ty'
                    WHERE category_slug = 'corporate' AND category_name LIKE '%Ảnh%'");
                
                $pdo->exec("UPDATE folder_categories SET 
                    category_name = 'Thẻ', 
                    description = 'Thẻ, hồ sơ, chân dung chính thức'
                    WHERE category_slug = 'id-photo' AND category_name LIKE '%Ảnh%'");
                
                error_log("Updated category names and merged graduation categories.");
            } catch (PDOException $e) {
                error_log("Error updating categories: " . $e->getMessage());
            }
        }

        // --- AUTO-MIGRATION: Ensure new columns exist ---
        add_column_if_not_exists($pdo, 'zip_jobs', 'items_json', 'TEXT DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'result_message', 'TEXT NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'downloaded_at', 'TIMESTAMP NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'final_zip_path', 'TEXT NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'final_zip_name', 'VARCHAR(255) NULL DEFAULT NULL');
        add_column_if_not_exists($pdo, 'zip_jobs', 'total_size', 'BIGINT DEFAULT 0');
        add_column_if_not_exists($pdo, 'zip_jobs', 'cleanup_attempts', 'TINYINT UNSIGNED DEFAULT 0 NOT NULL COMMENT \'Number of times cleanup has been attempted for this job ZIP file\' AFTER downloaded_at');
        
        // Add processing_method column to jet_cache_jobs table
        add_column_if_not_exists($pdo, 'jet_cache_jobs', 'processing_method', 'VARCHAR(50) DEFAULT NULL AFTER original_height');

        // --- AUTO-SETUP ADMIN USER ---
        // Check if admin user exists, if not create one from config
        $admin_check_stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin'");
        $admin_check_stmt->execute();
        $admin_count = $admin_check_stmt->fetchColumn();
        
        if ($admin_count == 0) {
            // No admin user exists, create one from config
            $admin_username = $config['admin_user'] ?? 'admin';
            $admin_password = $config['admin_pass'] ?? 'admin123';
            
            // Hash the password
            $admin_password_hash = password_hash($admin_password, PASSWORD_DEFAULT);
            
            // Insert admin user with Unix timestamp
            $create_admin_stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)");
            $create_admin_stmt->execute([$admin_username, $admin_password_hash, time()]);
            
            error_log("AUTO-SETUP: Created admin user '{$admin_username}' with default password. Please change password after first login.");
            
            // Log to a setup file for reference
            $setup_log = __DIR__ . '/logs/setup.log';
            if (!is_dir(dirname($setup_log))) {
                @mkdir(dirname($setup_log), 0775, true);
            }
            file_put_contents($setup_log, 
                date('Y-m-d H:i:s') . " - AUTO-SETUP: Created admin user '{$admin_username}' with default password\n", 
                FILE_APPEND | LOCK_EX
            );
        } else {
            // Admin user already exists
            error_log("AUTO-SETUP: Admin user already exists, skipping creation.");
        }

        // Create directory_file_counts table for performance optimization
        $sql_directory_counts = "CREATE TABLE IF NOT EXISTS directory_file_counts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_key VARCHAR(50) NOT NULL,
            directory_path VARCHAR(1024) NOT NULL,
            file_count INT DEFAULT 0,
            last_scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            scan_duration_ms INT DEFAULT 0,
            is_scanning TINYINT(1) DEFAULT 0,
            scan_error TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            UNIQUE KEY unique_directory (source_key, directory_path(500)),
            INDEX idx_source_key (source_key),
            INDEX idx_last_scanned (last_scanned_at),
            INDEX idx_is_scanning (is_scanning),
            INDEX idx_file_count (file_count)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

        try {
            $pdo->exec($sql_directory_counts);
            error_log("[DB Setup] directory_file_counts table created/verified successfully");
        } catch (PDOException $e) {
            error_log("[DB Setup] Error creating directory_file_counts table: " . $e->getMessage());
        }

        // Create directory_index table for ultra-fast directory search and browsing
        $sql_directory_index = "CREATE TABLE IF NOT EXISTS directory_index (
            id INT AUTO_INCREMENT PRIMARY KEY,
            source_key VARCHAR(50) NOT NULL,
            directory_name VARCHAR(255) NOT NULL,
            directory_path VARCHAR(1024) NOT NULL, -- Full source-prefixed path
            relative_path VARCHAR(1024) NOT NULL,  -- Path relative to source
            first_image_path VARCHAR(1024) NULL,   -- Relative path to first image for thumbnail
            file_count INT DEFAULT 0,
            last_modified TIMESTAMP NULL,          -- Directory's last modified time
            is_protected TINYINT(1) DEFAULT 0,     -- Whether directory requires password
            has_thumbnail TINYINT(1) DEFAULT 0,    -- Whether thumbnail cache exists
            is_active TINYINT(1) DEFAULT 1,        -- Whether directory still exists
            batch_id VARCHAR(100) NULL,            -- For tracking index rebuilds
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            UNIQUE KEY unique_source_directory (source_key, relative_path(500)),
            INDEX idx_source_key (source_key),
            INDEX idx_directory_name (directory_name),
            INDEX idx_last_modified (last_modified),
            INDEX idx_is_active (is_active),
            INDEX idx_has_thumbnail (has_thumbnail),
            INDEX idx_file_count (file_count),
            INDEX idx_search_name (directory_name, is_active),
            INDEX idx_batch_updated (batch_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

        try {
            $pdo->exec($sql_directory_index);
            error_log("[DB Setup] directory_index table created/verified successfully");
        } catch (PDOException $e) {
            error_log("[DB Setup] Error creating directory_index table: " . $e->getMessage());
        }

    }
} catch (PDOException $e) {
    error_log("Failed to create or check database tables (folder_stats, folder_passwords): " . $e->getMessage());
    // Depending on requirements, you might want to throw this error
    // or handle it gracefully, allowing the script to continue without stats table.
}

?>