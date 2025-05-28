<?php
/**
 * Debug Login Script
 * Run this to check admin user setup and password verification
 */

require_once 'db_connect.php';

echo "=== Login Debug Information ===\n";

// Load config
$config = require_once __DIR__ . '/config.php';
if (!$config) {
    echo "❌ Failed to load config.php\n";
    exit(1);
}

echo "✓ Config loaded successfully\n";

// Check config values
$admin_username = $config['admin_user'] ?? 'admin';
$admin_password = $config['admin_pass'] ?? 'admin123';
$config_password_hash = $config['admin_password_hash'] ?? null;

echo "Config admin_user: {$admin_username}\n";
echo "Config admin_pass: {$admin_password}\n";
echo "Config admin_password_hash: " . ($config_password_hash ? 'SET' : 'NOT SET') . "\n";

// Check database connection
try {
    if (!$pdo) {
        echo "❌ Database connection failed\n";
        exit(1);
    }
    echo "✓ Database connected\n";
    
    // Check users table structure
    $stmt = $pdo->query("DESCRIBE users");
    $columns = $stmt->fetchAll();
    echo "\nUsers table structure:\n";
    foreach ($columns as $col) {
        echo "  - {$col['Field']}: {$col['Type']}\n";
    }
    
    // Check existing admin users
    $stmt = $pdo->prepare("SELECT id, username, role, created_at FROM users WHERE role = 'admin'");
    $stmt->execute();
    $admins = $stmt->fetchAll();
    
    echo "\nExisting admin users:\n";
    if (empty($admins)) {
        echo "  No admin users found\n";
    } else {
        foreach ($admins as $admin) {
            echo "  - ID: {$admin['id']}, Username: {$admin['username']}, Created: {$admin['created_at']}\n";
        }
    }
    
    // Test password verification for existing admin
    if (!empty($admins)) {
        $admin = $admins[0];
        $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$admin['id']]);
        $result = $stmt->fetch();
        
        if ($result) {
            $stored_hash = $result['password_hash'];
            echo "\nPassword verification test:\n";
            echo "  Stored hash: " . substr($stored_hash, 0, 20) . "...\n";
            echo "  Testing with config password '{$admin_password}': ";
            
            if (password_verify($admin_password, $stored_hash)) {
                echo "✓ MATCH\n";
            } else {
                echo "❌ NO MATCH\n";
            }
            
            // Test with config hash if available
            if ($config_password_hash) {
                echo "  Testing config password against config hash: ";
                if (password_verify($admin_password, $config_password_hash)) {
                    echo "✓ MATCH\n";
                } else {
                    echo "❌ NO MATCH\n";
                }
            }
        }
    }
    
    // Generate new hash for testing
    echo "\nGenerated hash for current config password:\n";
    $new_hash = password_hash($admin_password, PASSWORD_DEFAULT);
    echo "  New hash: {$new_hash}\n";
    echo "  Verification test: ";
    if (password_verify($admin_password, $new_hash)) {
        echo "✓ WORKS\n";
    } else {
        echo "❌ FAILED\n";
    }
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n=== Debug Complete ===\n";
?> 