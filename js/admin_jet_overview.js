// Admin Jet Overview Management
// This module handles admin view of designer activity in Jet workspace

document.addEventListener('DOMContentLoaded', () => {
    // Auto-load when the users tab is active
    loadJetOverview();
});

async function loadJetOverview() {
    const container = document.getElementById('jet-overview-container');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading">Đang tải thông tin hoạt động Jet...</div>';
        
        // Load detailed work progress stats
        const detailedResponse = await fetch('api.php?action=jet_get_detailed_stats');
        const detailedData = await detailedResponse.json();
        
        if (!detailedData.success) {
            throw new Error(detailedData.error || 'Lỗi khi tải thống kê chi tiết');
        }

        let overviewHtml = `
            <div class="jet-overview-section">
                <h3>Chi tiết tiến độ làm việc Designer</h3>
                <div class="work-progress-table-container">
                    <table class="work-progress-table">
                        <thead>
                            <tr>
                                <th>Designer</th>
                                <th>Album</th>
                                <th>Đã pick / Tổng</th>
                                <th>Màu sắc</th>
                                <th>Hoạt động cuối</th>
                                <th>Tiến độ</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        const workProgress = detailedData.work_progress || [];
        
        if (workProgress.length === 0) {
            overviewHtml += `
                            <tr>
                                <td colspan="6" class="no-data">Chưa có hoạt động nào được ghi nhận</td>
                            </tr>
            `;
        } else {
            workProgress.forEach(work => {
                const totalPicks = parseInt(work.picked_count);
                const redCount = parseInt(work.red_count || 0);
                const greenCount = parseInt(work.green_count || 0);
                const blueCount = parseInt(work.blue_count || 0);
                const greyCount = parseInt(work.grey_count || 0);
                
                // Approximate total images (this would be better if we had actual counts)
                const totalImages = 'Unknown'; // Could be enhanced to count actual images
                const progressPercent = totalImages === 'Unknown' ? 'N/A' : Math.round((totalPicks / totalImages) * 100);

                overviewHtml += `
                            <tr>
                                <td class="designer-name">${escapeHtml(work.username)}</td>
                                <td class="album-name">${escapeHtml(work.folder_name || work.source_key)}</td>
                                <td class="pick-counts">${totalPicks} / ${totalImages}</td>
                                <td class="color-breakdown">
                                    <div class="color-stats-inline">
                                        ${redCount > 0 ? `<span class="color-count color-red" title="Đỏ: ${redCount}">${redCount}</span>` : ''}
                                        ${greenCount > 0 ? `<span class="color-count color-green" title="Xanh lá: ${greenCount}">${greenCount}</span>` : ''}
                                        ${blueCount > 0 ? `<span class="color-count color-blue" title="Xanh dương: ${blueCount}">${blueCount}</span>` : ''}
                                        ${greyCount > 0 ? `<span class="color-count color-grey" title="Xám: ${greyCount}">${greyCount}</span>` : ''}
                                    </div>
                                </td>
                                <td class="last-activity">${formatDate(work.last_activity)}</td>
                                <td class="progress-indicator">
                                    ${progressPercent === 'N/A' ? 
                                        '<span class="progress-unknown">Chưa xác định</span>' : 
                                        `<div class="progress-bar">
                                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                                            <span class="progress-text">${progressPercent}%</span>
                                        </div>`
                                    }
                                </td>
                            </tr>
                `;
            });
        }

        overviewHtml += `
                        </tbody>
                    </table>
                </div>
                <div class="quick-actions">
                    <a href="jet.php" target="_blank" class="button primary">Mở Jet Workspace</a>
                    <span class="help-text">💡 Trong Jet Workspace, admin thấy tất cả picks của designers hiển thị tên bên cạnh dot màu</span>
                </div>
            </div>
        `;

        container.innerHTML = overviewHtml;
        
    } catch (error) {
        console.error('Error loading Jet overview:', error);
        container.innerHTML = `
            <div class="error-message">
                <h3>Lỗi tải thông tin Jet</h3>
                <p>${error.message}</p>
                <button class="button" onclick="loadJetOverview()">Thử lại</button>
            </div>
        `;
    }
}

async function showDesignerDetails(designerId, username) {
    try {
        const response = await fetch(`api.php?action=jet_get_designer_stats&designer_id=${designerId}`);
        const data = await response.json();
        
        if (data.success) {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            
            const totalPicks = data.picks_by_color.reduce((sum, colorPick) => {
                return colorPick.pick_color ? sum + parseInt(colorPick.count) : sum;
            }, 0);

            const colorDetails = ['red', 'green', 'blue', 'grey'].map(color => {
                const found = data.picks_by_color.find(p => p.pick_color === color);
                const count = found ? found.count : 0;
                const percentage = totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0;
                return { color, count, percentage };
            });

            modal.innerHTML = `
                <div class="modal-box designer-details-modal">
                    <h3>Chi tiết hoạt động: ${escapeHtml(username)}</h3>
                    <div class="designer-details-content">
                        <div class="summary-stats">
                            <div class="summary-item">
                                <span class="summary-label">Tổng số albums đã làm:</span>
                                <span class="summary-value">${data.album_count}</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">Tổng số picks:</span>
                                <span class="summary-value">${totalPicks}</span>
                            </div>
                        </div>
                        
                        <div class="color-breakdown">
                            <h4>Phân tích theo màu:</h4>
                            ${colorDetails.map(cd => `
                                <div class="color-detail-row">
                                    <span class="color-indicator color-indicator-${cd.color}"></span>
                                    <span class="color-name">${getColorName(cd.color)}</span>
                                    <span class="color-count">${cd.count} picks</span>
                                    <div class="color-bar">
                                        <div class="color-bar-fill color-bar-${cd.color}" style="width: ${cd.percentage}%"></div>
                                    </div>
                                    <span class="color-percentage">${cd.percentage}%</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="action-suggestion">
                            <h4>💡 Gợi ý:</h4>
                            <p>Để xem chi tiết picks của ${escapeHtml(username)}, hãy vào 
                            <a href="jet.php" target="_blank">Jet Workspace</a> và duyệt các albums mà designer này đã làm việc.</p>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="button" onclick="this.closest('.modal-overlay').remove()">Đóng</button>
                        <a href="jet.php" target="_blank" class="button primary">Mở Jet Workspace</a>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } else {
            showFeedback(data.error || 'Lỗi khi tải chi tiết designer', 'error');
        }
    } catch (error) {
        console.error('Error showing designer details:', error);
        showFeedback('Lỗi khi tải chi tiết designer', 'error');
    }
}

function getColorName(color) {
    const names = {
        'red': 'Đỏ',
        'green': 'Xanh lá', 
        'blue': 'Xanh dương',
        'grey': 'Xám'
    };
    return names[color] || color;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
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

// Make functions available globally
window.loadJetOverview = loadJetOverview;
window.showDesignerDetails = showDesignerDetails; 