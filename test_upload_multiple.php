<?php
// Test script for multiple file upload debugging
session_start();

// Set admin session for testing
$_SESSION['user_role'] = 'admin';
$_SESSION['username'] = 'admin';

echo "<!DOCTYPE html>
<html>
<head>
    <title>Upload Test - Multiple Files</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .upload-form { border: 1px solid #ddd; padding: 20px; margin: 20px 0; }
        .result { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .error { background: #ffe6e6; border: 1px solid #ff9999; }
        .success { background: #e6ffe6; border: 1px solid #99ff99; }
        .info { background: #e6f3ff; border: 1px solid #99ccff; }
    </style>
</head>
<body>";

echo "<h1>Multiple File Upload Test</h1>";

// Display PHP upload settings
echo "<div class='result info'>";
echo "<h3>PHP Upload Settings:</h3>";
echo "<ul>";
echo "<li>upload_max_filesize: " . ini_get('upload_max_filesize') . "</li>";
echo "<li>post_max_size: " . ini_get('post_max_size') . "</li>";
echo "<li>max_file_uploads: " . ini_get('max_file_uploads') . "</li>";
echo "<li>max_input_vars: " . ini_get('max_input_vars') . "</li>";
echo "<li>max_execution_time: " . ini_get('max_execution_time') . "</li>";
echo "<li>memory_limit: " . ini_get('memory_limit') . "</li>";
echo "</ul>";
echo "</div>";

// Check if files were uploaded
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['test_files'])) {
    echo "<div class='result'>";
    echo "<h3>Upload Attempt Results:</h3>";
    
    echo "<h4>Request Info:</h4>";
    echo "<ul>";
    echo "<li>Content-Length: " . ($_SERVER['CONTENT_LENGTH'] ?? 'unknown') . "</li>";
    echo "<li>Request Method: " . $_SERVER['REQUEST_METHOD'] . "</li>";
    echo "<li>POST size: " . strlen(http_build_query($_POST)) . " bytes</li>";
    echo "</ul>";
    
    echo "<h4>POST Data:</h4>";
    echo "<pre>" . print_r($_POST, true) . "</pre>";
    
    echo "<h4>FILES Data Structure:</h4>";
    echo "<pre>" . print_r($_FILES, true) . "</pre>";
    
    if (empty($_FILES)) {
        echo "<div class='result error'>";
        echo "<strong>ERROR:</strong> No files received. This could indicate:";
        echo "<ul>";
        echo "<li>post_max_size exceeded</li>";
        echo "<li>max_file_uploads exceeded</li>";
        echo "<li>Files too large</li>";
        echo "</ul>";
        echo "</div>";
    } else {
        $files = $_FILES['test_files'];
        
        if (is_array($files['name'])) {
            $file_count = count($files['name']);
            echo "<p><strong>Received {$file_count} files</strong></p>";
            
            for ($i = 0; $i < $file_count; $i++) {
                echo "<div style='border: 1px solid #ccc; margin: 10px 0; padding: 10px;'>";
                echo "<h5>File " . ($i + 1) . ": " . htmlspecialchars($files['name'][$i]) . "</h5>";
                echo "<ul>";
                echo "<li>Size: " . $files['size'][$i] . " bytes</li>";
                echo "<li>Type: " . $files['type'][$i] . "</li>";
                echo "<li>Temp file: " . $files['tmp_name'][$i] . "</li>";
                echo "<li>Error code: " . $files['error'][$i];
                
                if ($files['error'][$i] !== UPLOAD_ERR_OK) {
                    $error_messages = [
                        UPLOAD_ERR_INI_SIZE => 'File quá lớn (upload_max_filesize)',
                        UPLOAD_ERR_FORM_SIZE => 'File quá lớn (MAX_FILE_SIZE)',
                        UPLOAD_ERR_PARTIAL => 'Upload bị gián đoạn',
                        UPLOAD_ERR_NO_FILE => 'Không có file',
                        UPLOAD_ERR_NO_TMP_DIR => 'Không có thư mục temp',
                        UPLOAD_ERR_CANT_WRITE => 'Không thể ghi file',
                        UPLOAD_ERR_EXTENSION => 'Extension bị cấm'
                    ];
                    echo " (" . ($error_messages[$files['error'][$i]] ?? 'Unknown error') . ")";
                }
                echo "</li>";
                
                if ($files['error'][$i] === UPLOAD_ERR_OK && file_exists($files['tmp_name'][$i])) {
                    echo "<li style='color: green;'>✓ Temp file exists and is accessible</li>";
                } else {
                    echo "<li style='color: red;'>✗ Temp file not accessible</li>";
                }
                
                echo "</ul>";
                echo "</div>";
            }
        } else {
            echo "<p><strong>Single file mode (not array)</strong></p>";
            echo "<pre>" . print_r($files, true) . "</pre>";
        }
    }
    
    echo "</div>";
}

// Display upload form
echo "<div class='upload-form'>";
echo "<h3>Test Multiple File Upload</h3>";
echo "<form method='POST' enctype='multipart/form-data'>";
echo "<p><label>";
echo "<strong>Select multiple files to test:</strong><br>";
echo "<input type='file' name='test_files[]' multiple accept='image/*,video/*' style='margin: 10px 0;'>";
echo "</label></p>";
echo "<p><input type='submit' value='Test Upload' style='padding: 10px 20px; font-size: 16px;'></p>";
echo "</form>";
echo "</div>";

echo "<div class='result info'>";
echo "<h3>Notes:</h3>";
echo "<ul>";
echo "<li>This test checks if files are received by PHP correctly</li>";
echo "<li>Files are NOT saved to disk - this is just a reception test</li>";
echo "<li>Check the browser's Network tab for request details</li>";
echo "<li><strong>No file size limits</strong> - upload any size files you want</li>";
echo "<li>PHP settings configured for unlimited uploads</li>";
echo "</ul>";
echo "</div>";

echo "</body></html>";
?> 