<?php
session_start();

// Check if logged in as admin
if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
    echo "Please log in as admin first. <a href='login.php'>Login</a>";
    exit;
}

echo "<h1>Jet API Test Page</h1>";
echo "<p>User: " . $_SESSION['username'] . " (Role: " . $_SESSION['user_role'] . ")</p>";

if ($_POST) {
    echo "<h2>Testing API Call...</h2>";
    
    $action = $_POST['action'] ?? '';
    $source_key = $_POST['source_key'] ?? '';
    $folder_path = $_POST['folder_path'] ?? '';
    
    echo "<p>Action: $action</p>";
    echo "<p>Source Key: $source_key</p>";
    echo "<p>Folder Path: $folder_path</p>";
    
    // Make internal API call
    $_POST['action'] = $action;
    if ($source_key) $_POST['source_key'] = $source_key;
    if ($folder_path) $_POST['folder_path'] = $folder_path;
    
    echo "<h3>API Response:</h3>";
    echo "<pre>";
    
    ob_start();
    try {
        include_once 'api.php';
    } catch (Exception $e) {
        echo "Exception: " . $e->getMessage();
    }
    $output = ob_get_clean();
    echo htmlspecialchars($output);
    
    echo "</pre>";
} else {
    echo "<h2>Test Jet Cache API</h2>";
    echo "<form method='POST'>";
    echo "<p>";
    echo "<label>Action:</label><br>";
    echo "<select name='action'>";
    echo "<option value='jet_queue_folder_cache'>jet_queue_folder_cache</option>";
    echo "<option value='jet_list_raw_folders_with_cache_stats'>jet_list_raw_folders_with_cache_stats</option>";
    echo "<option value='jet_get_cache_stats'>jet_get_cache_stats</option>";
    echo "</select>";
    echo "</p>";
    echo "<p>";
    echo "<label>Source Key:</label><br>";
    echo "<input type='text' name='source_key' value='my_raw_drive_g'>";
    echo "</p>";
    echo "<p>";
    echo "<label>Folder Path:</label><br>";
    echo "<input type='text' name='folder_path' value='250316_12A6CuJut'>";
    echo "</p>";
    echo "<button type='submit'>Test API</button>";
    echo "</form>";
}
?> 