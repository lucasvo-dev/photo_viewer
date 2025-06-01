// Admin Users Management
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Admin Users] DOM loaded, initializing...');
    
    // Check if we're on the admin page
    const isAdminPage = document.body.classList.contains('admin-panel-active') || 
                       window.location.pathname.includes('admin.php');
    console.log('[Admin Users] Is admin page:', isAdminPage);
    
    if (!isAdminPage) {
        console.log('[Admin Users] Not on admin page, skipping initialization');
        return;
    }
    
    // Load initial users list when the page loads
    loadAllUsers();

    // Add event listener for create user form
    const createUserForm = document.getElementById('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
        console.log('[Admin Users] Create user form listener added');
    } else {
        console.warn('[Admin Users] Create user form not found');
    }

    // Add event listener for refresh button
    const refreshButton = document.getElementById('refresh-users-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', loadAllUsers);
        console.log('[Admin Users] Refresh button listener added');
    } else {
        console.warn('[Admin Users] Refresh button not found');
    }

    // Add event delegation for user action buttons
    const usersTableContainer = document.getElementById('users-management-table');
    if (usersTableContainer) {
        // Remove any existing listeners first
        usersTableContainer.removeEventListener('click', handleUserActionClick);
        
        // Add the event listener
        usersTableContainer.addEventListener('click', handleUserActionClick);
        console.log('[Admin Users] Event delegation added to users table container');
        
        // Test the event listener immediately
        setTimeout(() => {
            console.log('[Admin Users] Testing event listener setup...');
            const testButtons = usersTableContainer.querySelectorAll('button[data-action]');
            console.log('[Admin Users] Found', testButtons.length, 'buttons with data-action');
            
            if (testButtons.length > 0) {
                console.log('[Admin Users] First button:', testButtons[0]);
                console.log('[Admin Users] First button data:', {
                    action: testButtons[0].getAttribute('data-action'),
                    userId: testButtons[0].getAttribute('data-user-id'),
                    username: testButtons[0].getAttribute('data-username'),
                    userRole: testButtons[0].getAttribute('data-user-role')
                });
            }
        }, 1000);
    } else {
        console.warn('[Admin Users] Users table container not found');
    }
    
    console.log('[Admin Users] Initialization complete');
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

function showCreateAdminForm() {
    showCreateUserForm();
    // Set role to admin
    const roleSelect = document.getElementById('user-role-select');
    if (roleSelect) {
        roleSelect.value = 'admin';
    }
}

function showCreateLeadForm() {
    showCreateUserForm();
    // Set role to admin (since lead is removed)
    const roleSelect = document.getElementById('user-role-select');
    if (roleSelect) {
        roleSelect.value = 'admin';
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

async function loadAllUsers() {
    try {
        showUsersLoading();
        
        console.log('[Admin Users] Loading users list...');
        const response = await fetch('api.php?action=admin_list_users', {
            method: 'GET',
            credentials: 'include'
        });
        
        console.log('[Admin Users] Response status:', response.status);
        console.log('[Admin Users] Response ok:', response.ok);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Admin Users] HTTP Error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        }
        
        const responseText = await response.text();
        console.log('[Admin Users] Raw response:', responseText.substring(0, 500));
        
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('[Admin Users] Parsed data:', data);
        } catch (parseError) {
            console.error('[Admin Users] JSON parse error:', parseError);
            throw new Error(`JSON parse error: ${parseError.message}. Response: ${responseText.substring(0, 200)}`);
        }
        
        if (data.success) {
            console.log('[Admin Users] Found', data.users ? data.users.length : 0, 'users');
            renderUsersList(data.users || []);
        } else {
            console.error('[Admin Users] API error:', data.error);
            showUsersError(data.error || 'Lỗi không xác định khi tải danh sách người dùng');
        }
    } catch (error) {
        console.error('[Admin Users] Failed to load users:', error);
        showUsersError(`Lỗi kết nối: ${error.message}`);
    }
}

function showUsersLoading() {
    const tbody = document.getElementById('users-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-cell">
                    <div class="users-loading">
                        <i class="fas fa-spinner"></i>
                        <span>Đang tải danh sách người dùng...</span>
                    </div>
                </td>
            </tr>
        `;
    }
}

function showUsersError(message) {
    const tbody = document.getElementById('users-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="error-cell">
                    <div class="users-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p><strong>Lỗi:</strong> ${message}</p>
                        <button class="button secondary" onclick="loadAllUsers()">
                            <i class="fas fa-redo"></i> Thử lại
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

function renderUsersList(users) {
    const tbody = document.getElementById('users-table-body');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-cell">
                    <div class="users-empty">
                        <i class="fas fa-users"></i>
                        <p>Chưa có người dùng nào trong hệ thống</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const rowsHtml = users.map(user => {
        // Clean the data to avoid issues
        const cleanUserId = String(user.id || '').trim();
        const cleanUsername = String(user.username || '').trim();
        const cleanRole = String(user.role || '').trim();
        
        console.log('[Admin Users] Rendering user:', { 
            id: cleanUserId, 
            username: cleanUsername, 
            role: cleanRole 
        });
        
        // Get role display info
        let roleIcon, roleDisplay;
        switch(cleanRole) {
            case 'admin':
                roleIcon = 'crown';
                roleDisplay = 'Admin';
                break;
            case 'designer':
            default:
                roleIcon = 'palette';
                roleDisplay = 'Designer';
                break;
        }
        
        return `
        <tr>
            <td>
                <strong>${escapeHtml(user.username)}</strong>
            </td>
            <td>
                <span class="role-badge ${cleanRole}">
                    <i class="fas fa-${roleIcon}"></i>
                    ${roleDisplay}
                </span>
            </td>
            <td>${formatDate(user.created_at)}</td>
            <td>${formatDate(user.last_login)}</td>
            <td><span class="loading-activity">Đang tải...</span></td>
            <td>
                <div class="user-actions">
                    <button class="button small info" 
                            data-action="stats" 
                            data-user-id="${cleanUserId}" 
                            data-username="${escapeHtml(cleanUsername)}"
                            data-user-role="${cleanRole}" 
                            title="Xem thống kê">
                        <i class="fas fa-chart-bar"></i>
                    </button>
                    <button class="button small warning" 
                            data-action="change-password" 
                            data-user-id="${cleanUserId}" 
                            data-username="${escapeHtml(cleanUsername)}"
                            data-user-role="${cleanRole}" 
                            title="Đổi mật khẩu">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="button small danger" 
                            data-action="delete" 
                            data-user-id="${cleanUserId}" 
                            data-username="${escapeHtml(cleanUsername)}"
                            data-user-role="${cleanRole}" 
                            title="Xóa người dùng">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rowsHtml;
    
    console.log('[Admin Users] Table rendered with', users.length, 'users');
}

function getUserJetActivity(userId) {
    // This would be loaded separately via API if needed
    return '<span class="loading-activity">Đang tải...</span>';
}

async function handleCreateUser(event) {
    event.preventDefault();
    
    const form = event.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    const role = form.role.value;

    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);
        formData.append('role', role);

        const response = await fetch('api.php?action=admin_create_user', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            showAdminFeedback(data.message, 'success');
            form.reset();
            hideCreateUserForm();
            loadAllUsers(); // Reload the list
        } else {
            showAdminFeedback(data.error || 'Lỗi khi tạo tài khoản', 'error');
        }
    } catch (error) {
        console.error('Failed to create user:', error);
        showAdminFeedback('Lỗi khi tạo tài khoản', 'error');
    }
}

async function viewUserStats(userId, role) {
    try {
        let response;
        if (role === 'designer') {
            // Use designer_id parameter for jet API
            response = await fetch(`api.php?action=jet_get_designer_stats&designer_id=${userId}`);
        } else {
            // Use user_id parameter for admin API
            response = await fetch(`api.php?action=admin_get_user_stats&user_id=${userId}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            showUserStatsModal(data, role);
        } else {
            showAdminFeedback(data.error || 'Lỗi khi tải thống kê', 'error');
        }
    } catch (error) {
        console.error('Failed to load user stats:', error);
        showAdminFeedback('Lỗi khi tải thống kê', 'error');
    }
}

function showUserStatsModal(stats, role) {
    console.log('[Admin Users] Creating stats modal for role:', role, 'with data:', stats);
    
    // Remove any existing modal
    const existing = document.getElementById('stats-modal');
    if (existing) existing.remove();
    
    let content = '';
    if (role === 'designer' && stats.picks_by_color) {
        const picksByColor = stats.picks_by_color.reduce((acc, curr) => {
            acc[curr.pick_color] = curr.count;
            return acc;
        }, {});

        content = `
            <p style="color: #e0e0e0; margin-bottom: 15px;"><strong>Số album đã làm:</strong> ${stats.album_count || 0}</p>
            <div style="margin: 15px 0;">
                <h4 style="color: #e0e0e0; margin-bottom: 10px;">Lựa chọn theo màu:</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                    <div style="padding: 8px; background: #dc3545; color: white; border-radius: 4px; text-align: center;">Đỏ: ${picksByColor.red || 0}</div>
                    <div style="padding: 8px; background: #28a745; color: white; border-radius: 4px; text-align: center;">Xanh lá: ${picksByColor.green || 0}</div>
                    <div style="padding: 8px; background: #007bff; color: white; border-radius: 4px; text-align: center;">Xanh dương: ${picksByColor.blue || 0}</div>
                    <div style="padding: 8px; background: #6c757d; color: white; border-radius: 4px; text-align: center;">Xám: ${picksByColor.grey || 0}</div>
                </div>
            </div>
        `;
    } else {
        content = '<p style="color: #e0e0e0;">Thống kê admin sẽ được bổ sung sau.</p>';
    }

    const modal = document.createElement('div');
    modal.id = 'stats-modal';
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: Arial, sans-serif !important;
    `;
    
    modal.innerHTML = `
        <div style="
            background: #2d3748 !important;
            color: #e0e0e0 !important;
            padding: 30px !important;
            border-radius: 10px !important;
            max-width: 500px !important;
            width: 90% !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            border: 1px solid #4a5568 !important;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #4a5568; padding-bottom: 15px;">
                <h3 style="margin: 0; color: #e0e0e0;"><i class="fas fa-chart-bar"></i> Thống kê Người dùng</h3>
                <button onclick="document.getElementById('stats-modal').remove()" style="
                    background: none !important;
                    border: none !important;
                    font-size: 24px !important;
                    cursor: pointer !important;
                    color: #a0aec0 !important;
                    padding: 0 !important;
                    width: 30px !important;
                    height: 30px !important;
                ">&times;</button>
            </div>
            <div>${content}</div>
            <div style="text-align: right; margin-top: 20px; border-top: 1px solid #4a5568; padding-top: 15px;">
                <button onclick="document.getElementById('stats-modal').remove()" style="
                    background: #4a5568 !important;
                    color: #e0e0e0 !important;
                    border: none !important;
                    padding: 10px 20px !important;
                    border-radius: 5px !important;
                    cursor: pointer !important;
                ">Đóng</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    console.log('[Admin Users] Stats modal added to DOM');
}

function showChangePasswordModal(userId, username) {
    console.log('[Admin Users] Creating change password modal for user:', userId, username);
    
    // Remove any existing modal
    const existing = document.getElementById('password-modal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'password-modal';
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: Arial, sans-serif !important;
    `;
    
    modal.innerHTML = `
        <div style="
            background: #2d3748 !important;
            color: #e0e0e0 !important;
            padding: 30px !important;
            border-radius: 10px !important;
            max-width: 500px !important;
            width: 90% !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            border: 1px solid #4a5568 !important;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #4a5568; padding-bottom: 15px;">
                <h3 style="margin: 0; color: #e0e0e0;"><i class="fas fa-key"></i> Đổi mật khẩu cho: ${username}</h3>
                <button onclick="document.getElementById('password-modal').remove()" style="
                    background: none !important;
                    border: none !important;
                    font-size: 24px !important;
                    cursor: pointer !important;
                    color: #a0aec0 !important;
                    padding: 0 !important;
                    width: 30px !important;
                    height: 30px !important;
                ">&times;</button>
            </div>
            <form id="change-password-form-${userId}">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #e0e0e0;">Mật khẩu mới:</label>
                    <input type="password" id="new-password-${userId}" required minlength="6" style="
                        width: 100% !important;
                        padding: 12px !important;
                        border: 2px solid #4a5568 !important;
                        border-radius: 5px !important;
                        font-size: 16px !important;
                        box-sizing: border-box !important;
                        background: #1a202c !important;
                        color: #e0e0e0 !important;
                    ">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #e0e0e0;">Xác nhận mật khẩu:</label>
                    <input type="password" id="confirm-password-${userId}" required minlength="6" style="
                        width: 100% !important;
                        padding: 12px !important;
                        border: 2px solid #4a5568 !important;
                        border-radius: 5px !important;
                        font-size: 16px !important;
                        box-sizing: border-box !important;
                        background: #1a202c !important;
                        color: #e0e0e0 !important;
                    ">
                </div>
            </form>
            <div style="text-align: right; border-top: 1px solid #4a5568; padding-top: 15px;">
                <button onclick="document.getElementById('password-modal').remove()" style="
                    background: #4a5568 !important;
                    color: #e0e0e0 !important;
                    border: none !important;
                    padding: 10px 20px !important;
                    border-radius: 5px !important;
                    cursor: pointer !important;
                    margin-right: 10px !important;
                ">Hủy</button>
                <button onclick="submitPasswordChange(${userId}, '${username}')" style="
                    background: #3182ce !important;
                    color: white !important;
                    border: none !important;
                    padding: 10px 20px !important;
                    border-radius: 5px !important;
                    cursor: pointer !important;
                ">Đổi mật khẩu</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    console.log('[Admin Users] Change password modal added to DOM');
}

// Global function for password change
window.submitPasswordChange = async function(userId, username) {
    const newPassword = document.getElementById(`new-password-${userId}`).value;
    const confirmPassword = document.getElementById(`confirm-password-${userId}`).value;

    if (newPassword !== confirmPassword) {
        alert('Mật khẩu xác nhận không khớp');
        return;
    }

    if (newPassword.length < 6) {
        alert('Mật khẩu phải có ít nhất 6 ký tự');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('user_id', userId);
        formData.append('new_password', newPassword);

        const response = await fetch('api.php?action=admin_change_user_password', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            alert('Đã đổi mật khẩu thành công!');
            document.getElementById('password-modal').remove();
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể đổi mật khẩu'));
        }
    } catch (error) {
        console.error('Failed to change password:', error);
        alert('Lỗi kết nối khi đổi mật khẩu');
    }
};

function showDeleteUserModal(userId, username, role) {
    console.log('[Admin Users] Creating delete modal for user:', userId, username, role);
    
    // Remove any existing modal
    const existing = document.getElementById('delete-modal');
    if (existing) existing.remove();
    
    // Get role display name
    let roleDisplay;
    switch(role) {
        case 'admin': roleDisplay = 'Admin'; break;
        default: roleDisplay = 'Designer'; break;
    }
    
    const modal = document.createElement('div');
    modal.id = 'delete-modal';
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: Arial, sans-serif !important;
    `;
    
    modal.innerHTML = `
        <div style="
            background: #2d3748 !important;
            color: #e0e0e0 !important;
            padding: 30px !important;
            border-radius: 10px !important;
            max-width: 500px !important;
            width: 90% !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            border: 1px solid #4a5568 !important;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #4a5568; padding-bottom: 15px;">
                <h3 style="margin: 0; color: #f56565;"><i class="fas fa-exclamation-triangle"></i> Xác nhận xóa người dùng</h3>
                <button onclick="document.getElementById('delete-modal').remove()" style="
                    background: none !important;
                    border: none !important;
                    font-size: 24px !important;
                    cursor: pointer !important;
                    color: #a0aec0 !important;
                    padding: 0 !important;
                    width: 30px !important;
                    height: 30px !important;
                ">&times;</button>
            </div>
            <div>
                <p style="margin-bottom: 15px; font-size: 16px; color: #e0e0e0;"><strong>Bạn có chắc chắn muốn xóa người dùng này?</strong></p>
                <div style="background: #1a202c; padding: 15px; border-radius: 5px; margin: 15px 0; border: 1px solid #4a5568;">
                    <p style="margin: 5px 0; color: #e0e0e0;"><strong>Tên đăng nhập:</strong> ${username}</p>
                    <p style="margin: 5px 0; color: #e0e0e0;"><strong>Vai trò:</strong> ${roleDisplay}</p>
                </div>
                <div style="background: #744210; border: 1px solid #d69e2e; padding: 15px; border-radius: 5px; color: #faf089;">
                    <p style="margin: 0;"><i class="fas fa-exclamation-triangle"></i> <strong>Cảnh báo:</strong> Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan đến người dùng này sẽ bị xóa vĩnh viễn.</p>
                </div>
            </div>
            <div style="text-align: right; margin-top: 20px; border-top: 1px solid #4a5568; padding-top: 15px;">
                <button onclick="document.getElementById('delete-modal').remove()" style="
                    background: #4a5568 !important;
                    color: #e0e0e0 !important;
                    border: none !important;
                    padding: 10px 20px !important;
                    border-radius: 5px !important;
                    cursor: pointer !important;
                    margin-right: 10px !important;
                ">Hủy</button>
                <button onclick="confirmDeleteUser(${userId}, '${username}')" style="
                    background: #e53e3e !important;
                    color: white !important;
                    border: none !important;
                    padding: 10px 20px !important;
                    border-radius: 5px !important;
                    cursor: pointer !important;
                ">Xóa người dùng</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    console.log('[Admin Users] Delete modal added to DOM');
}

// Global function for delete confirmation
window.confirmDeleteUser = async function(userId, username) {
    try {
        const formData = new FormData();
        formData.append('user_id', userId);

        const response = await fetch('api.php?action=admin_delete_user', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const data = await response.json();
        
        if (data.success) {
            alert('Đã xóa người dùng thành công!');
            document.getElementById('delete-modal').remove();
            loadAllUsers(); // Reload the list
        } else {
            alert('Lỗi: ' + (data.error || 'Không thể xóa người dùng'));
        }
    } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Lỗi kết nối khi xóa người dùng');
    }
};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    let date;
    // Handle both string and integer timestamps
    if (typeof dateStr === 'number') {
        // Unix timestamp (seconds)
        date = new Date(dateStr * 1000);
    } else if (typeof dateStr === 'string') {
        // String date
        date = new Date(dateStr);
    } else {
        return 'N/A';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return 'N/A';
    }
    
    try {
        return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('[Admin Users] Date formatting error:', error, 'for value:', dateStr);
        return 'N/A';
    }
}

function showAdminFeedback(message, type = 'info') {
    const feedbackElement = document.getElementById('admin-feedback');
    if (feedbackElement) {
        feedbackElement.textContent = message;
        feedbackElement.className = `feedback-message ${type}`;
        feedbackElement.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 5000);
    }
}

// Handle user action button clicks
function handleUserActionClick(event) {
    // Find the button
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    // Get action and data - use getAttribute for reliability
    const action = button.getAttribute('data-action');
    const userId = button.getAttribute('data-user-id');
    const username = button.getAttribute('data-username');
    const userRole = button.getAttribute('data-user-role');

    console.log('[Admin Users] Button clicked:', {
        action: action,
        userId: userId,
        username: username,
        userRole: userRole
    });

    // Validate data
    if (!action) {
        console.error('[Admin Users] No action found');
        return;
    }

    if (!userId || !username || !userRole) {
        console.error('[Admin Users] Missing required data:', { userId, username, userRole });
        alert('Lỗi: Thiếu thông tin người dùng. Vui lòng tải lại trang.');
        return;
    }

    // Convert userId to number
    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
        console.error('[Admin Users] Invalid user ID:', userId);
        alert('Lỗi: ID người dùng không hợp lệ.');
        return;
    }

    // Prevent default
    event.preventDefault();
    event.stopPropagation();

    // Execute action
    console.log('[Admin Users] Executing action:', action, 'for user:', userIdNum);
    
    try {
        switch (action) {
            case 'stats':
                viewUserStats(userIdNum, userRole);
                break;
            case 'change-password':
                showChangePasswordModal(userIdNum, username);
                break;
            case 'delete':
                showDeleteUserModal(userIdNum, username, userRole);
                break;
            default:
                console.warn('[Admin Users] Unknown action:', action);
                alert('Hành động không xác định: ' + action);
        }
    } catch (error) {
        console.error('[Admin Users] Error executing action:', error);
        alert('Lỗi khi thực hiện hành động: ' + error.message);
    }
}

// Export functions for global access
window.showCreateUserForm = showCreateUserForm;
window.showCreateAdminForm = showCreateAdminForm;
window.showCreateLeadForm = showCreateLeadForm;
window.hideCreateUserForm = hideCreateUserForm;
window.viewUserStats = viewUserStats;
window.showChangePasswordModal = showChangePasswordModal;
window.showDeleteUserModal = showDeleteUserModal;
window.confirmDeleteUser = confirmDeleteUser; 