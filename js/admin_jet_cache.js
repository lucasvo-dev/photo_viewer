// Admin Jet Cache Management
// This module handles RAW cache management in admin interface

document.addEventListener('DOMContentLoaded', () => {
    // Auto-load when the jet cache tab is active
    loadRawCacheData();
    
    // Note: Main 'Update Cache' button removed from Jet app UI

    // Search functionality
    const searchInput = document.getElementById('rawSourceSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterRawSourcesTable(e.target.value.trim());
        });
    }

    // Manual refresh button
    const refreshButton = document.getElementById('refresh-jet-cache-data');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            console.log('Manual refresh triggered');
            Object.keys(activePollers).forEach(key => stopJetCachePolling(key));
            loadRawCacheData();
        });
    }

    // Clear failed jobs button, cleanup orphaned records button, and folder cache buttons
    document.addEventListener('click', (e) => {
        if (e.target.id === 'clear-failed-jobs') {
            clearFailedJetCacheJobs();
        } else if (e.target.id === 'cleanup-orphaned-records') {
            cleanupOrphanedCacheRecords();
        } else if (e.target.classList.contains('queue-folder-cache')) {
            console.log('Button with queue-folder-cache class clicked.');
            const button = e.target;
            const sourceKey = button.dataset.sourceKey;
            const folderPath = button.dataset.folderPath;
            console.log(`Source Key: ${sourceKey}, Folder Path: ${folderPath}`);
            if (sourceKey && folderPath) {
                handleRawCacheFolder(button, sourceKey, folderPath);
            }
        } else if (e.target.classList.contains('cache-info-icon')) {
            // Handle cache info icon click to show modal
            const sourceKey = e.target.dataset.sourceKey;
            const folderPath = e.target.dataset.folderPath;
            if (sourceKey && folderPath) {
                fetchAndShowJetCacheInfo(sourceKey, folderPath);
            }
        }
    });
});

let rawSourcesData = []; // This will hold folder data
let activePollers = {}; // Track active polling for cache operations - matches gallery pattern
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds

// Helper function to escape HTML - matches gallery pattern
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Helper functions for loading/feedback - matches gallery pattern  
function showJetLoading(message = 'Đang tải...') {
    if (typeof showLoading === 'function') {
        showLoading(message);
    } else {
        showRawCacheLoading(true);
    }
}

function hideJetLoading() {
    if (typeof hideLoading === 'function') {
        hideLoading();
    } else {
        showRawCacheLoading(false);
    }
}

function showJetFeedback(message, type = 'success') {
    if (typeof showFeedback === 'function') {
        showFeedback(message, type);
    } else {
        showRawCacheMessage(message, type);
    }
}

// Main function to update cache button state - matches gallery updateCacheButtonState
function updateJetCacheButtonState(button, sourceKey, folderPath, stats, totalFiles) {
    const totalPossibleJobs = totalFiles; // SIMPLIFIED: 1 job per file (750px only)
    const isActive = stats.pending > 0 || stats.processing > 0;
    
    let buttonText = '';
    let buttonTitle = '';
    let isDisabled = false;
    let icon = '';

    if (stats.processing > 0) {
        buttonText = 'Đang xử lý...';
        buttonTitle = `Đang xử lý ${stats.processing} công việc cache RAW.`;
        isDisabled = true;
        icon = '⚙️';
    } else if (stats.pending > 0) {
        buttonText = 'Đang chờ xử lý';
        buttonTitle = `${stats.pending} công việc cache RAW đang chờ xử lý.`;
        isDisabled = true;
        icon = '🕒';
    } else {
        // Job is completed, failed, or never run
        if (stats.completed === totalPossibleJobs && totalPossibleJobs > 0) {
            buttonText = 'Cập nhật Cache';
            buttonTitle = `Cache hoàn thành cho ${stats.completed} ảnh. Click để chạy lại quá trình cache.`;
            isDisabled = false;
            icon = '🔄';
        } else if (stats.completed > 0) {
            buttonText = 'Cập nhật Cache';
            buttonTitle = `Đã cache ${stats.completed}/${totalPossibleJobs} file RAW. Click để tiếp tục cache.`;
            isDisabled = false;
            icon = '🔄';
        } else if (totalFiles === 0) {
            buttonText = 'Không có file RAW';
            buttonTitle = 'Không có file RAW nào trong thư mục này.';
            isDisabled = true;
            icon = '❌';
        } else {
            buttonText = 'Tạo Cache RAW';
            buttonTitle = 'Tạo cache 750px cho tất cả file RAW trong thư mục.';
            isDisabled = false;
            icon = '➕';
        }
    }
    
    button.innerHTML = `${icon} ${buttonText}`.trim();
    button.title = buttonTitle;
    button.disabled = isDisabled;
}

// Function to render cache status - enhanced to match gallery renderCacheStatusCell
function renderJetCacheStatus(folder) {
    const stats = folder.cache_stats;
    const totalPossibleJobs = folder.total_raw_files; // SIMPLIFIED: 1 job per file (750px only)
    const sourceKey = folder.source_key;
    const folderPath = folder.relative_path;
    
    let statusHTML = '';
    let title = '';
    let infoIconHTML = '';
    let progressHTML = '';

    if (stats.processing > 0) {
        const percentage = totalPossibleJobs > 0 ? Math.round(((stats.completed + stats.processing) / totalPossibleJobs) * 100) : 0;
        statusHTML = `<span class="status-processing">⚙️ Đang xử lý (${percentage}%)</span>`;
        
        // Add progress bar if total jobs > 0
        if (totalPossibleJobs > 0) {
            progressHTML = `<progress class="cache-progress-bar" value="${stats.completed}" max="${totalPossibleJobs}" title="${stats.completed}/${totalPossibleJobs}"></progress>`;
        }
        title = `Đang xử lý ${stats.processing} công việc cache RAW (${stats.completed}/${totalPossibleJobs} hoàn thành).`;
        
    } else if (stats.pending > 0) {
        statusHTML = '<span class="status-pending">🕒 Đang chờ...</span>';
        title = `${stats.pending} công việc cache RAW đang chờ trong hàng đợi.`;
        
    } else if (stats.failed > 0) {
        statusHTML = `<span class="status-failed">❌ Có lỗi (${stats.failed})</span>`;
        title = `${stats.failed} công việc cache gặp lỗi.`;
        infoIconHTML = `<span class="cache-info-icon" data-source-key="${escapeHTML(sourceKey)}" data-folder-path="${escapeHTML(folderPath)}" title="Xem chi tiết lỗi">&#8505;</span>`;
        
    } else if (stats.completed === totalPossibleJobs && totalPossibleJobs > 0) {
        statusHTML = `<span class="status-completed">✅ Cache (${stats.completed} ảnh)</span>`;
        title = `Đã cache thành công ${stats.completed} ảnh RAW.`;
        infoIconHTML = `<span class="cache-info-icon" data-source-key="${escapeHTML(sourceKey)}" data-folder-path="${escapeHTML(folderPath)}" title="Xem chi tiết cache">&#8505;</span>`;
        
    } else if (stats.completed > 0 && totalPossibleJobs > 0) {
        const completedPercentage = Math.round((stats.completed / totalPossibleJobs) * 100);
        statusHTML = `<span class="status-partial">🔄 Đã xử lý ${completedPercentage}% (${stats.completed}/${totalPossibleJobs} ảnh)</span>`;
        title = `Đã cache ${stats.completed} trong tổng số ${totalPossibleJobs} ảnh RAW.`;
        infoIconHTML = `<span class="cache-info-icon" data-source-key="${escapeHTML(sourceKey)}" data-folder-path="${escapeHTML(folderPath)}" title="Xem chi tiết cache">&#8505;</span>`;
        
    } else if (totalPossibleJobs === 0) {
        statusHTML = '<span class="status-none">❌ Không có file RAW</span>';
        title = 'Không có file RAW nào trong thư mục này.';
        
    } else {
        statusHTML = '<span class="status-never">➕ Chưa cache</span>';
        title = 'Chưa có cache RAW nào được tạo cho thư mục này.';
    }
    
    // Combine status, progress bar and icon - matches gallery pattern
    return `<div class="cache-status-wrapper" title="${escapeHTML(title)}">
                ${statusHTML}
                ${progressHTML}
                ${infoIconHTML}
            </div>`;
}

async function loadRawCacheData() {
    showJetLoading('Đang tải dữ liệu cache RAW...');
    try {
        // Load both cache stats (overall) and folders data
        const [statsResponse, foldersResponse] = await Promise.all([
            fetch('api.php?action=jet_get_cache_stats'), // Keep overall stats
            fetch('api.php?action=jet_list_raw_folders_with_cache_stats') // New API for folders
        ]);

        const [statsResult, foldersResult] = await Promise.all([
            statsResponse.json(),
            foldersResponse.json()
        ]);

        if (statsResult.success) {
            updateCacheStats(statsResult.stats);
            updateFailedJobsSection(statsResult.recent_failed);
        } else {
             showJetFeedback(statsResult.error || 'Lỗi tải thống kê cache tổng quan', 'error');
        }

        if (foldersResult.success) {
            rawSourcesData = foldersResult.folders; // Store folder data
            renderRawSourcesTable(rawSourcesData); // Render using folder data
        } else {
            showJetFeedback(foldersResult.error || 'Lỗi tải danh sách thư mục RAW', 'error');
        }

    } catch (error) {
        console.error('Error loading RAW cache data:', error);
        showJetFeedback('Lỗi kết nối khi tải dữ liệu cache RAW', 'error');
    } finally {
        hideJetLoading();
    }
}

function updateCacheStats(stats) {
    const statsMap = {};
    stats.forEach(stat => {
        statsMap[stat.status] = stat.count;
    });

    document.getElementById('pending-jobs').textContent = statsMap.pending || 0;
    document.getElementById('processing-jobs').textContent = statsMap.processing || 0;
    document.getElementById('completed-jobs').textContent = statsMap.completed || 0;
    document.getElementById('failed-jobs').textContent = statsMap.failed || 0;
}

// This function now renders folders instead of sources, matching gallery columns exactly
function renderRawSourcesTable(folders) {
    const tbody = document.getElementById('raw-sources-list-body');
    if (!tbody) return;

    if (folders.length === 0) {
        // Adjusted colspan to 4 columns (Source/Folder, File Count, Status, Action)
        tbody.innerHTML = '<tr><td colspan="4">Không có thư mục RAW nào được tìm thấy trong các nguồn cấu hình.</td></tr>';
        return;
    }

    // Clear previous content
    tbody.innerHTML = '';

    folders.forEach(folder => {
        const row = document.createElement('tr');
        row.dataset.sourceKey = folder.source_key;
        row.dataset.folderPath = folder.relative_path;

        const cacheStatusHtml = renderJetCacheStatus(folder); // Use new enhanced status function

        row.innerHTML = `
            <td data-label="Nguồn RAW">
                <strong>${escapeHTML(folder.source_name)} / ${escapeHTML(folder.folder_name)}</strong>
                <br><small>Đường dẫn hệ thống: <code>${escapeHTML(folder.full_path)}</code></small>
            </td>
            <td data-label="Số file RAW">${folder.total_raw_files} file</td>
            <td data-label="Trạng thái Cache">${cacheStatusHtml}</td>
            <td data-label="Hành động Cache">
                <button class="button queue-folder-cache" title="Cập nhật cache RAW">...</button>
            </td>
        `;

        // Find the cache button and status cell we just created - matches gallery pattern
        const cacheButton = row.querySelector('.queue-folder-cache');
        const cacheStatusCell = row.querySelector('td[data-label="Trạng thái Cache"]');
        
        if (cacheButton && cacheStatusCell) {
            // Set data attributes for the button
            cacheButton.dataset.sourceKey = folder.source_key;
            cacheButton.dataset.folderPath = folder.relative_path;
            
            // Set initial state for the button using our new function
            updateJetCacheButtonState(cacheButton, folder.source_key, folder.relative_path, folder.cache_stats, folder.total_raw_files);

            // Start polling if job is active - matches gallery pattern
            const isActive = folder.cache_stats.pending > 0 || folder.cache_stats.processing > 0;
            if (isActive) {
                startJetCachePolling(cacheButton, cacheStatusCell, folder.source_key, folder.relative_path);
            }
        } else {
            console.warn("Could not find cache button or status cell for row:", folder.source_key, folder.relative_path);
        }

        tbody.appendChild(row);
    });
}

// Function to show cache info modal - matches gallery pattern
function showJetCacheInfoModal(folderData) {
    // Remove existing modal first
    const existingModal = document.getElementById('jetCacheInfoModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'jetCacheInfoModal';
    modalOverlay.className = 'modal-overlay cache-info-modal';

    const stats = folderData.cache_stats;
    const totalPossibleJobs = folderData.total_raw_files * 2;

    let detailsHTML = '';
    detailsHTML += `<p><strong>Tổng số file RAW:</strong> ${folderData.total_raw_files} file</p>`;
    detailsHTML += `<p><strong>Tổng công việc cache:</strong> ${totalPossibleJobs} (preview + filmstrip)</p>`;
    detailsHTML += `<hr style="margin: 15px 0; border-color: #30363d;">`;
    detailsHTML += `<p><strong>Đã hoàn thành:</strong> ${stats.completed} công việc</p>`;
    detailsHTML += `<p><strong>Đang xử lý:</strong> ${stats.processing} công việc</p>`;
    detailsHTML += `<p><strong>Đang chờ:</strong> ${stats.pending} công việc</p>`;
    detailsHTML += `<p><strong>Lỗi:</strong> ${stats.failed} công việc</p>`;

    if (stats.completed > 0) {
        const completedPercentage = Math.round((stats.completed / totalPossibleJobs) * 100);
        detailsHTML += `<p><strong>Tiến trình:</strong> ${completedPercentage}% hoàn thành</p>`;
    }

    modalOverlay.innerHTML = `
        <div class="modal-box">
            <h3>Thông tin Cache RAW</h3>
            <p><strong>Thư mục:</strong> ${escapeHTML(folderData.source_name)} / ${escapeHTML(folderData.folder_name)}</p>
            <p><small><strong>Đường dẫn:</strong> ${escapeHTML(folderData.full_path)}</small></p>
            <hr style="margin: 15px 0; border-color: #30363d;">
            ${detailsHTML}
            <div class="prompt-actions" style="margin-top: 20px;">
                <button class="button close-modal-button">Đóng</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);
    document.body.classList.add('body-blur');

    // Add listener to close button
    const closeButton = modalOverlay.querySelector('.close-modal-button');
    closeButton.addEventListener('click', () => {
        modalOverlay.remove();
        document.body.classList.remove('body-blur');
    });
    
    // Optional: close on overlay click
    modalOverlay.addEventListener('click', (event) => {
         if (event.target === modalOverlay) { 
             closeButton.click(); 
         }
     });

    // Make visible with transition
    requestAnimationFrame(() => {
         modalOverlay.classList.add('modal-visible');
    });
}

// Function to fetch and show cache info - matches gallery pattern
async function fetchAndShowJetCacheInfo(sourceKey, folderPath) {
    showJetLoading('Đang lấy thông tin cache RAW...');
    try {
        // Find the folder data in our cached array
        const folderData = rawSourcesData.find(f => 
            f.source_key === sourceKey && f.relative_path === folderPath
        );

        if (!folderData) {
            throw new Error(`Không tìm thấy thông tin cho thư mục ${sourceKey}/${folderPath}`);
        }

        hideJetLoading();
        showJetCacheInfoModal(folderData);

    } catch (error) {
        hideJetLoading();
        console.error('Error fetching cache info:', error);
        showJetFeedback(`Lỗi lấy thông tin cache: ${error.message}`, 'error');
    }
}


// This function now handles queuing for a folder - matches gallery handleCacheFolder pattern
async function handleRawCacheFolder(button, sourceKey, folderPath) {
    console.log(`handleRawCacheFolder called for Source: ${sourceKey}, Folder: ${folderPath}`);
    
    // Check if already polling (button should be disabled, but as extra check)
    const pollerKey = `${sourceKey}_${folderPath}`;
    if (activePollers[pollerKey]) {
        console.warn(`[Cache Request ${pollerKey}] Ignoring click, already polling/processing.`);
        return;
    }
    
    if (!confirm(`Bạn có chắc muốn yêu cầu tạo/cập nhật cache cho thư mục RAW "${sourceKey}/${folderPath}"? Quá trình này sẽ chạy trong nền.`)) {
        console.log('Cache request cancelled by user.');
        return;
    }
    
    button.disabled = true;
    button.innerHTML = `⏳ Đang gửi yêu cầu...`; 
    button.title = 'Đang gửi yêu cầu cache lên server...';

    try {
        const formData = new FormData();
        formData.append('action', 'jet_queue_folder_cache');
        formData.append('source_key', sourceKey);
        formData.append('folder_path', folderPath);

        const response = await fetch('api.php', { method: 'POST', body: formData });
        const result = await response.json();
        console.log('API response received:', result);

        if (!response.ok || result.success !== true) {
            throw new Error(result.error || result.message || `Lỗi HTTP ${response.status}`);
        }

        // SUCCESS: Job queued or already running
        showJetFeedback(result.message || 'Yêu cầu đã được xử lý.', result.status === 'queued' ? 'success' : 'warning'); 
        
        // Find folder data and update button state immediately if queued
        const folderData = rawSourcesData.find(f => 
            f.source_key === sourceKey && f.relative_path === folderPath
        );
        
        const statusCell = button.closest('tr')?.querySelector('td[data-label="Trạng thái Cache"]');
        if (result.status === 'queued' && folderData) {
            // Update local stats to show pending
            folderData.cache_stats.pending += result.queued_count || 1;
            updateJetCacheButtonState(button, sourceKey, folderPath, folderData.cache_stats, folderData.total_raw_files);
        }

        // *** START POLLING *** 
        if (statusCell) {
             startJetCachePolling(button, statusCell, sourceKey, folderPath); 
        } else {
             console.error(`[Cache Request ${pollerKey}] Could not find status cell to start polling.`);
        }

    } catch (error) {
        // FAILURE: API call failed
        console.error("Error requesting cache job:", error);
        showJetFeedback(`Lỗi gửi yêu cầu cache: ${error.message}`, "error");
        
        // Restore original button state on failure
        const folderData = rawSourcesData.find(f => 
            f.source_key === sourceKey && f.relative_path === folderPath
        );
        if (folderData) {
            updateJetCacheButtonState(button, sourceKey, folderPath, folderData.cache_stats, folderData.total_raw_files);
        }
        stopJetCachePolling(pollerKey); // Ensure no poller is running after failure
    }
}

// Polling function for cache status - matches gallery pollCacheStatus pattern
async function pollJetCacheStatus(button, statusCell, sourceKey, folderPath) {
    const pollerKey = `${sourceKey}_${folderPath}`;
    console.log(`[Polling ${pollerKey}] Checking status...`);
    
    try {
        // Fetch updated data
        const response = await fetch('api.php?action=jet_list_raw_folders_with_cache_stats');
        const result = await response.json();

        if (!response.ok || !result.success || !result.folders) {
             console.warn(`[Polling ${pollerKey}] Failed to get updated folder info:`, result.error || `HTTP ${response.status}`);
             return; // Keep previous button state on error
        }
        
        // Find the specific folder that was updated
        const updatedFolder = result.folders.find(f => 
            f.source_key === sourceKey && f.relative_path === folderPath
        );
        
        if (!updatedFolder) {
             console.warn(`[Polling ${pollerKey}] Folder not found in update. Stopping polling.`);
             stopJetCachePolling(pollerKey);
             return;
        }

        console.log(`[Polling ${pollerKey}] Received updated data:`, updatedFolder);

        // Update status cell content
        if (statusCell) {
            statusCell.innerHTML = renderJetCacheStatus(updatedFolder);
        }

        // Update button state based on job status
        updateJetCacheButtonState(button, sourceKey, folderPath, updatedFolder.cache_stats, updatedFolder.total_raw_files);

        // Update the corresponding entry in the global rawSourcesData array
        const dataIndex = rawSourcesData.findIndex(f => f.source_key === sourceKey && f.relative_path === folderPath);
        if (dataIndex !== -1) {
             rawSourcesData[dataIndex] = updatedFolder;
        }

        // Stop polling if the job is no longer pending or processing
        const isActive = updatedFolder.cache_stats.pending > 0 || updatedFolder.cache_stats.processing > 0;
        if (!isActive) {
            console.log(`[Polling ${pollerKey}] Job completed, stopping polling.`);
            stopJetCachePolling(pollerKey);
            
            // Optionally refresh overall stats
            fetch('api.php?action=jet_get_cache_stats')
                .then(res => res.json())
                .then(statsResult => { if(statsResult.success) updateCacheStats(statsResult.stats); });
        }
        
    } catch (error) {
        console.error(`Error polling RAW folder ${pollerKey}:`, error);
    }
}

// Start polling function - matches gallery startPolling pattern
function startJetCachePolling(button, statusCell, sourceKey, folderPath) {
    const pollerKey = `${sourceKey}_${folderPath}`;

    // Clear existing poller for this key
    if (activePollers[pollerKey]) {
        clearInterval(activePollers[pollerKey]);
    }

    console.log(`Starting polling for RAW folder: ${pollerKey}`);
    
    activePollers[pollerKey] = setInterval(async () => {
        pollJetCacheStatus(button, statusCell, sourceKey, folderPath);
    }, POLLING_INTERVAL_MS);
}

// Stop polling function - matches gallery stopPolling pattern
function stopJetCachePolling(pollerKey) {
    if (activePollers[pollerKey]) {
        console.log(`Stopping polling for: ${pollerKey}`);
        clearInterval(activePollers[pollerKey]);
        delete activePollers[pollerKey];
    }
}

function updateFailedJobsSection(failedJobs) {
    const section = document.getElementById('failed-jobs-section');
    const container = document.getElementById('failed-jobs-container');
    
    if (failedJobs.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    
    let html = '<div class="failed-jobs-list">';
    html += '<table class="admin-table"><thead><tr>';
    html += '<th>Nguồn / Thư mục</th><th>File</th><th>Kích thước</th><th>Lỗi</th><th>Thời gian</th>'; // Updated header
    html += '</tr></thead><tbody>';

    failedJobs.forEach(job => {
        const createTime = new Date(job.created_at * 1000).toLocaleString(); // Convert timestamp to JS Date
         // Extract folder name from relative path for display if needed, or just show full path
         const sourceAndPath = `${escapeHTML(job.source_key)} / ${escapeHTML(job.image_relative_path)}`;

        html += `<tr>
            <td>${sourceAndPath}</td>
            <td>${escapeHTML(job.image_relative_path.split('/').pop())}</td> <!-- Show just filename -->
            <td>${job.cache_size}px</td>
            <td><small>${escapeHTML(job.result_message || 'Không rõ')}</small></td>
            <td><small>${createTime}</small></td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    html += '<button id="clear-failed-jobs" class="button button-danger">Xóa tất cả công việc lỗi</button>';
    html += '<button id="cleanup-orphaned-records" class="button button-warning" style="margin-left: 10px;">🧹 Dọn dẹp records bị mồ côi</button>';
    
    container.innerHTML = html;
}

function filterRawSourcesTable(searchTerm) {
    const rows = document.querySelectorAll('#raw-sources-list-body tr');
    const lowerSearchTerm = searchTerm.toLowerCase();

    rows.forEach(row => {
        // Search against source name, folder name, and full path
        const sourceName = row.querySelector('td:first-child strong').textContent.split('/')[0].trim() || '';
        const folderName = row.querySelector('td:first-child strong').textContent.split('/')[1].trim() || '';
        const fullPath = row.querySelector('td:first-child small code')?.textContent || '';

        const matches = sourceName.toLowerCase().includes(lowerSearchTerm) ||
                       folderName.toLowerCase().includes(lowerSearchTerm) ||
                       fullPath.toLowerCase().includes(lowerSearchTerm);

        row.style.display = matches ? '' : 'none';
    });
}

async function clearFailedJetCacheJobs() {
    if (!confirm('Bạn có chắc muốn xóa tất cả công việc cache lỗi?')) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('action', 'jet_clear_failed_cache_jobs');

        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showJetFeedback(result.message, 'success');
            loadRawCacheData(); // Refresh all data
        } else {
            showJetFeedback(result.error || 'Lỗi xóa công việc cache lỗi', 'error');
        }
    } catch (error) {
        console.error('Error clearing failed jobs:', error);
        showJetFeedback('Lỗi kết nối khi xóa công việc cache lỗi', 'error');
    }
}

async function cleanupOrphanedCacheRecords() {
    if (!confirm('Bạn có chắc muốn dọn dẹp các records database bị mồ côi (file cache đã bị xóa)? Thao tác này sẽ kiểm tra và xóa các records trong database mà file tương ứng không còn tồn tại.')) {
        return;
    }

    showJetLoading('Đang kiểm tra và dọn dẹp records bị mồ côi...');

    try {
        const formData = new FormData();
        formData.append('action', 'jet_cleanup_orphaned_cache_records');

        const response = await fetch('api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showJetFeedback(result.message, 'success');
            loadRawCacheData(); // Refresh all data
        } else {
            showJetFeedback(result.error || 'Lỗi dọn dẹp records bị mồ côi', 'error');
        }
    } catch (error) {
        console.error('Error cleaning up orphaned records:', error);
        showJetFeedback('Lỗi kết nối khi dọn dẹp records bị mồ côi', 'error');
    } finally {
        hideJetLoading();
    }
}

function showRawCacheMessage(message, type = 'info') {
    // Use global feedback function if available
    if (typeof showFeedback === 'function') {
        showFeedback(message, type);
    } else {
        // Fallback to local message area
        const messageArea = document.getElementById('raw-cache-message');
        if (messageArea) {
            messageArea.textContent = message;
            messageArea.className = `message ${type}`;
            messageArea.style.display = 'block';
            setTimeout(() => {
                messageArea.style.display = 'none';
            }, 5000);
        }
    }
}

function showRawCacheLoading(show) {
    const loader = document.getElementById('raw-cache-loading');
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}

// escapeHTML function is now defined at the top of the file

// Auto-refresh every 30 seconds (only if no active pollers)
setInterval(() => {
    // Only load if the jet cache tab is currently active
    const jetCacheTabContent = document.getElementById('jet-cache-tab');
    if (jetCacheTabContent && jetCacheTabContent.classList.contains('active')) {
        if (Object.keys(activePollers).length === 0) {
            console.log("Auto-refreshing RAW cache data...");
            loadRawCacheData();
        }
    }
}, 30000);

// Force refresh when tab becomes visible (worker might have restarted)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        const jetCacheTabContent = document.getElementById('jet-cache-tab');
        if (jetCacheTabContent && jetCacheTabContent.classList.contains('active')) {
            console.log("Tab became visible - force refreshing cache data...");
            // Stop all pollers and refresh data
            Object.keys(activePollers).forEach(key => stopJetCachePolling(key));
            loadRawCacheData();
        }
    }
});

// Make functions globally available
window.loadJetCacheStats = loadRawCacheData; // For tab switching compatibility
window.loadRawCacheData = loadRawCacheData;
window.handleRawCacheSource = handleRawCacheFolder; // Rename function for clarity
window.clearFailedJetCacheJobs = clearFailedJetCacheJobs;

// Main 'Update Cache' button functionality removed
// Cache management now handled only through individual folder buttons 