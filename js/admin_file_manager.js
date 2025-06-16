/**
 * Admin File Manager Module
 * Quản lý upload, tạo, sửa, xóa file và thư mục
 */

class AdminFileManager {
    constructor() {
        this.selectedItems = new Set();
        this.currentSource = null;
        this.currentPath = '';
        this.debug = true; // Enable debug mode
        this.isInitialized = false;
        this.isNavigating = false; // Prevent multiple simultaneous navigation
        this.breadcrumbClickHandler = null; // Store bound event handler
        this.currentLoadKey = null; // Track current load request
        this.sourceChangeTimeout = null; // Debounce source changes
        this.isDeletingItem = false; // Prevent multiple delete confirmations
        this.isDeletingSelected = false; // Prevent multiple delete selected operations
        
        // Upload tracking
        this.isUploading = false;
        this.uploadAbortController = null;
        this.uploadProgressModal = null;
        
        this.init();
    }

    log(message, data = null) {
        if (this.debug) {
            console.log('[FileManager]', message, data || '');
        }
    }

    error(message, error = null) {
        console.error('[FileManager]', message, error || '');
    }

    init() {
        this.log('Initializing File Manager');
        if (this.isInitialized) return;
        
        this.bindEvents();
        this.loadImageSources();
        this.isInitialized = true;
        
        console.log('Admin File Manager initialized');
    }

    bindEvents() {
        // Source selector change
        const sourceSelect = document.getElementById('fm-source-select');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', (e) => {
                this.selectSource(e.target.value);
            });
        }

        // Action buttons
        const uploadBtn = document.getElementById('fm-upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.showUploadDialog());
        }

        const createFolderBtn = document.getElementById('fm-create-folder-btn');
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => this.showCreateFolderDialog());
        }

        const refreshBtn = document.getElementById('fm-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshCurrentDirectory());
        }
    }

    async loadImageSources() {
        try {
            // Use a simple API call to get available sources
            const response = await fetch('api.php?action=file_manager_get_sources');
            let sources = [];
            
            if (response.ok) {
                const data = await response.json();
                if (data.sources) {
                    sources = data.sources;
                }
            }
            
            // Fallback to hardcoded sources if API fails
            if (sources.length === 0) {
                sources = [
                    { key: 'main', name: 'Thư mục chính' },
                    { key: 'extra_drive', name: 'Ổ G 2020' },
                    { key: 'guu_ssd', name: 'SSD Guu 2020' },
                    { key: 'guu_2025', name: 'SSD Guu 2025' },
                    { key: 'guu_2025_e', name: 'E Drive 2025' }
                ];
            }
            
            const sourceSelect = document.getElementById('fm-source-select');
            if (!sourceSelect) {
                console.error('Source select element not found');
                return;
            }
            
            sourceSelect.innerHTML = '<option value="">-- Chọn nguồn ảnh --</option>';
            
            sources.forEach(source => {
                const option = document.createElement('option');
                option.value = source.key;
                option.textContent = source.name;
                sourceSelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error loading image sources:', error);
            this.showMessage('Không thể tải danh sách nguồn ảnh: ' + error.message, 'error');
        }
    }

    async selectSource(sourceKey) {
        this.log('Selecting source:', sourceKey);
        
        // Prevent rapid source changes
        if (this.sourceChangeTimeout) {
            clearTimeout(this.sourceChangeTimeout);
        }
        
        // Reset navigation state when changing sources
        this.isNavigating = false;
        this.currentLoadKey = null;
        
        this.currentSource = sourceKey;
        this.currentPath = '';
        this.selectedItems.clear();
        
        this.updateUI();
        
        if (sourceKey) {
            // Debounce the actual loading
            this.sourceChangeTimeout = setTimeout(() => {
                this.loadDirectory('');
                this.sourceChangeTimeout = null;
            }, 150); // Small delay to prevent rapid firing
        } else {
            // Clear content immediately if no source selected
            document.getElementById('file-manager-content').innerHTML = `
                <div class="fm-message fm-message-info">
                    <i class="fas fa-info-circle"></i>
                    <p>Chọn một nguồn ảnh để bắt đầu quản lý file và thư mục.</p>
                </div>
            `;
            document.getElementById('fm-breadcrumb').style.display = 'none';
        }
    }

    async loadDirectory(path = '') {
        if (!this.currentSource) {
            this.error('No source selected');
            return;
        }

        // Prevent concurrent loads of the same path
        const loadKey = `${this.currentSource}:${path}`;
        if (this.currentLoadKey === loadKey) {
            this.log('Same directory already loading, skipping duplicate request');
            return;
        }
        this.currentLoadKey = loadKey;

        this.log(`Loading directory: source="${this.currentSource}", path="${path}"`);
        this.showLoading(true);
        
        try {
            const url = `api.php?action=file_manager_browse&source=${encodeURIComponent(this.currentSource)}&path=${encodeURIComponent(path)}`;
            this.log('API call URL:', url);
            
            const response = await fetch(url);
            
            // Check if this request is still current
            if (this.currentLoadKey !== loadKey) {
                this.log('Request superseded by newer request, ignoring response');
                return;
            }
            
            if (!response.ok) {
                const errorText = await response.text();
                this.error('Response not ok:', { status: response.status, error: errorText });
                
                // If directory not found (maybe deleted), try to navigate to parent
                if (response.status === 400 && path) {
                    this.log('Directory may have been deleted, trying parent directory...');
                    const parentPath = path.split('/').slice(0, -1).join('/');
                    return this.loadDirectory(parentPath);
                }
                
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
            // Check again if this request is still current
            if (this.currentLoadKey !== loadKey) {
                this.log('Request superseded by newer request, ignoring response data');
                return;
            }
            
            this.log('Directory data received:', { items: data.items?.length || 0, path: data.current_path });
            
            if (data.error) {
                // If error due to path not existing, try parent directory
                if (path && (data.error.includes('không hợp lệ') || data.error.includes('không thể truy cập'))) {
                    this.log('Path error, trying parent directory...');
                    const parentPath = path.split('/').slice(0, -1).join('/');
                    return this.loadDirectory(parentPath);
                }
                throw new Error(data.error);
            }
            
            this.currentPath = data.current_path || '';
            this.renderDirectory(data.items || []);
            this.updateBreadcrumb();
            this.updateUI(); // Update UI state after loading directory
            this.log('Directory loaded successfully', { currentPath: this.currentPath });
            
        } catch (error) {
            this.error('Error loading directory:', error);
            this.showMessage('Không thể tải thư mục: ' + error.message, 'error');
            
            // Show empty state
            this.renderDirectory([]);
        } finally {
            this.showLoading(false);
            // Clear the load key when done
            if (this.currentLoadKey === loadKey) {
                this.currentLoadKey = null;
            }
        }
    }

    renderDirectory(items) {
        const content = document.getElementById('file-manager-content');
        
        if (!items || items.length === 0) {
            content.innerHTML = `
                <div class="fm-empty">
                    <i class="fas fa-folder-open"></i>
                    <p>Thư mục trống</p>
                </div>
            `;
            return;
        }

        const itemsHtml = items.map(item => this.renderItem(item)).join('');
        
        content.innerHTML = `
            <div class="fm-controls">
                <div class="selection-controls">
                    <label>
                        <input type="checkbox" id="fm-select-all"> Chọn tất cả
                    </label>
                    <button id="fm-delete-selected" class="button danger" disabled>
                        <i class="fas fa-trash"></i> Xóa đã chọn
                    </button>
                </div>
            </div>
            <div class="fm-items">
                ${itemsHtml}
            </div>
        `;

        this.bindItemEvents();
    }

    renderItem(item) {
        const isDirectory = item.type === 'directory';
        const icon = isDirectory ? 'fas fa-folder' : this.getFileIcon(item.extension);
        const size = isDirectory ? '' : this.formatFileSize(item.size);
        const modified = new Date(item.modified * 1000).toLocaleString('vi-VN');
        
        // File count for directories
        const fileCount = isDirectory && item.file_count !== undefined ? 
            `<span class="fm-item-count">${item.file_count} files</span>` : '';

        return `
            <div class="fm-item" data-path="${item.path}" data-type="${item.type}">
                <div class="fm-item-checkbox">
                    <input type="checkbox" class="item-checkbox">
                </div>
                <div class="fm-item-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="fm-item-details">
                    <div class="fm-item-name" ${isDirectory ? 'data-action="open"' : ''}>${item.name}</div>
                    <div class="fm-item-meta">
                        ${size}${size && fileCount ? ' • ' : ''}${fileCount}${(size || fileCount) && modified ? ' • ' : ''}${modified}
                    </div>
                </div>
                <div class="fm-item-actions">
                    <button class="fm-action-btn" data-action="rename" title="Đổi tên">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="fm-action-btn danger" data-action="delete" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${item.is_image ? `
                        <button class="fm-action-btn" data-action="view" title="Xem">
                            <i class="fas fa-eye"></i>
                        </button>
                    ` : ''}
                    ${!item.is_image && !isDirectory ? `<!-- Not image: ${item.extension} -->` : ''}
                </div>
            </div>
        `;
    }

    bindItemEvents() {
        const content = document.getElementById('file-manager-content');
        
        // Select all checkbox
        const selectAllCheckbox = content.querySelector('#fm-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                this.selectAll(e.target.checked);
            });
        }

        // Delete selected button
        const deleteSelectedBtn = content.querySelector('#fm-delete-selected');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => {
                this.deleteSelected();
            });
        }

        // Item actions
        content.addEventListener('click', (e) => {
            const item = e.target.closest('.fm-item');
            if (!item) return;

            const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
            const itemPath = item.dataset.path;
            const itemType = item.dataset.type;

            switch (action) {
                case 'open':
                    if (itemType === 'directory') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Prevent multiple rapid clicks
                        if (this.isNavigating) {
                            this.log('Navigation already in progress, ignoring directory click');
                            return;
                        }
                        
                        this.isNavigating = true;
                        this.openDirectory(itemPath).finally(() => {
                            this.isNavigating = false;
                        });
                    }
                    break;
                case 'rename':
                    this.showRenameDialog(itemPath);
                    break;
                case 'delete':
                    this.deleteItem(itemPath);
                    break;
                case 'view':
                    this.log(`View action triggered for: ${itemPath}`);
                    this.viewFile(itemPath);
                    break;
            }
        });

        // Item selection
        content.addEventListener('change', (e) => {
            if (e.target.classList.contains('item-checkbox')) {
                this.updateSelection();
            }
        });
    }

    async openDirectory(path) {
        await this.loadDirectory(path);
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('fm-breadcrumb');
        if (!this.currentSource) {
            breadcrumb.style.display = 'none';
            return;
        }

        breadcrumb.style.display = 'block';
        
        const parts = this.currentPath.split('/').filter(p => p);
        let cumulativePath = '';
        
        let html = `
            <span class="breadcrumb-item" data-path="">
                <i class="fas fa-home"></i> ${this.getSourceName(this.currentSource)}
            </span>
        `;

        parts.forEach(part => {
            cumulativePath += (cumulativePath ? '/' : '') + part;
            html += `
                <span class="breadcrumb-separator">/</span>
                <span class="breadcrumb-item" data-path="${cumulativePath}">${part}</span>
            `;
        });

        breadcrumb.innerHTML = html;

        // Remove any existing event listeners to prevent duplicates
        breadcrumb.removeEventListener('click', this.breadcrumbClickHandler);
        
        // Create bound handler if it doesn't exist
        if (!this.breadcrumbClickHandler) {
            this.breadcrumbClickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const item = e.target.closest('.breadcrumb-item');
                if (item) {
                    const path = item.dataset.path;
                    this.log(`Breadcrumb navigation to: "${path}"`);
                    
                    // Prevent multiple rapid clicks
                    if (this.isNavigating) {
                        this.log('Navigation already in progress, ignoring click');
                        return;
                    }
                    
                    this.isNavigating = true;
                    this.loadDirectory(path).finally(() => {
                        this.isNavigating = false;
                    });
                }
            };
        }
        
        // Add the event listener
        breadcrumb.addEventListener('click', this.breadcrumbClickHandler);
    }

    getSourceName(sourceKey) {
        const sourceNames = {
            'main': 'Thư mục chính',
            'extra_drive': 'Ổ G 2020',
            'guu_ssd': 'SSD Guu 2020',
            'guu_2025': 'SSD Guu 2025',
            'guu_2025_e': 'E Drive 2025'
        };
        return sourceNames[sourceKey] || sourceKey;
    }

    getFileIcon(extension) {
        const iconMap = {
            'jpg': 'fas fa-image',
            'jpeg': 'fas fa-image',
            'png': 'fas fa-image',
            'gif': 'fas fa-image',
            'bmp': 'fas fa-image',
            'webp': 'fas fa-image',
            'mp4': 'fas fa-video',
            'mov': 'fas fa-video',
            'avi': 'fas fa-video',
            'mkv': 'fas fa-video',
            'webm': 'fas fa-video'
        };
        return iconMap[extension?.toLowerCase()] || 'fas fa-file';
    }

    formatFileSize(bytes) {
        if (!bytes) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    updateSelection() {
        const checkboxes = document.querySelectorAll('.fm-item .item-checkbox');
        const deleteBtn = document.getElementById('fm-delete-selected');
        
        this.selectedItems.clear();
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const item = checkbox.closest('.fm-item');
                this.selectedItems.add(item.dataset.path);
            }
        });

        if (deleteBtn) {
            deleteBtn.disabled = this.selectedItems.size === 0;
        }
    }

    selectAll(checked) {
        const checkboxes = document.querySelectorAll('.fm-item .item-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
        this.updateSelection();
    }

    async showUploadDialog() {
        if (!this.currentSource) {
            this.showMessage('Vui lòng chọn nguồn ảnh trước', 'warning');
            return;
        }

        // Check if we're at root level (no path)
        if (!this.currentPath || this.currentPath === '') {
            this.showMessage('Vui lòng vào bên trong thư mục để upload ảnh', 'warning');
            return;
        }

        const dialog = this.createDialog('Upload Files', `
            <div class="upload-dialog">
                <div class="upload-zone" id="fm-upload-zone">
                    <div class="upload-zone-inner">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h4>Tải ảnh và video lên</h4>
                        <p class="upload-zone-text">Kéo thả file vào đây hoặc <span class="upload-zone-link">click để chọn</span></p>
                        <div class="upload-zone-formats">
                            <div class="format-group">
                                <i class="fas fa-image"></i>
                                <span>Ảnh: JPG, PNG, GIF, BMP, WebP</span>
                            </div>
                            <div class="format-group">
                                <i class="fas fa-video"></i>
                                <span>Video: MP4, MOV, AVI, MKV, WebM</span>
                            </div>
                        </div>
                    </div>
                    <input type="file" id="fm-file-input" multiple accept="image/*,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm" style="display: none;">
                </div>
                <div class="upload-info">
                    <div class="info-item">
                        <i class="fas fa-info-circle"></i>
                        <span><strong>Kích thước:</strong> Không giới hạn dung lượng file</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-layer-group"></i>
                        <span><strong>Tính năng:</strong> Tự động tạo thumbnail cho ảnh và video</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-rocket"></i>
                        <span><strong>Upload thông minh:</strong> Tự động chia batch cho hiệu suất tối ưu</span>
                    </div>
                </div>
            </div>
        `, [
            { text: 'Upload', action: () => this.performUpload(), primary: true },
            { text: 'Hủy', action: () => this.closeDialog() }
        ]);

        this.bindUploadEvents();
        this.resetUploadZone();
    }

    bindUploadEvents() {
        const uploadZone = document.getElementById('fm-upload-zone');
        const fileInput = document.getElementById('fm-file-input');

        if (!uploadZone || !fileInput) return;

        // Click to select files
        uploadZone.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            fileInput.files = e.dataTransfer.files;
            this.updateUploadPreview();
        });

        fileInput.addEventListener('change', () => {
            this.updateUploadPreview();
        });
    }

    resetUploadZone() {
        const uploadZone = document.getElementById('fm-upload-zone');
        const fileInput = document.getElementById('fm-file-input');
        
        if (uploadZone && fileInput) {
            // Clear file input
            fileInput.value = '';
            
            // Remove any existing content
            const existingContent = uploadZone.querySelector('.upload-zone-content');
            if (existingContent) {
                existingContent.remove();
            }
            
            // Show original upload prompt
            const uploadZoneInner = uploadZone.querySelector('.upload-zone-inner');
            if (uploadZoneInner) {
                uploadZoneInner.style.display = 'block';
            }
        }
    }

    updateUploadPreview() {
        const fileInput = document.getElementById('fm-file-input');
        const uploadZone = document.getElementById('fm-upload-zone');
        
        if (!fileInput || !uploadZone) return;

        const files = Array.from(fileInput.files);
        if (files.length === 0) return;

        // Count file types
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        const videoFiles = files.filter(file => file.type.startsWith('video/'));

        // Update zone content without removing file input
        const existingContent = uploadZone.querySelector('.upload-zone-content');
        if (existingContent) {
            existingContent.remove();
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'upload-zone-content';
        contentDiv.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <p>Đã chọn ${files.length} file</p>
            <div class="file-type-summary">
                ${imageFiles.length > 0 ? `
                    <div class="type-summary">
                        <i class="fas fa-image"></i>
                        <span>${imageFiles.length} ảnh</span>
                    </div>
                ` : ''}
                ${videoFiles.length > 0 ? `
                    <div class="type-summary">
                        <i class="fas fa-video"></i>
                        <span>${videoFiles.length} video</span>
                    </div>
                ` : ''}
            </div>
            <div class="upload-file-list">
                ${files.map(file => {
                    const isImage = file.type.startsWith('image/');
                    const isVideo = file.type.startsWith('video/');
                    const icon = isImage ? 'fa-image' : isVideo ? 'fa-video' : 'fa-file';
                    const iconColor = isImage ? '#3fb950' : isVideo ? '#d29922' : '#8b949e';
                    
                    return `
                        <div class="upload-file-item">
                            <div class="file-info">
                                <i class="fas ${icon}" style="color: ${iconColor}"></i>
                                <span class="file-name">${file.name}</span>
                            </div>
                            <span class="upload-file-size">${this.formatFileSize(file.size)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            <button class="button secondary change-files-btn" type="button">
                <i class="fas fa-edit"></i> Chọn file khác
            </button>
        `;
        
        // Insert before file input to preserve it
        uploadZone.insertBefore(contentDiv, fileInput);
        
        // Hide original upload prompt
        const uploadZoneInner = uploadZone.querySelector('.upload-zone-inner');
        if (uploadZoneInner) {
            uploadZoneInner.style.display = 'none';
        }

        // Bind change files button
        const changeBtn = contentDiv.querySelector('.change-files-btn');
        if (changeBtn) {
            changeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.click();
            });
        }
    }

    showUploadProgressModal(totalFiles) {
        // Close existing upload dialog first
        this.closeDialog();
        
        // Create upload progress modal
        this.uploadProgressModal = this.createDialog('Tiến trình Upload & Cache', `
            <div class="upload-progress-modal">
                <div class="progress-info">
                    <div class="progress-stats">
                        <div class="stat-item">
                            <span class="stat-label">Tiến trình:</span>
                            <span class="stat-value" id="upload-percentage">0%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">File đã xử lý:</span>
                            <span class="stat-value"><span id="upload-processed">0</span>/<span id="upload-total">${totalFiles}</span></span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Đang xử lý:</span>
                            <span class="stat-value" id="upload-current-file">Đang chuẩn bị...</span>
                        </div>
                    </div>
                </div>
                
                <div class="progress-bar-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" id="upload-progress-fill" style="width: 0%"></div>
                    </div>
                    <div class="progress-percentage" id="upload-progress-text">0%</div>
                </div>
                
                <div class="upload-status" id="upload-status">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>🟢 Upload files → 🟡 Tạo cache thumbnails</span>
                </div>
                
                <div class="upload-results" id="upload-results" style="display: none;">
                    <div class="result-summary">
                        <div class="success-count">
                            <i class="fas fa-check-circle"></i>
                            <span>Thành công: <span id="success-count">0</span></span>
                        </div>
                        <div class="error-count" id="error-section" style="display: none;">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>Lỗi: <span id="error-count">0</span></span>
                        </div>
                    </div>
                    <div class="error-details" id="error-details" style="display: none;"></div>
                </div>
            </div>
        `, [
            { text: 'Hủy Upload', action: () => this.cancelUpload(), className: 'cancel-btn', id: 'cancel-upload-btn' },
            { text: 'Hủy Cache', action: () => this.cancelCacheOnly(), className: 'cancel-cache-btn', style: 'display: none;', id: 'cancel-cache-btn' },
            { text: 'Đóng', action: () => this.closeUploadProgress(), style: 'display: none;', id: 'close-upload-btn' }
        ]);
        
        return this.uploadProgressModal;
    }

    updateUploadProgress(processed, total, currentFile = '', percentage = null) {
        if (!this.uploadProgressModal) return;
        
        const actualPercentage = percentage !== null ? percentage : Math.round((processed / total) * 100);
        
        // Update progress stats
        const percentageEl = document.getElementById('upload-percentage');
        const processedEl = document.getElementById('upload-processed');
        const totalEl = document.getElementById('upload-total');
        const currentFileEl = document.getElementById('upload-current-file');
        
        if (percentageEl) percentageEl.textContent = `${actualPercentage}%`;
        if (processedEl) processedEl.textContent = processed;
        if (totalEl) totalEl.textContent = total;
        if (currentFileEl) {
            if (currentFile && (currentFile.includes('🟡') || currentFile.includes('cache'))) {
                // Cache phase - keep as is
                currentFileEl.textContent = currentFile;
            } else {
                // Upload phase - add green indicator
                currentFileEl.textContent = currentFile ? `🟢 Upload: ${currentFile}` : 'Đang upload...';
            }
        }
        
        // Update progress bar với màu xanh lá cho upload
        const progressFill = document.getElementById('upload-progress-fill');
        const progressText = document.getElementById('upload-progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${actualPercentage}%`;
            // Remove cache-progress class để về màu xanh lá mặc định
            progressFill.classList.remove('cache-progress');
        }
        if (progressText) {
            progressText.textContent = `${actualPercentage}%`;
        }
    }

    updateCacheProgress(completedFiles, totalFiles, remainingFiles, currentFile = '', percentage = null) {
        if (!this.uploadProgressModal) return;
        
        const actualPercentage = percentage !== null ? percentage : 
            (totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 100);
        
        // Update cache-specific progress display với chú thích rõ ràng
        const currentFileEl = document.getElementById('upload-current-file');
        if (currentFileEl) {
            if (currentFile) {
                currentFileEl.textContent = `🟡 Đang tạo cache: ${currentFile}`;
            } else {
                currentFileEl.textContent = `🟡 Tạo cache thumbnail: ${completedFiles}/${totalFiles} files (còn ${remainingFiles})`;
            }
        }
        
        // Update progress bar for cache với màu vàng
        const progressFill = document.getElementById('upload-progress-fill');
        const progressText = document.getElementById('upload-progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${actualPercentage}%`;
            // Thêm class cache-progress để đổi màu thành vàng
            progressFill.classList.add('cache-progress');
        }
        if (progressText) {
            progressText.textContent = `${actualPercentage}%`;
        }
        
        // Keep file count showing cache progress
        const processedEl = document.getElementById('upload-processed');
        const totalEl = document.getElementById('upload-total');
        const percentageEl = document.getElementById('upload-percentage');
        
        if (processedEl) processedEl.textContent = completedFiles;
        if (totalEl) totalEl.textContent = totalFiles;
        if (percentageEl) percentageEl.textContent = `${actualPercentage}%`;
    }

    showUploadComplete(successCount, errorCount, errors = []) {
        if (!this.uploadProgressModal) return;
        
        // Hide status, show results
        const statusEl = document.getElementById('upload-status');
        const resultsEl = document.getElementById('upload-results');
        const cancelBtn = document.getElementById('cancel-upload-btn');
        const closeBtn = document.getElementById('close-upload-btn');
        
        if (statusEl) statusEl.style.display = 'none';
        if (resultsEl) resultsEl.style.display = 'block';
        
        // Update buttons
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-block';
        
        // Update result counts
        const successCountEl = document.getElementById('success-count');
        const errorCountEl = document.getElementById('error-count');
        const errorSection = document.getElementById('error-section');
        const errorDetails = document.getElementById('error-details');
        
        if (successCountEl) successCountEl.textContent = successCount;
        if (errorCountEl) errorCountEl.textContent = errorCount;
        
        if (errorCount > 0) {
            if (errorSection) errorSection.style.display = 'block';
            if (errorDetails && errors.length > 0) {
                errorDetails.style.display = 'block';
                errorDetails.innerHTML = `
                    <h4>Chi tiết lỗi:</h4>
                    <ul>
                        ${errors.map(error => `<li>${error}</li>`).join('')}
                    </ul>
                `;
            }
        }
    }

    async cancelUpload() {
        if (this.uploadAbortController) {
            this.uploadAbortController.abort();
            this.uploadAbortController = null;
        }
        
        // Stop cache workers to save resources
        try {
            const response = await fetch('api.php?action=stop_cache_workers', {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success && result.cancelled_jobs > 0) {
                this.log(`Cancelled ${result.cancelled_jobs} cache jobs`);
                this.showMessage(`Upload đã bị hủy. Đã dừng ${result.cancelled_jobs} cache job(s)`, 'warning');
            } else {
                this.showMessage('Upload đã bị hủy', 'warning');
            }
        } catch (error) {
            this.log('Error stopping cache workers:', error);
            this.showMessage('Upload đã bị hủy', 'warning');
        }
        
        this.isUploading = false;
        this.closeUploadProgress();
    }

    async cancelCacheOnly() {
        // Only stop cache workers, don't close modal
        try {
            const response = await fetch('api.php?action=stop_cache_workers', {
                method: 'POST'
            });
            const result = await response.json();
            
            if (result.success && result.cancelled_jobs > 0) {
                this.log(`Cancelled ${result.cancelled_jobs} cache jobs`);
                this.showMessage(`Đã dừng ${result.cancelled_jobs} cache job(s)`, 'info');
                
                // Update UI to show cache cancelled
                this.updateUploadProgress(
                    null, null, 
                    'Cache generation đã bị hủy bởi người dùng', 
                    null
                );
                
                // Hide cancel cache button, show close button
                const cancelCacheBtn = document.getElementById('cancel-cache-btn');
                const closeBtn = document.getElementById('close-upload-btn');
                
                if (cancelCacheBtn) cancelCacheBtn.style.display = 'none';
                if (closeBtn) closeBtn.style.display = 'inline-block';
                
            } else {
                this.showMessage('Không có cache job nào để hủy', 'info');
            }
        } catch (error) {
            this.log('Error stopping cache workers:', error);
            this.showMessage('Lỗi khi dừng cache workers', 'error');
        }
    }

    closeUploadProgress() {
        this.uploadProgressModal = null;
        this.isUploading = false;
        this.uploadAbortController = null;
        this.closeDialog();
    }

    async performUpload(overwriteMode = 'ask') {
        console.log('[File Manager] performUpload called with overwriteMode:', overwriteMode);
        
        if (this.isUploading) {
            this.showMessage('Upload đang trong tiến trình', 'warning');
            return;
        }
        
        const fileInput = document.getElementById('fm-file-input');
        console.log('[File Manager] fileInput:', fileInput);
        console.log('[File Manager] files object:', fileInput?.files);
        console.log('[File Manager] files count:', fileInput?.files?.length || 0);
        
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            console.log('[File Manager] Failed file validation - no files selected');
            this.showMessage('Vui lòng chọn file để upload', 'warning');
            return;
        }
        
        console.log('[File Manager] File validation passed, proceeding with batch upload');

        // Use batch upload for better reliability
        await this.performUploadWithFiles(fileInput.files, overwriteMode);
    }

    async showCreateFolderDialog() {
        if (!this.currentSource) {
            this.showMessage('Vui lòng chọn nguồn ảnh trước', 'warning');
            return;
        }

        const dialog = this.createDialog('Tạo Thư mục Mới', `
            <div class="create-folder-dialog">
                <label for="folder-name-input">Tên thư mục:</label>
                <input type="text" id="folder-name-input" placeholder="Nhập tên thư mục..." maxlength="255">
                <p class="hint">Chỉ cho phép chữ, số, dấu cách, dấu chấm, gạch dưới và gạch ngang.</p>
            </div>
        `, [
            { text: 'Tạo', action: () => this.performCreateFolder(), primary: true },
            { text: 'Hủy', action: () => this.closeDialog() }
        ]);

        const input = document.getElementById('folder-name-input');
        if (input) {
            input.focus();
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performCreateFolder();
                }
            });
        }
    }

    async performCreateFolder() {
        const input = document.getElementById('folder-name-input');
        const folderName = input?.value.trim();

        if (!folderName) {
            this.showMessage('Vui lòng nhập tên thư mục', 'warning');
            return;
        }

        if (!/^[a-zA-Z0-9\s\._-]+$/.test(folderName)) {
            this.showMessage('Tên thư mục không hợp lệ', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('source', this.currentSource);
            formData.append('parent_path', this.currentPath);
            formData.append('folder_name', folderName);

            const response = await fetch('api.php?action=file_manager_create_folder', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            this.closeDialog();
            this.showMessage('Tạo thư mục thành công', 'success');
            
            // Refresh directory
            await this.loadDirectory(this.currentPath);

        } catch (error) {
            console.error('Create folder error:', error);
            this.showMessage('Lỗi tạo thư mục: ' + error.message, 'error');
        }
    }

    async deleteSelected() {
        if (this.selectedItems.size === 0) return;

        // Prevent multiple simultaneous delete operations
        if (this.isDeletingSelected) {
            this.log('Delete selected operation already in progress, ignoring...');
            return;
        }

        const selectedItemsArray = Array.from(this.selectedItems);
        this.log('Deleting selected items:', selectedItemsArray);
        this.isDeletingSelected = true;

        try {
            const itemList = selectedItemsArray.join('\n• ');
            const confirmed = confirm(`Bạn có chắc muốn xóa ${this.selectedItems.size} item(s) sau?\n\n• ${itemList}\n\nHành động này không thể hoàn tác!`);
            
            if (!confirmed) {
                this.log('Delete cancelled by user');
                return;
            }
            // Check if we're deleting the current directory or any of its parents
            const isCurrentDirectoryDeleted = selectedItemsArray.some(item => {
                // If current path starts with deleted item path, we're deleting a parent
                return this.currentPath.startsWith(item) || this.currentPath === item;
            });

            this.log('Current directory will be deleted:', isCurrentDirectoryDeleted);

            const formData = new FormData();
            formData.append('source', this.currentSource);
            formData.append('items', JSON.stringify(selectedItemsArray));

            this.log('Sending delete request...');
            const response = await fetch('api.php?action=file_manager_delete', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            this.log('Delete response:', result);

            if (result.error) {
                throw new Error(result.error);
            }

            this.selectedItems.clear();
            this.showMessage(`Xóa thành công ${result.success_count} item(s)${result.error_count > 0 ? `, ${result.error_count} lỗi` : ''}`, 'success');
            
            if (result.errors && result.errors.length > 0) {
                this.error('Delete errors:', result.errors);
            }

            // Smart refresh: if current directory was deleted, go to parent
            if (isCurrentDirectoryDeleted && this.currentPath) {
                this.log('Current directory was deleted, navigating to parent...');
                const parentPath = this.currentPath.split('/').slice(0, -1).join('/');
                await this.loadDirectory(parentPath);
            } else {
                // Normal refresh
                this.log('Refreshing current directory...');
                await this.loadDirectory(this.currentPath);
            }

        } catch (error) {
            this.error('Delete error:', error);
            this.showMessage('Lỗi xóa: ' + error.message, 'error');
        } finally {
            // Always reset the flag
            this.isDeletingSelected = false;
        }
    }

    async deleteItem(itemPath) {
        // Prevent multiple simultaneous delete operations
        if (this.isDeletingItem) {
            this.log('Delete operation already in progress, ignoring...');
            return;
        }

        this.log('Deleting single item:', itemPath);
        this.isDeletingItem = true;

        try {
            const confirmed = confirm(`Bạn có chắc muốn xóa "${itemPath}"?\n\nHành động này không thể hoàn tác!`);
            if (!confirmed) {
                this.log('Delete cancelled by user');
                return;
            }

            // Check if we're deleting the current directory or any of its parents
            const isCurrentDirectoryDeleted = this.currentPath.startsWith(itemPath) || this.currentPath === itemPath;
            this.log('Current directory will be deleted:', isCurrentDirectoryDeleted);

            const formData = new FormData();
            formData.append('source', this.currentSource);
            formData.append('items', JSON.stringify([itemPath]));

            this.log('Sending delete request...');
            const response = await fetch('api.php?action=file_manager_delete', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            this.log('Delete response:', result);

            if (result.error) {
                throw new Error(result.error);
            }

            this.showMessage('Xóa thành công', 'success');
            
            // Smart refresh: if current directory was deleted, go to parent
            if (isCurrentDirectoryDeleted && this.currentPath) {
                this.log('Current directory was deleted, navigating to parent...');
                const parentPath = this.currentPath.split('/').slice(0, -1).join('/');
                await this.loadDirectory(parentPath);
            } else {
                // Normal refresh
                this.log('Refreshing current directory...');
                await this.loadDirectory(this.currentPath);
            }

        } catch (error) {
            this.error('Delete error:', error);
            this.showMessage('Lỗi xóa: ' + error.message, 'error');
        } finally {
            // Always reset the flag
            this.isDeletingItem = false;
        }
    }

    async showRenameDialog(itemPath) {
        const currentName = itemPath.split('/').pop();
        
        const dialog = this.createDialog('Đổi tên', `
            <div class="rename-dialog">
                <label for="rename-input">Tên mới:</label>
                <input type="text" id="rename-input" value="${currentName}" maxlength="255">
                <p class="hint">Chỉ cho phép chữ, số, dấu cách, dấu chấm, gạch dưới và gạch ngang.</p>
            </div>
        `, [
            { text: 'Đổi tên', action: () => this.performRename(itemPath), primary: true },
            { text: 'Hủy', action: () => this.closeDialog() }
        ]);

        const input = document.getElementById('rename-input');
        if (input) {
            input.focus();
            input.select();
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performRename(itemPath);
                }
            });
        }
    }

    async performRename(oldPath) {
        const input = document.getElementById('rename-input');
        const newName = input?.value.trim();

        if (!newName) {
            this.showMessage('Vui lòng nhập tên mới', 'warning');
            return;
        }

        if (!/^[a-zA-Z0-9\s\._-]+$/.test(newName)) {
            this.showMessage('Tên không hợp lệ', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('source', this.currentSource);
            formData.append('old_path', oldPath);
            formData.append('new_name', newName);

            const response = await fetch('api.php?action=file_manager_rename', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            this.closeDialog();
            this.showMessage('Đổi tên thành công', 'success');
            
            // Refresh directory
            await this.loadDirectory(this.currentPath);

        } catch (error) {
            console.error('Rename error:', error);
            this.showMessage('Lỗi đổi tên: ' + error.message, 'error');
        }
    }

    viewFile(filePath) {
        // Show file preview in modal
        const sourcePrefixedPath = `${this.currentSource}/${filePath}`;
        const fileName = filePath.split('/').pop();
        const extension = fileName.split('.').pop().toLowerCase();
        
        this.log(`Previewing file:`, { 
            filePath, 
            currentSource: this.currentSource,
            sourcePrefixedPath,
            fileName,
            extension
        });

        let previewContent;
        
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension)) {
            // Image preview
            previewContent = `
                <div class="file-preview-container">
                    <img src="api.php?action=get_thumbnail&path=${encodeURIComponent(sourcePrefixedPath)}&size=750" 
                         alt="${fileName}"
                         class="preview-image"
                         onerror="this.src='api.php?action=get_file&path=${encodeURIComponent(sourcePrefixedPath)}'"
                         onload="this.style.opacity='1'">
                    <div class="preview-info">
                        <h4>${fileName}</h4>
                        <p>Nguồn: ${this.getSourceName(this.currentSource)}</p>
                        <p>Đường dẫn: ${filePath}</p>
                    </div>
                </div>
            `;
        } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) {
            // Video preview
            previewContent = `
                <div class="file-preview-container">
                    <video controls class="preview-video">
                        <source src="api.php?action=get_file&path=${encodeURIComponent(sourcePrefixedPath)}" type="video/${extension}">
                        Trình duyệt không hỗ trợ video này.
                    </video>
                    <div class="preview-info">
                        <h4>${fileName}</h4>
                        <p>Nguồn: ${this.getSourceName(this.currentSource)}</p>
                        <p>Đường dẫn: ${filePath}</p>
                    </div>
                </div>
            `;
        } else {
            // Unsupported file type
            previewContent = `
                <div class="file-preview-container">
                    <div class="preview-unsupported">
                        <i class="fas fa-file-alt"></i>
                        <p>Không thể preview loại file này</p>
                        <h4>${fileName}</h4>
                        <p>Nguồn: ${this.getSourceName(this.currentSource)}</p>
                        <p>Đường dẫn: ${filePath}</p>
                    </div>
                </div>
            `;
        }

        this.createDialog(`Preview: ${fileName}`, previewContent, [
            { text: 'Đóng', action: () => this.closeDialog() }
        ]);
    }

    updateUI() {
        const uploadBtn = document.getElementById('fm-upload-btn');
        const createFolderBtn = document.getElementById('fm-create-folder-btn');
        
        const hasSource = !!this.currentSource;
        const isInFolder = hasSource && this.currentPath && this.currentPath !== '';
        
        this.log('UpdateUI called:', { 
            currentSource: this.currentSource, 
            currentPath: this.currentPath, 
            hasSource, 
            isInFolder 
        });
        
        // Upload only allowed when inside a folder, not at root level
        if (uploadBtn) {
            uploadBtn.disabled = !isInFolder;
            uploadBtn.title = isInFolder ? 
                'Upload ảnh và video' : 
                'Vui lòng vào bên trong thư mục để upload';
            this.log('Upload button state:', { disabled: uploadBtn.disabled, title: uploadBtn.title });
        }
        
        // Create folder allowed when source is selected
        if (createFolderBtn) {
            createFolderBtn.disabled = !hasSource;
            this.log('Create folder button state:', { disabled: createFolderBtn.disabled });
        }
    }

    refreshCurrentDirectory() {
        if (this.currentSource) {
            this.loadDirectory(this.currentPath);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('fm-loading');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    showMessage(message, type = 'info') {
        this.log(`Message (${type}):`, message);
        
        // Use existing admin feedback system
        const feedbackDiv = document.getElementById('admin-feedback');
        if (feedbackDiv) {
            feedbackDiv.textContent = message;
            feedbackDiv.className = `feedback-message ${type}`;
            feedbackDiv.style.display = 'block';
            
            setTimeout(() => {
                feedbackDiv.style.display = 'none';
            }, 5000);
        } else {
            // Try to show message in file manager content area
            const fmContent = document.getElementById('file-manager-content');
            if (fmContent) {
                fmContent.innerHTML = `
                    <div class="fm-message fm-message-${type}">
                        <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
                        <p>${message}</p>
                    </div>
                `;
            } else {
                // Last resort - console and alert for errors
                if (type === 'error') {
                    alert(message);
                }
            }
        }
    }

    createDialog(title, content, buttons) {
        // Remove existing dialog
        this.closeDialog();

        const dialog = document.createElement('div');
        dialog.id = 'fm-dialog';
        dialog.className = 'fm-dialog-overlay';
        
        const buttonsHtml = buttons.map(btn => {
            const buttonClasses = ['button'];
            if (btn.primary) buttonClasses.push('primary');
            if (btn.className) buttonClasses.push(btn.className);
            
            const buttonId = btn.id ? `id="${btn.id}"` : '';
            const buttonStyle = btn.style ? `style="${btn.style}"` : '';
            
            return `
                <button class="${buttonClasses.join(' ')}" data-action="${btn.text}" ${buttonId} ${buttonStyle}>
                    ${btn.text}
                </button>
            `;
        }).join('');

        dialog.innerHTML = `
            <div class="fm-dialog">
                <div class="fm-dialog-header">
                    <h3>${title}</h3>
                    <button class="fm-dialog-close">&times;</button>
                </div>
                <div class="fm-dialog-content">
                    ${content}
                </div>
                <div class="fm-dialog-footer">
                    ${buttonsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Bind events
        dialog.addEventListener('click', (e) => {
            this.log('Dialog click:', e.target);
            
            if (e.target === dialog || e.target.classList.contains('fm-dialog-close')) {
                this.closeDialog();
            } else if (e.target.dataset.action) {
                this.log('Button action clicked:', e.target.dataset.action);
                const action = buttons.find(btn => btn.text === e.target.dataset.action)?.action;
                if (action) action();
            }
        });

        return dialog;
    }

    closeDialog() {
        const dialog = document.getElementById('fm-dialog');
        if (dialog) {
            dialog.remove();
        }
    }

    handleDuplicates(duplicates, files) {
        const duplicateList = duplicates.join(', ');
        
        const dialog = this.createDialog('File Trùng Tên', `
            <div class="duplicate-dialog">
                <p><strong>Các file sau đã tồn tại:</strong></p>
                <ul class="duplicate-list">
                    ${duplicates.map(file => `<li>${file}</li>`).join('')}
                </ul>
                <p>Bạn muốn làm gì?</p>
            </div>
        `, [
            { text: 'Ghi đè tất cả', action: () => this.resolveAndUpload('overwrite', files), primary: true },
            { text: 'Tạo file mới', action: () => this.resolveAndUpload('rename', files) },
            { text: 'Hủy', action: () => this.closeDialog() }
        ]);
    }

    async resolveAndUpload(mode, files) {
        this.closeDialog();
        
        // Directly perform upload with chosen mode
        // No need to recreate file input since we already have the files
        await this.performUploadWithFiles(files, mode);
    }

    async performUploadWithFiles(files, overwriteMode) {
        if (this.isUploading) {
            this.showMessage('Upload đang trong tiến trình', 'warning');
            return;
        }

        this.isUploading = true;
        this.uploadAbortController = new AbortController();

        // Show upload progress modal
        this.showUploadProgressModal(files.length);
        this.updateUploadProgress(0, files.length, 'Đang bắt đầu upload...');

        try {
            // Calculate optimal batch size based on file sizes
            const fileArray = Array.from(files);
            const batchSize = this.calculateOptimalBatchSize(fileArray);
            
            this.log(`Upload strategy: ${fileArray.length} files in batches of ${batchSize}`);
            
            let totalUploaded = 0;
            let allErrors = [];
            let uploadedFiles = []; // Track successfully uploaded files
            
            // Process files in batches
            for (let i = 0; i < fileArray.length; i += batchSize) {
                if (this.uploadAbortController.signal.aborted) {
                    throw new Error('Upload cancelled');
                }
                
                const batch = fileArray.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(fileArray.length / batchSize);
                
                this.updateUploadProgress(
                    totalUploaded, 
                    fileArray.length, 
                    `Batch ${batchNumber}/${totalBatches} - ${batch.length} file(s)...`
                );
                
                try {
                    const result = await this.uploadBatch(batch, overwriteMode);
                    
                    // Handle duplicates for first batch if overwrite mode is 'ask'
                    if (result.duplicates && result.duplicates.length > 0 && overwriteMode === 'ask' && i === 0) {
                        this.closeUploadProgress();
                        this.handleDuplicates(result.duplicates, fileArray);
                        return;
                    }
                    
                    if (result.errors && result.errors.length > 0) {
                        allErrors.push(...result.errors);
                    }
                    
                    totalUploaded += (result.success_count || 0);
                    
                    // Track successfully uploaded files for cache monitoring
                    if (result.success_count > 0) {
                        batch.forEach(file => {
                            const filePath = `${this.currentSource}/${this.currentPath}/${file.name}`.replace(/\/+/g, '/');
                            uploadedFiles.push(filePath);
                        });
                    }
                    
                    // Update progress after each batch
                    this.updateUploadProgress(
                        totalUploaded, 
                        fileArray.length, 
                        `Đã hoàn thành batch ${batchNumber}/${totalBatches}`,
                        Math.round((totalUploaded / fileArray.length) * 100)
                    );
                    
                    // If this batch uploaded files successfully, trigger cache generation
                    if (result.success_count > 0) {
                        this.updateUploadProgress(
                            totalUploaded, 
                            fileArray.length, 
                            `Đang tạo cache cho ${result.success_count} file(s)...`,
                            Math.round((totalUploaded / fileArray.length) * 100)
                        );
                        
                        // Wait a moment for cache generation to start
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                } catch (batchError) {
                    this.error('Batch upload error:', batchError);
                    allErrors.push(`Batch ${batchNumber}: ${batchError.message}`);
                    
                    // Continue with next batch instead of failing completely
                    continue;
                }
                
                // Small delay between batches to prevent server overload
                if (i + batchSize < fileArray.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Monitor cache generation for uploaded files
            if (totalUploaded > 0) {
                this.updateUploadProgress(fileArray.length, fileArray.length, 'Đang kiểm tra cache generation...', 100);
                
                // Switch to cache monitoring mode - show cache cancel button
                const cancelUploadBtn = document.getElementById('cancel-upload-btn');
                const cancelCacheBtn = document.getElementById('cancel-cache-btn');
                
                if (cancelUploadBtn) cancelUploadBtn.style.display = 'none';
                if (cancelCacheBtn) cancelCacheBtn.style.display = 'inline-block';
                
                // Use the uploadedFiles array we built during batch processing
                this.log(`Monitoring cache for ${uploadedFiles.length} uploaded files:`, uploadedFiles);
                
                // Debug: Check if we have any files to monitor
                if (uploadedFiles.length === 0) {
                    this.log('Warning: No uploaded files to monitor for cache');
                    this.updateUploadProgress(fileArray.length, fileArray.length, 'Không có files để tạo cache', 100);
                    
                    // Show close button
                    const cancelCacheBtn = document.getElementById('cancel-cache-btn');
                    const closeBtn = document.getElementById('close-upload-btn');
                    if (cancelCacheBtn) cancelCacheBtn.style.display = 'none';
                    if (closeBtn) closeBtn.style.display = 'inline-block';
                    return;
                }
                
                // Wait a moment for cache jobs to be created
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                await this.waitForCacheGeneration(totalUploaded, uploadedFiles);
            }

            // Show final completion - DON'T auto close, let cache monitoring handle it
            const totalErrors = allErrors.length;
            
            if (totalErrors > 0) {
                // If there are errors, show them and don't auto-close
                this.updateUploadProgress(fileArray.length, fileArray.length, 'Upload hoàn thành với lỗi', 100);
                this.showUploadComplete(totalUploaded, totalErrors, allErrors);
            } else {
                // If no errors, wait for cache completion will handle the final display
                this.updateUploadProgress(fileArray.length, fileArray.length, 'Files uploaded, cache processing...', 100);
            }

            // Refresh directory
            await this.loadDirectory(this.currentPath);

        } catch (error) {
            console.error('Upload error:', error);
            
            if (error.name === 'AbortError' || error.message === 'Upload cancelled') {
                // Upload was cancelled, modal already closed
                return;
            }
            
            this.closeUploadProgress();
            this.showMessage('Lỗi upload: ' + error.message, 'error');
        } finally {
            this.isUploading = false;
            this.uploadAbortController = null;
        }
    }

    calculateOptimalBatchSize(files) {
        // Calculate total size of all files
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const avgFileSize = totalSize / files.length;
        
        // More flexible limits for batch upload - no size restrictions
        const MAX_FILES_PER_BATCH = 20; // Max 20 files per batch
        const MIN_BATCH_SIZE = 1; // Always at least 1 file
        
        // Calculate batch size based on file count and complexity
        let batchSize;
        if (files.length <= 5) {
            batchSize = files.length; // Upload all files at once if 5 or fewer
        } else if (files.length <= 20) {
            batchSize = Math.ceil(files.length / 2); // Split into 2 batches
        } else if (files.length <= 50) {
            batchSize = Math.ceil(files.length / 3); // Split into 3 batches
        } else {
            batchSize = MAX_FILES_PER_BATCH; // Use max batch size for large uploads
        }
        
        return Math.max(MIN_BATCH_SIZE, Math.min(MAX_FILES_PER_BATCH, batchSize));
    }

    async uploadBatch(files, overwriteMode) {
        const formData = new FormData();
        formData.append('source', this.currentSource);
        formData.append('path', this.currentPath);
        formData.append('overwrite_mode', overwriteMode);

        files.forEach(file => {
            formData.append('files[]', file);
        });

        // Create XMLHttpRequest for this batch
        const xhr = new XMLHttpRequest();
        
        // Setup abort handling
        this.uploadAbortController.signal.addEventListener('abort', () => {
            xhr.abort();
        });

        // Create promise wrapper for XMLHttpRequest
        const response = await new Promise((resolve, reject) => {
            xhr.open('POST', 'api.php?action=file_manager_upload');
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.onabort = () => reject(new Error('Upload cancelled'));
            
            xhr.send(formData);
        });

        const result = JSON.parse(response);

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    }

    async waitForCacheGeneration(uploadedCount, uploadedFiles = []) {
        // Enhanced cache generation monitoring with real-time progress for specific files
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max wait (increased)
        let lastProgress = -1;
        let stuckCount = 0;
        
        while (attempts < maxAttempts) {
            try {
                // Use specific file monitoring if we have uploaded files list
                let response;
                if (uploadedFiles.length > 0) {
                    const formData = new FormData();
                    formData.append('action', 'get_specific_cache_status');
                    uploadedFiles.forEach(filePath => {
                        formData.append('file_paths[]', filePath);
                    });
                    response = await fetch('api.php', {
                        method: 'POST',
                        body: formData
                    });
                } else {
                    // Fallback to general cache status
                    response = await fetch('api.php?action=get_cache_status');
                }
                
                const status = await response.json();
                
                this.log('[Cache Status]', status);
                this.log('[Cache Status] Uploaded files being monitored:', uploadedFiles);
                
                // Use corrected file-based status information
                const totalFiles = status.total_files || 0;
                const completedFiles = status.completed_files || 0;
                const remainingFiles = status.remaining_files || 0;
                const progressPercent = status.progress_percentage || 100;
                const isWorking = status.is_actually_working || false;
                const currentActivity = status.current_activity;
                
                // Check if there's any pending or processing work
                const activeCacheJobs = (status.pending_jobs || 0) + (status.processing_jobs || 0);
                
                // If we have no recent cache activity at all, exit early
                if (totalFiles === 0 && activeCacheJobs === 0) {
                    if (attempts < 5) {
                        // Give it more attempts in case jobs are still being created
                        this.updateUploadProgress(
                            uploadedCount,
                            uploadedCount,
                            `🔍 Đang chờ cache jobs được tạo... (${attempts}/5)`,
                            100
                        );
                    } else {
                        this.log('No cache jobs found after 5 attempts, assuming cache not needed');
                        this.updateUploadProgress(
                            uploadedCount,
                            uploadedCount,
                            '✅ Upload hoàn thành (không cần cache)',
                            100
                        );
                        
                        // Show close button and auto-close after 2 seconds
                        const cancelCacheBtn = document.getElementById('cancel-cache-btn');
                        const closeBtn = document.getElementById('close-upload-btn');
                        if (cancelCacheBtn) cancelCacheBtn.style.display = 'none';
                        if (closeBtn) closeBtn.style.display = 'inline-block';
                        
                        setTimeout(() => {
                            this.closeUploadProgress();
                            this.refreshCurrentDirectory();
                        }, 2000);
                        break;
                    }
                } else if (totalFiles > 0 && activeCacheJobs === 0 && progressPercent >= 100) {
                    // All files have been processed and completed
                    this.updateCacheProgress(
                        totalFiles,
                        totalFiles,
                        0,
                        `Cache generation hoàn thành! (${totalFiles} files)`,
                        100
                    );
                    
                    // Hide cancel cache button, show close button
                    const cancelCacheBtn = document.getElementById('cancel-cache-btn');
                    const closeBtn = document.getElementById('close-upload-btn');
                    
                    if (cancelCacheBtn) cancelCacheBtn.style.display = 'none';
                    if (closeBtn) closeBtn.style.display = 'inline-block';
                    
                                        // Show completion and auto-close after 3 seconds  
                    setTimeout(() => {
                        this.closeUploadProgress();
                        this.showMessage(`Upload thành công ${uploadedCount} file(s), cache đã hoàn thành`, 'success');
                    }, 3000);
                    break;
                } else if (activeCacheJobs > 0 || isWorking || remainingFiles > 0) {
                    const currentFile = currentActivity?.file || '';
                    
                    // Use the new cache progress method
                    this.updateCacheProgress(
                        completedFiles,
                        totalFiles,
                        remainingFiles,
                        currentFile,
                        progressPercent
                    );
                    
                    // Check if progress is stuck
                    if (Math.abs(progressPercent - lastProgress) < 0.1) {
                        stuckCount++;
                        if (stuckCount >= 10) { // Stuck for 10 seconds
                            this.log(`Cache progress might be stuck at ${progressPercent}%`);
                        }
                    } else {
                        lastProgress = progressPercent;
                        stuckCount = 0;
                    }
                    
                } else if (totalFiles > 0 && progressPercent >= 100) {
                    // All work completed
                    this.updateCacheProgress(
                        totalFiles,
                        totalFiles,
                        0,
                        `Cache generation hoàn thành! (${totalFiles} files)`,
                        100
                    );
                    
                    // Show completion and auto-close after 3 seconds  
                    setTimeout(() => {
                        this.closeUploadProgress();
                        this.showMessage(`Upload thành công ${uploadedCount} file(s), cache đã hoàn thành`, 'success');
                    }, 3000);
                    break;
                } else if (totalFiles > 0) {
                    // Still have files but no active jobs - might be waiting
                    this.updateCacheProgress(
                        completedFiles,
                        totalFiles,
                        remainingFiles,
                        'Đang chờ worker xử lý...',
                        progressPercent
                    );
                } else {
                    // No files to process
                    this.updateUploadProgress(
                        uploadedCount,
                        uploadedCount,
                        'Cache generation không cần thiết',
                        100
                    );
                    break;
                }
            } catch (error) {
                this.log('Cache status check failed:', error);
                // Don't break immediately on single failed request
                if (attempts > 5) break; // Only break after multiple failures
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            this.updateUploadProgress(
                uploadedCount,
                uploadedCount,
                'Cache generation timed out (sẽ tiếp tục background)',
                100
            );
        }
    }
}

// Initialize when DOM is ready
function initFileManager() {
    // Only initialize if we're on the admin page and the tab exists
    if (!document.getElementById('file-manager-tab')) {
        console.log('File Manager tab not found, skipping initialization');
        return;
    }
    
    try {
        window.fileManager = new AdminFileManager();
        console.log('File Manager initialized successfully');
    } catch (error) {
        console.error('Failed to initialize File Manager:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileManager);
} else {
    initFileManager();
}