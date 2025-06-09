<?php
session_start(); // Luôn bắt đầu session ở đầu file cần dùng session
require_once 'db_connect.php';

// Load central configuration
$config = require_once __DIR__ . '/config.php';
if (!$config) {
    error_log("CRITICAL CONFIG ERROR: Failed to load config.php in login.php");
    // Show generic error, dont reveal config issues
    $error_message = 'Lỗi cấu hình server.';
    $admin_username = 'admin'; // Fallback
    $admin_password_hash = null;
} else {
    $admin_username = $config['admin_username'] ?? 'admin'; // Use from config, fallback
    $admin_password_hash = $config['admin_password_hash'] ?? null;
}

// --- CẤU HÌNH ADMIN (REMOVED - Loaded from config.php) ---
// define('ADMIN_USERNAME', 'admin'); 
// define('ADMIN_PASSWORD_HASH', '...'); 

$error = '';
$username = '';

// Check if config loaded properly
if (isset($error_message)) {
    $error = $error_message;
}

// Nếu đã đăng nhập, chuyển hướng dựa trên role
if (isset($_SESSION['user_role'])) {
    if ($_SESSION['user_role'] === 'admin') {
        header('Location: admin.php');
    } else {
        header('Location: jet.php');
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    $redirect = $_GET['redirect'] ?? 'admin';



    if (empty($username) || empty($password)) {
        $error = 'Vui lòng nhập tên đăng nhập và mật khẩu.';
    } else {
        try {
            // Kiểm tra admin mặc định từ config
            if ($username === $admin_username && $admin_password_hash && password_verify($password, $admin_password_hash)) {
                // Tạo hoặc cập nhật admin trong database
                $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? AND role = 'admin'");
                $stmt->execute([$username]);
                $admin = $stmt->fetch();

                if (!$admin) {
                    // Tạo admin mới nếu chưa tồn tại
                    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')");
                    $stmt->execute([$username, $admin_password_hash]);
                    $admin_id = $pdo->lastInsertId();
                } else {
                    $admin_id = $admin['id'];
                }

                // Đăng nhập thành công
                $_SESSION['user_id'] = $admin_id;
                $_SESSION['username'] = $username;
                $_SESSION['user_role'] = 'admin';

                // Cập nhật last_login
                $stmt = $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
                $stmt->execute([$admin_id]);

                header('Location: admin.php');
                exit;
            }

            // Kiểm tra user trong database
            $stmt = $pdo->prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?");
            $stmt->execute([$username]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password_hash'])) {
                // Đăng nhập thành công
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['user_role'] = $user['role'];

                // Cập nhật last_login
                $stmt = $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
                $stmt->execute([$user['id']]);

                // Điều hướng dựa trên role và redirect
                if ($user['role'] === 'admin') {
                    header('Location: admin.php');
                } else {
                    header('Location: jet.php');
                }
                exit;
            } else {
                $error = 'Tên đăng nhập hoặc mật khẩu không đúng.';
            }
        } catch (PDOException $e) {
            error_log("Login error: " . $e->getMessage());
            $error = 'Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại sau.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đăng nhập - <?php echo htmlspecialchars($config['app_title'] ?? 'Thư viện Ảnh'); ?></title>
    <link rel="icon" type="image/png" href="theme/favicon.png"> <!-- Favicon -->
    <link rel="stylesheet" href="css/style.css"> <style>
        /* CSS riêng cho trang login */
        html, body { height: 100%; } /* Đảm bảo body chiếm toàn bộ chiều cao */
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #0d1117; /* Nền tối giống theme */
            color: #e6edf3;
        }
        .login-container {
            background: #161b22; /* Nền tối hơn cho box */
            padding: 35px 40px;
            border-radius: 8px;
            border: 1px solid #30363d;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            text-align: center;
            width: 100%;
            max-width: 360px; /* Giới hạn chiều rộng */
        }
        .login-container h2 {
             margin-top: 0; margin-bottom: 25px; color: #f0f6fc; font-size: 1.6em;
        }
        .login-container label {
             display: block; text-align: left; margin-bottom: 8px; font-weight: 500; color: #c9d1d9; font-size: 0.9em;
        }
        .login-container input[type="text"],
        .login-container input[type="password"] {
            width: 100%;
            padding: 10px 12px;
            margin-bottom: 20px;
            border: 1px solid #30363d;
            border-radius: 6px;
            background-color: #0d1117; /* Nền input tối */
            color: #e6edf3; /* Chữ trong input */
            font-size: 1em;
            box-sizing: border-box;
        }
         .login-container input:focus {
             outline: none;
             border-color: #58a6ff;
             box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
         }
        .login-container button { width: 100%; padding: 11px; font-size: 1.1em; background-color: #238636; border-color: #2ea043;}
        .login-container button:hover { background-color: #2ea043; border-color: #3fb950;}
        .error { color: #f85149; margin-top: -10px; margin-bottom: 15px; font-size: 0.9em; text-align: center; }
    </style>
</head>
<body class="login-view">
    <div class="container">
        <div class="login-container">
            <h1>Đăng nhập</h1>
            <?php if ($error): ?>
                <div class="error-message"><?php echo htmlspecialchars($error); ?></div>
            <?php endif; ?>
            <form method="POST" action="login.php<?php echo isset($_GET['redirect']) ? '?redirect=' . htmlspecialchars($_GET['redirect']) : ''; ?>">
                <div class="form-group">
                    <label for="username">Tên đăng nhập:</label>
                    <input type="text" id="username" name="username" value="<?php echo htmlspecialchars($username); ?>" required>
                </div>
                <div class="form-group">
                    <label for="password">Mật khẩu:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="button">Đăng nhập</button>
            </form>
        </div>
    </div>

    <!-- Professional loading overlay -->
    <div id="loading-overlay" style="display: none;">
        <div class="loading-content">
            <div class="spinner-container">
                <div class="spinner"></div>
            </div>
            <p class="loading-text">Đang xác thực</p>
            <p class="loading-subtext">Vui lòng chờ trong giây lát...</p>
        </div>
    </div>

    <script>
        // Show loading when form is submitted
        document.querySelector('form').addEventListener('submit', function() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.add('overlay-visible');
                document.body.classList.add('loading-active');
            }
        });
    </script>
</body>
</html>