<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../db/db_connect.php';

try {
    // Test connection
    $stmt = DB->query("SELECT 1");
    $result = $stmt->fetch();
    
    if ($result) {
        echo "Database connection successful!\n";
        
        // Test table creation
        $stmt = DB->query("SHOW TABLES");
        $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        echo "\nTables in database:\n";
        foreach ($tables as $table) {
            echo "- {$table}\n";
        }
        
        // Test insert
        $stmt = DB->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
        $stmt->execute(['test_user', password_hash('test_password', PASSWORD_DEFAULT), 'designer']);
        
        echo "\nTest insert successful!\n";
    }
    
} catch (PDOException $e) {
    echo "Database connection failed: " . $e->getMessage() . "\n";
    error_log("Database connection test failed: " . $e->getMessage());
}
