<?php
// Load database configuration
$db_config = require_once __DIR__ . '/database.php';

return [
    // Environment
    'env' => 'development',
    'debug' => true,
    
    // Database
    'database' => $db_config,
    
    // Paths
    'root_path' => __DIR__ . '/../',
    'upload_path' => __DIR__ . '/../uploads/',
    'cache_path' => __DIR__ . '/../cache/',
    'logs_path' => __DIR__ . '/../logs/',
    
    // File settings
    'allowed_extensions' => [
        'image' => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'cr2', 'nef', 'arw'],
        'video' => ['mp4', 'mov', 'avi', 'mkv']
    ],
    'max_file_size' => 1024 * 1024 * 1024, // 1GB
    
    // Performance
    'memory_limit' => '4096M',
    'max_execution_time' => 300,
    
    // Cache
    'cache_ttl' => 3600, // 1 hour
    'max_cache_size' => 1024 * 1024 * 1024, // 1GB
    'cleanup_interval' => 86400, // 24 hours
    
    // Security
    'session_timeout' => 3600, // 1 hour
    'password_min_length' => 8,
    'password_max_length' => 64
];
