<?php
// Test Upload Debug Script
session_start();

// Set admin session for testing
$_SESSION['user_role'] = 'admin';
$_SESSION['username'] = 'admin';

// Include necessary files
require_once 'db_connect.php';
require_once 'api/helpers.php';

echo "<h1>Upload Debug Test</h1>";

// Test IMAGE_SOURCES
echo "<h2>IMAGE_SOURCES Configuration:</h2>";
echo "<pre>" . print_r(IMAGE_SOURCES, true) . "</pre>";

// Test ALLOWED_EXTENSIONS
echo "<h2>ALLOWED_EXTENSIONS:</h2>";
echo "<pre>" . print_r(ALLOWED_EXTENSIONS, true) . "</pre>";

// Test path validation
echo "<h2>Path Validation Tests:</h2>";
$test_paths = [
    'main',
    'main/test', 
    'guu_ssd',
    'guu_ssd/test'
];

foreach ($test_paths as $path) {
    $path_info = validate_source_and_path($path);
    echo "<strong>Path: {$path}</strong><br>";
    if ($path_info) {
        echo "✅ Valid - Absolute path: {$path_info['absolute_path']}<br>";
        echo "  - Exists: " . (file_exists($path_info['absolute_path']) ? 'YES' : 'NO') . "<br>";
        echo "  - Writable: " . (is_writable($path_info['absolute_path']) ? 'YES' : 'NO') . "<br>";
    } else {
        echo "❌ Invalid path<br>";
    }
    echo "<br>";
}

// Test file upload simulation
echo "<h2>File Upload Simulation:</h2>";

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['test_file'])) {
    echo "<h3>Upload Attempt:</h3>";
    
    $source_key = $_POST['source'] ?? 'main';
    $target_path = $_POST['path'] ?? 'test';
    
    echo "Source: {$source_key}<br>";
    echo "Target Path: {$target_path}<br>";
    echo "Files: <pre>" . print_r($_FILES, true) . "</pre>";
    
    $source_prefixed_path = $source_key . ($target_path ? '/' . ltrim($target_path, '/') : '');
    echo "Source prefixed path: {$source_prefixed_path}<br>";
    
    $path_info = validate_source_and_path($source_prefixed_path);
    if ($path_info) {
        echo "✅ Path validation passed<br>";
        echo "Target directory: {$path_info['absolute_path']}<br>";
        
        if (is_writable($path_info['absolute_path'])) {
            echo "✅ Directory is writable<br>";
            
            $file = $_FILES['test_file'];
            if ($file['error'] === UPLOAD_ERR_OK) {
                $filename = $file['name'];
                $temp_path = $file['tmp_name'];
                
                $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
                echo "File extension: {$extension}<br>";
                
                if (in_array($extension, ALLOWED_EXTENSIONS)) {
                    echo "✅ Extension allowed<br>";
                    
                    $safe_filename = preg_replace('/[^a-zA-Z0-9\._-]/', '_', $filename);
                    $destination = $path_info['absolute_path'] . DIRECTORY_SEPARATOR . $safe_filename;
                    
                    echo "Destination: {$destination}<br>";
                    
                    if (move_uploaded_file($temp_path, $destination)) {
                        echo "✅ File uploaded successfully!<br>";
                        echo "File size: " . filesize($destination) . " bytes<br>";
                    } else {
                        echo "❌ Failed to move uploaded file<br>";
                    }
                } else {
                    echo "❌ Extension not allowed<br>";
                }
            } else {
                echo "❌ Upload error: " . $file['error'] . "<br>";
            }
        } else {
            echo "❌ Directory not writable<br>";
        }
    } else {
        echo "❌ Path validation failed<br>";
    }
}

?>

<h2>Test Upload Form:</h2>
<form method="POST" enctype="multipart/form-data">
    <p>
        <label>Source:</label>
        <select name="source">
            <?php foreach (IMAGE_SOURCES as $key => $config): ?>
                <option value="<?php echo htmlspecialchars($key); ?>">
                    <?php echo htmlspecialchars($config['name'] ?? $key); ?>
                </option>
            <?php endforeach; ?>
        </select>
    </p>
    <p>
        <label>Target Path:</label>
        <input type="text" name="path" value="test" placeholder="Enter folder name">
    </p>
    <p>
        <label>Test File:</label>
        <input type="file" name="test_file" accept="image/*">
    </p>
    <p>
        <button type="submit">Test Upload</button>
    </p>
</form>

<style>
body { font-family: Arial, sans-serif; margin: 20px; }
form { background: #f5f5f5; padding: 20px; border-radius: 5px; }
label { display: inline-block; width: 120px; }
input, select { padding: 5px; margin: 5px 0; }
button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 3px; }
pre { background: #f0f0f0; padding: 10px; overflow: auto; }
</style> 