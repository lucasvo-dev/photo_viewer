<?php
return [
    // Database configuration
    'type' => 'mysql',
    'host' => 'localhost',
    'name' => 'photo_gallery',
    'user' => 'root',
    'pass' => '',
    
    // Connection settings
    'charset' => 'utf8mb4',
    'collation' => 'utf8mb4_unicode_ci',
    'prefix' => '',
    
    // Performance settings
    'max_connections' => 100,
    'connection_timeout' => 5,
    'wait_timeout' => 300,
    
    // Query cache
    'query_cache_size' => 16777216, // 16MB
    'table_cache_size' => 1000,
    
    // Error handling
    'error_reporting' => true,
    'log_errors' => true,
    'error_log_path' => 'D:\xampp\htdocs\logs\database.log'
];
