<?php
session_start();

// Kiểm tra đăng nhập designer hoặc admin
if (!isset($_SESSION['user_role']) || !in_array($_SESSION['user_role'], ['designer', 'admin'])) {
    header('Location: login.php?redirect=jet');
    exit;
}

// Lấy thông tin người dùng
$username = isset($_SESSION['username']) ? htmlspecialchars($_SESSION['username']) : 'User';

// Xử lý đăng xuất
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_unset();
    session_destroy();
    header('Location: login.php?redirect=jet');
    exit;
}

// Placeholder for RAW_IMAGE_SOURCES - this should ideally be loaded from config.php
// For now, this is just a reminder. The actual loading will be in API/init.
if (!defined('RAW_IMAGE_SOURCES')) {
    // This is a conceptual check. In a real scenario, config.php would define this.
    // For jet.php, we'd fetch data via API, which would have access to this constant.
}

?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jet - Photo Culling</title>
    <link rel="icon" type="image/png" href="theme/favicon.png"> <!-- Favicon -->
    <link rel="stylesheet" href="css/style.css">
    <!-- Potentially a dedicated CSS file for Jet later: <link rel="stylesheet" href="css/jet_style.css"> -->
</head>
<body class="jet-app-active">
    <div class="container jet-view"> <!-- Specific class for Jet view styling -->
        <div class="header">
            <h1>Jet - Photo Culling Workspace</h1>
            <div class="user-info">
                <span id="jet-user-info"><?php echo ($_SESSION['user_role'] === 'admin' ? 'Admin' : 'Designer') . ': ' . $username; ?></span>
                <!-- Add Update Cache button for Admin -->
                <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                    <button id="jet-update-cache-button" class="button">Update Cache</button>
                <?php endif; ?>
                <a href="jet.php?action=logout" class="button logout-link">Đăng xuất</a>
            </div>
        </div>

        <div id="jet-app-container">
            <!-- Main culling interface will be rendered here by JavaScript -->
            <p>Loading Jet Culling App...</p>
        </div>

        <div id="jet-loading-indicator" class="loading-indicator" style="display: none;">Đang xử lý...</div>
        <div id="jet-feedback" class="feedback-message" style="display: none;"></div>

    </div>

    <script>
        // Pass PHP defined constants or configurations to JavaScript if needed
        // For example, if RAW_IMAGE_SOURCES keys were needed directly by JS (though API is better)
        // const RAW_SOURCES_CONFIG = <?php echo json_encode(defined('RAW_IMAGE_SOURCES') ? RAW_IMAGE_SOURCES : []); ?>;
    </script>
    <script type="module" src="js/jet_app.js"></script>
</body>
</html> 