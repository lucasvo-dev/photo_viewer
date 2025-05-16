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

    // Variables for manual double-click detection
    let lastClickTime = 0;
    let lastClickedItemPath = null;
    const DOUBLE_CLICK_THRESHOLD = 400; // Milliseconds

    // State for Preview Mode
    let isPreviewOpen = false;
    let currentPreviewImageObject = null; // Will store the image object with its pick_color
    let currentPreviewIndex = -1;

    // NEW: State for Grid Selection
    let currentGridSelection = {
        source_key: null,
        image_path: null,
        element: null,
        index: -1,
        imageObject: null // Store the full image object
    };

    const PICK_COLORS = {
        NONE: null, // Or a specific string like 'none' if preferred for API communication then mapped to NULL server-side
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
            <div id="jet-breadcrumb"></div>
            <div id="jet-controls"></div>
            <div id="jet-item-list-container">
                <!-- Content will be loaded here -->
            </div>
            <div id="jet-preview-area"></div>
        `;
        // currentRawSourceKey and currentRelativePath are null/empty initially
        renderBreadcrumb(); 
        fetchAndRenderTopLevelFolders(); // New initial fetch function
    }

    async function fetchAndRenderTopLevelFolders() {
        showLoading('Đang tải danh sách thư mục RAW gốc...');
        currentRawSourceKey = null; // Reset context
        currentRelativePath = '';
        const itemListContainer = document.getElementById('jet-item-list-container');
        if(itemListContainer) itemListContainer.innerHTML = ''; // Clear previous items
        renderBreadcrumb(); // Render breadcrumb for the top level

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

    async function fetchAndRenderImages(sourceKey, folderPath) {
        showLoading(`Đang tải hình ảnh từ ${sourceKey}/${folderPath}...`);
        currentRawSourceKey = sourceKey;
        currentRelativePath = folderPath;
        const itemListContainer = document.getElementById('jet-item-list-container');
        if(itemListContainer) itemListContainer.innerHTML = ''; // Clear previous items (folders or images)
        renderBreadcrumb();

        try {
            const apiUrl = `api.php?action=jet_list_images&source_key=${encodeURIComponent(sourceKey)}&path=${encodeURIComponent(folderPath)}`;
            const response = await fetch(apiUrl);
            hideLoading();
            if (!response.ok) throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
            const data = await response.json();

            if (data.error) {
                showFeedback(`Lỗi tải hình ảnh: ${data.error}${data.details ? ' (' + data.details + ')' : ''}`, 'error');
                if(itemListContainer) itemListContainer.innerHTML = `<p>Không thể tải hình ảnh: ${data.error}</p>`;
                return;
            }
            
            if (data.success && data.images) {
                renderImageGrid(data.images);
                if (data.images.length === 0) {
                    showFeedback(`Không tìm thấy hình ảnh nào trong thư mục ${folderPath}.`, 'info');
                }
            } else {
                throw new Error('Định dạng phản hồi không hợp lệ từ máy chủ khi tải hình ảnh.');
            }

        } catch (error) {
            hideLoading();
            console.error('[Jet] Failed to fetch images:', error);
            showFeedback(`Không thể tải hình ảnh: ${error.message}`, 'error');
            if(itemListContainer) itemListContainer.innerHTML = `<p>Lỗi khi tải hình ảnh. ${error.message}</p>`;
        }
    }

    function renderImageGrid(images) {
        currentGridImages = images; // Store the images array when rendering the grid
        const itemListContainer = document.getElementById('jet-item-list-container');
        if (!itemListContainer) return;
        itemListContainer.innerHTML = ''; // Clear previous items
        itemListContainer.classList.add('image-grid-container'); // Add class for grid styling
        currentGridSelection = { source_key: null, image_path: null, element: null, index: -1, imageObject: null }; // Reset grid selection

        if (images.length === 0) {
            itemListContainer.innerHTML = '<p class="empty-message">Không có hình ảnh nào để hiển thị trong thư mục này.</p>';
            return;
        }

        images.forEach((image, index) => {
            const imageItemContainer = document.createElement('div');
            imageItemContainer.classList.add('jet-image-item-container'); // For styling the grid item
            imageItemContainer.dataset.imagePath = image.path; // Store path for easy access
            imageItemContainer.dataset.sourceKey = image.source_key;
            imageItemContainer.dataset.index = index;

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
            
            // MODIFIED: Click listener now selects the image in the grid, and handles manual double-click
            imageItemContainer.addEventListener('click', () => {
                const currentTime = new Date().getTime();

                if (currentTime - lastClickTime < DOUBLE_CLICK_THRESHOLD && lastClickedItemPath === image.path) {
                    // Double click detected
                    openImagePreview(image, index);
                    // Reset last click info to prevent triple click issues
                    lastClickTime = 0;
                    lastClickedItemPath = null;
                } else {
                    // Single click
                    selectImageInGrid(image, imageItemContainer, index);
                    // Store info for next click detection
                    lastClickTime = currentTime;
                    lastClickedItemPath = image.path;
                }
            });

            itemListContainer.appendChild(imageItemContainer);
        });

        // REMOVE Event delegation for double-click on the container
        if (itemListContainer.handleDoubleClickEvent) { 
            itemListContainer.removeEventListener('dblclick', itemListContainer.handleDoubleClickEvent);
            delete itemListContainer.handleDoubleClickEvent; // Clean up the custom property
        }

        // Automatically select the first image if available after rendering
        if (images.length > 0) {
            const firstImageElement = itemListContainer.querySelector('.jet-image-item-container');
            if (firstImageElement) {
                selectImageInGrid(images[0], firstImageElement, 0);
            }
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
                                                        // So, we should simplify. The item.path from API `jet_list_raw_sources` is `source_key/folder_name`.
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
        previewArea.innerHTML = ''; // Clear previous preview
        renderPreviewOverlay(currentPreviewImageObject); 

        // Add event listeners for preview navigation (keyboard)
        document.addEventListener('keydown', handlePreviewKeyPress);
    }

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
    }

    function renderPreviewOverlay(imageObject) {
        // Remove existing overlay if any (shouldn't be necessary if state is managed)
        const existingOverlay = document.getElementById('jet-image-preview-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'jet-image-preview-overlay';
        overlay.classList.add('jet-preview-overlay-container'); // For styling

        // Image element
        const imgPreview = document.createElement('img');
        imgPreview.id = 'jet-preview-main-image';
        imgPreview.src = `api.php?action=jet_get_raw_preview&source_key=${encodeURIComponent(imageObject.source_key)}&image_path=${encodeURIComponent(imageObject.path)}`;
        imgPreview.alt = `Preview of ${imageObject.name}`;
        imgPreview.onerror = () => {
            imgPreview.alt = 'Lỗi tải ảnh xem trước.';
            // Could add more detailed error display within the preview
            // For safety, try to close preview if image fails to load, or show placeholder
            const errorPlaceholder = document.createElement('div');
            errorPlaceholder.className = 'preview-load-error-message';
            errorPlaceholder.textContent = 'Không thể tải ảnh xem trước. Nhấn Esc để đóng.';
            imgPreview.replaceWith(errorPlaceholder);

        };

        // Close button
        const closeButton = document.createElement('button');
        closeButton.id = 'jet-preview-close-button';
        closeButton.textContent = 'Đóng (Esc)'; // Close (Esc)
        closeButton.addEventListener('click', closeImagePreview);

        // Navigation buttons (placeholders for now)
        const prevButton = document.createElement('button');
        prevButton.id = 'jet-preview-prev-button';
        prevButton.textContent = 'Trước (←)'; // Previous
        prevButton.addEventListener('click', navigatePreviewPrev);

        const nextButton = document.createElement('button');
        nextButton.id = 'jet-preview-next-button';
        nextButton.textContent = 'Sau (→)'; // Next
        nextButton.addEventListener('click', navigatePreviewNext);

        // Pick button (placeholder for now)
        const pickButton = document.createElement('button');
        pickButton.id = 'jet-preview-pick-button';
        // Update pick button based on pick_color
        pickButton.className = 'jet-preview-pick-button-base'; // Base class
        pickButton.textContent = 'Màu: '; // Base text
        const colorIndicator = document.createElement('span');
        colorIndicator.id = 'jet-preview-pick-color-indicator';
        if (imageObject.pick_color) {
            pickButton.classList.add(`picked-${imageObject.pick_color}`);
            colorIndicator.textContent = imageObject.pick_color.toUpperCase();
            colorIndicator.style.backgroundColor = imageObject.pick_color; // Simple visual cue
             if (imageObject.pick_color === 'grey' || imageObject.pick_color === 'blue') colorIndicator.style.color = 'white'; else colorIndicator.style.color = 'black';
        } else {
            colorIndicator.textContent = 'NONE';
            colorIndicator.style.backgroundColor = 'transparent';
            colorIndicator.style.color = '#ccc';
        }
        pickButton.appendChild(colorIndicator);
        // pickButton.addEventListener('click', togglePickFromPreview); // This will be replaced by hotkey logic primarily
        
        // Info/Metadata area (placeholder)
        const imageNameDisplay = document.createElement('div');
        imageNameDisplay.id = 'jet-preview-image-name';
        imageNameDisplay.textContent = imageObject.name;

        // Assemble the preview
        const controlsTop = document.createElement('div');
        controlsTop.className = 'jet-preview-controls-top';
        controlsTop.appendChild(imageNameDisplay);
        controlsTop.appendChild(pickButton); // Temporary placement
        controlsTop.appendChild(closeButton);


        const imageContainer = document.createElement('div');
        imageContainer.className = 'jet-preview-image-container';
        imageContainer.appendChild(imgPreview);

        const controlsNav = document.createElement('div');
        controlsNav.className = 'jet-preview-controls-nav';
        controlsNav.appendChild(prevButton);
        controlsNav.appendChild(nextButton);
        
        overlay.appendChild(controlsTop);
        overlay.appendChild(imageContainer);
        overlay.appendChild(controlsNav);

        document.body.appendChild(overlay);
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

    function navigatePreviewNext() {
        if (!isPreviewOpen || currentGridImages.length === 0) return;
        
        let nextIndex = currentPreviewIndex + 1;
        if (nextIndex >= currentGridImages.length) {
            nextIndex = 0; // Loop to the beginning
        }
        currentPreviewIndex = nextIndex;
        currentPreviewImageObject = currentGridImages[currentPreviewIndex];
        renderPreviewOverlay(currentPreviewImageObject); // Re-render with new image

        // Update grid selection to match preview
        const gridItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
        if (gridItems[currentPreviewIndex]) {
            selectImageInGrid(currentPreviewImageObject, gridItems[currentPreviewIndex], currentPreviewIndex);
        }
    }

    function navigatePreviewPrev() {
        if (!isPreviewOpen || currentGridImages.length === 0) return;

        let prevIndex = currentPreviewIndex - 1;
        if (prevIndex < 0) {
            prevIndex = currentGridImages.length - 1; // Loop to the end
        }
        currentPreviewImageObject = currentGridImages[prevIndex];
        currentPreviewIndex = prevIndex; // Update index after setting object
        renderPreviewOverlay(currentPreviewImageObject);

        // Update grid selection to match preview
        const gridItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
        if (gridItems[currentPreviewIndex]) {
            selectImageInGrid(currentPreviewImageObject, gridItems[currentPreviewIndex], currentPreviewIndex);
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
                        if(colorIndicatorSpan) {
                             colorIndicatorSpan.textContent = imageToUpdate.pick_color.toUpperCase();
                             colorIndicatorSpan.style.backgroundColor = imageToUpdate.pick_color;
                             if (imageToUpdate.pick_color === PICK_COLORS.GREY || imageToUpdate.pick_color === PICK_COLORS.BLUE) colorIndicatorSpan.style.color = 'white'; else colorIndicatorSpan.style.color = 'black';
                        }
                    } else { // No color picked (null)
                         if(colorIndicatorSpan) {
                            colorIndicatorSpan.textContent = 'NONE';
                            colorIndicatorSpan.style.backgroundColor = 'transparent';
                            colorIndicatorSpan.style.color = '#ccc';
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

        // If preview is open, let preview key handler take precedence for most keys
        // EXCEPT for Escape (which preview also handles but good to have here too)
        // and Space (which we want to use for closing preview from global context)
        if (isPreviewOpen) {
            if (event.key === 'Escape') {
                closeImagePreview();
                event.preventDefault(); // Prevent other potential global actions
            } else if (event.code === 'Space') { // NEW: Space to close preview
                closeImagePreview();
                event.preventDefault();
            }
            // Most other keys are handled by handlePreviewKeyPress if preview is open
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
                    // Approximate moving up: subtract number of columns.
                    // This requires knowing the grid layout or an approximation.
                    // For simplicity, let's try to find number of items per row.
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
                            } else { // Go to first item if trying to go above top row
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
                            } else { // Go to last item if trying to go below last row
                                newIndex = currentGridImages.length - 1;
                                handled = true;
                            }
                        }
                    }
                    break;
                // Color pick keys (0-3) when an item is selected in the grid
                case '0': // Grey
                    if (currentGridSelection.imageObject) { // Check if imageObject exists
                        let targetGrey = PICK_COLORS.GREY;
                        if (currentGridSelection.imageObject.pick_color === targetGrey) {
                            targetGrey = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetGrey, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '1': // Red
                    if (currentGridSelection.imageObject) {
                        let targetRed = PICK_COLORS.RED;
                        if (currentGridSelection.imageObject.pick_color === targetRed) {
                            targetRed = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetRed, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '2': // Green
                    if (currentGridSelection.imageObject) {
                        let targetGreen = PICK_COLORS.GREEN;
                        if (currentGridSelection.imageObject.pick_color === targetGreen) {
                            targetGreen = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetGreen, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                case '3': // Blue
                    if (currentGridSelection.imageObject) {
                        let targetBlue = PICK_COLORS.BLUE;
                        if (currentGridSelection.imageObject.pick_color === targetBlue) {
                            targetBlue = PICK_COLORS.NONE;
                        }
                        setGridItemPickColorAPI(currentGridSelection.imageObject, targetBlue, currentGridSelection.element);
                        handled = true;
                    }
                    break;
                 // Add other grid-specific hotkeys here if needed
            }

            if (handled) {
                event.preventDefault(); // Prevent browser scrolling with arrow keys
                const allRenderedItems = document.querySelectorAll('#jet-item-list-container .jet-image-item-container');
                if (newIndex !== currentGridSelection.index && allRenderedItems[newIndex]) {
                    selectImageInGrid(currentGridImages[newIndex], allRenderedItems[newIndex], newIndex);
                     // Scroll the new item into view if necessary
                    allRenderedItems[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
        
        // NEW: Space to open preview if an item is selected in grid and preview is not open
        if (event.code === 'Space' && !isPreviewOpen && currentGridSelection.imageObject) {
            openImagePreview(currentGridSelection.imageObject, currentGridSelection.index);
            event.preventDefault();
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

    initializeAppLayout();
});

// TODO:
// - Spacebar to open/close preview for the currentGridSelection.
// - Ensure focus management is robust for keyboard navigation.
// - Refine UI for selected grid item (e.g. border style).
// - Review toggleImagePickAPI and setPickColorViaAPI for redundancy or merge. (setPickColorViaAPI is for preview, setGridItemPickColorAPI is for grid).
// - CSS for .grid-item-selected

// Initialize the app 