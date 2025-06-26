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
        this.activeUploadSessions = []; // Track active upload sessions
        this.globalCancelFlag = false; // Global flag to stop all monitoring
        
        // New properties for grid view and preview
        this.currentView = 'list'; // 'list' or 'grid'
        this.previewOpen = false;
        this.currentPreviewIndex = -1;
        this.currentItems = []; // Store current directory items
        this.images = []; // Store only image items for preview
        
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

        // Global click listener to close open dropdowns
        document.body.addEventListener('click', (e) => {
            document.querySelectorAll('.fm-featured-dropdown.open').forEach(dropdown => {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('open');
                }
            });
        }, true);
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
            
            // Store current folder category from API response
            this.currentFolderCategory = data.current_folder_category;
            
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
        // Store items for preview
        this.currentItems = items || [];
        this.images = this.currentItems.filter(item => item.is_image);
        
        // Always render list view (grid view removed)
        this.renderListView(items);
    }

    renderListView(items) {
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

        // Calculate folder statistics
        const totalItems = items.length;
        const directories = items.filter(item => item.type === 'directory').length;
        const files = items.filter(item => item.type === 'file').length;
        const featuredCount = items.filter(item => item.is_featured).length;
        const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);

        const itemsHtml = items.map(item => this.renderItem(item)).join('');
        
        const currentCategory = this.getCurrentFolderCategory(items);
        
        content.innerHTML = `
            <div class="fm-toolbar">
                <div class="fm-stats">
                    <span class="fm-stat-item">
                        <i class="fas fa-folder"></i> ${directories} thư mục
                    </span>
                    <span class="fm-stat-item">
                        <i class="fas fa-file"></i> ${files} file
                    </span>
                    <span class="fm-stat-item">
                        <i class="fas fa-star"></i> ${featuredCount} featured
                    </span>
                    <span class="fm-stat-item">
                        <i class="fas fa-hdd"></i> ${this.formatFileSize(totalSize)}
                    </span>
                    <span class="fm-stat-item">
                        <i class="fas fa-list"></i> Tổng: ${totalItems} mục
                    </span>
                </div>
                ${!this.isRootDirectory() ? `
                    <div class="fm-category-controls">
                        <div class="fm-category-current">
                            ${currentCategory ? `
                                <span class="category-badge" style="background: ${currentCategory.color_code}">
                                    <i class="${currentCategory.icon_class || 'fas fa-tag'}"></i>
                                    ${currentCategory.category_name}
                                </span>
                            ` : `
                                <span class="category-badge no-category">
                                    <i class="fas fa-tag"></i>
                                    Chưa phân loại
                                </span>
                            `}
                        </div>
                        <button class="category-dropdown-btn" onclick="fileManager.showCategoryDropdown(event, '${this.currentPath}')">
                            <i class="fas fa-tag"></i>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="fm-controls">
                <div class="selection-controls">
                    <label>
                        <input type="checkbox" id="fm-select-all"> Chọn tất cả file
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
        
        const fileCount = isDirectory && item.file_count !== undefined ? 
            `<span class="fm-item-count">${item.file_count} files</span>` : '';

        let categoryInfo = '';
        if (isDirectory && item.category) {
            categoryInfo = `<span class="fm-item-category">
                <i class="${item.category.icon_class || 'fas fa-tag'}"></i>
                ${item.category.category_name}
            </span>`;
        } else if (isDirectory) {
            const currentCategory = this.getCurrentFolderCategory(this.currentItems);
            if (currentCategory) {
                categoryInfo = `<span class="fm-item-category inherited">
                    <i class="${currentCategory.icon_class || 'fas fa-tag'}"></i>
                    ${currentCategory.category_name} (inherited)
                </span>`;
            }
        }

        return `
            <div class="fm-item" data-path="${item.path}" data-type="${item.type}">
                <div class="fm-item-checkbox">
                    <input type="checkbox" class="item-checkbox">
                </div>
                <div class="fm-item-icon">
                    <i class="${icon}"></i>
                    ${isDirectory && item.category ? `<span class="fm-category-indicator" style="background: ${item.category.color_code}"></span>` : ''}
                </div>
                <div class="fm-item-details" ${item.is_image ? 'data-action="preview"' : ''}>
                    <div class="fm-item-name" ${isDirectory ? 'data-action="open"' : ''}>${item.name}</div>
                    <div class="fm-item-meta">
                        ${size}${size && fileCount ? ' • ' : ''}${fileCount}${(size || fileCount) && modified ? ' • ' : ''}${modified}
                        ${categoryInfo}
                    </div>
                </div>
                <div class="fm-item-actions">
                    ${item.is_image ? `
                        <div class="fm-featured-dropdown">
                            <button class="fm-action-btn featured-status-btn" data-action="toggle-featured-menu" title="Set featured status">
                                ${item.is_featured 
                                    ? (item.featured_type === 'portrait' ? '<i class="fas fa-user-circle" style="color: #8b949e;"></i>' : '<i class="fas fa-star" style="color: #ffc107;"></i>') 
                                    : '<i class="far fa-star"></i>'
                                }
                            </button>
                            <div class="featured-dropdown-menu">
                                <a class="featured-option" data-action="set-featured" data-type="none"><i class="fas fa-times"></i> Bỏ chọn</a>
                                <a class="featured-option" data-action="set-featured" data-type="featured"><i class="fas fa-star" style="color: #ffc107;"></i> Featured</a>
                                <a class="featured-option" data-action="set-featured" data-type="portrait"><i class="fas fa-user-circle" style="color: #8b949e;"></i> Portrait</a>
                            </div>
                        </div>
                    ` : ''}
                    <button class="fm-action-btn" data-action="rename" title="Đổi tên">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${isDirectory ? `
                        <div class="fm-category-dropdown">
                            <button class="category-dropdown-btn" onclick="fileManager.showCategoryDropdown(event, '${item.path}')" title="Set Category">
                                <i class="fas fa-tag"></i>
                                <i class="fas fa-chevron-down"></i>
                            </button>
                        </div>
                    ` : ''}
                    <button class="fm-action-btn danger" data-action="delete" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    isRootDirectory() {
        return this.currentPath === '' || this.currentPath === '/' || this.currentPath === '.';
    }

    getCurrentFolderCategory(items) {
        // First check if current folder itself has a category (from API)
        if (this.currentFolderCategory) {
            return this.currentFolderCategory;
        }

        // Check inheritance from child directories (old logic)
        for (const item of items) {
            if (item.type === 'directory' && item.category) {
                return {
                    ...item.category,
                    inherited: true
                };
            }
        }
        return null;
    }

    openPreview(index) {
        if (!this.currentItems[index] || !this.currentItems[index].is_image) {
            console.error('[FileManager] Attempted to open preview with invalid image.');
            return;
        }
        
        this.currentPreviewIndex = index;
        this.previewOpen = true;
        
        // Filter only images for preview navigation
        this.images = this.currentItems.filter(item => item.is_image);
        const imageIndex = this.images.findIndex(img => img.name === this.currentItems[index].name);
        
        if (imageIndex === -1) {
            console.error('[FileManager] Could not find image in filtered list.');
            return;
        }
        
        this.currentPreviewIndex = imageIndex;
        
        // Create overlay if it doesn't exist
        if (!document.getElementById('fm-preview-overlay')) {
            this.renderPreviewOverlayStructure();
        }
        
        // Update the main image
        this.updatePreviewImage(this.images[this.currentPreviewIndex]);
        
        // Render filmstrip
        this.renderThumbnailFilmstrip(this.images, this.currentPreviewIndex);
        
        // Add keyboard listeners
        this.bindPreviewEvents();
        
        // Focus overlay for keyboard navigation
        const overlay = document.getElementById('fm-preview-overlay');
        if (overlay) {
            overlay.tabIndex = -1;
            overlay.style.outline = 'none';
            setTimeout(() => overlay.focus(), 50);
        }
    }

    renderPreviewOverlayStructure() {
        // Remove existing overlay if any
        const existingOverlay = document.getElementById('fm-preview-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'fm-preview-overlay';
        overlay.className = 'fm-preview-overlay';

        // Main image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'fm-preview-container';
        
        const imgPreview = document.createElement('img');
        imgPreview.id = 'fm-preview-main-image';
        imgPreview.className = 'fm-preview-image';
        imgPreview.alt = 'Preview Image';
        
        imageContainer.appendChild(imgPreview);

        // Header with info and close button
        const header = document.createElement('div');
        header.className = 'fm-preview-header';
        
        const infoPanel = document.createElement('div');
        infoPanel.className = 'fm-preview-info';
        
        const imageTitle = document.createElement('h3');
        imageTitle.id = 'fm-preview-title';
        
        const badgesContainer = document.createElement('div');
        badgesContainer.id = 'fm-preview-badges';
        badgesContainer.className = 'fm-preview-badges';
        
        infoPanel.appendChild(imageTitle);
        infoPanel.appendChild(badgesContainer);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'fm-preview-close';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', () => this.closePreview());
        
        header.appendChild(infoPanel);
        header.appendChild(closeBtn);

        // Navigation controls
        const controls = document.createElement('div');
        controls.className = 'fm-preview-controls';
        
        const prevBtn = document.createElement('button');
        prevBtn.className = 'fm-preview-nav-btn prev';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.addEventListener('click', () => this.navigatePreview(-1));
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'fm-preview-nav-btn next';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.addEventListener('click', () => this.navigatePreview(1));
        
        controls.appendChild(prevBtn);
        controls.appendChild(nextBtn);

        // Filmstrip container
        const filmstrip = document.createElement('div');
        filmstrip.id = 'fm-preview-filmstrip';
        filmstrip.className = 'fm-preview-filmstrip';

        // Assemble overlay
        overlay.appendChild(header);
        overlay.appendChild(imageContainer);
        overlay.appendChild(controls);
        overlay.appendChild(filmstrip);

        document.body.appendChild(overlay);
    }

    updatePreviewImage(image) {
        const imgPreview = document.getElementById('fm-preview-main-image');
        const titleElement = document.getElementById('fm-preview-title');
        const badgesContainer = document.getElementById('fm-preview-badges');
        
        if (!imgPreview || !titleElement || !badgesContainer) return;
        
        const fullPath = this.currentPath ? `${this.currentSource}/${this.currentPath}/${image.name}` : `${this.currentSource}/${image.name}`;
        
        imgPreview.src = `/api.php?action=get_image&path=${encodeURIComponent(fullPath)}`;
        imgPreview.alt = image.name;
        
        titleElement.textContent = image.name;
        
        // Update badges
        badgesContainer.innerHTML = '';
        if (image.featured_type === 'featured') {
            badgesContainer.innerHTML += '<span class="badge featured">⭐ Featured</span>';
        }
        if (image.featured_type === 'portrait') {
            badgesContainer.innerHTML += '<span class="badge portrait">👤 Portrait</span>';
        }
        
        // Update navigation buttons
        const prevBtn = document.querySelector('.fm-preview-nav-btn.prev');
        const nextBtn = document.querySelector('.fm-preview-nav-btn.next');
        
        if (prevBtn) {
            prevBtn.disabled = this.currentPreviewIndex === 0;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPreviewIndex === this.images.length - 1;
        }
    }

    renderThumbnailFilmstrip(images, currentIndex) {
        const filmstripContainer = document.getElementById('fm-preview-filmstrip');
        if (!filmstripContainer) return;

        filmstripContainer.innerHTML = '';

        images.forEach((image, index) => {
            const thumbContainer = document.createElement('div');
            thumbContainer.className = 'fm-filmstrip-thumb';
            thumbContainer.dataset.index = index;
            
            if (index === currentIndex) {
                thumbContainer.classList.add('active');
            }

            const thumbImg = document.createElement('img');
            const fullPath = this.currentPath ? `${this.currentSource}/${this.currentPath}/${image.name}` : `${this.currentSource}/${image.name}`;
            
            // Lazy loading for filmstrip
            const shouldLoadImmediately = Math.abs(index - currentIndex) <= 2;
            
            if (shouldLoadImmediately) {
                thumbImg.src = `/api.php?action=get_thumbnail&path=${encodeURIComponent(fullPath)}&size=150`;
            } else {
                thumbImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiMyMTI2MkQiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSIyMCIgZmlsbD0iIzMwMzYzRCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjEwIiBmaWxsPSIjNThhNmZmIiBvcGFjaXR5PSIwLjMiLz48L3N2Zz4=';
                thumbImg.dataset.lazySrc = `/api.php?action=get_thumbnail&path=${encodeURIComponent(fullPath)}&size=150`;
                thumbImg.classList.add('lazy-load');
            }
            
            thumbImg.alt = image.name;

            // Add featured badges to filmstrip
            if (image.featured_type) {
                const badge = document.createElement('span');
                badge.className = `featured-badge ${image.featured_type}`;
                badge.textContent = image.featured_type === 'featured' ? '⭐' : '👤';
                thumbContainer.appendChild(badge);
            }

            thumbContainer.appendChild(thumbImg);
            
            thumbContainer.addEventListener('click', () => {
                this.navigateToImage(index);
            });

            filmstripContainer.appendChild(thumbContainer);
        });
    }

    bindPreviewEvents() {
        // Remove any existing listeners first
        document.removeEventListener('keydown', this.boundHandlePreviewKeypress);
        
        // Bind and store the reference
        this.boundHandlePreviewKeypress = this.handlePreviewKeypress.bind(this);
        document.addEventListener('keydown', this.boundHandlePreviewKeypress);
    }

    handlePreviewKeypress(e) {
        if (!this.previewOpen) return;

        // Prevent default behavior for navigation keys to avoid conflicts
        if (['Escape', 'ArrowLeft', 'ArrowRight', '1', '2'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (e.key === 'Escape') {
            this.closePreview();
            return;
        }
        if (e.key === 'ArrowLeft') {
            this.navigatePreview(-1);
            return;
        }
        if (e.key === 'ArrowRight') {
            this.navigatePreview(1);
            return;
        }
        
        // Featured marking hotkeys - only trigger on keydown, not repeat
        if (!e.repeat) {
            switch (e.key) {
                case '1':
                    this.toggleFeatured('featured');
                    break;
                case '2':
                    this.toggleFeatured('portrait');
                    break;
            }
        }
    }

    navigatePreview(direction) {
        const newIndex = this.currentPreviewIndex + direction;
        if (newIndex >= 0 && newIndex < this.images.length) {
            this.navigateToImage(newIndex);
        }
    }

    navigateToImage(index) {
        if (index < 0 || index >= this.images.length) return;
        
        this.currentPreviewIndex = index;
        this.updatePreviewImage(this.images[index]);
        this.updateFilmstripActiveThumbnail(index);
        this.loadNearbyThumbnails(index);
    }

    updateFilmstripActiveThumbnail(newIndex) {
        const filmstripContainer = document.getElementById('fm-preview-filmstrip');
        if (!filmstripContainer) return;

        // Remove active class from all thumbnails
        filmstripContainer.querySelectorAll('.fm-filmstrip-thumb').forEach(thumb => {
            thumb.classList.remove('active');
        });

        // Add active class to current thumbnail
        const currentThumb = filmstripContainer.querySelector(`[data-index="${newIndex}"]`);
        if (currentThumb) {
            currentThumb.classList.add('active');
            
            // Scroll to current thumbnail
            currentThumb.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }

    loadNearbyThumbnails(centerIndex) {
        const filmstripContainer = document.getElementById('fm-preview-filmstrip');
        if (!filmstripContainer) return;

        // Load thumbnails around the current index
        for (let i = Math.max(0, centerIndex - 3); i <= Math.min(this.images.length - 1, centerIndex + 3); i++) {
            const thumbImg = filmstripContainer.querySelector(`[data-index="${i}"] img`);
            if (thumbImg && thumbImg.classList.contains('lazy-load') && thumbImg.dataset.lazySrc) {
                thumbImg.src = thumbImg.dataset.lazySrc;
                thumbImg.classList.remove('lazy-load');
                delete thumbImg.dataset.lazySrc;
            }
        }
    }

    closePreview() {
        this.previewOpen = false;
        this.currentPreviewIndex = -1;
        
        // Remove event listeners
        if (this.boundHandlePreviewKeypress) {
            document.removeEventListener('keydown', this.boundHandlePreviewKeypress);
            this.boundHandlePreviewKeypress = null;
        }
        
        // Remove overlay
        const overlay = document.getElementById('fm-preview-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    async setFeaturedStatus(imagePath, type) {
        this.log(`Setting featured status for: ${imagePath} to type: ${type}`);
        
        try {
            const formData = new FormData();
            formData.append('source', this.currentSource);
            formData.append('path', imagePath);
            formData.append('type', type);

            const response = await fetch('/api.php?action=toggle_featured_image', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error || 'Unknown error from API');
            }

            this.showMessage('Cập nhật trạng thái thành công!', 'success');
            
            // Find item in master list and update it
            const itemToUpdate = this.currentItems.find(i => i.path === imagePath);
            if (itemToUpdate) {
                itemToUpdate.is_featured = type !== 'none';
                itemToUpdate.featured_type = type !== 'none' ? type : null;
            }
            
            // Also update in the images array for the previewer
            const imageToUpdate = this.images.find(i => i.path === imagePath);
            if (imageToUpdate) {
                imageToUpdate.is_featured = type !== 'none';
                imageToUpdate.featured_type = type !== 'none' ? type : null;
            }

            this.renderListView(this.currentItems);

        } catch (error) {
            this.error('Error setting featured status:', error);
            this.showMessage(`Lỗi: ${error.message}`, 'error');
        }
    }

    async toggleFeatured(type) {
        if (this.currentPreviewIndex === -1) return;
        const currentImage = this.images[this.currentPreviewIndex];
        if (!currentImage) return;
        
        const imagePath = this.currentPath ? `${this.currentPath}/${currentImage.name}` : currentImage.name;
        
        // Use the new centralized function
        await this.setFeaturedStatus(imagePath, type);
        
        // Update the preview UI as it remains open
        if (this.previewOpen) {
            this.updatePreviewImage(this.images[this.currentPreviewIndex]);
            this.renderThumbnailFilmstrip(this.images, this.currentPreviewIndex);
        }
    }

    async setFolderCategory() {
        const categories = await this.loadCategories();
        if (!categories) return;
        
        const options = categories.map(cat => 
            `<option value="${cat.id}" style="color: ${cat.color_code}">${cat.category_name}</option>`
        ).join('');
        
        const dialog = this.createDialog('Set Category cho Folder', `
            <div class="category-dialog">
                <p>Chọn category cho folder: <strong>${this.currentPath || 'Root'}</strong></p>
                <select id="category-select" class="form-control">
                    <option value="">-- Chọn category --</option>
                    ${options}
                </select>
            </div>
        `, [
            { text: 'Set Category', action: () => this.performSetCategory(), primary: true },
            { text: 'Hủy', action: () => this.closeDialog() }
        ]);
    }

    async loadCategories() {
        try {
            const response = await fetch('/api.php?action=get_categories');
            const result = await response.json();
            if (result.success) {
                return result.categories;
            }
        } catch (error) {
            this.error('Error loading categories:', error);
            this.showMessage('Lỗi khi tải categories', 'error');
        }
        return null;
    }

    async performSetCategory() {
        const categoryId = document.getElementById('category-select')?.value;
        if (!categoryId) {
            this.showMessage('Vui lòng chọn category', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api.php?action=set_folder_category', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    source_key: this.currentSource,
                    folder_path: this.currentPath,
                    category_id: categoryId
                })
            });
            
            const result = await response.json();
            if (result.success) {
                this.showMessage(result.message, 'success');
                this.closeDialog();
                this.refreshCurrentDirectory();
            }
        } catch (error) {
            this.error('Error setting category:', error);
            this.showMessage('Lỗi khi set category', 'error');
        }
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

            const actionTarget = e.target.closest('[data-action]');
            if (!actionTarget) return;

            const action = actionTarget.dataset.action;
            const itemPath = item.dataset.path;
            const itemType = item.dataset.type;

            switch (action) {
                case 'open':
                    if (itemType === 'directory') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (this.isNavigating) return;
                        this.isNavigating = true;
                        this.openDirectory(itemPath).finally(() => { this.isNavigating = false; });
                    }
                    break;
                case 'preview':
                    if (itemType === 'file') {
                        e.preventDefault();
                        e.stopPropagation();
                        const imageIndex = this.currentItems.findIndex(i => i.path === itemPath && i.is_image);
                        if (imageIndex >= 0) {
                            this.openPreview(imageIndex);
                        }
                    }
                    break;
                case 'toggle-featured-menu':
                    e.preventDefault();
                    e.stopPropagation();
                    const dropdown = item.querySelector('.fm-featured-dropdown');
                    // Close other dropdowns
                    document.querySelectorAll('.fm-featured-dropdown.open').forEach(d => {
                        if (d !== dropdown) d.classList.remove('open');
                    });
                    dropdown.classList.toggle('open');
                    break;
                case 'set-featured':
                    e.preventDefault();
                    e.stopPropagation();
                    const featureType = actionTarget.dataset.type;
                    this.setFeaturedStatus(itemPath, featureType);
                    const dropdownToClose = item.querySelector('.fm-featured-dropdown');
                    if (dropdownToClose) {
                        dropdownToClose.classList.remove('open');
                    }
                    break;
                case 'rename':
                    this.showRenameDialog(itemPath);
                    break;
                case 'delete':
                    this.deleteItem(itemPath);
                    break;
            }
        });
    }

    // ... (rest of the existing methods)
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

// Global function for cancel cache (accessible from onclick)
window.cancelCacheGeneration = async function() {
    console.log('[Global] Cancel cache generation called');
    if (window.fileManager && typeof window.fileManager.cancelCacheGeneration === 'function') {
        // Call the class method which contains the full logic
        await window.fileManager.cancelCacheGeneration();
    } else {
        console.error('[Global] FileManager not initialized or method not found');
        alert('Lỗi: Trình quản lý file chưa sẵn sàng hoặc có lỗi logic.');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFileManager);
} else {
    initFileManager();
}