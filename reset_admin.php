<?php
/**
 * Reset Admin User Script
 * Run this to reset admin user with correct password
 */

require_once 'db_connect.php';

echo "=== Reset Admin User ===\n";

// Load config
$config = require_once __DIR__ . '/config.php';
if (!$config) {
    echo "❌ Failed to load config.php\n";
    exit(1);
}

$admin_username = $config['admin_user'] ?? 'admin';
$admin_password = $config['admin_pass'] ?? 'admin123';

echo "Resetting admin user: {$admin_username}\n";
echo "Password: {$admin_password}\n";

try {
    // Generate new password hash
    $password_hash = password_hash($admin_password, PASSWORD_DEFAULT);
    echo "Generated hash: " . substr($password_hash, 0, 20) . "...\n";
    
    // Delete existing admin user
    $stmt = $pdo->prepare("DELETE FROM users WHERE username = ? AND role = 'admin'");
    $stmt->execute([$admin_username]);
    echo "Deleted existing admin user(s)\n";
    
    // Create new admin user
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')");
    $stmt->execute([$admin_username, $password_hash]);
    $admin_id = $pdo->lastInsertId();
    
    echo "✓ Created new admin user with ID: {$admin_id}\n";
    
    // Verify the creation
    $stmt = $pdo->prepare("SELECT id, username, role FROM users WHERE id = ?");
    $stmt->execute([$admin_id]);
    $user = $stmt->fetch();
    
    if ($user) {
        echo "✓ Verification: User {$user['username']} (ID: {$user['id']}) with role {$user['role']}\n";
        
        // Test password verification
        $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$admin_id]);
        $result = $stmt->fetch();
        
        if ($result && password_verify($admin_password, $result['password_hash'])) {
            echo "✓ Password verification: SUCCESS\n";
        } else {
            echo "❌ Password verification: FAILED\n";
        }
    } else {
        echo "❌ Failed to verify user creation\n";
    }
    
    echo "\n=== Admin Reset Complete ===\n";
    echo "You can now login with:\n";
    echo "Username: {$admin_username}\n";
    echo "Password: {$admin_password}\n";
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}
?> 