// Admin Users Management
document.addEventListener('DOMContentLoaded', () => {
    const usersContainer = document.getElementById('admin-users-container');
    // Load initial users list when the page loads
    loadDesigners();

    // Add event listener for create user form
    const createUserForm = document.getElementById('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }
});

// Show create user form
function showCreateUserForm() {
    const container = document.getElementById('create-user-form-container');
    if (container) {
        container.style.display = 'block';
        // Focus on username field
        const usernameField = document.getElementById('username');
        if (usernameField) {
            usernameField.focus();
        }
    }
}

// Hide create user form
function hideCreateUserForm() {
    const container = document.getElementById('create-user-form-container');
    if (container) {
        container.style.display = 'none';
        // Clear form
        const form = document.getElementById('create-user-form');
        if (form) {
            form.reset();
        }
    }
}

async function loadDesigners() {
    try {
        const response = await fetch('api.php?action=jet_list_designers');
        const data = await response.json();
        
        if (data.success) {
            renderDesignersList(data.designers);
        } else {
            showFeedback(data.error || 'Lỗi khi tải danh sách designer', 'error');
        }
    } catch (error) {
        console.error('Failed to load designers:', error);
        showFeedback('Lỗi khi tải danh sách designer', 'error');
    }
}

function renderDesignersList(designers) {
    const container = document.getElementById('designers-list');
    if (!container) return;

    if (designers.length === 0) {
        container.innerHTML = '<p class="no-data">Chưa có designer nào được tạo.</p>';
        return;
    }

    const html = `
        <table class="admin-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tên đăng nhập</th>
                    <th>Ngày tạo</th>
                    <th>Đăng nhập cuối</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${designers.map(designer => `
                    <tr>
                        <td>${designer.id}</td>
                        <td>${escapeHtml(designer.username)}</td>
                        <td>${formatDate(designer.created_at)}</td>
                        <td>${designer.last_login ? formatDate(designer.last_login) : 'Chưa đăng nhập'}</td>
                        <td>
                            <button class="button small" onclick="window.viewDesignerStats(${designer.id})">Xem thống kê</button>
                            <button class="button small secondary" onclick="window.showChangePasswordModal(${designer.id}, '${escapeHtml(designer.username)}')">Đổi mật khẩu</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

async function handleCreateUser(event) {
    event.preventDefault();
    
    const form = event.target;
    const username = form.username.value.trim();
    const password = form.password.value;

    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch('api.php?action=jet_create_designer', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            showFeedback(data.message, 'success');
            form.reset();
            hideCreateUserForm();
            loadDesigners(); // Reload the list
        } else {
            showFeedback(data.error || 'Lỗi khi tạo tài khoản', 'error');
        }
    } catch (error) {
        console.error('Failed to create user:', error);
        showFeedback('Lỗi khi tạo tài khoản', 'error');
    }
}

async function viewDesignerStats(designerId) {
    try {
        const response = await fetch(`api.php?action=jet_get_designer_stats&designer_id=${designerId}`);
        const data = await response.json();
        
        if (data.success) {
            showDesignerStatsModal(data);
        } else {
            showFeedback(data.error || 'Lỗi khi tải thống kê', 'error');
        }
    } catch (error) {
        console.error('Failed to load designer stats:', error);
        showFeedback('Lỗi khi tải thống kê', 'error');
    }
}

function showDesignerStatsModal(stats) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    const picksByColor = stats.picks_by_color.reduce((acc, curr) => {
        acc[curr.pick_color] = curr.count;
        return acc;
    }, {});

    modal.innerHTML = `
        <div class="modal-box">
            <h3>Thống kê Designer</h3>
            <div class="stats-content">
                <p>Số album đã làm: ${stats.album_count}</p>
                <div class="picks-stats">
                    <h4>Lựa chọn theo màu:</h4>
                    <ul>
                        <li>Đỏ: ${picksByColor.red || 0}</li>
                        <li>Xanh lá: ${picksByColor.green || 0}</li>
                        <li>Xanh dương: ${picksByColor.blue || 0}</li>
                        <li>Xám: ${picksByColor.grey || 0}</li>
                    </ul>
                </div>
            </div>
            <button class="button" onclick="this.closest('.modal-overlay').remove()">Đóng</button>
        </div>
    `;

    document.body.appendChild(modal);
}

function showChangePasswordModal(userId, username) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
        <div class="modal-box">
            <h3>Đổi mật khẩu cho: ${username}</h3>
            <form id="change-password-form">
                <div class="form-group">
                    <label for="new-password">Mật khẩu mới:</label>
                    <input type="password" id="new-password" name="new_password" required 
                           minlength="6" 
                           title="Mật khẩu tối thiểu 6 ký tự">
                </div>
                <div class="form-group">
                    <label for="confirm-password">Xác nhận mật khẩu:</label>
                    <input type="password" id="confirm-password" name="confirm_password" required 
                           minlength="6" 
                           title="Xác nhận mật khẩu">
                </div>
                <div class="form-actions">
                    <button type="submit" class="button">Đổi mật khẩu</button>
                    <button type="button" class="button secondary" onclick="this.closest('.modal-overlay').remove()">Hủy</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Add form submit handler
    const form = modal.querySelector('#change-password-form');
    form.addEventListener('submit', (e) => handleChangePassword(e, userId, username));
}

async function handleChangePassword(event, userId, username) {
    event.preventDefault();
    
    const form = event.target;
    const newPassword = form.new_password.value;
    const confirmPassword = form.confirm_password.value;
    
    if (newPassword !== confirmPassword) {
        showFeedback('Mật khẩu xác nhận không khớp', 'error');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('new_password', newPassword);

        const response = await fetch('api.php?action=jet_change_user_password', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            showFeedback(data.message, 'success');
            form.closest('.modal-overlay').remove();
        } else {
            showFeedback(data.error || 'Lỗi khi đổi mật khẩu', 'error');
        }
    } catch (error) {
        console.error('Failed to change password:', error);
        showFeedback('Lỗi khi đổi mật khẩu', 'error');
    }
}

// Helper functions
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showFeedback(message, type = 'info') {
    const feedback = document.getElementById('admin-feedback');
    if (!feedback) {
        console.error('Admin feedback element not found');
        alert(message); // Fallback
        return;
    }

    feedback.textContent = message;
    feedback.className = `feedback-message ${type}`;
    feedback.style.display = 'block';

    setTimeout(() => {
        feedback.style.display = 'none';
    }, 3000);
}

// Make functions globally available
window.showCreateUserForm = showCreateUserForm;
window.hideCreateUserForm = hideCreateUserForm;
window.viewDesignerStats = viewDesignerStats;
window.showChangePasswordModal = showChangePasswordModal; 