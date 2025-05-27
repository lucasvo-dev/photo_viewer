// Admin Jet Cache Management
// This module handles RAW cache management in admin interface

document.addEventListener('DOMContentLoaded', () => {
    // Auto-load when the jet cache tab is active
    loadRawCacheData();
    
    // Note: Main 'Update Cache' button removed from Jet app UI

    // Search functionality
    const searchInput = document.getElementById('rawSourceSearchInput');
    const clearSearchBtn = document.getElementById('clearRawSearch');
    const searchPrompt = document.getElementById('raw-search-prompt');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            filterRawSourcesTable(searchTerm);
            
            // Show/hide clear button
            if (clearSearchBtn) {
                clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
            }
            
            // Update search prompt
            if (searchPrompt) {
                if (searchTerm) {
                    const visibleRows = document.querySelectorAll('#raw-sources-list-body tr[style=""], #raw-sources-list-body tr:not([style])');
                    const totalRows = document.querySelectorAll('#raw-sources-list-body tr').length;
                    searchPrompt.textContent = `Hiển thị ${visibleRows.length}/${totalRows} thư mục khớp với "${searchTerm}"`;
                    searchPrompt.style.display = 'block';
                } else {
                    searchPrompt.style.display = 'none';
                }
            }
        });
    }
    
    // Clear search functionality
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input')); // Trigger input event to update UI
                searchInput.focus(); // Focus back to input
            }
        });
    }

    // Enhanced refresh button - combines refresh + auto-sync
    const refreshButton = document.getElementById('refresh-jet-cache-data');
    if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
            console.log('Enhanced refresh triggered - Force reloading with auto-sync');
            
            // Stop all active pollers
            Object.keys(activePollers).forEach(key => stopJetCachePolling(key));
            
            // Clear cached data
            rawSourcesData = [];
            
            // Visual feedback
            refreshButton.disabled = true;
            refreshButton.innerHTML = '🔄 Đang làm mới...';
            
            try {
                // Step 1: Force cleanup orphaned records first
                console.log('[Enhanced Refresh] Step 1: Cleaning up orphaned records...');
                refreshButton.innerHTML = '🧹 Đang dọn dẹp database...';
                
                const cleanupResponse = await fetch('api.php?action=jet_cleanup_orphaned_cache_records', {
                    method: 'POST',
                    credentials: 'include'
                });
                const cleanupResult = await cleanupResponse.json();
                
                let cleanupMessage = '';
                if (cleanupResult.success) {
                    if (cleanupResult.deleted_count > 0) {
                        console.log(`[Enhanced Refresh] Cleaned up ${cleanupResult.deleted_count} orphaned records`);
                        cleanupMessage = `🧹 Đã dọn dẹp ${cleanupResult.deleted_count} records bị mồ côi. `;
                    } else {
                        console.log('[Enhanced Refresh] No orphaned records found');
                        cleanupMessage = '✅ Database đã đồng bộ. ';
                    }
                } else {
                    console.warn('[Enhanced Refresh] Cleanup failed:', cleanupResult.error);
                    cleanupMessage = '⚠️ Cleanup có vấn đề nhưng tiếp tục làm mới. ';
                }
                
                // Step 2: Load fresh data (which will also auto-cleanup any remaining issues)
                console.log('[Enhanced Refresh] Step 2: Loading fresh data...');
                refreshButton.innerHTML = '📊 Đang tải dữ liệu mới...';
                
                await loadRawCacheData();
                
                // Success message with cleanup info
                showJetFeedback(cleanupMessage + '📊 Dữ liệu đã được làm mới thành công!', 'success');
                
            } catch (error) {
                console.error('[Enhanced Refresh] Error:', error);
                showJetFeedback('❌ Lỗi khi làm mới dữ liệu: ' + error.message, 'error');
            } finally {
                refreshButton.disabled = false;
                refreshButton.innerHTML = '🔄 Làm mới & Đồng bộ';
            }
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

    console.log(`[updateJetCacheButtonState] ${sourceKey}/${folderPath}: total=${totalFiles}, completed=${stats.completed}, pending=${stats.pending}, processing=${stats.processing}, failed=${stats.failed}`);

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
    } else if (totalFiles === 0) {
        buttonText = 'Không có file RAW';
        buttonTitle = 'Không có file RAW nào trong thư mục này.';
        isDisabled = true;
        icon = '❌';
    } else if (stats.completed === totalPossibleJobs && totalPossibleJobs > 0) {
        // Cache đã hoàn thành 100% - chỉ cho phép refresh/rebuild
        buttonText = 'Cache hoàn thành';
        buttonTitle = `Cache đã hoàn thành cho ${stats.completed}/${totalPossibleJobs} ảnh RAW. Click để tạo lại cache.`;
        isDisabled = false;
        icon = '✅';
    } else if (stats.completed > 0) {
        // Cache một phần - cho phép tiếp tục
        buttonText = 'Tiếp tục Cache';
        buttonTitle = `Đã cache ${stats.completed}/${totalPossibleJobs} file RAW. Click để tiếp tục cache.`;
        isDisabled = false;
        icon = '🔄';
    } else {
        // Chưa có cache nào
        buttonText = 'Tạo Cache RAW';
        buttonTitle = 'Tạo cache 750px cho tất cả file RAW trong thư mục.';
        isDisabled = false;
        icon = '➕';
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
    let warningHTML = '';

    // Check for validation issues
    if (folder.validation_issues && folder.validation_issues.length > 0) {
        warningHTML = '<span class="validation-warning" title="Database có thể không đồng bộ với thực tế">⚠️</span>';
    }

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
    
    // Add validation warning to title if present
    if (folder.validation_issues && folder.validation_issues.length > 0) {
        title += ' ⚠️ Cảnh báo: Database có thể không đồng bộ với thực tế.';
    }
    
    // Combine status, progress bar, warning and icon - matches gallery pattern
    return `<div class="cache-status-wrapper" title="${escapeHTML(title)}">
                ${warningHTML}
                ${statusHTML}
                ${progressHTML}
                ${infoIconHTML}
            </div>`;
}

async function loadRawCacheData() {
    console.log('[loadRawCacheData] Starting to load RAW cache data...');
    showJetLoading('Đang tải dữ liệu cache RAW...');
    
    try {
        // Load both cache stats (overall) and folders data
        console.log('[loadRawCacheData] Fetching cache stats and folders data...');
        const timestamp = Date.now(); // Add timestamp to prevent browser caching
        const [statsResponse, foldersResponse] = await Promise.all([
            fetch(`api.php?action=jet_get_cache_stats&_t=${timestamp}`), // Keep overall stats
            fetch(`api.php?action=jet_list_raw_folders_with_cache_stats&_t=${timestamp}`) // New API for folders
        ]);

        console.log('[loadRawCacheData] Responses received, parsing JSON...');
        const [statsResult, foldersResult] = await Promise.all([
            statsResponse.json(),
            foldersResponse.json()
        ]);

        console.log('[loadRawCacheData] Stats result:', statsResult);
        console.log('[loadRawCacheData] Folders result:', foldersResult);

        if (statsResult.success) {
            console.log('[loadRawCacheData] Updating cache stats...');
            updateCacheStats(statsResult.stats);
            updateFailedJobsSection(statsResult.recent_failed);
        } else {
            console.error('[loadRawCacheData] Stats loading failed:', statsResult.error);
            showJetFeedback(statsResult.error || 'Lỗi tải thống kê cache tổng quan', 'error');
        }

        if (foldersResult.success) {
            console.log(`[loadRawCacheData] Updating folders data (${foldersResult.folders.length} folders)...`);
            rawSourcesData = foldersResult.folders; // Store folder data
            renderRawSourcesTable(rawSourcesData); // Render using folder data
            console.log('[loadRawCacheData] Folders table rendered successfully');
            
            // Show auto-cleanup message if any records were cleaned
            if (foldersResult.auto_cleaned && foldersResult.auto_cleaned > 0) {
                showJetFeedback(
                    `✨ ${foldersResult.auto_cleanup_message} Database đã được đồng bộ tự động.`, 
                    'info'
                );
                console.log(`[loadRawCacheData] Auto-cleanup: ${foldersResult.auto_cleaned} records removed`);
            }
            
            // Check for validation issues across all folders
            const foldersWithIssues = foldersResult.folders.filter(f => f.validation_issues && f.validation_issues.length > 0);
            if (foldersWithIssues.length > 0) {
                console.log(`[loadRawCacheData] Found ${foldersWithIssues.length} folders with validation issues`);
                showJetFeedback(
                    `⚠️ Phát hiện ${foldersWithIssues.length} thư mục có vấn đề đồng bộ. Hệ thống đã tự động xử lý.`, 
                    'warning'
                );
            }
        } else {
            console.error('[loadRawCacheData] Folders loading failed:', foldersResult.error);
            showJetFeedback(foldersResult.error || 'Lỗi tải danh sách thư mục RAW', 'error');
        }

        console.log('[loadRawCacheData] Data loading completed successfully');

        // Update last refresh time
        updateLastRefreshTime();

    } catch (error) {
        console.error('[loadRawCacheData] Error loading RAW cache data:', error);
        showJetFeedback('Lỗi kết nối khi tải dữ liệu cache RAW', 'error');
    } finally {
        hideJetLoading();
        console.log('[loadRawCacheData] Loading process finished');
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
    const totalPossibleJobs = folderData.total_raw_files; // Only 750px jobs now

    let detailsHTML = '';
    detailsHTML += `<p><strong>Tổng số file RAW:</strong> ${folderData.total_raw_files} file</p>`;
    detailsHTML += `<p><strong>Cache jobs (750px only):</strong> ${totalPossibleJobs}</p>`;
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

        console.log(`[handleRawCacheFolder] Sending request with:`, {
            action: 'jet_queue_folder_cache',
            source_key: sourceKey,
            folder_path: folderPath
        });

        const response = await fetch('api.php', { 
            method: 'POST', 
            body: formData,
            credentials: 'include' // Ensure cookies/session are sent
        });
        
        console.log(`[handleRawCacheFolder] Response status: ${response.status}`);
        console.log(`[handleRawCacheFolder] Response headers:`, response.headers);
        
        const result = await response.json();
        console.log('API response received:', result);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${result.error || result.message || 'Unknown error'}`);
        }
        
        if (result.success !== true) {
            throw new Error(result.error || result.message || 'API returned success=false');
        }

        // SUCCESS: Job queued or already running
        const message = result.message || 'Yêu cầu đã được xử lý.';
        let feedbackType = 'success';
        
        if (result.status === 'queued' && result.queued_count > 0) {
            feedbackType = 'success';
        } else if (result.status === 'no_new_jobs' || result.queued_count === 0) {
            feedbackType = 'warning';
        } else {
            feedbackType = 'info';
        }
        
        showJetFeedback(message, feedbackType);
        
        console.log(`[handleRawCacheFolder] Success: ${message} (status: ${result.status}, queued: ${result.queued_count})`);
        
        // Find folder data and update button state immediately if queued
        const folderData = rawSourcesData.find(f => 
            f.source_key === sourceKey && f.relative_path === folderPath
        );
        
        const statusCell = button.closest('tr')?.querySelector('td[data-label="Trạng thái Cache"]');
        
        // Only start polling if new jobs were actually queued
        if (result.status === 'queued' && result.queued_count > 0 && folderData) {
            // Update local stats to show pending
            folderData.cache_stats.pending += result.queued_count;
            updateJetCacheButtonState(button, sourceKey, folderPath, folderData.cache_stats, folderData.total_raw_files);
            
            // *** START POLLING *** 
            if (statusCell) {
                 startJetCachePolling(button, statusCell, sourceKey, folderPath); 
            } else {
                 console.error(`[Cache Request ${pollerKey}] Could not find status cell to start polling.`);
            }
        } else {
            // No new jobs queued - just refresh the data to show current state
            console.log(`[handleRawCacheFolder] No new jobs queued, refreshing data to show current state`);
            if (folderData) {
                updateJetCacheButtonState(button, sourceKey, folderPath, folderData.cache_stats, folderData.total_raw_files);
            }
            // Optionally refresh the entire data to get latest state
            setTimeout(() => loadRawCacheData(), 1000);
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
        stopJetCachePolling(pollerKey); // Now pollerKey is defined
    }
}

// Polling function for cache status - matches gallery pollCacheStatus pattern
async function pollJetCacheStatus(button, statusCell, sourceKey, folderPath) {
    const pollerKey = `${sourceKey}_${folderPath}`;
    console.log(`[Polling ${pollerKey}] Checking status...`);
    
    try {
        // Fetch updated data
        const timestamp = Date.now(); // Prevent browser caching
        const response = await fetch(`api.php?action=jet_list_raw_folders_with_cache_stats&_t=${timestamp}`);
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
    showJetLoading('Đang dọn dẹp records bị mồ côi...');
    try {
        const response = await fetch('api.php?action=jet_cleanup_orphaned_cache_records', {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            const message = `Đã kiểm tra ${result.checked_count} records. Xóa ${result.deleted_count} records bị mồ côi.`;
            showJetFeedback(message, 'success');
            
            // Hiển thị modal chi tiết nếu có records bị xóa
            if (result.deleted_count > 0) {
                showOrphanedRecordsDetailsModal(result);
            }
            
            // Làm mới dữ liệu ngay lập tức sau khi dọn dẹp
            await loadRawCacheData();
        } else {
            showJetFeedback(result.error || 'Lỗi dọn dẹp records', 'error');
        }
    } catch (error) {
        console.error('Error cleaning up orphaned records:', error);
        showJetFeedback('Lỗi kết nối khi dọn dẹp records', 'error');
    } finally {
        hideJetLoading();
    }
}

function showOrphanedRecordsDetailsModal(result) {
    const modalContent = `
        <div class="orphaned-records-details">
            <h3>Chi tiết Dọn dẹp Records Bị Mồ Côi</h3>
            <p>Tổng số records đã kiểm tra: <strong>${result.checked_count}</strong></p>
            <p>Số records bị mồ côi: <strong>${result.orphaned_count}</strong></p>
            <p>Số records đã xóa: <strong>${result.deleted_count}</strong></p>
            
            <div class="details-note">
                <p>⚠️ Các records bị mồ côi là những records cache đã hoàn thành nhưng file vật lý không còn tồn tại.</p>
                <p>Điều này có thể xảy ra do:</p>
                <ul>
                    <li>Xóa file thủ công</li>
                    <li>Di chuyển/rename thư mục</li>
                    <li>Lỗi hệ thống</li>
                </ul>
            </div>
        </div>
    `;

    // Tạo modal động
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">
                <h2>Dọn dẹp Cache</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content">
                ${modalContent}
            </div>
            <div class="modal-footer">
                <button class="modal-ok-button">Đóng</button>
            </div>
        </div>
    `;

    // Thêm sự kiện đóng modal
    const closeButtons = modal.querySelectorAll('.modal-close, .modal-ok-button');
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });

    document.body.appendChild(modal);
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

// Auto-refresh every 15 seconds (more responsive for manual cache deletions)
setInterval(() => {
    // Only load if the jet cache tab is currently active
    const jetCacheTabContent = document.getElementById('jet-cache-tab');
    if (jetCacheTabContent && jetCacheTabContent.classList.contains('active')) {
        if (Object.keys(activePollers).length === 0) {
            console.log("Auto-refreshing RAW cache data with auto-cleanup...");
            // Auto-refresh includes auto-cleanup to detect manually deleted cache files
            loadRawCacheData(); // This API call includes auto-cleanup logic
        } else {
            console.log("Skipping auto-refresh - active pollers:", Object.keys(activePollers).length);
        }
    }
}, 15000);

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

// Keyboard shortcuts for refresh
document.addEventListener('keydown', (e) => {
    const jetCacheTabContent = document.getElementById('jet-cache-tab');
    const isJetCacheTabActive = jetCacheTabContent && jetCacheTabContent.classList.contains('active');
    
    // F5 or Ctrl+R to refresh (only when jet cache tab is active)
    if (isJetCacheTabActive && (e.key === 'F5' || (e.ctrlKey && e.key === 'r'))) {
        e.preventDefault(); // Prevent browser refresh
        const refreshButton = document.getElementById('refresh-jet-cache-data');
        if (refreshButton && !refreshButton.disabled) {
            console.log('Keyboard shortcut triggered refresh');
            refreshButton.click();
        }
    }
});

// Make functions globally available
window.loadJetCacheStats = loadRawCacheData; // For tab switching compatibility
window.loadRawCacheData = loadRawCacheData;
window.handleRawCacheSource = handleRawCacheFolder; // Rename function for clarity
window.clearFailedJetCacheJobs = clearFailedJetCacheJobs;

// Add tab click listener for immediate refresh with auto-cleanup
document.addEventListener('click', (e) => {
    // Check if user clicked on the Jet Cache tab
    if (e.target.closest('[data-tab="jet-cache"]')) {
        console.log("Jet Cache tab clicked - force refreshing with auto-cleanup...");
        // Stop all pollers and force refresh to ensure auto-cleanup runs
        Object.keys(activePollers).forEach(key => stopJetCachePolling(key));
        setTimeout(() => loadRawCacheData(), 100); // Small delay to ensure tab is active
    }
});

// Main 'Update Cache' button functionality removed
// Cache management now handled only through individual folder buttons 

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('vi-VN');
    const refreshButton = document.getElementById('refresh-jet-cache-data');
    if (refreshButton) {
        refreshButton.title = `Làm mới dữ liệu và đồng bộ database. Cập nhật cuối: ${timeString}`;
    }
    
    // Also update any existing last refresh display
    let lastRefreshDisplay = document.getElementById('last-refresh-time');
    if (!lastRefreshDisplay) {
        // Create the display element if it doesn't exist
        const tabHeader = document.querySelector('#jet-cache-tab .tab-header');
        if (tabHeader) {
            lastRefreshDisplay = document.createElement('small');
            lastRefreshDisplay.id = 'last-refresh-time';
            lastRefreshDisplay.style.color = '#666';
            lastRefreshDisplay.style.marginLeft = '10px';
            tabHeader.appendChild(lastRefreshDisplay);
        }
    }
    
    if (lastRefreshDisplay) {
        lastRefreshDisplay.textContent = `Cập nhật cuối: ${timeString}`;
    }
} 