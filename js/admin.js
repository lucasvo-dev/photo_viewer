document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const folderListBody = document.getElementById('folder-list-body');
    const adminSearchInput = document.getElementById('adminSearchInput');
    const adminSortSelect = document.getElementById('adminSortSelect');
    const adminMessageDiv = document.getElementById('admin-message');
    const adminFeedbackDiv = document.getElementById('admin-feedback');
    const adminLoadingDiv = document.getElementById('admin-loading');

    // --- Configuration ---
    const API_URL = 'api.php'; // API endpoint haha

    // --- Global state for polling --- 
    const activePollers = {}; // Store interval IDs: { "folder/path": intervalId }
    const POLLING_INTERVAL_MS = 10000; // Increased: Check every 10 seconds

    // --- Utility Functions ---
    function escapeHTML(str) {
        if (typeof str !== 'string') return str;
        const p = document.createElement('p');
        p.appendChild(document.createTextNode(str));
        return p.innerHTML;
    }

    function showLoading(message = 'Đang tải...') {
        if (adminLoadingDiv) {
            adminLoadingDiv.textContent = message;
            adminLoadingDiv.style.display = 'block';
        }
        if (adminFeedbackDiv) {
            adminFeedbackDiv.style.display = 'none';
        }
    }

    function hideLoading() {
        if (adminLoadingDiv) {
            adminLoadingDiv.style.display = 'none';
        }
    }

    function showFeedback(message, type = 'success') {
        if (adminFeedbackDiv) {
            adminFeedbackDiv.textContent = message;
            adminFeedbackDiv.className = `feedback-message feedback-${type}`;
            adminFeedbackDiv.style.display = 'block';
        }
        hideLoading();
        setTimeout(() => {
            if (adminFeedbackDiv) adminFeedbackDiv.style.display = 'none';
        }, 5000);
    }

    // --- Debounce helper ---
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // --- API Call Helper ---
    async function fetchData(url, options = {}) {
        try {
            const res = await fetch(url, options);
            // Check for specific admin-related errors first if needed, e.g., 403 Forbidden
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: res.statusText }));
                // Prioritize error message from JSON payload if available
                throw new Error(errData.error || `Lỗi HTTP ${res.status}`);
            }
            // Assume successful responses are JSON for admin actions
            const data = await res.json(); 
            return { status: 'success', data }; // Mimic structure used in handleCacheFolder
        } catch (e) {
            console.error("Fetch API Error (admin):", e);
            // Return an error structure consistent with what the calling code expects
            return { status: 'error', message: e.message || 'Lỗi kết nối mạng.' }; 
        }
    }

    // --- Function to Update Button State --- 
    function updateCacheButtonState(button, folderPath, jobStatus, lastCachedAt) {
        let buttonText = '';
        let buttonTitle = '';
        let isDisabled = false;
        let icon = ''; // Optional icon

        if (jobStatus === 'processing') {
            buttonText = 'Đang xử lý...';
            buttonTitle = 'Cache ảnh lớn đang được xử lý trong nền.';
            isDisabled = true;
            icon = '⚙️';
        } else if (jobStatus === 'pending') {
            buttonText = 'Đang chờ xử lý';
            buttonTitle = 'Yêu cầu cache ảnh lớn đang chờ xử lý trong nền.';
            isDisabled = true;
            icon = '🕒';
        } else { // Job is null (completed, failed, or never run)
            if (lastCachedAt) {
                buttonText = 'Cập nhật Cache';
                buttonTitle = 'Cache ảnh lớn đã tạo lúc: ' + new Date(lastCachedAt * 1000).toLocaleString() + '. Click để chạy lại quá trình cache trong nền.';
                isDisabled = false;
                icon = '🔄';
            } else {
                buttonText = 'Tạo Cache Ảnh Lớn';
                buttonTitle = 'Yêu cầu tạo cache thumbnail kích thước lớn cho thư mục này trong nền.';
                isDisabled = false;
                icon = '➕';
            }
        }
        
        button.innerHTML = `${icon} ${buttonText}`.trim(); // Add icon
        button.title = buttonTitle;
        button.disabled = isDisabled;
    }
    
    // +++ Function to Render Cache Status Cell Content (MODIFIED) +++
    function renderCacheStatusCell(folder) {
        const lastCachedTimestamp = folder.last_cached_fully_at;
        const lastCachedCount = folder.last_cached_image_count;
        const currentJobStatus = folder.current_cache_job_status; // pending or processing
        const lastResultMessage = folder.latest_job_result_message;
        const folderPath = folder.path; // Get folder path

        // === Lấy thông tin tiến trình ===
        const totalFiles = folder.total_files || 0;
        const processedFiles = folder.processed_files || 0;
        const currentFile = folder.current_file_processing || '';
        // === Kết thúc lấy thông tin ===

        let statusHTML = '';
        let title = '';
        let infoIconHTML = '';
        let progressHTML = ''; // HTML cho progress bar

        if (currentJobStatus === 'processing') {
            const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
            // Rút gọn tên file nếu quá dài
            const displayFile = currentFile.length > 40 ? '...' + currentFile.slice(-37) : currentFile;

            statusHTML = `<span class="status-processing">⚙️ Đang xử lý (${percentage}%)</span>`;
            // Thêm progress bar
            progressHTML = `<progress class="cache-progress-bar" value="${processedFiles}" max="${totalFiles}" title="${processedFiles}/${totalFiles}"></progress>`;
            // Thêm file hiện tại (nếu có)
            if (currentFile) {
                statusHTML += `<br><small class="processing-file-path" title="${escapeHTML(currentFile)}">${escapeHTML(displayFile)}</small>`;
            }
            title = `Worker đang tạo cache (${processedFiles}/${totalFiles} file).`;

        } else if (currentJobStatus === 'pending') {
            statusHTML = '<span class="status-pending">🕒 Đang chờ...</span>';
            title = 'Yêu cầu cache đang chờ trong hàng đợi.';
        } else if (lastCachedTimestamp) {
            const dateStr = new Date(lastCachedTimestamp * 1000).toLocaleString();
            const countStr = (lastCachedCount !== null && lastCachedCount !== undefined)
                               ? `${lastCachedCount} ảnh`
                               : 'không rõ số lượng';
            // Display count instead of timestamp
            statusHTML = `<span class="status-completed">✅ Cache (${countStr})</span>`;
            title = `Đã cache thành công ${countStr} lúc ${dateStr}.`;
            // Add info icon only if cache exists
            infoIconHTML = `<span class="cache-info-icon" data-folder-path="${escapeHTML(folderPath)}" title="Xem chi tiết cache">&#8505;</span>`; // Info symbol

            // Check for past errors even if currently cached
            if (folder.latest_job_status === 'failed') {
                statusHTML += `<br><span class="status-warning">⚠️ Lần chạy cuối gặp lỗi</span>`;
            }
        } else {
            // No cache timestamp, check last job result
            if (folder.latest_job_status === 'failed') {
                 const shortError = escapeHTML(lastResultMessage && lastResultMessage.length > 100 ? lastResultMessage.substring(0, 97) + '...' : (lastResultMessage || 'Lỗi không xác định'));
                 statusHTML = `<span class="status-failed">❌ Lỗi cache</span>`;
                 title = `Lần chạy cache cuối cùng thất bại: ${shortError}`;
                 infoIconHTML = `<span class="cache-info-icon" data-folder-path="${escapeHTML(folderPath)}" title="Xem chi tiết lỗi">&#8505;</span>`;
            } else {
                statusHTML = '<span class="status-never">➕ Chưa cache</span>';
                title = 'Chưa có cache ảnh lớn nào được tạo cho thư mục này.';
            }
        }
        // Combine status, progress bar and icon
        return `<div class="cache-status-wrapper" title="${escapeHTML(title)}">
                    ${statusHTML}
                    ${progressHTML}
                    ${infoIconHTML}
                </div>`;
    }
    // +++ END MODIFIED Function +++

    // +++ NEW Function to Show Cache Info Modal +++
    function showCacheInfoModal(folderData) {
        // Remove existing modal first
        const existingModal = document.getElementById('cacheInfoModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'cacheInfoModal';
        modalOverlay.className = 'modal-overlay cache-info-modal'; // Add specific class

        const lastCachedTimestamp = folderData.last_cached_fully_at;
        const lastCachedCount = folderData.last_cached_image_count;
        const lastResultMessage = folderData.latest_job_result_message;

        let detailsHTML = '';
        if (lastCachedTimestamp) {
            const dateStr = new Date(lastCachedTimestamp * 1000).toLocaleString();
            const countStr = (lastCachedCount !== null && lastCachedCount !== undefined)
                               ? `${lastCachedCount} ảnh`
                               : 'Không rõ số lượng';
            detailsHTML = `
                <p><strong>Số lượng ảnh đã cache:</strong> ${escapeHTML(countStr)}</p>
                <p><strong>Lần cache cuối:</strong> ${escapeHTML(dateStr)}</p>
            `;
        } else {
            detailsHTML = '<p>Chưa có thông tin cache thành công.</p>';
        }

        if (lastResultMessage) {
             detailsHTML += `<p><strong>Kết quả lần chạy cuối:</strong><br><span class="job-result-message">${escapeHTML(lastResultMessage)}</span></p>`;
        }

        modalOverlay.innerHTML = `
            <div class="modal-box">
                <h3>Thông tin Cache</h3>
                <p><strong>Thư mục:</strong> ${escapeHTML(folderData.name)}</p>
                <p><small><strong>Đường dẫn:</strong> ${escapeHTML(folderData.path)}</small></p>
                <hr style="margin: 15px 0; border-color: #30363d;">
                ${detailsHTML}
                <div class="prompt-actions" style="margin-top: 20px;">
                    <button class="button close-modal-button">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);
        document.body.classList.add('body-blur'); // Add blur

        // Add listener to close button
        const closeButton = modalOverlay.querySelector('.close-modal-button');
        closeButton.addEventListener('click', () => {
            modalOverlay.remove();
            document.body.classList.remove('body-blur'); // Remove blur
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
    // +++ END NEW Function +++

    // +++ NEW Function to Fetch and Show Cache Info +++
    async function fetchAndShowCacheInfo(folderPath) {
        showLoading('Đang lấy thông tin cache...');
        try {
            const apiUrl = `api.php?action=admin_list_folders&path_filter=${encodeURIComponent(folderPath)}`;
            const response = await fetch(apiUrl);
            const result = await response.json();

            if (!response.ok || !result.folders || result.folders.length === 0) {
                throw new Error(result.error || `Không tìm thấy thông tin cho thư mục ${folderPath}`);
            }

            const folderData = result.folders[0];
            hideLoading();
            showCacheInfoModal(folderData);

        } catch (error) {
            hideLoading();
            console.error('Error fetching cache info:', error);
            showFeedback(`Lỗi lấy thông tin cache: ${error.message}`, 'error');
        }
    }
    // +++ END NEW Function +++

    // --- Function to Poll Cache Status --- 
    async function pollCacheStatus(button, statusCell, folderPath) {
        console.log(`[Polling ${folderPath}] Checking status...`);
        try {
            // Fetch the full folder info again to get all latest details
            const apiUrl = `api.php?action=admin_list_folders&path_filter=${encodeURIComponent(folderPath)}`; // Use a filter param
            const response = await fetch(apiUrl);
            const result = await response.json();

            if (!response.ok || !result.folders || result.folders.length === 0) {
                 console.warn(`[Polling ${folderPath}] Failed to get updated folder info:`, result.error || `HTTP ${response.status}`);
                 return; // Keep previous button state on error
            }
            
            const updatedFolderData = result.folders[0]; // Assuming path_filter returns one
            console.log(`[Polling ${folderPath}] Received updated data:`, updatedFolderData);

            // Update status cell content
            if (statusCell) {
                statusCell.innerHTML = renderCacheStatusCell(updatedFolderData);
            }

            // Update button state based on job status
            const isJobActive = updatedFolderData.current_cache_job_status === 'pending' || updatedFolderData.current_cache_job_status === 'processing';
            button.disabled = isJobActive;
             if (isJobActive) {
                 button.title = 'Yêu cầu cache đang được xử lý hoặc đang chờ.';
             } else {
                 button.title = 'Yêu cầu tạo/kiểm tra lại cache'; // Reset title
             }

            // Stop polling if the job is no longer pending or processing
            if (!isJobActive) {
                stopPolling(folderPath);
            }

        } catch (error) {
             console.error(`[Polling ${folderPath}] Error:`, error);
        }
    }

    // --- Function to Start Polling --- 
    function startPolling(button, statusCell, folderPath) {
        // Clear existing poller for this path, if any
        stopPolling(folderPath);
        
        console.log(`[Polling ${folderPath}] Starting poller.`);
        // Initial immediate check
        pollCacheStatus(button, statusCell, folderPath); 
        
        // Start interval
        activePollers[folderPath] = setInterval(() => {
            pollCacheStatus(button, statusCell, folderPath);
        }, POLLING_INTERVAL_MS);
    }

    // --- Function to Stop Polling --- 
    function stopPolling(folderPath) {
        if (activePollers[folderPath]) {
            console.log(`[Polling ${folderPath}] Stopping poller.`);
            clearInterval(activePollers[folderPath]);
            delete activePollers[folderPath];
        }
    }

    // --- Fetch and Render Folders ---
    // Global variable to track if fetch is in progress
    let isFetching = false;

    async function fetchAndRenderFolders(searchTerm = '', sortBy = 'cache_priority') {
        if (!folderListBody) return;
        
        // Prevent concurrent requests
        if (isFetching) {
            console.log('Fetch already in progress, skipping...');
            return;
        }
        
        isFetching = true;
        
        // CRITICAL: Stop all active polling jobs to prevent conflicts
        console.log('Stopping all active polling jobs before fetch...');
        const activePollerKeys = Object.keys(activePollers);
        activePollerKeys.forEach(key => {
            clearInterval(activePollers[key]);
            delete activePollers[key];
        });
        console.log(`Stopped ${activePollerKeys.length} active pollers`);

        folderListBody.innerHTML = '<tr><td colspan="8">Đang tải dữ liệu...</td></tr>';

        let apiUrl = 'api.php?action=admin_list_folders';
        const params = new URLSearchParams();
        
        if (searchTerm) {
            params.append('search', searchTerm);
        }
        if (sortBy) {
            params.append('sort', sortBy);
        }
        
        if (params.toString()) {
            apiUrl += `&${params.toString()}`;
        }

        try {
            console.log(`Fetching data: ${apiUrl}`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(apiUrl, { 
                signal: controller.signal,
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Lỗi HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }
            
            console.log(`Successfully loaded ${result.folders?.length || 0} folders`);
            
            // Render the table
            renderFolderTable(result.folders || []);
            
        } catch (error) {
            console.error("Lỗi tải danh sách thư mục:", error);
            
            if (error.name === 'AbortError') {
                folderListBody.innerHTML = `<tr><td colspan="8" style="color: orange;">⏱️ Request timeout - vui lòng thử lại</td></tr>`;
                showFeedback('Request timeout - vui lòng thử lại', 'error');
            } else {
                folderListBody.innerHTML = `<tr><td colspan="8" style="color: red;">❌ Lỗi tải dữ liệu: ${error.message}</td></tr>`;
                showFeedback(`Lỗi tải danh sách: ${error.message}`, 'error');
            }
        } finally {
            isFetching = false;
        }
    }

    // --- Render Table Rows ---
    function renderFolderTable(folders) {
        folderListBody.innerHTML = ''; // Xóa nội dung cũ

        if (folders.length === 0) {
            folderListBody.innerHTML = '<tr><td colspan="8">Không tìm thấy thư mục nào.</td></tr>';
            return;
        }

        folders.forEach(folder => {
            const row = document.createElement('tr');
            row.dataset.folderPath = folder.path; // Lưu đường dẫn để dễ tham chiếu

            const folderName = escapeHTML(folder.name);
            const folderPath = escapeHTML(folder.path);
            const shareLink = `${window.location.origin}${window.location.pathname.replace(/[^\/]*$/, '')}?#?folder=${encodeURIComponent(folder.path)}`; // Link chia sẻ
            const views = folder.views || 0;
            const zipDownloads = folder.zip_downloads || 0;
            const isPasswordProtected = folder.is_password_protected;
            
            // === Thêm data-label vào các ô ===
            row.innerHTML = `
                <td data-label="Tên thư mục"><strong>${folderName}</strong><br><small>${folderPath}</small></td>
                <td data-label="Trạng thái">
                    <span class="status-${isPasswordProtected ? 'protected' : 'unprotected'}">
                        ${isPasswordProtected ? '🔒 Có mật khẩu' : '✅ Công khai'}
                    </span>
                </td>
                <td data-label="Lượt xem">${views}</td>
                <td data-label="Lượt tải ZIP">${zipDownloads}</td>
                <td data-label="Link chia sẻ">
                    <div class="share-link-cell">
                        <div class="share-link-container">
                            <input type="text" class="share-link-input" value="${shareLink}" readonly title="Click để chọn và sao chép">
                            <button type="button" class="copy-link-button" title="Sao chép link">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="copy-feedback">Đã sao chép!</div>
                    </div>
                </td>
                <td data-label="Quản lý Mật khẩu">
                    <div class="password-management-cell">
                        <div class="password-status">
                            <span class="password-status-badge ${isPasswordProtected ? 'protected' : 'unprotected'}">
                                <i class="fas fa-${isPasswordProtected ? 'lock' : 'lock-open'}"></i>
                                ${isPasswordProtected ? 'Đã bảo vệ' : 'Công khai'}
                            </span>
                        </div>
                        <form class="action-form password-form" data-folder-path="${folderPath}">
                            <div class="password-input-group">
                                <input type="password" name="new_password" placeholder="Mật khẩu mới..." aria-label="Mật khẩu mới cho ${folderName}">
                                <div class="password-actions">
                                    <button type="submit" class="button set-password" title="Lưu mật khẩu mới">
                                        <i class="fas fa-save"></i>
                                    </button>
                                    ${isPasswordProtected ? `<button type="button" class="button remove-password" title="Xóa mật khẩu hiện tại">
                                        <i class="fas fa-trash"></i>
                                    </button>` : ''}
                                </div>
                            </div>
                        </form>
                    </div>
                </td>
                <td data-label="Trạng thái Cache">
                    ${renderCacheStatusCell(folder)}
                </td>
                <td data-label="Hành động Cache">
                     <button class="button cache-button" title="Yêu cầu cache ảnh lớn">...</button> 
                </td>
            `;
            // === Kết thúc thêm data-label ===

            // Find the cache button and status cell we just created
            const cacheButton = row.querySelector('.cache-button');
            const cacheStatusCell = row.querySelector('td[data-label="Trạng thái Cache"]'); // Use the new data-label selector
            
            if (cacheButton && cacheStatusCell) {
                 // Set initial state for the button
                 updateCacheButtonState(cacheButton, folderPath, folder.current_cache_job_status, folder.last_cached_fully_at);
    
                 // Add click listener for caching
                 cacheButton.addEventListener('click', (e) => {
                     e.preventDefault();
                     handleCacheFolder(cacheButton, folderPath); 
                 });
    
                 // Start polling if job is active
                 if (folder.current_cache_job_status === 'pending' || folder.current_cache_job_status === 'processing') {
                     startPolling(cacheButton, cacheStatusCell, folderPath);
                 }
             } else {
                console.warn("Could not find cache button or status cell for row:", folderPath);
             }


            // Add event listeners after elements are in the DOM (within the row)
            const passwordForm = row.querySelector('.password-form');
            if (passwordForm) {
                passwordForm.addEventListener('submit', handlePasswordSubmit);
            }

            // === THÊM CODE GẮN EVENT LISTENER CHO NÚT XÓA MK ===
            const removeButton = row.querySelector('.remove-password');
            if (removeButton) {
                 removeButton.addEventListener('click', handleRemovePassword);
            }
            // === KẾT THÚC THÊM CODE ===

            // === THÊM CODE GẮN EVENT LISTENER CHO NÚT COPY LINK ===
            const copyButton = row.querySelector('.copy-link-button');
            if (copyButton) {
                copyButton.addEventListener('click', handleCopyLink);
            }

            const shareInput = row.querySelector('.share-link-input');
            if (shareInput) {
                shareInput.addEventListener('click', handleShareLinkClick);
            }
            // === KẾT THÚC THÊM CODE ===

            folderListBody.appendChild(row);
        });
    }
    
    // --- Handle Copy Link Button ---
    function handleCopyLink(event) {
        const button = event.target.closest('.copy-link-button');
        const container = button.closest('.share-link-container');
        const input = container.querySelector('.share-link-input');
        const feedback = button.closest('.share-link-cell').querySelector('.copy-feedback');
        
        try {
            input.select();
            navigator.clipboard.writeText(input.value).then(() => {
                // Show feedback animation
                feedback.classList.add('show');
                
                // Change button icon temporarily
                const icon = button.querySelector('i');
                const originalClass = icon.className;
                icon.className = 'fas fa-check';
                
                setTimeout(() => {
                    feedback.classList.remove('show');
                    icon.className = originalClass;
                }, 2000);
                
            }).catch(err => {
                console.error('Lỗi sao chép link:', err);
                showFeedback('Lỗi: Không thể tự động sao chép.', 'error');
            });
        } catch (err) {
            console.error('Lỗi clipboard API:', err);
            showFeedback('Lỗi: Trình duyệt không hỗ trợ sao chép tự động.', 'error');
        }
    }
    
    // --- Handle Share Link Click ---
    function handleShareLinkClick(event) {
        const input = event.target;
        input.select();
        try {
            navigator.clipboard.writeText(input.value).then(() => {
                 showFeedback(`Đã sao chép link cho thư mục: ${input.closest('tr').querySelector('td').textContent}`);
            }).catch(err => {
                console.error('Lỗi sao chép link:', err);
                showFeedback('Lỗi: Không thể tự động sao chép.', 'error');
            });
        } catch (err) {
            console.error('Lỗi clipboard API:', err);
            showFeedback('Lỗi: Trình duyệt không hỗ trợ sao chép tự động.', 'error');
        }
    }

    // --- Handle Password Form Submission (Set/Update) ---
    async function handlePasswordSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const folderName = form.dataset.folderPath;
        const passwordInput = form.querySelector('input[name="new_password"]');
        const password = passwordInput.value;
        const submitButton = form.querySelector('button[type="submit"]');

        if (!password) {
            showFeedback('Vui lòng nhập mật khẩu mới.', 'error');
            passwordInput.focus();
            return;
        }

        const originalButtonText = submitButton.textContent;
        submitButton.textContent = 'Đang lưu...';
        submitButton.disabled = true;

        const formData = new FormData();
        formData.append('action', 'admin_set_password');
        formData.append('folder', folderName);
        formData.append('password', password);

        try {
            const response = await fetch('api.php', { method: 'POST', body: formData });
            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || `Lỗi HTTP ${response.status}`);
            }

            showFeedback(result.message || 'Đặt mật khẩu thành công!', 'success');
            passwordInput.value = ''; // Clear input
            // Reload the list to show updated status
            const searchTerm = adminSearchInput?.value.trim() || '';
            const sortBy = adminSortSelect?.value || 'cache_priority';
            fetchAndRenderFolders(searchTerm, sortBy); 

        } catch (error) {
            console.error("Lỗi đặt mật khẩu:", error);
            showFeedback(`Lỗi: ${error.message}`, 'error');
        }

        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }

    // --- Handle Remove Password Click ---
    async function handleRemovePassword(event) {
        const button = event.target;
        const form = button.closest('.action-form');
        const folderName = form.dataset.folderPath;

        if (!confirm(`Bạn có chắc muốn xóa mật khẩu cho thư mục "${folderName}"?`)) {
            return;
        }
        
        button.textContent = 'Đang xóa...';
        button.disabled = true;

        const formData = new FormData();
        formData.append('action', 'admin_remove_password');
        formData.append('folder', folderName);

        try {
            const response = await fetch('api.php', { method: 'POST', body: formData });
            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || `Lỗi HTTP ${response.status}`);
            }

            showFeedback(result.message || 'Xóa mật khẩu thành công!', 'success');
             // Reload the list to show updated status
             const searchTerm = adminSearchInput?.value.trim() || '';
             const sortBy = adminSortSelect?.value || 'cache_priority';
             fetchAndRenderFolders(searchTerm, sortBy);

        } catch (error) {
            console.error("Lỗi xóa mật khẩu:", error);
            showFeedback(`Lỗi: ${error.message}`, 'error');
            // Re-enable button on error
             button.textContent = 'Xóa MK';
             button.disabled = false;
        }
        // Button state is handled by the reload
    }

    // --- Event Listeners ---
    // +++ NEW Event Listener for Cache Info Icons (Delegation) +++
    folderListBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('cache-info-icon')) {
            const folderPath = event.target.dataset.folderPath;
            if (folderPath) {
                fetchAndShowCacheInfo(folderPath);
            }
        }
        // Listener for share link click (can be combined here)
         if (event.target.classList.contains('share-link-input')) {
             handleShareLinkClick(event);
         }
    });
    // +++ END NEW Listener +++

    /* TẠM THỜI BỎ EVENT DELEGATION RIÊNG CHO CACHE BUTTON
    folderListBody.addEventListener('click', (event) => {
// ... existing code ...
    });
    */

    // --- Action Handlers ---
    async function handleCacheFolder(button, folderPath) {
        console.log(`handleCacheFolder called for path: ${folderPath}`);

        // Check if already polling (button should be disabled, but as extra check)
        if (activePollers[folderPath]) {
            console.warn(`[Cache Request ${folderPath}] Ignoring click, already polling/processing.`);
            return;
        }
        
        if (!confirm(`Bạn có chắc muốn yêu cầu tạo/cập nhật cache cho thư mục "${folderPath}"? Quá trình này sẽ chạy trong nền.`)) {
            console.log('Cache request cancelled by user.');
            return;
        }
        
        button.disabled = true;
        button.innerHTML = `⏳ Đang gửi yêu cầu...`; 
        button.title = 'Đang gửi yêu cầu cache lên server...';

        try {
            const formData = new FormData();
            formData.append('action', 'admin_queue_cache');
            formData.append('folder_path', folderPath);

            const response = await fetch('api.php', { method: 'POST', body: formData });
            const result = await response.json();
            console.log('API response received:', result);

            if (!response.ok || result.success !== true) {
                throw new Error(result.error || result.message || `Lỗi HTTP ${response.status}`);
            }

            // SUCCESS: Job queued or already running
            showFeedback(result.message || 'Yêu cầu đã được xử lý.', result.status === 'queued' ? 'success' : 'warning'); 
            
            // === SỬA Ở ĐÂY: Cập nhật nút thành 'pending' ngay nếu API trả về 'queued' ===
            const statusCell = button.closest('tr').querySelector('td[data-label="Trạng thái Cache"]');
            if (result.status === 'queued') {
                updateCacheButtonState(button, folderPath, 'pending', null); // Set to pending immediately
                if (statusCell) {
                    // Optionally update the cell text immediately too, although polling will overwrite
                    // statusCell.innerHTML = renderCacheStatusCell({ path: folderPath, current_cache_job_status: 'pending'}); 
                }
            } // Nếu status là 'already_queued' hoặc khác, polling sẽ xử lý trạng thái đúng

            // *** START POLLING *** 
            if (statusCell) {
                 startPolling(button, statusCell, folderPath); 
            } else {
                 console.error(`[Cache Request ${folderPath}] Could not find status cell to start polling.`);
                 // Maybe restore button state here if polling can't start?
                 // updateCacheButtonState(button, folderPath, null, null); // Restore to default 'Create Cache'
            }

        } catch (error) {
            // FAILURE: API call failed
            hideLoading(); 
            console.error("Error requesting cache job:", error);
            showFeedback(`Lỗi gửi yêu cầu cache: ${error.message}`, "error");
            
            // Restore original button state on failure using update function
             const statusCellFallback = button.closest('tr')?.querySelector('td[data-label="Trạng thái Cache"]');
             // We need the *current* known status (which is likely null or old) to restore correctly
             // Fetching it again here might be overkill, let's just restore to a default 'create' state
             updateCacheButtonState(button, folderPath, null, null); // Restore button to 'Tạo Cache Ảnh Lớn'
             stopPolling(folderPath); // Ensure no poller is running after failure
        }
    }

    // --- Search Input Listener --- 
    let refreshIntervalId = null; // Biến lưu ID của interval
    const REFRESH_INTERVAL_MS = 15000; // 15 giây

    // REMOVED AUTO-REFRESH - Now using manual refresh button like Raw cache
    // function startAutoRefresh() {
    //     // Xóa interval cũ nếu có
    //     if (refreshIntervalId) {
    //         clearInterval(refreshIntervalId);
    //     }
    //     // Bắt đầu interval mới
    //     refreshIntervalId = setInterval(() => {
    //         // Chỉ refresh nếu người dùng không đang gõ tìm kiếm VÀ không có polling nào đang chạy
    //         if (document.activeElement !== adminSearchInput && Object.keys(activePollers).length === 0) {
    //             console.log('Auto-refreshing folder list...');
    //             fetchAndRenderFolders(adminSearchInput.value.trim());
    //          } else if (Object.keys(activePollers).length > 0) {
    //              console.log('Skipping auto-refresh because pollers are active.');
    //          }
    //     }, REFRESH_INTERVAL_MS);
    //      console.log(`Auto-refresh started with interval ID: ${refreshIntervalId}`);
    // }

    // function stopAutoRefresh() {
    //      if (refreshIntervalId) {
    //         console.log(`Stopping auto-refresh interval ID: ${refreshIntervalId}`);
    //         clearInterval(refreshIntervalId);
    //         refreshIntervalId = null;
    //     }
    // }

    // Enhanced refresh button - manual refresh like Raw cache tab
    const refreshGalleryButton = document.getElementById('refresh-gallery-data');
    if (refreshGalleryButton) {
        refreshGalleryButton.addEventListener('click', async () => {
            console.log('Manual gallery refresh triggered');
            
            // Prevent refresh if already fetching
            if (isFetching) {
                console.log('Fetch already in progress, ignoring refresh button...');
                showFeedback('⏳ Đang tải dữ liệu, vui lòng chờ...', 'info');
                return;
            }
            
            // Visual feedback
            refreshGalleryButton.disabled = true;
            refreshGalleryButton.innerHTML = '🔄 Đang làm mới...';
            
            try {
                // Load fresh data using the improved fetchAndRenderFolders (it handles polling cleanup)
                console.log('[Manual Refresh] Loading fresh gallery data...');
                
                const searchTerm = adminSearchInput?.value.trim() || '';
                const sortBy = adminSortSelect?.value || 'cache_priority';
                await fetchAndRenderFolders(searchTerm, sortBy);
                
                // Success message
                showFeedback('📊 Dữ liệu Gallery đã được làm mới thành công!', 'success');
                
                // Note: Active polling for cache jobs will be automatically restarted 
                // by renderFolderTable() when it detects jobs with 'pending' or 'processing' status
                
            } catch (error) {
                console.error('[Manual Refresh] Error:', error);
                showFeedback('❌ Lỗi khi làm mới dữ liệu: ' + error.message, 'error');
            } finally {
                refreshGalleryButton.disabled = false;
                refreshGalleryButton.innerHTML = '🔄 Làm mới & Đồng bộ';
            }
        });
    }

    // Combined debounced function for both search and sort
    const debouncedFetchFolders = debounce(() => {
        if (isFetching) {
            console.log('Fetch in progress, skipping debounced call...');
            return;
        }
        
        console.log('Debounced fetch triggering...');
        const searchTerm = adminSearchInput?.value.trim() || '';
        const sortBy = adminSortSelect?.value || 'cache_priority';
        fetchAndRenderFolders(searchTerm, sortBy);
    }, 300); // Reduced to 300ms for better responsiveness

    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', () => {
             console.log('Search input changed, debouncing...');
             debouncedFetchFolders(); 
        });
        
         // Xử lý trường hợp xóa sạch ô tìm kiếm
         adminSearchInput.addEventListener('search', () => {
              if(adminSearchInput.value === '') {
                   console.log('Search cleared, immediate fetch...');
                   const sortBy = adminSortSelect?.value || 'cache_priority';
                   fetchAndRenderFolders('', sortBy);
              }
         });

    } else {
        console.error("Admin search input not found!");
    }

    // Sort dropdown listener with debounce
    if (adminSortSelect) {
        adminSortSelect.addEventListener('change', () => {
            console.log('Sort option changed:', adminSortSelect.value);
            debouncedFetchFolders(); // Use debounced function
        });
    } else {
        console.error("Admin sort select not found!");
    }

    // --- Initial Load ---
    fetchAndRenderFolders('', 'cache_priority');

}); // End DOMContentLoaded