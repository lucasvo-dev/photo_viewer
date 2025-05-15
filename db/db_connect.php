<?php
// Load configuration
$config = require_once __DIR__ . '/../config/config.php';

// Check if database configuration exists
if (!isset($config['database'])) {
    throw new Exception('Database configuration not found in config.php');
}

// Database configuration
$db_config = $config['database'];

// Validate required database settings
if (!isset($db_config['host']) || !isset($db_config['name']) || !isset($db_config['user'])) {
    throw new Exception('Missing required database configuration');
}

try {
    // Create PDO connection
    $dsn = sprintf(
        "mysql:host=%s;dbname=%s;charset=%s",
        $db_config['host'],
        $db_config['name'],
        $db_config['charset'] ?? 'utf8mb4'
    );
    
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
    ];
    
    $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'] ?? '', $options);
    
    // Create global PDO instance
    define('DB', $pdo);
    
} catch (PDOException $e) {
    error_log("Database Connection Error: " . $e->getMessage());
    throw new Exception("Database Connection Error: " . $e->getMessage());
}
