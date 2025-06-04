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
    <title>Jet - Photo Culling Workspace</title>
    <link rel="icon" type="image/png" href="theme/favicon.png">
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/jet.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body class="jet-app-active">
    <header class="app-header">
        <div class="container header-container">
            <a href="jet.php" class="logo-link" aria-label="Quay về Jet Culling Workspace">
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
                        <a href="index.php" class="menu-item">
                            <i class="fas fa-images"></i>
                            Thư viện Ảnh
                        </a>
                        <?php if (isset($_SESSION['user_role']) && ($_SESSION['user_role'] === 'admin' || $_SESSION['user_role'] === 'designer')): ?>
                        <a href="jet.php" class="menu-item active">
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
                        <a href="jet.php?action=logout" class="menu-item danger">
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

    <main class="container jet-view">
        <div class="jet-main-header">
            <h1><i class="fas fa-cut"></i> Jet - Photo Culling Workspace</h1>
            <div class="jet-stats-info" id="jet-stats-info" style="display: none;">
                <span class="stats-item">
                    <i class="fas fa-images"></i>
                    <span id="total-images-count">0</span> ảnh
                </span>
                <span class="stats-item">
                    <i class="fas fa-filter"></i>
                    <span id="filtered-images-count">0</span> hiển thị
                </span>
            </div>
        </div>

        <!-- Loading indicator ở đầu -->
        <div id="loading-indicator" style="display: none; text-align: center; padding: 20px;">
            <div class="spinner"></div>
            <p>Đang tải...</p>
        </div>

        <div id="jet-app-container">
            <div id="jet-header-area">
                <div id="jet-breadcrumb" class="jet-breadcrumb"></div>

                <div id="jet-controls">
                    <!-- Compact Controls Section -->
                    <div id="jet-main-controls" class="jet-main-controls" style="display: none;">
                        <div class="controls-grid">
                            <!-- Filter Section -->
                            <div class="filter-section">
                                <div class="section-header">
                                    <h3><i class="fas fa-filter"></i> Lọc ảnh</h3>
                                </div>
                                <div class="filter-buttons">
                                    <div class="filter-main-group">
                                        <button class="jet-filter-button active" id="filter-all">
                                            <i class="fas fa-th"></i> Tất cả
                                        </button>
                                        <button class="jet-filter-button" id="filter-picked-any">
                                            <i class="fas fa-check"></i> Đã chọn
                                        </button>
                                        <button class="jet-filter-button" id="filter-not-picked">
                                            <i class="fas fa-minus"></i> Chưa chọn
                                        </button>
                                    </div>
                                    <div class="filter-color-group">
                                        <span class="filter-label">Màu:</span>
                                        <button class="jet-filter-button color-filter" data-color="red" title="Màu đỏ">
                                            <i class="fas fa-circle"></i>
                                        </button>
                                        <button class="jet-filter-button color-filter" data-color="green" title="Màu xanh lá">
                                            <i class="fas fa-circle"></i>
                                        </button>
                                        <button class="jet-filter-button color-filter" data-color="blue" title="Màu xanh dương">
                                            <i class="fas fa-circle"></i>
                                        </button>
                                        <button class="jet-filter-button color-filter" data-color="grey" title="Màu xám">
                                            <i class="fas fa-circle"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Actions Section -->
                            <div class="actions-section">
                                <div class="action-row sort-row">
                                    <label for="sort-order">
                                        <i class="fas fa-sort"></i> Sắp xếp:
                                    </label>
                                    <select id="sort-order" class="jet-sort-select">
                                        <option value="default">Mặc định</option>
                                        <option value="name-asc">Tên A-Z</option>
                                        <option value="name-desc">Tên Z-A</option>
                                        <option value="date-desc">Mới nhất</option>
                                        <option value="date-asc">Cũ nhất</option>
                                    </select>
                                </div>
                                <div class="action-row download-row" style="display: none;">
                                    <button class="jet-download-button" id="zip-filtered-images" title="Tải ZIP những ảnh đã lọc">
                                        <i class="fas fa-download"></i>
                                        <span class="download-text">Tải ZIP</span>
                                        <span class="download-count">(<span id="zip-count">0</span>)</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Legacy support - hidden containers -->
                    <div id="jet-filter-controls" style="display: none;"></div>
                    <div id="jet-action-controls" style="display: none;"></div>
                </div>
            </div>

            <!-- Subfolder display area - similar to gallery app -->
            <div id="jet-subfolder-display-area" style="display: none;"></div>
            
            <!-- Main image grid container -->
            <div id="jet-item-list-container">
                <!-- Content will be loaded here -->
                <div class="jet-welcome-message" id="jet-welcome-message">
                    <div class="welcome-content">
                        <i class="fas fa-folder-open"></i>
                        <h2>Chào mừng đến với Jet Culling Workspace</h2>
                        <p>Chọn một thư mục RAW để bắt đầu lọc và chọn ảnh của bạn.</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="jet-feedback" class="feedback-message" style="display: none;"></div>
    </main>

    <!-- ZIP Jobs Panel -->
    <div id="zip-jobs-panel-container" class="zip-jobs-panel-container">
        <h4><i class="fas fa-archive"></i> Tiến trình tạo ZIP</h4>
        <div id="zip-jobs-list"></div>
    </div>

    <!-- Loading overlay -->
    <div id="loading-overlay" style="display: none;">
        <div class="spinner"></div>
        <p>Đang xử lý...</p>
    </div>

    <footer class="app-footer">
        <div class="container footer-container">
            <p>&copy; 2025 <a href="https://guustudio.vn" target="_blank" rel="noopener noreferrer">Guustudio.vn</a> - Buôn Ma Thuột - Đắk Lắk</p>
            <p class="footer-contact">Liên hệ: 0914 896 870 | Email: guustudio.bmt@gmail.com</p> 
        </div>
    </footer>

    <!-- Shared Menu Component -->
    <script src="js/shared-menu.js"></script>

    <script type="module" src="js/jet_app.js"></script>
    
    <!-- Override logo click behavior for Jet app -->
    <script>
    document.addEventListener('DOMContentLoaded', () => {
        // Override logo click to properly redirect to jet.php
        const logoLink = document.querySelector('.logo-link');
        if (logoLink) {
            logoLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Simply redirect to jet.php to reload the app
                window.location.href = 'jet.php';
            });
            console.log('[Jet] Logo click handler overridden');
        }
    });
    </script>
</body>
</html> 