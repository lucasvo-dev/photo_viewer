<?php
session_start(); // Luôn bắt đầu session
require_once 'db_connect.php';

// --- KIỂM TRA ĐĂNG NHẬP ---
if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
    header('Location: login.php?redirect=admin'); // Chỉ admin mới được truy cập
    exit;
}

// --- XỬ LÝ ĐĂNG XUẤT ---
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_unset();   // Xóa tất cả biến session
    session_destroy(); // Hủy session hoàn toàn
    header('Location: login.php?redirect=admin'); // Chuyển về trang login
    exit;
}

// Lấy tên admin từ session để hiển thị (nếu có)
$admin_username = isset($_SESSION['username']) ? htmlspecialchars($_SESSION['username']) : 'Admin';

?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - Thư viện Ảnh</title>
    <link rel="icon" type="image/png" href="theme/favicon.png"> <!-- Favicon -->
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/admin_tabs.css">
    <link rel="stylesheet" href="css/admin.css">
    <link rel="stylesheet" href="css/admin_file_manager.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body class="admin-panel-active">
    <header class="app-header">
        <div class="container header-container">
            <a href="index.php" class="logo-link" aria-label="Quay về Thư viện chính">
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
                            <span class="menu-user-name"><?php echo htmlspecialchars($admin_username); ?></span>
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
                        <a href="jet.php" class="menu-item">
                            <i class="fas fa-filter"></i>
                            Jet Culling
                        </a>
                        <?php endif; ?>
                    </div>

                    <?php if (isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin'): ?>
                    <!-- Admin Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Quản trị</div>
                        <a href="admin.php" class="menu-item active">
                            <i class="fas fa-cog"></i>
                            Bảng điều khiển Admin
                        </a>
                    </div>
                    <?php endif; ?>

                    <?php if (isset($_SESSION['user_role'])): ?>
                    <!-- User Section -->
                    <div class="menu-section">
                        <div class="menu-section-title">Tài khoản</div>
                        <a href="admin.php?action=logout" class="menu-item danger">
                            <i class="fas fa-sign-out-alt"></i>
                            Đăng xuất
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
                    <span class="user-text"><?php echo htmlspecialchars($admin_username); ?></span>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </header>

    <main class="container admin-view">
        <div class="admin-header">
            <h1><i class="fas fa-cog"></i> Bảng điều khiển Admin</h1>
            <p>Quản lý hệ thống thư viện ảnh và Jet Culling Workspace</p>
        </div>

        <!-- Tab Navigation -->
        <div class="admin-tabs">
            <button class="admin-tab-button active" data-tab="file-manager-tab">
                <i class="fas fa-folder-open"></i> File Manager
            </button>
            <button class="admin-tab-button" data-tab="gallery-tab">
                <i class="fas fa-images"></i> Gallery & Cache
            </button>
            <button class="admin-tab-button" data-tab="jet-cache-tab">
                <i class="fas fa-database"></i> RAW Cache
            </button>
            <button class="admin-tab-button" data-tab="users-tab">
                <i class="fas fa-users"></i> Người dùng
            </button>
        </div>

        <!-- Global Feedback -->
        <div id="admin-feedback" class="feedback-message" style="display: none;"></div>

        <!-- File Manager Tab -->
        <div class="admin-tab-content active" id="file-manager-tab">
            <div class="tab-header">
                <h2>Quản lý File & Thư mục</h2>
                <p>Upload, tạo, sửa, xóa ảnh và thư mục trong các nguồn ảnh của hệ thống.</p>
            </div>

            <div class="file-manager-container">
                <!-- Source Selection -->
                <div class="fm-source-selection">
                    <label for="fm-source-select">Nguồn ảnh:</label>
                    <select id="fm-source-select" class="fm-source-select">
                        <option value="">-- Chọn nguồn ảnh --</option>
                    </select>
                </div>

                <!-- Action Buttons -->
                <div class="fm-actions">
                    <button id="fm-upload-btn" class="button primary" disabled>
                        <i class="fas fa-upload"></i> Upload Files
                    </button>
                    <button id="fm-create-folder-btn" class="button" disabled>
                        <i class="fas fa-folder-plus"></i> Tạo Thư mục
                    </button>
                    <button id="fm-refresh-btn" class="button">
                        <i class="fas fa-sync"></i> Làm mới
                    </button>
                </div>

                <!-- Breadcrumb Navigation -->
                <div id="fm-breadcrumb" class="fm-breadcrumb">
                    <span class="breadcrumb-item" data-path="">
                        <i class="fas fa-home"></i> Root
                    </span>
                </div>

                <!-- Loading Indicator -->
                <div id="fm-loading" class="fm-loading">
                    Đang tải danh sách...
                </div>

                <!-- File Browser Content -->
                <div id="file-manager-content" class="fm-content">
                    <div class="fm-message fm-message-info">
                        <i class="fas fa-info-circle"></i>
                        <p>Chọn một nguồn ảnh để bắt đầu quản lý file và thư mục.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Gallery & Cache Management Tab -->
        <div class="admin-tab-content" id="gallery-tab">
            <div class="tab-header">
                <h2>Quản lý Gallery & Cache</h2>
                <p>Quản lý mật khẩu, xem lượt truy cập, lấy link chia sẻ và cache cho các thư mục ảnh.</p>
                <div class="tab-actions">
                    <button id="refresh-gallery-data" class="button">🔄 Làm mới & Đồng bộ</button>
                </div>
            </div>

            <!-- Search and Sort Controls -->
            <div class="admin-controls">
                <div class="search-container admin-search">
                    <input type="search" id="adminSearchInput" placeholder="Tìm thư mục..." aria-label="Tìm kiếm thư mục">
                </div>
                
                <div class="sort-container admin-sort">
                    <label for="adminSortSelect">Sắp xếp:</label>
                    <select id="adminSortSelect" aria-label="Cách sắp xếp thư mục">
                        <option value="cache_priority">Ưu tiên Cache (Chưa cache → Mới nhất)</option>
                        <option value="newest">Thư mục mới nhất</option>
                        <option value="name">Tên thư mục (A-Z)</option>
                    </select>
                </div>
            </div>
            
            <!-- Optional prompt for admin search -->
            <p id="admin-search-prompt" class="search-prompt admin-prompt" style="display: none; font-size: 0.85em; margin-top: 8px;">
                Nhập tên thư mục để lọc danh sách.
            </p>

            <div id="admin-message" class="message" style="display: none;"></div>

            <table>
                <thead>
                    <tr>
                        <th>Tên thư mục</th>
                        <th>Trạng thái</th>
                        <th>Lượt xem</th>
                        <th>Lượt tải ZIP</th>
                        <th>Link chia sẻ</th>
                        <th>Quản lý Mật khẩu</th>
                        <th>Trạng thái Cache</th>
                        <th>Hành động Cache</th>
                    </tr>
                </thead>
                <tbody id="folder-list-body">
                    <tr><td colspan="8">Đang tải danh sách thư mục...</td></tr>
                </tbody>
            </table>

            <div id="admin-loading" class="loading-indicator" style="display: none;">Đang tải...</div>
        </div>



        <!-- RAW Cache Management Tab -->
        <div class="admin-tab-content" id="jet-cache-tab">
            <div class="tab-header">
                <h2>Quản lý Cache RAW</h2>
                <p>Quản lý cache cho ảnh RAW trong Jet app. Cache được tạo với chiều cao cố định 750px.</p>
                <div class="tab-actions">
                    <button id="refresh-jet-cache-data" class="button">🔄 Làm mới & Đồng bộ</button>
                </div>
            </div>

            <!-- Search Bar for RAW Sources -->
            <div class="search-container admin-search">
                <input type="search" id="rawSourceSearchInput" placeholder="Tìm nguồn RAW..." aria-label="Tìm kiếm nguồn RAW">
                <button id="clearRawSearch" class="clear-search-button" style="display: none;" aria-label="Xóa tìm kiếm">&times;</button>
            </div>
            <p id="raw-search-prompt" class="search-prompt admin-prompt" style="display: none; font-size: 0.85em; margin-top: 8px;">
                Nhập tên nguồn hoặc thư mục để lọc danh sách.
            </p>

            <div id="raw-cache-message" class="message" style="display: none;"></div>

            <!-- RAW Cache Statistics -->
            <div class="admin-section">
                <div class="cache-stats-grid">
                    <div class="cache-stat-item">
                        <span class="stat-label">Đang chờ:</span>
                        <span class="stat-value" id="pending-jobs">...</span>
                    </div>
                    <div class="cache-stat-item">
                        <span class="stat-label">Đang xử lý:</span>
                        <span class="stat-value" id="processing-jobs">...</span>
                    </div>
                    <div class="cache-stat-item">
                        <span class="stat-label">Hoàn thành:</span>
                        <span class="stat-value" id="completed-jobs">...</span>
                    </div>
                    <div class="cache-stat-item">
                        <span class="stat-label">Lỗi:</span>
                        <span class="stat-value" id="failed-jobs">...</span>
                    </div>
                </div>
            </div>

            <!-- RAW Sources Table -->
            <table>
                <thead>
                    <tr>
                        <th>Nguồn RAW</th>
                        <th>Số file RAW</th>
                        <th>Trạng thái Cache</th>
                        <th>Hành động Cache</th>
                    </tr>
                </thead>
                <tbody id="raw-sources-list-body">
                    <tr><td colspan="4">
                        <div class="loading-placeholder">
                            <i class="fas fa-spinner"></i>
                            <p class="loading-placeholder-text">Đang tải danh sách thư mục</p>
                        </div>
                    </td></tr>
                </tbody>
            </table>

            <!-- Failed Jobs Section -->
            <div class="admin-section" id="failed-jobs-section" style="display: none;">
                <h3>Công việc lỗi gần đây</h3>
                <div id="failed-jobs-container">
                    <button id="clear-failed-jobs" class="button button-danger">Xóa tất cả công việc lỗi</button>
                </div>
            </div>

            <div id="raw-cache-loading" class="loading-indicator" style="display: none;">Đang tải...</div>
        </div>

        <!-- Users Management Tab -->
        <div class="admin-tab-content" id="users-tab">
            <div class="tab-header">
                <h2><i class="fas fa-users"></i> Quản lý Người dùng</h2>
                <p>Quản lý tài khoản admin và designer trong hệ thống.</p>
            </div>

            <div class="admin-section">
                <h3><i class="fas fa-user-plus"></i> Tạo tài khoản mới</h3>
                <div class="admin-actions">
                    <button class="button primary" onclick="showCreateUserForm()">
                        <i class="fas fa-palette"></i> Tạo Designer mới
                    </button>
                    <button class="button secondary" onclick="showCreateAdminForm()">
                        <i class="fas fa-user-shield"></i> Tạo Admin mới
                    </button>
                </div>
                
                <div id="create-user-form-container" style="display: none;">
                    <form id="create-user-form" class="admin-form">
                        <div class="form-group">
                            <label for="username"><i class="fas fa-user"></i> Tên đăng nhập:</label>
                            <input type="text" id="username" name="username" required 
                                   pattern="[a-zA-Z0-9_]{3,20}" 
                                   title="Tên đăng nhập từ 3-20 ký tự, chỉ bao gồm chữ cái, số và dấu gạch dưới"
                                   placeholder="Nhập tên đăng nhập...">
                        </div>
                        <div class="form-group">
                            <label for="password"><i class="fas fa-lock"></i> Mật khẩu:</label>
                            <input type="password" id="password" name="password" required 
                                   minlength="6" 
                                   title="Mật khẩu tối thiểu 6 ký tự"
                                   placeholder="Nhập mật khẩu...">
                        </div>
                        <div class="form-group">
                            <label for="user-role-select"><i class="fas fa-shield-alt"></i> Vai trò:</label>
                            <select id="user-role-select" name="role" required>
                                <option value="designer">Designer</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="button primary">
                                <i class="fas fa-save"></i> Tạo tài khoản
                            </button>
                            <button type="button" class="button secondary" onclick="hideCreateUserForm()">
                                <i class="fas fa-times"></i> Hủy
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="admin-section">
                <h3><i class="fas fa-list"></i> Danh sách Người dùng</h3>
                <div class="admin-actions">
                    <button id="refresh-users-button" class="button secondary">
                        <i class="fas fa-sync"></i> Làm mới danh sách
                    </button>
                </div>
                
                <table id="users-management-table">
                    <thead>
                        <tr>
                            <th><i class="fas fa-user"></i> Tên đăng nhập</th>
                            <th><i class="fas fa-shield-alt"></i> Vai trò</th>
                            <th><i class="fas fa-calendar-plus"></i> Ngày tạo</th>
                            <th><i class="fas fa-clock"></i> Lần đăng nhập cuối</th>
                            <th><i class="fas fa-chart-bar"></i> Hoạt động Jet</th>
                            <th><i class="fas fa-cogs"></i> Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body">
                        <tr><td colspan="6">
                            <div class="loading-placeholder">
                                <i class="fas fa-spinner"></i>
                                <p class="loading-placeholder-text">Đang tải danh sách người dùng</p>
                            </div>
                        </td></tr>
                    </tbody>
                </table>
            </div>

            <!-- User form modal placeholder -->
            <div id="user-form-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h3 id="user-form-title">Chỉnh sửa người dùng</h3>
                    <form id="user-form">
                        <div class="form-group">
                            <label for="user-username">Tên đăng nhập:</label>
                            <input type="text" id="user-username" name="username" required>
                        </div>
                        <div class="form-group">
                            <label for="user-password">Mật khẩu mới (để trống nếu không đổi):</label>
                            <input type="password" id="user-password" name="password">
                        </div>
                        <div class="form-group">
                            <label for="user-role">Vai trò:</label>
                            <select id="user-role" name="role" required>
                                <option value="designer">Designer</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="button">Lưu</button>
                            <button type="button" class="button secondary" onclick="closeUserModal()">Hủy</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

    </main>

    <!-- Professional loading overlay -->
    <div id="loading-overlay" style="display: none;">
        <div class="loading-content">
            <div class="spinner-container">
                <div class="spinner"></div>
            </div>
            <p class="loading-text">Đang tải dữ liệu</p>
            <p class="loading-subtext">Vui lòng chờ trong giây lát...</p>
        </div>
    </div>

    <!-- Shared Menu Component -->
    <script src="js/shared-menu.js"></script>

    <script src="js/admin.js"></script>
    <script src="js/admin_users.js"></script>
    <script src="js/admin_tabs.js"></script>
    <script src="js/admin_jet_cache.js"></script>
    <script src="js/admin_file_manager.js"></script>
    
    <!-- Logo click handler for Admin -->
    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const logoLink = document.querySelector('.logo-link');
        if (logoLink) {
            logoLink.addEventListener('click', (e) => {
                console.log('[Admin] Logo clicked, redirecting to gallery with force reload');
                // Force navigation to index.php để đảm bảo reset hoàn toàn
                // Không cần preventDefault vì href sẽ handle redirect
                // Nhưng chúng ta có thể force reload nếu cần
                window.location.href = 'index.php';
            });
            console.log('[Admin] Logo click handler added successfully');
        }
    });
    </script>
</body>
</html>