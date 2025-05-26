<?php
session_start(); // Luôn bắt đầu session

// --- KIỂM TRA ĐĂNG NHẬP ---
if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
    header('Location: login.php'); // Chưa đăng nhập hoặc không phải admin, chuyển về trang login
    exit;
}

// --- XỬ LÝ ĐĂNG XUẤT ---
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    session_unset();   // Xóa tất cả biến session
    session_destroy(); // Hủy session hoàn toàn
    header('Location: login.php'); // Chuyển về trang login
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
    <title>Admin - Trang Quản Trị</title>
    <link rel="icon" type="image/png" href="theme/favicon.png"> <!-- Favicon -->
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/admin_tabs.css">
    <link rel="stylesheet" href="css/admin_jet.css">
</head>
<body>
    <div class="container admin-view">
        <div class="header">
            <h1>Trang Quản Trị</h1>
            <a href="admin.php?action=logout" class="button logout-link">Đăng xuất (<?php echo $admin_username; ?>)</a>
        </div>

        <!-- Admin Tabs -->
        <div class="admin-tabs">
            <button class="admin-tab active" data-tab="gallery">Quản lý Gallery & Cache</button>
            <button class="admin-tab" data-tab="jet-cache">Quản lý Cache RAW</button>
            <button class="admin-tab" data-tab="jet-admin">Dashboard Jet Admin</button>
        </div>

        <!-- Cache Count Display REMOVED -->
        <!-- 
        <div class="cache-stats-display">
            Tổng số ảnh cache đã tạo: <strong id="total-cache-count">...</strong>
        </div> 
        -->

        <!-- Global Feedback -->
        <div id="admin-feedback" class="feedback-message" style="display: none;"></div>

        <!-- Gallery & Cache Management Tab -->
        <div class="admin-tab-content active" id="gallery-tab">
            <div class="tab-header">
                <h2>Quản lý Gallery & Cache</h2>
                <p>Quản lý mật khẩu, xem lượt truy cập, lấy link chia sẻ và cache cho các thư mục ảnh.</p>
            </div>

            <!-- Search Bar for Admin - Styled like homepage -->
            <div class="search-container admin-search">
                <input type="search" id="adminSearchInput" placeholder="Tìm thư mục..." aria-label="Tìm kiếm thư mục">
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
                        <th>Link chia sẻ (Click để chọn)</th>
                        <th>Hành động Mật khẩu</th>
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
            </div>

            <!-- Search Bar for RAW Sources -->
            <div class="search-container admin-search">
                <input type="search" id="rawSourceSearchInput" placeholder="Tìm nguồn RAW..." aria-label="Tìm kiếm nguồn RAW">
            </div>

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
                    <tr><td colspan="4">Đang tải danh sách thư mục...</td></tr>
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

        <!-- Jet Admin Dashboard Tab -->
        <div class="admin-tab-content" id="jet-admin-tab">
            <div class="tab-header">
                <h2>Dashboard Jet Admin</h2>
                <p>Quản lý tài khoản designer và giám sát hoạt động Jet Culling Workspace.</p>
            </div>

            <div class="admin-section">
                <h3>Jet Culling Workspace</h3>
                <p>Truy cập không gian làm việc để lọc và chọn ảnh RAW.</p>
                <a href="jet.php" class="button" target="_blank">Mở Jet Workspace</a>
            </div>

            <div class="admin-section">
                <h3>Tổng quan Jet Culling</h3>
                <div id="jet-overview-container">
                    <!-- Jet overview will be loaded here -->
                </div>
            </div>

            <div class="admin-section">
                <h3>Quản lý Designer</h3>
                <div class="admin-actions">
                    <button class="button" onclick="showCreateUserForm()">Tạo Designer mới</button>
                </div>
                
                <div id="create-user-form-container" style="display: none;">
                    <form id="create-user-form" class="admin-form">
                        <div class="form-group">
                            <label for="username">Tên đăng nhập:</label>
                            <input type="text" id="username" name="username" required 
                                   pattern="[a-zA-Z0-9_]{3,20}" 
                                   title="Tên đăng nhập từ 3-20 ký tự, chỉ bao gồm chữ cái, số và dấu gạch dưới">
                        </div>
                        <div class="form-group">
                            <label for="password">Mật khẩu:</label>
                            <input type="password" id="password" name="password" required 
                                   minlength="6" 
                                   title="Mật khẩu tối thiểu 6 ký tự">
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="button">Tạo tài khoản</button>
                            <button type="button" class="button secondary" onclick="hideCreateUserForm()">Hủy</button>
                        </div>
                    </form>
                </div>

                <div id="designers-list" class="admin-table-container">
                    <!-- Danh sách designer sẽ được load động -->
                </div>
            </div>
        </div>

    </div>

    <script type="module" src="js/admin.js"></script>
    <script src="js/admin_users.js"></script>
    <script src="js/admin_tabs.js"></script>
    <script src="js/admin_jet_overview.js"></script>
    <script src="js/admin_jet_cache.js"></script>
</body>
</html>