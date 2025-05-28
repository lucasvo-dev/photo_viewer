<?php
/**
 * Database Setup Script
 * Run this once on the server to initialize database and admin user
 */

echo "=== Photo Gallery Database Setup ===\n";

try {
    // Load config
    $config = require_once __DIR__ . '/config.php';
    
    if (!$config) {
        throw new Exception("Could not load config.php");
    }
    
    echo "✓ Config loaded\n";
    
    // Connect to MySQL (without database first)
    $dsn = "mysql:host={$config['host']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['user'], $config['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
    
    echo "✓ Connected to MySQL\n";
    
    // Create database
    $pdo->exec("CREATE DATABASE IF NOT EXISTS {$config['name']} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "✓ Database '{$config['name']}' created/verified\n";
    
    // Switch to database
    $pdo->exec("USE {$config['name']}");
    
    // Create tables
    $sql = file_get_contents(__DIR__ . '/database/create_tables.sql');
    
    // Remove the CREATE DATABASE and USE lines since we already did that
    $sql = preg_replace('/^CREATE DATABASE.*$/m', '', $sql);
    $sql = preg_replace('/^USE.*$/m', '', $sql);
    
    // Execute SQL
    $pdo->exec($sql);
    echo "✓ Tables created/verified\n";
    
    // Verify admin user
    $stmt = $pdo->prepare("SELECT username FROM users WHERE role = 'admin' LIMIT 1");
    $stmt->execute();
    $admin = $stmt->fetch();
    
    if ($admin) {
        echo "✓ Admin user exists: {$admin['username']}\n";
    } else {
        echo "⚠ No admin user found\n";
    }
    
    echo "\n=== Setup Complete! ===\n";
    echo "Admin login:\n";
    echo "Username: {$config['admin_username']}\n";
    echo "Password: @Floha123 (default - please change!)\n";
    echo "\nYou can now access the admin panel at: admin.php\n";
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
?> 