<?php
/**
 * Password Hash Generator
 * Generates secure password hashes using PHP's password_hash() function
 * 
 * Usage:
 * 1. Command line: php generate_password_hash.php "your_password"
 * 2. Web browser: Open this file in browser and use the form
 */

// Check if running from command line
$is_cli = php_sapi_name() === 'cli';

if ($is_cli) {
    // Command line usage
    echo "=== Password Hash Generator ===\n";
    
    if ($argc < 2) {
        echo "Usage: php generate_password_hash.php \"your_password\"\n";
        echo "Example: php generate_password_hash.php \"admin123\"\n";
        exit(1);
    }
    
    $password = $argv[1];
    echo "Password: {$password}\n";
    
    // Generate hash
    $hash = password_hash($password, PASSWORD_DEFAULT);
    echo "Generated hash: {$hash}\n";
    
    // Verify the hash works
    if (password_verify($password, $hash)) {
        echo "✓ Verification: SUCCESS\n";
    } else {
        echo "❌ Verification: FAILED\n";
    }
    
    echo "\nYou can use this hash in your config.php:\n";
    echo "'admin_password_hash' => '{$hash}',\n";
    
} else {
    // Web interface
    $generated_hash = '';
    $password = '';
    $verification_result = '';
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['password'])) {
        $password = $_POST['password'];
        $generated_hash = password_hash($password, PASSWORD_DEFAULT);
        
        // Verify the hash
        if (password_verify($password, $generated_hash)) {
            $verification_result = '✓ Verification: SUCCESS';
        } else {
            $verification_result = '❌ Verification: FAILED';
        }
    }
    ?>
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Hash Generator</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
                background-color: #0d1117;
                color: #e6edf3;
                line-height: 1.6;
            }
            .container {
                background: #161b22;
                padding: 30px;
                border-radius: 8px;
                border: 1px solid #30363d;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            }
            h1 {
                color: #f0f6fc;
                margin-top: 0;
                text-align: center;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: #c9d1d9;
            }
            input[type="password"], input[type="text"] {
                width: 100%;
                padding: 12px;
                border: 1px solid #30363d;
                border-radius: 6px;
                background-color: #0d1117;
                color: #e6edf3;
                font-size: 16px;
                box-sizing: border-box;
            }
            input:focus {
                outline: none;
                border-color: #58a6ff;
                box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
            }
            button {
                background-color: #238636;
                color: white;
                padding: 12px 24px;
                border: 1px solid #2ea043;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
            }
            button:hover {
                background-color: #2ea043;
                border-color: #3fb950;
            }
            .result {
                margin-top: 30px;
                padding: 20px;
                background-color: #0d1117;
                border: 1px solid #30363d;
                border-radius: 6px;
            }
            .hash-output {
                background-color: #161b22;
                padding: 15px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
                word-break: break-all;
                margin: 10px 0;
                border: 1px solid #30363d;
            }
            .success {
                color: #3fb950;
            }
            .error {
                color: #f85149;
            }
            .info {
                background-color: #0c2d6b;
                border: 1px solid #1f6feb;
                padding: 15px;
                border-radius: 6px;
                margin-top: 20px;
            }
            .copy-btn {
                background-color: #21262d;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px 12px;
                font-size: 14px;
                margin-left: 10px;
            }
            .copy-btn:hover {
                background-color: #30363d;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔐 Password Hash Generator</h1>
            
            <form method="POST">
                <div class="form-group">
                    <label for="password">Enter Password:</label>
                    <input type="password" id="password" name="password" value="<?php echo htmlspecialchars($password); ?>" required>
                </div>
                <button type="submit">Generate Hash</button>
            </form>
            
            <?php if ($generated_hash): ?>
            <div class="result">
                <h3>Generated Hash:</h3>
                <div class="hash-output" id="hashOutput"><?php echo htmlspecialchars($generated_hash); ?></div>
                <button type="button" class="copy-btn" onclick="copyToClipboard()">📋 Copy Hash</button>
                
                <p class="<?php echo strpos($verification_result, '✓') !== false ? 'success' : 'error'; ?>">
                    <?php echo htmlspecialchars($verification_result); ?>
                </p>
                
                <div class="info">
                    <h4>How to use this hash:</h4>
                    <p><strong>1. In config.php:</strong></p>
                    <div class="hash-output">'admin_password_hash' => '<?php echo htmlspecialchars($generated_hash); ?>',</div>
                    
                    <p><strong>2. In database:</strong></p>
                    <div class="hash-output">UPDATE users SET password_hash = '<?php echo htmlspecialchars($generated_hash); ?>' WHERE username = 'admin';</div>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="info">
                <h4>📝 Usage Instructions:</h4>
                <ul>
                    <li><strong>Web Interface:</strong> Use the form above</li>
                    <li><strong>Command Line:</strong> <code>php generate_password_hash.php "your_password"</code></li>
                    <li><strong>Security:</strong> This tool uses PHP's <code>PASSWORD_DEFAULT</code> algorithm (currently bcrypt)</li>
                    <li><strong>Note:</strong> Each generation creates a different hash, but all will verify correctly</li>
                </ul>
            </div>
        </div>
        
        <script>
            function copyToClipboard() {
                const hashOutput = document.getElementById('hashOutput');
                const text = hashOutput.textContent;
                
                navigator.clipboard.writeText(text).then(function() {
                    const btn = event.target;
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.backgroundColor = '#238636';
                    
                    setTimeout(function() {
                        btn.textContent = originalText;
                        btn.style.backgroundColor = '#21262d';
                    }, 2000);
                }).catch(function(err) {
                    alert('Failed to copy: ' + err);
                });
            }
        </script>
    </body>
    </html>
    <?php
}
?> 