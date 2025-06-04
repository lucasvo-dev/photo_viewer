<?php
require_once 'config.php'; // Defines constants like BASE_URL
require_once 'db_connect.php'; // Connects to DB, defines IMAGE_SOURCES
require_once 'api/helpers.php'; // For functions like validate_source_and_path

session_start();

// Basic security check - check if user is logged in
$is_logged_in = isset($_SESSION['user']);
$is_admin = $is_logged_in && $_SESSION['user'] === ADMIN_USER; 

// Determine initial view based on query parameters or default
$initial_view = 'directory'; // Default to directory view
$initial_folder_path = '';

if (isset($_GET['folder'])) {
    $initial_view = 'image';
    $initial_folder_path = trim($_GET['folder'], '/');
}

?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($config['app_title'] ?? 'Photo Gallery'); ?></title>
    <link rel="icon" type="image/png" href="theme/favicon.png"> <!-- Favicon -->

    <!-- Corrected PhotoSwipe 5 CSS CDN -->
    <link rel="stylesheet" href="https://unpkg.com/photoswipe@5/dist/photoswipe.css">
    <!-- Your custom styles -->
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body class="<?php echo $is_admin ? 'admin-logged-in' : ''; ?>">
    <header class="app-header">
        <div class="container header-container">
            <a href="index.php" class="logo-link" aria-label="Trang chủ">
                <img src="theme/logo.png" alt="Guustudio Logo" id="site-logo"> 
            </a>
            
            <!-- Unified Main Menu -->
            <nav class="header-nav">
                <div class="main-menu-toggle" id="main-menu-toggle">
                    <i class="fas fa-bars"></i>
                    <span class="menu-text">Menu</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="main-menu-dropdown" id="main-menu-dropdown">
                    <?php if (isset($_SESSION['user_role'])): ?>
                    <!-- User Info Section -->
                    <div class="menu-section">
                        <div class="menu-user-info">
                            <span class="menu-user-role-badge <?php echo htmlspecialchars($_SESSION['user_role']); ?>">
                                <?php echo ucfirst(htmlspecialchars($_SESSION['user_role'])); ?>
                            </span>
                            <span class="menu-user-name"><?php echo htmlspecialchars($_SESSION['username'] ?? 'User'); ?></span>
                        </div>
                    </div>
                    <?php endif; ?>

                    <!-- Navigation Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Điều hướng</div>
                        <a href="index.php" class="menu-item active">
                            <i class="fas fa-images"></i>
                            Thư viện Ảnh
                        </a>
                        <?php if (isset($_SESSION['user_role']) && ($_SESSION['user_role'] === 'admin' || $_SESSION['user_role'] === 'designer')): ?>
                        <a href="jet.php" class="menu-item">
                            <i class="fas fa-cut"></i>
                            Jet Culling Workspace
                        </a>
                        <?php endif; ?>
                    </div>

                    <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                    <!-- Admin Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Quản trị</div>
                        <a href="admin.php" class="menu-item">
                            <i class="fas fa-cog"></i>
                            Bảng điều khiển Admin
                        </a>
                        <a href="admin.php#jet-cache-tab" class="menu-item">
                            <i class="fas fa-database"></i>
                            Quản lý Cache RAW
                        </a>
                        <a href="admin.php#users-tab" class="menu-item">
                            <i class="fas fa-users"></i>
                            Quản lý Người dùng
                        </a>
                    </div>
                    <?php endif; ?>

                    <?php if (isset($_SESSION['user_role'])): ?>
                    <!-- User Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Tài khoản</div>
                        <a href="index.php?action=logout" class="menu-item danger">
                            <i class="fas fa-sign-out-alt"></i>
                            Đăng xuất
                        </a>
                    </div>
                    <?php else: ?>
                    <!-- Guest Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Tài khoản</div>
                        <a href="login.php" class="menu-item">
                            <i class="fas fa-sign-in-alt"></i>
                            Đăng nhập
                        </a>
                    </div>
                    <?php endif; ?>
                </div>
            </nav>
            
            <div class="header-actions">
                <button id="backButton" class="button back-button" style="display: none;">
                    <i class="fas fa-arrow-left"></i> Quay lại
                </button>
                
                <?php if (isset($_SESSION['user_role'])): ?>
                <div class="user-info-display">
                    <span class="user-role-badge <?php echo htmlspecialchars($_SESSION['user_role']); ?>">
                        <?php echo ucfirst(htmlspecialchars($_SESSION['user_role'])); ?>
                    </span>
                    <span class="user-text"><?php echo htmlspecialchars($_SESSION['username'] ?? 'User'); ?></span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </header>

    <main class="container user-view">
        <!-- Thêm loading indicator ở đây -->
        <div id="loading-indicator" style="display: none; text-align: center; padding: 20px;">
            <p>Đang tải...</p> 
            <!-- Bạn có thể thêm spinner CSS hoặc ảnh GIF ở đây nếu muốn -->
        </div>

        <div id="directory-view">
            <div class="search-container google-style">
                <input type="search" id="searchInput" placeholder="Tìm album ảnh" aria-label="Tìm kiếm album">
                <!-- Thêm nút clear search -->
                <button id="clearSearch" class="clear-search-button" style="display: none;" aria-label="Xóa tìm kiếm">&times;</button>
            </div>
            <p id="search-prompt" class="search-prompt">
                Nhập từ khóa để tìm album ảnh của bạn.
            </p>

            <ul id="directory-list" class="directory-list-styling">
                <!-- Search results -->
            </ul>
        </div>

        <div id="image-view" style="display: none;">
            <div class="image-view-header">
                <h2 id="current-directory-name"></h2>
                 <div class="image-view-actions">
                    <button id="toggleSelectModeButton" class="button select-mode-button">Chọn ảnh</button>
                    <button id="downloadSelectedButton" class="button download-selected-button download-selected-action-button" style="display: none;">Tải ảnh đã chọn (0)</button>
                    <button id="clearSelectionButton" class="button clear-selection-button" style="display: none;">Bỏ chọn tất cả</button>
                    <button id="shareButton" class="button share-button">Sao chép Link</button>
                    <a id="download-all-link" href="#" class="button download-all">Tải tất cả (ZIP)</a>
                 </div>
            </div>
            <div id="subfolder-display-area"></div>
            <div id="image-grid">
                <!-- Masonry items will go here -->
            </div>
            <div id="load-more-container" class="load-more-container-styling" style="display: none;">
                <!-- <button id="loadMoreBtn" class="button">Tải thêm ảnh</button> --> <!-- Button removed for infinite scroll -->
            </div>
        </div>
    </main>

    <!-- REMOVED old Preview Overlay -->
    <!-- PhotoSwipe requires no static HTML for its overlay -->

    <!-- Password Prompt -->
    <div id="passwordPromptOverlay" class="modal-overlay">
        <!-- Add modal-box and keep specific class -->
        <div class="modal-box password-prompt-box">
            <!-- Content generated by JS -->
        </div>
    </div>

    <footer class="app-footer">
        <div class="container footer-container">
            <p>&copy; 2025 <a href="https://guustudio.vn" target="_blank" rel="noopener noreferrer">Guustudio.vn</a> - Buôn Ma Thuột - Đắk Lắk</p>
             <p class="footer-contact">Liên hệ: 0914 896 870 | Email: guustudio.bmt@gmail.com</p> 
        </div>
    </footer>

    <!-- App JS (Load as module because it uses import) -->
    <!-- PhotoSwipe JS module will be imported *within* app.js -->
    <script type="module" src="js/app.js"></script> 

    <!-- Shared Menu Component -->
    <script src="js/shared-menu.js"></script>

    <!-- REPLACED: Zip Progress Section (Replaces old overlay) -->
    <!-- ZIP Progress Bar -->
    <div id="zip-progress-bar-container" class="zip-progress-bar-container" style="display: none;">
        <p class="zip-folder-info">Đang tạo ZIP: <span id="zip-folder-name-progress" class="zip-folder-name"></span></p>
        <progress id="zip-overall-progress" value="0" max="100"></progress>
        <p id="zip-progress-stats-text" class="zip-progress-stats">0/0 files (0%)</p>
        <!-- <button id="zip-progress-cancel-btn" class="zip-progress-cancel-btn" title="Hủy">×</button> -->
    </div>
    <!-- END ZIP Progress Bar -->

    <!-- Masonry.js Library -->
    <script src="https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js"></script>
    <!-- imagesLoaded Library (for Masonry) -->
    <script src="https://unpkg.com/imagesloaded@5/imagesloaded.pkgd.min.js"></script>

    <div id="loading-overlay">
        <div class="spinner"></div>
        <p>Đang tải...</p>
    </div>

    <div id="zip-jobs-panel-container" class="zip-jobs-panel-container">
        <h4><i class="fas fa-archive"></i> Tiến trình tạo ZIP</h4>
        <div id="zip-jobs-list">
            <!-- Job entries will be added here by JavaScript -->
        </div>
    </div>

    <script>
        // Define initial state for JavaScript
        const initialState = {
            view: '<?php echo $initial_view; ?>',
            folderPath: '<?php echo addslashes($initial_folder_path); ?>',
            isLoggedIn: <?php echo $is_logged_in ? 'true' : 'false'; ?>,
            isAdmin: <?php echo $is_admin ? 'true' : 'false'; ?>
        };
    </script>
    
    <!-- Corrected PhotoSwipe 5 JavaScript CDN -->
    <script src="https://unpkg.com/photoswipe@5/dist/umd/photoswipe.umd.min.js"></script>
    <script src="https://unpkg.com/photoswipe@5/dist/umd/photoswipe-lightbox.umd.min.js"></script>
    
    <!-- Your app scripts -->
    <script type="module" src="js/app.js"></script>
</body>
</html>