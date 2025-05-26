// Jet Application Logic
// This file will handle the Photo Culling App's frontend functionality.

document.addEventListener('DOMContentLoaded', () => {
    console.log('Jet Culling App Initialized.');

    const appContainer = document.getElementById('jet-app-container');
    const feedbackElement = document.getElementById('jet-feedback');
    const loadingIndicator = document.getElementById('jet-loading-indicator');

    // State for current view
    let currentRawSourceKey = null;
    let currentRelativePath = ''; // This will be path relative to the source_key (e.g., folder1/subfolder2)
                                 // For top-level folders, it will be just the folder name.
    let currentGridImages = []; // Store the currently displayed images array
    let currentUser = null;

    // Realtime polling for pick updates
    let pollingInterval = null;
    const POLLING_INTERVAL = 3000; // 3 seconds

    // Variables for manual double-click detection
    let lastClickTime = 0;
    let lastClickedItemPath = null;
    const DOUBLE_CLICK_THRESHOLD = 400; // Milliseconds

    // State for Preview Mode
    let isPreviewOpen = false;
    let currentPreviewImageObject = null; // Will store the image object with its pick_color
    let currentPreviewIndex = -1;

    // NEW: State for Filtering
    let currentFilter = 'all'; // Initial filter state

    // NEW: State for Sorting
    let currentSortOrder = 'default'; // Initial sort state

    // NEW: State for Grid Selection
    let currentGridSelection = {
        source_key: null,
        image_path: null,
        element: null,
        index: -1,
        imageObject: null // Store the full image object
    };

    const PICK_COLORS = {
        NONE: 'none', // Represents unpicked or null in DB
        GREY: 'grey',
        RED: 'red',
        GREEN: 'green',
        BLUE: 'blue'
    };

    function showLoading(message = 'Đang tải...') { // Changed default message to Vietnamese
        if (loadingIndicator) {
            loadingIndicator.textContent = message;
            loadingIndicator.style.display = 'block';
        }
    }

    function hideLoading() {
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }

    function showFeedback(message, type = 'info') {
        if (feedbackElement) {
            feedbackElement.textContent = message;
            feedbackElement.className = `feedback-message ${type}`;
            feedbackElement.style.display = 'block';
            // Longer timeout for feedback
            setTimeout(() => { if(feedbackElement) feedbackElement.style.display = 'none'; }, type === 'error' ? 8000 : 5000);
        }
    }

    function initializeAppLayout() {
        if (!appContainer) return;

        appContainer.innerHTML = `
            <div id="jet-header-area">
                <div id="jet-breadcrumb"></div>
                <div id="jet-controls">
                    <div id="jet-filter-controls" style="display: none;">
                        <div class="filter-group-main">
                            <button class="jet-filter-button active" id="filter-all">Tất cả</button>
                            <button class="jet-filter-button" id="filter-picked-any">Đã chọn (Bất kỳ)</button>
                            <button class="jet-filter-button" id="filter-not-picked">Chưa chọn</button>
                        </div>
                        <div class="filter-group-colors">
                            <button class="jet-filter-button color-filter" data-color="red" aria-label="Lọc màu đỏ"></button>
                            <button class="jet-filter-button color-filter" data-color="green" aria-label="Lọc màu xanh lá"></button>
                            <button class="jet-filter-button color-filter" data-color="blue" aria-label="Lọc màu xanh dương"></button>
                            <button class="jet-filter-button color-filter" data-color="grey" aria-label="Lọc màu xám"></button>
                        </div>
                    </div>
                    <div id="jet-sort-controls" style="display: none;">
                        <label for="sort-order">Sắp xếp theo:</label>
                        <select id="sort-order" class="jet-sort-select">
                            <option value="default">Mặc định (Tên A-Z)</option>
                            <option value="name-asc">Tên A-Z</option>
                            <option value="name-desc">Tên Z-A</option>
                            <option value="date-desc">Ngày mới nhất</option>
                            <option value="date-asc">Ngày cũ nhất</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="jet-item-list-container">
                <!-- Content will be loaded here -->
            </div>
            <div id="jet-preview-area">
                <!-- Preview will be loaded here if using a dedicated area -->
            </div>
        `;
        renderBreadcrumb(); // Initial breadcrumb for top level
        fetchAndRenderTopLevelFolders(); // Load initial view
        addFilterButtonListeners(); // Add listeners for filter buttons
        addSortControlListener(); // Add listener for sort dropdown
    }

    // NEW: Function to add event listeners to filter buttons
    function addFilterButtonListeners() {
        const filterControls = document.getElementById('jet-filter-controls');
        if (!filterControls) return;

        filterControls.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('jet-filter-button')) {
                // Remove active class from all filter buttons
                const buttons = filterControls.querySelectorAll('.jet-filter-button');
                buttons.forEach(btn => btn.classList.remove('active'));

                // Add active class to the clicked button
                target.classList.add('active');

                // Update currentFilter based on the button clicked
                if (target.id === 'filter-all') {
                    currentFilter = 'all';
                } else if (target.id === 'filter-picked-any') {
                    currentFilter = 'picked-any';
                } else if (target.id === 'filter-not-picked') {
                    currentFilter = 'not-picked';
                } else if (target.dataset.color) {
                    currentFilter = target.dataset.color; // e.g., 'red', 'green'
                }
                
                applySortAndFilterAndRender();
            }
        });
    }

    // NEW: Function to add event listener to sort dropdown
    function addSortControlListener() {
        const sortOrderSelect = document.getElementById('sort-order');
        if (!sortOrderSelect) return;

        sortOrderSelect.addEventListener('change', (event) => {
            currentSortOrder = event.target.value;
            applySortAndFilterAndRender();
        });
    }

    // NEW: Combined function to apply sort, then filter, then render
    function applySortAndFilterAndRender() {
        if (!currentGridImages || currentGridImages.length === 0) {
            renderImageGrid([]);
            return;
        }

        let processedImages = [...currentGridImages]; // Start with a copy of the master list

        // 1. Apply Sorting
        switch (currentSortOrder) {
            case 'name-asc':
                processedImages.sort((a, b) => strnatcasecmp(a.name, b.name));
                break;
            case 'name-desc':
                processedImages.sort((a, b) => strnatcasecmp(b.name, a.name));
                break;
            case 'date-desc': // Newest first
                processedImages.sort((a, b) => (b.modified_timestamp || 0) - (a.modified_timestamp || 0));
                break;
            case 'date-asc': // Oldest first
                processedImages.sort((a, b) => (a.modified_timestamp || 0) - (b.modified_timestamp || 0));
                break;
            case 'default': // Default is name-asc, often pre-sorted by API or matches name-asc
            default:
                processedImages.sort((a, b) => strnatcasecmp(a.name, b.name)); // Fallback to name-asc
                break;
        }

        // 2. Apply Filtering (to the sorted list)
        let filteredImages = [];
        switch (currentFilter) {
            case 'all':
                filteredImages = [...processedImages]; // Already sorted
                break;
            case 'picked-any':
                filteredImages = processedImages.filter(img => img.pick_color && img.pick_color !== PICK_COLORS.NONE);
                break;
            case 'not-picked':
                filteredImages = processedImages.filter(img => !img.pick_color || img.pick_color === PICK_COLORS.NONE);
                break;
            default: // Specific color filters
                if (Object.values(PICK_COLORS).includes(currentFilter) && currentFilter !== PICK_COLORS.NONE) {
                    filteredImages = processedImages.filter(img => img.pick_color === currentFilter);
                } else {
                    // This case should ideally not be hit if currentFilter is always valid
                    // but if it's an unknown color filter, show all (sorted) images
                    console.warn('[Jet Filter Sorter] Unknown filter type during sort:', currentFilter, 'defaulting to all sorted.');
                    filteredImages = [...processedImages];
                }
                break;
        }
        renderImageGrid(filteredImages);
    }

    async function fetchAndRenderTopLevelFolders() {
        showLoading('Đang tải danh sách thư mục RAW gốc...');
        currentRawSourceKey = null; // Reset context
        currentRelativePath = '';
        
        // Stop realtime polling when leaving image view
        stopRealtimePolling();
        
        const itemListContainer = document.getElementById('jet-item-list-container');
        if(itemListContainer) itemListContainer.innerHTML = ''; // Clear previous items
        renderBreadcrumb(); // Render breadcrumb for the top level

        // Hide filter and sort controls when showing top-level folders
        const filterControls = document.getElementById('jet-filter-controls');
        if (filterControls) filterControls.style.display = 'none';
        const sortControls = document.getElementById('jet-sort-controls');
        if (sortControls) sortControls.style.display = 'none';

        try {
            const response = await fetch('api.php?action=jet_list_raw_sources', { credentials: 'include' }); 
            hideLoading();
            if (!response.ok) throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
            const data = await response.json();

            if (data.folders && Array.isArray(data.folders)) {
                if (data.folders.length === 0) {
                    showFeedback('Không tìm thấy thư mục RAW nào trong các nguồn đã cấu hình.', 'warning');
                    if(itemListContainer) itemListContainer.innerHTML = '<p>Không có thư mục RAW nào được tìm thấy.</p>';
                } else {
                    renderItemList(data.folders, true); // true indicates these are top-level folders
                }
            } else if (data.error) {
                 showFeedback(`Lỗi tải thư mục RAW gốc: ${data.error}${data.details ? ' (' + data.details + ')' : ''}`, 'error');
            } else {
                throw new Error('Định dạng phản hồi không hợp lệ từ máy chủ khi tải thư mục RAW gốc.');
            }
        } catch (error) {
            hideLoading();
            console.error('[Jet] Failed to fetch top-level RAW folders:', error);
            showFeedback(`Không thể kết nối để tải thư mục RAW gốc: ${error.message}`, 'error');
            if(itemListContainer) itemListContainer.innerHTML = `<p>Lỗi khi tải thư mục. ${error.message}</p>`;
        }
    }

    async function loadItemsForCurrentPath() { // Used for navigating into subfolders
        if (!currentRawSourceKey) {
            showFeedback('Lỗi: Nguồn RAW không được chọn để tải thư mục con.', 'error');
            return;
        }
        showLoading(`Đang tải thư mục: ${currentRawSourceKey}/${currentRelativePath}...`);
        try {
            const apiUrl = `api.php?action=jet_list_folders_in_raw_source&source_key=${encodeURIComponent(currentRawSourceKey)}&path=${encodeURIComponent(currentRelativePath)}`;
            const response = await fetch(apiUrl);
            hideLoading();
            if (!response.ok) throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
            const data = await response.json();

            if (data.error) {
                showFeedback(`Lỗi tải thư mục: ${data.error}${data.details ? ' (' + data.details + ')' : ''}`, 'error');
                return;
            }
            renderBreadcrumb();
            renderItemList(data.folders, false); // false: these are not top-level source folders

        } catch (error) {
            hideLoading();
            console.error('[Jet] Failed to load items:', error);
            showFeedback(`Không thể tải thư mục: ${error.message}`, 'error');
        }
    }

    // NEW: API helper to fetch list of images for a given source and path
    async function listImagesAPI(sourceKey, relativePath) {
        const apiUrl = `api.php?action=jet_list_images&source_key=${encodeURIComponent(sourceKey)}&path=${encodeURIComponent(relativePath)}`;
        showLoading('Đang tải danh sách ảnh...'); // Show loading specific to this action
        try {
            const response = await fetch(apiUrl, { credentials: 'include' });
            hideLoading();
            if (!response.ok) {
                throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
            }
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error + (data.details ? ` (${data.details})` : ''));
            }
            if (data.success && Array.isArray(data.images)) {
                return data.images;
            }
            throw new Error('Định dạng phản hồi không hợp lệ từ máy chủ khi tải danh sách ảnh.');
        } catch (error) {
            hideLoading();
            console.error('[Jet API] Failed to list images:', error);
            // Re-throw to be caught by the caller, which will update the UI with an error message
            throw error; 
        }
    }

    async function fetchAndRenderImages(sourceKey, relativePath) {
        // Update current state for breadcrumb and future navigation
        currentRawSourceKey = sourceKey;
        currentRelativePath = relativePath;
        currentGridSelection.source_key = sourceKey; // Keep selection context updated
        renderBreadcrumb(); // Update breadcrumb

        // Show filter and sort controls when showing images
        const filterControls = document.getElementById('jet-filter-controls');
        if (filterControls) filterControls.style.display = 'flex'; 
        const sortControls = document.getElementById('jet-sort-controls');
        if (sortControls) sortControls.style.display = 'flex'; 
        if (sortControls) sortControls.style.alignItems = 'center'; // Vertically align label and select

        const itemListContainer = document.getElementById('jet-item-list-container');
        if (!itemListContainer) return;
        itemListContainer.innerHTML = '<div class="jet-loading-indicator">Đang tải danh sách ảnh...</div>';
        currentGridImages = []; // Clear previous images

        try {
            const images = await listImagesAPI(sourceKey, relativePath);
            currentGridImages = images; // Store the full list
            applySortAndFilterAndRender(); // NEW: Apply current sort and filter
            
            // Start realtime polling for pick updates
            startRealtimePolling();
        } catch (error) {
            console.error('Error fetching images for grid:', error);
            itemListContainer.innerHTML = `<div class="jet-feedback-message error">Lỗi khi tải ảnh: ${error.message}</div>`;
        }
    }

    function renderImageGrid(imagesToRender) {
        // currentGridImages = images; // REMOVE THIS LINE - currentGridImages should hold the master list
        const itemListContainer = document.getElementById('jet-item-list-container');
        if (!itemListContainer) return;
        itemListContainer.innerHTML = ''; // Clear previous items
        itemListContainer.classList.add('image-grid-container'); // Add class for grid styling
        // currentGridSelection = { source_key: null, image_path: null, element: null, index: -1, imageObject: null }; // Reset grid selection
        // NB: Resetting grid selection here might be too aggressive if we want to maintain selection across filter changes.
        // Let's defer resetting selection until a new folder is loaded or explicitly cleared.

        if (imagesToRender.length === 0) {
            itemListContainer.innerHTML = '<p class="empty-message">Không có hình ảnh nào khớp với bộ lọc hiện tại.</p>'; // Updated message
            // Clear selection if filter results in no images
            currentGridSelection = { source_key: currentRawSourceKey, image_path: null, element: null, index: -1, imageObject: null }; 
            return;
        }

        let firstMatchingElement = null;
        let firstMatchingImageObject = null;
        let firstMatchingIndex = -1;

        imagesToRender.forEach((image, indexInFilteredArray) => {
            const imageItemContainer = document.createElement('div');
            imageItemContainer.classList.add('jet-image-item-container'); // For styling the grid item
            imageItemContainer.dataset.imagePath = image.path; // Store path for easy access
            imageItemContainer.dataset.sourceKey = image.source_key;
            imageItemContainer.dataset.index = indexInFilteredArray;

            const imgElement = document.createElement('img');
            imgElement.classList.add('jet-preview-image');
            // Construct the path for the preview. image.path is relative to the source_key root folder.
            imgElement.src = `api.php?action=jet_get_raw_preview&source_key=${encodeURIComponent(image.source_key)}&image_path=${encodeURIComponent(image.path)}`;
            imgElement.alt = image.name;
            imgElement.title = image.name;

            // Add class if image is already picked - NOW BASED ON pick_color
            // Remove old .picked class logic if any, and add specific color classes
            imageItemContainer.classList.remove('picked', 'picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear old classes
            if (image.pick_color) { 
                imageItemContainer.classList.add(`picked-${image.pick_color}`);
            }
            
            // Handle loading errors for individual images (optional, but good UX)
            imgElement.onerror = () => {
                imgElement.alt = `Preview not available for ${image.name}`;
                // You could replace the img with a placeholder or error message in the container
                imageItemContainer.classList.add('preview-error');
                const errorSpan = document.createElement('span');
                errorSpan.textContent = `!`; // Simple error indicator
                errorSpan.title = `Preview not available for ${image.name}`;
                imgElement.parentNode.insertBefore(errorSpan, imgElement.nextSibling);
                imgElement.style.display = 'none'; // Hide broken image icon
            };

            const imageNameElement = document.createElement('span');
            imageNameElement.classList.add('image-item-name');
            imageNameElement.textContent = image.name;

            imageItemContainer.appendChild(imgElement);
            imageItemContainer.appendChild(imageNameElement);
            
            // Add all_picks indicator for admin
            if (image.all_picks && image.all_picks.length > 0) {
                const allPicksIndicator = document.createElement('div');
                allPicksIndicator.classList.add('all-picks-indicator');
                
                image.all_picks.forEach(pick => {
                    const pickRow = document.createElement('div');
                    pickRow.classList.add('pick-row');
                    
                    const pickDot = document.createElement('span');
                    pickDot.classList.add('pick-dot', `pick-dot-${pick.color}`);
                    
                    const pickText = document.createElement('span');
                    pickText.classList.add('pick-text');
                    pickText.textContent = pick.username || 'Unknown';
                    
                    pickRow.appendChild(pickDot);
                    pickRow.appendChild(pickText);
                    allPicksIndicator.appendChild(pickRow);
                    
                    // Debug log for troubleshooting
                    console.log('Pick row created:', pick);
                });
                
                imageItemContainer.appendChild(allPicksIndicator);
            }
            
            // MODIFIED: Click listener now selects the image in the grid, and handles manual double-click
            imageItemContainer.addEventListener('click', () => {
                const currentTime = new Date().getTime();
                // Find the original index of this image in the master currentGridImages list
                const originalIndex = currentGridImages.findIndex(img => img.path === image.path && img.source_key === image.source_key);

                if (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD && lastClickedItemPath === image.path) {
                    // Double click detected
                    if (originalIndex !== -1) {
                        openImagePreview(image, originalIndex); // Use original index
                    } else {
                        console.warn("[Jet Grid DblClick] Could not find original index for (dblclick):", image);
                        // Fallback or decide how to handle if originalIndex is -1 (should not happen if image is from currentGridImages)
                        openImagePreview(image, indexInFilteredArray); // Fallback to filtered index if needed
                    }
                    lastClickTime = 0;
                    lastClickedItemPath = null;
                } else {
                    // Single click
                    if (originalIndex !== -1) {
                        selectImageInGrid(image, imageItemContainer, originalIndex); // Use original index
                    } else {
                        console.warn("[Jet Grid Click] Could not find original index for (click):", image);
                        selectImageInGrid(image, imageItemContainer, indexInFilteredArray); // Fallback
                    }
                    lastClickTime = currentTime;
                    lastClickedItemPath = image.path;
                }
            });

            itemListContainer.appendChild(imageItemContainer);

            // Keep track of the first element to potentially auto-select it
            if (indexInFilteredArray === 0) {
                firstMatchingElement = imageItemContainer;
                firstMatchingImageObject = image;
                // The index for selection should be its index in the *original* currentGridImages array
                firstMatchingIndex = currentGridImages.findIndex(img => img.path === image.path && img.source_key === image.source_key);
            }
        });

        // REMOVE Event delegation for double-click on the container
        if (itemListContainer.handleDoubleClickEvent) { 
            itemListContainer.removeEventListener('dblclick', itemListContainer.handleDoubleClickEvent);
            delete itemListContainer.handleDoubleClickEvent; // Clean up the custom property
        }

        // Automatically select the first image if available after rendering
        // if (images.length > 0) { // OLD Condition
        if (imagesToRender.length > 0 && firstMatchingElement && firstMatchingImageObject && firstMatchingIndex !== -1) {
            // const firstImageElement = itemListContainer.querySelector('.jet-image-item-container'); // This would get the first in DOM
            // if (firstImageElement) {
            //     selectImageInGrid(imagesToRender[0], firstImageElement, 0); // Index 0 of filtered array might not be correct for global state
            // }
            selectImageInGrid(firstMatchingImageObject, firstMatchingElement, firstMatchingIndex);
        } else if (imagesToRender.length === 0) {
             // If filter results in no images, explicitly clear currentGridSelection's details beyond source_key
            currentGridSelection.image_path = null;
            currentGridSelection.element = null;
            currentGridSelection.index = -1;
            currentGridSelection.imageObject = null;
        }
    }

    // NEW: Function to handle selecting an image in the grid
    function selectImageInGrid(imageObject, imageElement, index) {
        // Iterate over ALL grid items. Remove .grid-item-selected from all of them.
        const allItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
        allItems.forEach(item => {
            if (item.classList.contains('grid-item-selected')) {
                 item.classList.remove('grid-item-selected');
            }
        });

        // Now, add .grid-item-selected ONLY to the target imageElement.
        if (imageElement) {
            imageElement.classList.add('grid-item-selected');
            imageElement.focus();
            imageElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }

        // Update current selection state
        currentGridSelection.source_key = imageObject.source_key;
        currentGridSelection.image_path = imageObject.path;
        currentGridSelection.element = imageElement;
        currentGridSelection.index = index;
        currentGridSelection.imageObject = imageObject; // Store the full image object
    }

    async function toggleImagePickAPI(imageObject, targetColor, itemContainerElement) { // Modified to accept targetColor
        showLoading('Đang cập nhật trạng thái...');
        try {
            const formData = new FormData();
            formData.append('source_key', imageObject.source_key);
            formData.append('image_relative_path', imageObject.path);
            // This function is now DEPRECATED in favor of setPickColorFromPreview or direct API calls with color
            // For now, let's assume it means toggling between GREY and NONE for simple grid clicks if we keep that behavior
            // const targetColor = newPickState ? PICK_COLORS.GREY : PICK_COLORS.NONE; 
            // Ensure targetColor is correctly formatted for the API ('none' for null)
            formData.append('pick_color', targetColor === PICK_COLORS.NONE ? 'none' : targetColor); 

            const response = await fetch('api.php?action=jet_set_pick_color', { // API endpoint updated
                method: 'POST',
                body: formData,
                credentials: 'include' 
            });
            hideLoading();

            if (!response.ok) {
                // No optimistic UI update to revert, just show error.
                // imageObject.is_picked remains its original state.
                const errorData = await response.json().catch(() => null); // Try to parse error
                const errorMessage = errorData?.error || `Lỗi HTTP: ${response.status}`;
                showFeedback(`Lỗi cập nhật trạng thái pick: ${errorMessage}`, 'error');
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.success) {
                showFeedback(data.message || 'Trạng thái pick đã được cập nhật.', 'success');
                
                imageObject.pick_color = data.pick_color; // Update with the color from API (could be null)
                
                if (itemContainerElement) { // If called from grid context
                    itemContainerElement.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear specific color classes
                    if (imageObject.pick_color) {
                        itemContainerElement.classList.add(`picked-${imageObject.pick_color}`);
                    } else {
                         // Ensure all color classes are removed if pick_color is null (unpicked)
                        // This is covered by the remove list above, but good to be explicit if old 'picked' class was also used
                    }
                }
                // If the currently selected grid item is the one being updated, ensure its imageObject state is also fresh
                if (currentGridSelection.imageObject && currentGridSelection.image_path === imageObject.path && currentGridSelection.source_key === imageObject.source_key) {
                    currentGridSelection.imageObject.pick_color = data.pick_color;
                }
            } else {
                // API call was successful but reported an error (e.g. validation)
                // imageObject.is_picked remains its original state. UI also remains.
                showFeedback(`Lỗi cập nhật trạng thái pick: ${data.error || 'Lỗi không xác định từ máy chủ.'}`, 'error');
            }

        } catch (error) {
            hideLoading();
            // imageObject.is_picked remains its original state. UI also remains.
            console.error('[Jet] Failed to toggle pick status:', error);
            showFeedback(`Không thể cập nhật trạng thái pick: ${error.message}`, 'error');
        }
    }

    function renderItemList(items, isTopLevel) {
        const itemListContainer = document.getElementById('jet-item-list-container');
        if (!itemListContainer) return;
        itemListContainer.innerHTML = ''; 

        if (!items || items.length === 0) {
            const message = isTopLevel ? 'Không có thư mục RAW nào trong các nguồn đã cấu hình.' : 'Thư mục này trống.';
            itemListContainer.innerHTML = `<p>${message}</p>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.className = 'jet-item-list jet-folder-list'; 

        items.forEach(item => {
            if (item.type === 'folder') {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.textContent = `📁 ${item.name}`;
                // item.path from jet_list_raw_sources is already source_key/folder_name
                // item.path from jet_list_folders_in_raw_source is relative_path/folder_name
                button.dataset.folderPath = item.path; 
                button.dataset.sourceKey = item.source_key; // Essential for top-level, useful for consistency
                
                button.addEventListener('click', () => {
                    const clickedSourceKey = item.source_key;
                    let clickedRelativePath;

                    if (isTopLevel) {
                        // item.path is 'source_key/folder_name', extract 'folder_name'
                        clickedRelativePath = item.path.substring(item.source_key.length + 1);
                    } else {
                        // This case ('else') might not be hit with the current top-level folder display logic,
                        // as 'jet_list_raw_sources' provides the initial set of "subfolders" directly.
                        // If we re-introduce deeper folder navigation that calls renderItemList with isTopLevel=false,
                        // this path logic would need to be robust for 'parentPath/currentFolder'.
                        // For now, assuming 'item.path' is the full relative path from the source root for any folder item.
                        // Example: if currentRelativePath = 'FolderA', and item.name = 'SubFolderB',
                        // then item.path (from a hypothetical future API for sub-folders) might be 'FolderA/SubFolderB'.
                        clickedRelativePath = item.path; // Assuming item.path is the full relative path from source root.
                                                        // This needs to align with what the API (e.g. jet_list_folders_in_raw_source) returns for 'path'.
                                                        // The old `loadItemsForCurrentPath` built this progressively.
                                                        // The `jet_list_raw_sources` returns 'source_key/folder_name' as path for top level.
                                                        // We need just the folder_name for the `path` param to `jet_list_images`.
                         const sourcePrefix = item.source_key + '/';
                         if (item.path.startsWith(sourcePrefix)) {
                            clickedRelativePath = item.path.substring(sourcePrefix.length);
                         } else {
                            // Fallback or error if path format is unexpected
                            console.warn("[Jet] Unexpected item path format for non-top-level folder:", item);
                            clickedRelativePath = item.path; 
                         }
                    }
                    // currentRawSourceKey = clickedSourceKey; // Set by fetchAndRenderImages
                    // currentRelativePath = clickedRelativePath; // Set by fetchAndRenderImages
                    fetchAndRenderImages(clickedSourceKey, clickedRelativePath);
                });
                li.appendChild(button);
                ul.appendChild(li);
            }
        });
        itemListContainer.appendChild(ul);
    }

    function renderBreadcrumb() {
        const breadcrumbDiv = document.getElementById('jet-breadcrumb');
        if (!breadcrumbDiv) return;
        breadcrumbDiv.innerHTML = ''; 

        const homeLink = document.createElement('a');
        homeLink.href = '#';
        homeLink.textContent = 'Thư mục RAW gốc'; // Changed to Vietnamese
        homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchAndRenderTopLevelFolders(); // This resets currentRawSourceKey and currentRelativePath
        });
        breadcrumbDiv.appendChild(homeLink);

        if (currentRawSourceKey && currentRelativePath) { // currentRelativePath is now just the folder name, or series of folder names
            breadcrumbDiv.appendChild(document.createTextNode(` > `));
            const sourceSpan = document.createElement('span'); // Make source key part of breadcrumb too
            sourceSpan.textContent = currentRawSourceKey;
            // Optional: make source key clickable to go to its root (if that view makes sense)
            breadcrumbDiv.appendChild(sourceSpan);

            const pathParts = currentRelativePath.split('/').filter(part => part.length > 0);
            let accumulatedPath = '';
            pathParts.forEach((part, index) => {
                breadcrumbDiv.appendChild(document.createTextNode(` > `));
                accumulatedPath += (index > 0 ? '/' : '') + part;
                const partLink = document.createElement('a');
                partLink.href = '#';
                partLink.textContent = part;
                const pathForThisLink = accumulatedPath; // This is the relative path for the API
                
                partLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    // currentRawSourceKey is already set and should remain
                    // currentRelativePath will be set by fetchAndRenderImages
                    fetchAndRenderImages(currentRawSourceKey, pathForThisLink);
                });
                breadcrumbDiv.appendChild(partLink);
            });
        } else if (currentRawSourceKey) { // Only source key is set (e.g. after error in folder, breadcrumb still shows source)
             breadcrumbDiv.appendChild(document.createTextNode(` > `));
             const sourceSpan = document.createElement('span');
             sourceSpan.textContent = currentRawSourceKey;
             breadcrumbDiv.appendChild(sourceSpan);
        }
    }

    // --- Image Preview Mode Functions ---

    function closeImagePreview() {
        const overlay = document.getElementById('jet-image-preview-overlay');
        if (overlay) {
            overlay.remove();
        }
        isPreviewOpen = false;
        currentPreviewImageObject = null;
        currentPreviewIndex = -1;
        // Remove keyboard listeners
        document.removeEventListener('keydown', handlePreviewKeyPress);
        
        // Clean up any picks info elements
        const existingPicksInfo = document.getElementById('jet-preview-all-picks-info');
        if (existingPicksInfo) existingPicksInfo.remove();
    }

    // Refactored: This function now only creates the overlay structure and sets up the initial main image
    function renderPreviewOverlayStructure() { // No longer takes imageObject, just creates structure
        // Remove existing overlay if any (shouldn't be necessary if state is managed)
        const existingOverlay = document.getElementById('jet-image-preview-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'jet-image-preview-overlay';
        overlay.classList.add('jet-preview-overlay-container'); // For styling

        // Image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'jet-preview-image-container';
        
        // Image element (source will be set later by updatePreviewImage)
        const imgPreview = document.createElement('img');
        imgPreview.id = 'jet-preview-main-image';
        imgPreview.alt = 'Preview Image'; // Generic alt, will be updated
        // imgPreview.onerror handled by updatePreviewImage
        // imgPreview.onload handled by updatePreviewImage

        imageContainer.appendChild(imgPreview);

        // Close button
        const closeButton = document.createElement('button');
        closeButton.id = 'jet-preview-close-button';
        closeButton.textContent = 'Đóng (Esc)'; // Close (Esc)
        closeButton.addEventListener('click', closeImagePreview);

        // Navigation buttons
        const prevButton = document.createElement('button');
        prevButton.id = 'jet-preview-prev-button';
        prevButton.textContent = 'Trước (←)'; // Previous
        // Event listeners added later

        const nextButton = document.createElement('button');
        nextButton.id = 'jet-preview-next-button';
        nextButton.textContent = 'Sau (→)'; // Next
        // Event listeners added later

        // Pick button
        const pickButton = document.createElement('button');
        pickButton.id = 'jet-preview-pick-button';
        pickButton.className = 'jet-preview-pick-button-base'; // Base class
        pickButton.textContent = 'Màu: '; // Base text
        const colorIndicator = document.createElement('span');
        colorIndicator.id = 'jet-preview-pick-color-indicator';
        pickButton.appendChild(colorIndicator);

        // Info/Metadata area (placeholder)
        const imageNameDisplay = document.createElement('div');
        imageNameDisplay.id = 'jet-preview-image-name';
        imageNameDisplay.textContent = ''; // Will be updated

        // Assemble the top controls
        const controlsTop = document.createElement('div');
        controlsTop.className = 'jet-preview-controls-top';
        
        // NEW: Create containers for layout
        const leftControlArea = document.createElement('div');
        leftControlArea.className = 'jet-preview-control-area left';

        const centerControlArea = document.createElement('div');
        centerControlArea.className = 'jet-preview-control-area center';

        const rightControlArea = document.createElement('div');
        rightControlArea.className = 'jet-preview-control-area right';

        // Append elements to their respective containers
        leftControlArea.appendChild(imageNameDisplay);
        
        centerControlArea.appendChild(pickButton); // Move pick button to center area
        
        rightControlArea.appendChild(closeButton);

        // Append control areas to the top controls container
        controlsTop.appendChild(leftControlArea);
        controlsTop.appendChild(centerControlArea);
        controlsTop.appendChild(rightControlArea);

        // Assemble the nav controls
         const controlsNav = document.createElement('div');
        controlsNav.className = 'jet-preview-controls-nav';
        // Append nav buttons later

        // NEW: Append navigation buttons to controlsNav
        controlsNav.appendChild(prevButton);
        controlsNav.appendChild(nextButton);

        // Container for horizontal thumbnail filmstrip
        const thumbnailFilmstrip = document.createElement('div');
        thumbnailFilmstrip.id = 'jet-thumbnail-filmstrip';
        // Filmstrip content will be added later

        // Append major sections to overlay
        overlay.appendChild(controlsTop);
        overlay.appendChild(imageContainer);
        overlay.appendChild(controlsNav);
        overlay.appendChild(thumbnailFilmstrip); // Add filmstrip container

        // Append overlay to body
        document.body.appendChild(overlay);

        // Add navigation button event listeners now that buttons exist
        document.getElementById('jet-preview-prev-button').addEventListener('click', navigatePreviewPrev);
        document.getElementById('jet-preview-next-button').addEventListener('click', navigatePreviewNext);
    }

    // NEW: Function to update only the main preview image source and state
    function updatePreviewImage(imageObject) {
        const imgPreview = document.getElementById('jet-preview-main-image');
        const imageNameDisplay = document.getElementById('jet-preview-image-name');
        const pickButtonInPreview = document.getElementById('jet-preview-pick-button');
         const existingError = document.querySelector('#jet-image-preview-overlay .preview-load-error-message');

        if (!imgPreview || !imageNameDisplay || !pickButtonInPreview) return;

         // Remove any previous error message
         if (existingError) {
             existingError.remove();
              imgPreview.style.display = 'block'; // Show image again if it was hidden
         }

        // Set the image source
        imgPreview.src = `api.php?action=jet_get_raw_preview&source_key=${encodeURIComponent(imageObject.source_key)}&image_path=${encodeURIComponent(imageObject.path)}`;
        imgPreview.alt = `Preview of ${imageObject.name}`;

        // Handle image load errors
        imgPreview.onerror = () => {
            imgPreview.alt = 'Lỗi tải ảnh xem trước.';
            const errorPlaceholder = document.createElement('div');
            errorPlaceholder.className = 'preview-load-error-message';
            errorPlaceholder.textContent = 'Không thể tải ảnh xem trước. Nhấn Esc để đóng.';
             const container = imgPreview.parentElement;
             if(container) {
                 imgPreview.style.display = 'none'; // Hide the broken image icon
                 container.parentElement.insertBefore(errorPlaceholder, container); // Insert error before the container to affect layout
             }
        };

        // Update image name display
        imageNameDisplay.textContent = imageObject.name;

        // Add all picks info display next to image name if available
        const existingPicksInfo = document.getElementById('jet-preview-all-picks-info');
        if (existingPicksInfo) existingPicksInfo.remove();
        
        if (imageObject.all_picks && imageObject.all_picks.length > 0) {
            const allPicksInfo = document.createElement('div');
            allPicksInfo.id = 'jet-preview-all-picks-info';
            allPicksInfo.className = 'jet-preview-all-picks-info';
            
            imageObject.all_picks.forEach(pick => {
                const pickInfo = document.createElement('span');
                pickInfo.className = `jet-preview-pick-info pick-info-${pick.color}`;
                pickInfo.textContent = `${pick.username}: ${pick.color.toUpperCase()}`;
                allPicksInfo.appendChild(pickInfo);
            });
            
            imageNameDisplay.parentNode.appendChild(allPicksInfo);
        }

        // Update the Pick button/indicator
        const colorIndicatorSpan = pickButtonInPreview.querySelector('#jet-preview-pick-color-indicator');
        pickButtonInPreview.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear all color classes
        if (imageObject.pick_color) {
            pickButtonInPreview.classList.add(`picked-${imageObject.pick_color}`);
            if(colorIndicatorSpan) {
                 colorIndicatorSpan.textContent = imageObject.pick_color.toUpperCase();
                 // Background color and text color are now handled by the button's CSS classes
                 // colorIndicatorSpan.style.backgroundColor = imageObject.pick_color;
                 // if (imageObject.pick_color === PICK_COLORS.GREY || imageObject.pick_color === PICK_COLORS.BLUE) colorIndicatorSpan.style.color = 'white'; else colorIndicatorSpan.style.color = 'black';
            }
        } else { // No color picked (null)
             if(colorIndicatorSpan) {
                colorIndicatorSpan.textContent = 'NONE';
                // Background color and text color are now handled by the button's CSS classes
                // colorIndicatorSpan.style.backgroundColor = 'transparent';
                // colorIndicatorSpan.style.color = '#ccc';
            }
        }

         // Update the corresponding item in the main grid display (This logic might be redundant if handled elsewhere, but keep for sync)
        const gridItems = document.querySelectorAll('.jet-image-item-container');
        gridItems.forEach(gridItem => {
            // Use dataset.imagePath for more reliable matching
             if (gridItem.dataset.imagePath === imageObject.path && gridItem.dataset.sourceKey === imageObject.source_key) {
                gridItem.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey');
                if (imageObject.pick_color) {
                    gridItem.classList.add(`picked-${imageObject.pick_color}`);
                }
             }
        });
    }

    function openImagePreview(imageObject, imageIndexInGrid) {
        if (!imageObject) {
            console.error('[Jet Preview] Attempted to open preview with no imageObject.');
            return;
        }
        currentPreviewImageObject = imageObject; // Store the full object
        currentPreviewIndex = imageIndexInGrid;  // Store its original index from currentGridImages
        isPreviewOpen = true;

        const previewArea = document.getElementById('jet-preview-area');
        if (!previewArea) {
            console.error('Preview area element not found!');
            return;
        }

        // Create the initial overlay structure if it doesn't exist
        if (!document.getElementById('jet-image-preview-overlay')) {
             renderPreviewOverlayStructure();
        }
        
        // Update the main image source and related info
        updatePreviewImage(currentPreviewImageObject);

        // Render the thumbnail filmstrip initially
        renderThumbnailFilmstrip(currentGridImages, currentPreviewIndex);

        // Add event listeners for preview navigation (keyboard)
        document.addEventListener('keydown', handlePreviewKeyPress);
    }

    // Function to render the horizontal thumbnail filmstrip (called once on open)
    function renderThumbnailFilmstrip(images, currentIndex) {
        const filmstripContainer = document.getElementById('jet-thumbnail-filmstrip');
        if (!filmstripContainer) return;

        filmstripContainer.innerHTML = ''; // Clear existing thumbnails (only on initial render)

        images.forEach((imageObject, index) => {
            // Create a container for the thumbnail and its indicator
            const thumbContainer = document.createElement('div');
            thumbContainer.classList.add('jet-filmstrip-thumb-container'); // New container class
            thumbContainer.dataset.index = index; // Store the index on container

            // Create the image element
            const thumbElement = document.createElement('img');
            thumbElement.classList.add('jet-filmstrip-thumb'); // Class for the image styling
            thumbElement.src = `api.php?action=jet_get_raw_preview&source_key=${encodeURIComponent(imageObject.source_key)}&image_path=${encodeURIComponent(imageObject.path)}&size=filmstrip`;
            thumbElement.alt = `Thumbnail of ${imageObject.name}`;

            // Add pick color class to the CONTAINER if image is picked
            if (imageObject.pick_color) {
                thumbContainer.classList.add(`picked-${imageObject.pick_color}`);
            }

            // Add all_picks indicator for admin (similar to grid)
            if (imageObject.all_picks && imageObject.all_picks.length > 0) {
                const allPicksIndicator = document.createElement('div');
                allPicksIndicator.classList.add('all-picks-indicator');
                allPicksIndicator.style.position = 'absolute';
                allPicksIndicator.style.top = '2px';
                allPicksIndicator.style.left = '2px';
                allPicksIndicator.style.fontSize = '0.6rem';
                allPicksIndicator.style.minWidth = '40px';
                
                imageObject.all_picks.forEach(pick => {
                    const pickRow = document.createElement('div');
                    pickRow.classList.add('pick-row');
                    
                    const pickDot = document.createElement('span');
                    pickDot.classList.add('pick-dot', `pick-dot-${pick.color}`);
                    pickDot.style.width = '6px';
                    pickDot.style.height = '6px';
                    
                    const pickText = document.createElement('span');
                    pickText.classList.add('pick-text');
                    pickText.textContent = pick.username || 'Unknown';
                    
                    pickRow.appendChild(pickDot);
                    pickRow.appendChild(pickText);
                    allPicksIndicator.appendChild(pickRow);
                });
                
                thumbContainer.appendChild(allPicksIndicator);
            }

            // Highlight the current image's thumbnail CONTAINER
            if (index === currentIndex) {
                thumbContainer.classList.add('active');
            }

            // Add click listener to navigate on the CONTAINER
            thumbContainer.addEventListener('click', () => {
                 // Update state and UI without closing/reopening overlay
                currentPreviewIndex = index;
                currentPreviewImageObject = images[index];
                updatePreviewImage(currentPreviewImageObject); // Update main image
                updateFilmstripActiveThumbnail(currentPreviewIndex); // Update filmstrip highlight and scroll
            });

            // Append image to container, then container to filmstrip
            thumbContainer.appendChild(thumbElement);
            filmstripContainer.appendChild(thumbContainer);
        });

        // Scroll the filmstrip to make the active thumbnail visible initially
        updateFilmstripActiveThumbnail(currentIndex); // Use the new update function
    }

    // Function to update the active thumbnail in the filmstrip and scroll
    function updateFilmstripActiveThumbnail(newIndex) {
        const filmstripContainer = document.getElementById('jet-thumbnail-filmstrip');
        if (!filmstripContainer) return;

        // Select thumbnail CONTAINERS
        const thumbContainers = filmstripContainer.querySelectorAll('.jet-filmstrip-thumb-container');

        // Remove active class from all thumbnail CONTAINERS
        thumbContainers.forEach(container => container.classList.remove('active'));

        // Add active class to the new active thumbnail CONTAINER
        const newActiveThumbContainer = filmstripContainer.querySelector(`.jet-filmstrip-thumb-container[data-index="${newIndex}"]`);
        if (newActiveThumbContainer) {
            newActiveThumbContainer.classList.add('active');

             // Scroll the filmstrip to make the active thumbnail visible
             newActiveThumbContainer.scrollIntoView({
                behavior: 'smooth',
                inline: 'center' // Scroll horizontally to center the thumbnail
            });
        }
    }

    function navigatePreviewNext() {
        if (!isPreviewOpen || currentGridImages.length === 0) return;

        let nextIndex = currentPreviewIndex + 1;
        if (nextIndex >= currentGridImages.length) {
            nextIndex = 0; // Loop to the beginning
        }
        currentPreviewIndex = nextIndex;
        currentPreviewImageObject = currentGridImages[currentPreviewIndex];

        // Update UI without re-rendering the whole overlay
        updatePreviewImage(currentPreviewImageObject); // Update main image
        updateFilmstripActiveThumbnail(currentPreviewIndex); // Update filmstrip highlight and scroll

        // Update grid selection to match preview (optional sync)
        const gridItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
        // Use dataset for more reliable matching
        gridItems.forEach(gridItem => {
             if (gridItem.dataset.imagePath === currentPreviewImageObject.path && gridItem.dataset.sourceKey === currentPreviewImageObject.source_key) {
                selectImageInGrid(currentPreviewImageObject, gridItem, currentPreviewIndex); // Pass correct index
             }
        });
    }

    function navigatePreviewPrev() {
        if (!isPreviewOpen || currentGridImages.length === 0) return;

        let prevIndex = currentPreviewIndex - 1;
        if (prevIndex < 0) {
            prevIndex = currentGridImages.length - 1; // Loop to the end
        }
        currentPreviewImageObject = currentGridImages[prevIndex];
        currentPreviewIndex = prevIndex;

         // Update UI without re-rendering the whole overlay
        updatePreviewImage(currentPreviewImageObject); // Update main image
        updateFilmstripActiveThumbnail(currentPreviewIndex); // Update filmstrip highlight and scroll

        // Update grid selection to match preview (optional sync)
        const gridItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
         // Use dataset for more reliable matching
        gridItems.forEach(gridItem => {
             if (gridItem.dataset.imagePath === currentPreviewImageObject.path && gridItem.dataset.sourceKey === currentPreviewImageObject.source_key) {
                selectImageInGrid(currentPreviewImageObject, gridItem, currentPreviewIndex); // Pass correct index
             }
        });
    }

    function handlePreviewKeyPress(event) {
        if (!isPreviewOpen) return;

        if (event.key === 'Escape') {
            closeImagePreview();
        }
        if (event.key === 'ArrowLeft') {
            navigatePreviewPrev();
        }
        if (event.key === 'ArrowRight') {
            navigatePreviewNext();
        }
        // Color pick hotkeys
        switch (event.key) {
            case '0':
                setPickColorViaAPI(PICK_COLORS.GREY);
                break;
            case '1':
                setPickColorViaAPI(PICK_COLORS.RED);
                break;
            case '2':
                setPickColorViaAPI(PICK_COLORS.GREEN);
                break;
            case '3':
                setPickColorViaAPI(PICK_COLORS.BLUE);
                break;
            // Potentially a dedicated unpick key like Backspace or Delete
            // case 'Backspace':
            // case 'Delete':
            //     setPickColorViaAPI(PICK_COLORS.NONE); 
            //     break;
        }
    }

    // Renamed from togglePickFromPreview and adapted for specific color setting
    async function setPickColorViaAPI(targetColor) { 
        if (!isPreviewOpen || !currentPreviewImageObject) return;

        const imageToUpdate = currentPreviewImageObject;
        
        // Logic for toggling off if the same color key is pressed again
        if (imageToUpdate.pick_color === targetColor) {
            targetColor = PICK_COLORS.NONE; // Unpick if current color is same as target
        }

        showLoading('Đang cập nhật màu pick...');

        try {
            const formData = new FormData();
            formData.append('source_key', imageToUpdate.source_key);
            formData.append('image_relative_path', imageToUpdate.path);
            // Send the targetColor. If targetColor is PICK_COLORS.NONE (null), it should be sent appropriately.
            // The API side (jet_set_pick_color) is already set up to interpret null/empty/'none' as unpick (store NULL).
            formData.append('pick_color', targetColor === PICK_COLORS.NONE ? 'none' : targetColor);

            const response = await fetch('api.php?action=jet_set_pick_color', {
                method: 'POST',
                body: formData,
                credentials: 'include' 
            });
            hideLoading();

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || `Lỗi HTTP: ${response.status}`;
                showFeedback(`Lỗi cập nhật màu pick: ${errorMessage}`, 'error');
                return;
            }

            const data = await response.json();
            if (data.success) {
                showFeedback(data.message || 'Màu pick đã được cập nhật.', 'success');
                
                imageToUpdate.pick_color = data.pick_color; // Update local object state

                // Update the Pick button/indicator in the preview overlay
                const pickButtonInPreview = document.getElementById('jet-preview-pick-button');
                if (pickButtonInPreview) {
                    const colorIndicatorSpan = pickButtonInPreview.querySelector('#jet-preview-pick-color-indicator');
                    pickButtonInPreview.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear all color classes
                    if (imageToUpdate.pick_color) {
                        pickButtonInPreview.classList.add(`picked-${imageToUpdate.pick_color}`);
                        // Update text content based on new color
                         if(colorIndicatorSpan) {
                             colorIndicatorSpan.textContent = imageToUpdate.pick_color.toUpperCase();
                         }
                    } else { // No color picked (null)
                         if(colorIndicatorSpan) {
                            colorIndicatorSpan.textContent = 'NONE';
                        }
                    }
                }

                // Update the corresponding thumbnail in the filmstrip
                const filmstripContainer = document.getElementById('jet-thumbnail-filmstrip');
                if (filmstripContainer && currentPreviewIndex !== -1) {
                     const currentThumbContainer = filmstripContainer.querySelector(`.jet-filmstrip-thumb-container[data-index="${currentPreviewIndex}"]`);
                     if (currentThumbContainer) {
                        currentThumbContainer.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear all color classes
                         if (imageToUpdate.pick_color) {
                             currentThumbContainer.classList.add(`picked-${imageToUpdate.pick_color}`);
                         }
                     }
                }

                // Update the corresponding item in the main grid display
                const gridItems = document.querySelectorAll('.jet-image-item-container');
                gridItems.forEach(gridItem => {
                    const imgElement = gridItem.querySelector('.jet-preview-image');
                    const nameElement = gridItem.querySelector('.image-item-name');
                    let isMatch = false;
                    if (nameElement && nameElement.textContent === imageToUpdate.name) {
                        if (imgElement && imgElement.src.includes(encodeURIComponent(imageToUpdate.path)) && imgElement.src.includes(encodeURIComponent(imageToUpdate.source_key))) {
                            isMatch = true;
                        }
                    }
                    if (isMatch) {
                        gridItem.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey');
                        if (imageToUpdate.pick_color) {
                            gridItem.classList.add(`picked-${imageToUpdate.pick_color}`);
                        }
                    }
                });
            } else {
                showFeedback(`Lỗi cập nhật màu pick: ${data.error || 'Lỗi không xác định.'}`, 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('[Jet Preview] Failed to set pick color:', error);
            showFeedback(`Không thể cập nhật màu pick: ${error.message}`, 'error');
        }
    }

    // --- Global Keydown Handler for Jet App ---
    // This will handle grid navigation and color picking when preview is NOT open.
    // Preview mode has its own handler (handlePreviewKeyPress)
    function handleGlobalJetKeyPress(event) {
        // console.log('[Jet Global KeyPress]', event.key, event.code, 'Target:', event.target);

        // Prevent actions if typing in an input, textarea, etc.
        if (event.target.matches('input, textarea, select, [contenteditable="true"]')) {
            return;
        }

        if (isPreviewOpen) {
            if (event.key === 'Escape') {
                closeImagePreview();
                event.preventDefault(); // RESTORED
            } else if (event.code === 'Space') { 
                closeImagePreview();
                event.preventDefault(); // RESTORED
            }
            return; 
        }

        // Grid Navigation & Interaction (Preview is NOT open)
        if (currentGridSelection.element) {
            let newIndex = currentGridSelection.index;
            let handled = false;

            switch (event.key) {
                case 'ArrowLeft':
                    if (newIndex > 0) {
                        newIndex--;
                        handled = true;
                    }
                    break;
                case 'ArrowRight':
                    if (newIndex < currentGridImages.length - 1) {
                        newIndex++;
                        handled = true;
                    }
                    break;
                case 'ArrowUp':
                    const gridContainer = document.getElementById('jet-item-list-container');
                    if (gridContainer && currentGridImages.length > 0) {
                        const firstItem = gridContainer.querySelector('.jet-image-item-container');
                        if (firstItem) {
                            const containerWidth = gridContainer.offsetWidth;
                            const itemWidth = firstItem.offsetWidth + parseFloat(getComputedStyle(firstItem).marginLeft) + parseFloat(getComputedStyle(firstItem).marginRight);
                            const itemsPerRow = Math.max(1, Math.floor(containerWidth / itemWidth));
                            if (newIndex - itemsPerRow >= 0) {
                                newIndex -= itemsPerRow;
                                handled = true;
                            } else { 
                                newIndex = 0;
                                handled = true;
                            }
                        }
                    }
                    break;
                case 'ArrowDown':
                    const gridContainerDown = document.getElementById('jet-item-list-container');
                    if (gridContainerDown && currentGridImages.length > 0) {
                        const firstItemDown = gridContainerDown.querySelector('.jet-image-item-container');
                        if (firstItemDown) {
                            const containerWidthDown = gridContainerDown.offsetWidth;
                            const itemWidthDown = firstItemDown.offsetWidth + parseFloat(getComputedStyle(firstItemDown).marginLeft) + parseFloat(getComputedStyle(firstItemDown).marginRight);
                            const itemsPerRowDown = Math.max(1, Math.floor(containerWidthDown / itemWidthDown));
                            if (newIndex + itemsPerRowDown < currentGridImages.length) {
                                newIndex += itemsPerRowDown;
                                handled = true;
                            } else { 
                                newIndex = currentGridImages.length - 1;
                                handled = true;
                            }
                        }
                    }
                    break;
                case '0': 
                    if (currentGridSelection.imageObject) { 
                        let targetGrey = PICK_COLORS.GREY;
                        if (currentGridSelection.imageObject.pick_color === targetGrey) {
                            targetGrey = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetGrey, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '1': 
                    if (currentGridSelection.imageObject) {
                        let targetRed = PICK_COLORS.RED;
                        if (currentGridSelection.imageObject.pick_color === targetRed) {
                            targetRed = PICK_COLORS.NONE; 
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetRed, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '2': 
                    if (currentGridSelection.imageObject) {
                        let targetGreen = PICK_COLORS.GREEN;
                        if (currentGridSelection.imageObject.pick_color === targetGreen) {
                            targetGreen = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetGreen, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '3': 
                    if (currentGridSelection.imageObject) {
                        let targetBlue = PICK_COLORS.BLUE;
                        if (currentGridSelection.imageObject.pick_color === targetBlue) {
                            targetBlue = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetBlue, currentGridSelection.element);
                        handled = true;
                    }
                    break;
            }

            if (handled) {
                event.preventDefault(); // RESTORED
                const allRenderedItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
                if (newIndex !== currentGridSelection.index && allRenderedItems[newIndex]) {
                    selectImageInGrid(currentGridImages[newIndex], allRenderedItems[newIndex], newIndex);
                    allRenderedItems[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
        
        if (event.code === 'Space' && !isPreviewOpen && currentGridSelection.imageObject) {
            openImagePreview(currentGridSelection.imageObject, currentGridSelection.index);
            event.preventDefault(); // RESTORED
        }
    }
    
    // NEW: API call specifically for grid item color setting
    async function setGridItemPickColorAPI(imageObject, targetColor, itemContainerElement) {
        if (!imageObject) {
            console.error("[Jet Grid Pick] No image object provided for picking.");
            return;
        }
        showLoading('Đang cập nhật màu...');
        try {
            const formData = new FormData();
            formData.append('source_key', imageObject.source_key);
            formData.append('image_relative_path', imageObject.path);
            formData.append('pick_color', targetColor === PICK_COLORS.NONE ? 'none' : targetColor); // API expects 'none' for NULL

            const response = await fetch('api.php?action=jet_set_pick_color', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            hideLoading();

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || `Lỗi HTTP: ${response.status}`;
                showFeedback(`Lỗi cập nhật màu: ${errorMessage}`, 'error');
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.success) {
                showFeedback(data.message || 'Màu đã được cập nhật.', 'success');
                
                // Update local data object (currentGridImages)
                const originalImageInGrid = currentGridImages.find(img => img.path === imageObject.path && img.source_key === imageObject.source_key);
                if (originalImageInGrid) {
                    originalImageInGrid.pick_color = data.pick_color;
                }
                // Update currentGridSelection's imageObject if it's the one modified
                 if (currentGridSelection.imageObject && currentGridSelection.imageObject.path === imageObject.path && currentGridSelection.imageObject.source_key === imageObject.source_key) {
                    currentGridSelection.imageObject.pick_color = data.pick_color;
                }

                // Update UI for the specific grid item
                if (itemContainerElement) {
                    itemContainerElement.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey');
                    if (data.pick_color) {
                        itemContainerElement.classList.add(`picked-${data.pick_color}`);
                    }
                }
                 // If preview is open AND showing this image, update preview pick button too
                if (isPreviewOpen && currentPreviewImageObject && currentPreviewImageObject.path === imageObject.path && currentPreviewImageObject.source_key === imageObject.source_key) {
                    currentPreviewImageObject.pick_color = data.pick_color; // Update preview's copy
                    const pickButton = document.getElementById('jet-preview-pick-button');
                    const colorIndicator = document.getElementById('jet-preview-pick-color-indicator');
                    if (pickButton && colorIndicator) {
                        pickButton.className = 'jet-preview-pick-button-base'; // Reset classes
                        if (data.pick_color) {
                            pickButton.classList.add(`picked-${data.pick_color}`);
                            colorIndicator.textContent = data.pick_color.toUpperCase();
                            colorIndicator.style.backgroundColor = data.pick_color;
                             if (data.pick_color === 'grey' || data.pick_color === 'blue') colorIndicator.style.color = 'white'; else colorIndicator.style.color = 'black';
                        } else {
                            colorIndicator.textContent = 'NONE';
                            colorIndicator.style.backgroundColor = 'transparent';
                            colorIndicator.style.color = '#ccc';
                        }
                    }
                }

                // NEW: Update the corresponding thumbnail in the filmstrip
                const filmstripContainer = document.getElementById('jet-thumbnail-filmstrip');
                if (filmstripContainer && currentPreviewIndex !== -1) {
                     const currentThumbContainer = filmstripContainer.querySelector(`.jet-filmstrip-thumb-container[data-index="${currentPreviewIndex}"]`);
                     if (currentThumbContainer) {
                        currentThumbContainer.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey'); // Clear all color classes
                         if (data.pick_color) {
                             currentThumbContainer.classList.add(`picked-${data.pick_color}`);
                         }
                     }
                }

            } else {
                showFeedback(`Lỗi cập nhật màu: ${data.error || 'Lỗi không xác định từ máy chủ.'}`, 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('[Jet] Failed to set pick color for grid item:', error);
            showFeedback(`Không thể cập nhật màu: ${error.message}`, 'error');
        }
    }

    // Add event listener for global key presses when app is active
    document.addEventListener('keydown', handleGlobalJetKeyPress);

    // Helper for natural sort (already used in API, but good for client-side too if needed elsewhere, or ensure API always provides natural sort for default)
    // For client-side sort consistency with PHP's strnatcasecmp, a JS equivalent might be needed if complex scenarios arise.
    // A simple localeCompare with numeric option can often suffice for basic alphanumeric sort.
    function strnatcasecmp(a, b) {
        return String(a).localeCompare(String(b), undefined, {numeric: true, sensitivity: 'base'});
    }

    // Realtime polling functions
    function startRealtimePolling() {
        stopRealtimePolling(); // Clear any existing interval
        if (currentRawSourceKey && currentRelativePath !== null) {
            pollingInterval = setInterval(async () => {
                await updatePicksRealtime();
            }, POLLING_INTERVAL);
        }
    }

    function stopRealtimePolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    async function updatePicksRealtime() {
        if (!currentRawSourceKey || currentRelativePath === null) return;
        
        try {
            // Quietly fetch updated image data
            const updatedImages = await listImagesAPI(currentRawSourceKey, currentRelativePath);
            
            // Check if there are any pick changes
            let hasChanges = false;
            const currentImageLookup = {};
            currentGridImages.forEach(img => {
                const key = `${img.source_key}/${img.path}`;
                currentImageLookup[key] = img;
            });
            
            updatedImages.forEach(updatedImg => {
                const key = `${updatedImg.source_key}/${updatedImg.path}`;
                const currentImg = currentImageLookup[key];
                
                if (currentImg) {
                    // Check for pick_color changes
                    if (currentImg.pick_color !== updatedImg.pick_color) {
                        hasChanges = true;
                        currentImg.pick_color = updatedImg.pick_color;
                    }
                    
                    // Check for all_picks changes
                    const currentPicksStr = JSON.stringify(currentImg.all_picks || []);
                    const updatedPicksStr = JSON.stringify(updatedImg.all_picks || []);
                    if (currentPicksStr !== updatedPicksStr) {
                        hasChanges = true;
                        currentImg.all_picks = updatedImg.all_picks;
                    }
                }
            });
            
            if (hasChanges) {
                // Update currentGridImages and re-render
                currentGridImages = updatedImages;
                applySortAndFilterAndRender();
                
                // If preview is open, update preview too
                if (isPreviewOpen && currentPreviewImageObject) {
                    const updatedPreviewImg = updatedImages.find(img => 
                        img.path === currentPreviewImageObject.path && 
                        img.source_key === currentPreviewImageObject.source_key
                    );
                    if (updatedPreviewImg) {
                        currentPreviewImageObject = updatedPreviewImg;
                        updatePreviewImage(currentPreviewImageObject);
                        renderThumbnailFilmstrip(currentGridImages, currentPreviewIndex);
                    }
                }
                
                console.log('[Jet Realtime] Pick changes detected and updated');
            }
        } catch (error) {
            console.error('[Jet Realtime] Error updating picks:', error);
            // Don't show user feedback for polling errors to avoid spam
        }
    }

    // Initialize app
    initializeAppLayout();
    fetchUserInfo();

    // Function to fetch user info
    async function fetchUserInfo() {
        try {
            const response = await fetch('api.php?action=jet_get_user_info');
            const data = await response.json();
            
            console.log('User info response:', data); // Debug log
            
            if (data.success) {
                currentUser = data.user;
                updateUserInfoDisplay();
            } else {
                console.error('Failed to get user info:', data.error);
                showFeedback('Lỗi khi lấy thông tin người dùng: ' + (data.error || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Failed to fetch user info:', error);
            showFeedback('Lỗi khi lấy thông tin người dùng', 'error');
        }
    }

    // Function to update user info display
    function updateUserInfoDisplay() {
        const userInfoElement = document.getElementById('jet-user-info');
        if (userInfoElement && currentUser) {
            const roleText = currentUser.role === 'admin' ? 'Admin' : 'Designer';
            userInfoElement.textContent = `${roleText}: ${currentUser.username}`;
            
            // Add visual indicator for admin
            if (currentUser.role === 'admin') {
                userInfoElement.style.fontWeight = 'bold';
                userInfoElement.style.color = '#dc3545';
                userInfoElement.title = 'Admin có thể thấy picks của tất cả designers';
            }
        }
    }

    // Update pick status
    async function updatePickStatus(sourceKey, imagePath, pickColor) {
        try {
            const formData = new FormData();
            formData.append('source_key', sourceKey);
            formData.append('image_path', imagePath);
            formData.append('pick_color', pickColor);

            const response = await fetch('api.php?action=jet_update_pick_status', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');
            }

            // Update local state
            const imageIndex = currentGridImages.findIndex(img => 
                img.source_key === sourceKey && img.path === imagePath
            );
            if (imageIndex !== -1) {
                currentGridImages[imageIndex].pick_color = pickColor;
            }

            // Update UI
            const imageElement = document.querySelector(`[data-source-key="${sourceKey}"][data-image-path="${imagePath}"]`);
            if (imageElement) {
                imageElement.classList.remove('picked-red', 'picked-green', 'picked-blue', 'picked-grey');
                if (pickColor) {
                    imageElement.classList.add(`picked-${pickColor}`);
                }
            }

            showFeedback('Đã cập nhật trạng thái', 'success');
        } catch (error) {
            console.error('Failed to update pick status:', error);
            showFeedback(error.message, 'error');
        }
    }
});

// TODO:
// - Spacebar to open/close preview for the currentGridSelection.
// - Ensure focus management is robust for keyboard navigation.
// - Refine UI for selected grid item (e.g. border style).
// - Review toggleImagePickAPI and setPickColorViaAPI for redundancy or merge. (setPickColorViaAPI is for preview, setGridItemPickColorAPI is for grid).
// - CSS for .grid-item-selected

// Initialize the app 