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

        if (images.length === 0) {
            itemListContainer.innerHTML = '<p class="empty-message">Không có hình ảnh nào để hiển thị trong thư mục này.</p>';
            return;
        }

        images.forEach(image => {
            const imageItemContainer = document.createElement('div');
            imageItemContainer.classList.add('jet-image-item-container'); // For styling the grid item

            const imgElement = document.createElement('img');
            imgElement.classList.add('jet-preview-image');
            // Construct the path for the preview. image.path is relative to the source_key root folder.
            imgElement.src = `api.php?action=jet_get_raw_preview&source_key=${encodeURIComponent(image.source_key)}&image_path=${encodeURIComponent(image.path)}`;
            imgElement.alt = image.name;
            imgElement.title = image.name;

            // Add class if image is already picked
            if (image.is_picked) { // Set initial state from server data
                imageItemContainer.classList.add('picked');
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
            
            // Add click listener for picking/unpicking
            imageItemContainer.addEventListener('click', () => {
                const newPickState = !image.is_picked; // Determine new state based on current actual data state
                // No optimistic UI update here. API call will handle UI and data update on success.
                toggleImagePickAPI(image, newPickState, imageItemContainer);
            });

            itemListContainer.appendChild(imageItemContainer);
        });
    }

    async function toggleImagePickAPI(imageObject, newPickState, itemContainerElement) {
        showLoading('Đang cập nhật trạng thái...');
        try {
            const formData = new FormData();
            formData.append('source_key', imageObject.source_key);
            formData.append('image_relative_path', imageObject.path);
            formData.append('is_picked', newPickState ? '1' : '0');

            const response = await fetch('api.php?action=jet_set_pick_status', {
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
                // Update local data object and UI based on server's confirmed state
                imageObject.is_picked = data.is_picked; 
                itemContainerElement.classList.toggle('picked', imageObject.is_picked);
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

    initializeAppLayout();
}); 