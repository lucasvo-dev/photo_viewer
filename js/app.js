console.log('[app.js] Script start'); // VERY FIRST LINE

// js/app.js

// Import PhotoSwipe using correct unpkg URLs for ES Modules
import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';

// Import config
import { IMAGES_PER_PAGE, ACTIVE_ZIP_JOB_KEY, API_BASE_URL } from './config.js';

// Import state variables and setters
import {
    currentFolder, setCurrentFolder,
    currentImageList, setCurrentImageList,
    allTopLevelDirs, setAllTopLevelDirs,
    searchAbortController, setSearchAbortController,
    photoswipeLightbox, setPhotoswipeLightbox,
    isLoadingMore, setIsLoadingMore,
    currentPage, setCurrentPage,
    totalImages, setTotalImages,
    zipProgressBarContainerEl, setZipProgressBarContainerEl,
    zipFolderNameEl, setZipFolderNameEl,
    zipOverallProgressEl, setZipOverallProgressEl,
    zipProgressStatsTextEl, setZipProgressStatsTextEl,
    generalModalOverlay, setGeneralModalOverlay,
    zipJobsPanelContainerEl, zipJobsListEl, setZipJobPanelDOMElements,
    preloadedImages, setPreloadedImages,
    isCurrentlyPreloading, setIsCurrentlyPreloading,
    pageCurrentlyFetching, setPageCurrentlyFetching,
    paginationAbortController, setPaginationAbortController,
    preloadAbortController, setPreloadAbortController,
    activePageRequests, addActivePageRequest, removeActivePageRequest, 
    isPageRequestActive, clearAllActivePageRequests
} from './state.js';

// Import utils
import { debounce, globalRequestManager, globalScrollTracker, globalPerformanceMonitor } from './utils.js';

// Import API service
import { fetchDataApi } from './apiService.js';

// Import UI Modules
import { 
    initModalSystem,
    showModalWithMessage, 
    hideModalWithMessage, 
    showPasswordPrompt, 
    hidePasswordPrompt 
} from './uiModal.js';
import {
    initializeDirectoryView,
    showDirectoryViewOnly,
    loadTopLevelDirectories,
    createDirectoryListItem
} from './uiDirectoryView.js';
import {
    initializeImageView,
    showImageViewOnly as showImageViewUI,
    hideImageViewOnly as hideImageViewUI,
    updateImageViewHeader,
    clearImageGrid,
    renderImageItems as renderImageItemsToGrid,
    createImageGroupIfNeeded,
    toggleInfiniteScrollSpinner
} from './uiImageView.js';
import {
    initializePhotoSwipeHandler,
    setupPhotoSwipeIfNeeded,
    openPhotoSwipeAtIndex
} from './photoswipeHandler.js';
import {
    initializeZipManager,
    handleDownloadZipAction as appHandleDownloadZipAction,
    startPanelPolling,
    addOrUpdateZipJob
} from './zipManager.js';
import { initializeSelectionMode, isSelectionModeActive as isSelectionModeActiveGlobal } from './selectionManager.js';

// ========================================
// === STATE VARIABLES                 ===
// ========================================
// All state variables moved to js/state.js
let isProcessingNavigation = false; // New flag for preventing concurrent folder loads

// ========================================
// === GLOBAL HELPER FUNCTIONS        ===
// ========================================

export function getCurrentFolderInfo() {
    const path = currentFolder; // READ from state
    const nameElement = document.getElementById('current-directory-name');
    const name = nameElement ? nameElement.textContent.replace('Album: ', '').trim() : (path ? path.split('/').pop() : 'Thư mục không xác định');
    return { path, name };
}

function showLoadingIndicator(message = 'Đang tải...') {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.querySelector('p').textContent = message;
        indicator.style.display = 'block';
    }
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// --- Global Overlay Functions --- START
function showGlobalLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'block'; // Or 'flex' if it's styled with flex
    }
}

function hideGlobalLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
// --- Global Overlay Functions --- END

// ========================================
// === FUNCTION DECLARATIONS             ===
// ========================================

// --- MODAL HANDLING --- (MOVED to uiModal.js)
/*
function showModalWithMessage(title, htmlContent, isError = false, isInfoOnly = false, showCancelButton = false, cancelCallback = null, okButtonText = 'Đóng') { ... }
function hideModalWithMessage() { ... }
const escapeGeneralModalListener = (e) => { ... };
*/

// --- ZIP Job Management --- (MOVED to zipManager.js)
/*
function setActiveZipJob(jobToken, sourcePath, folderDisplayName) {
    setCurrentZipJobToken(jobToken); // WRITE to state
    try {
        sessionStorage.setItem(ACTIVE_ZIP_JOB_KEY, JSON.stringify({ jobToken, sourcePath, folderDisplayName }));
    } catch (e) {
        console.warn("Could not save active ZIP job to sessionStorage", e);
    }
}

function getActiveZipJob() {
    try {
        const jobData = sessionStorage.getItem(ACTIVE_ZIP_JOB_KEY);
        return jobData ? JSON.parse(jobData) : null;
    } catch (e) {
        console.warn("Could not retrieve active ZIP job from sessionStorage", e);
        return null;
    }
}

function clearActiveZipJob() {
    setCurrentZipJobToken(null); // WRITE to state
    try {
        sessionStorage.removeItem(ACTIVE_ZIP_JOB_KEY);
    } catch (e) {
        console.warn("Could not clear active ZIP job from sessionStorage", e);
    }
    if (zipPollingIntervalId) { // READ from state
        clearInterval(zipPollingIntervalId);
        setZipPollingIntervalId(null); // WRITE to state
    }
}
*/

// --- ZIP Progress Bar UI Functions --- (MOVED to zipManager.js)
/*
function displayZipProgressBar(folderDisplayName, statusText = 'Đang khởi tạo...') {
    if (!zipProgressBarContainerEl) return; // READ from state
    if (zipFolderNameEl) zipFolderNameEl.textContent = folderDisplayName || ''; // READ from state
    if (zipProgressStatsTextEl) zipProgressStatsTextEl.textContent = statusText; // READ from state
    if (zipOverallProgressEl) zipOverallProgressEl.value = 0; // READ from state
    zipProgressBarContainerEl.style.display = 'flex'; 
}

function updateZipProgressBar(jobData, folderDisplayNameFromJob) {
    if (!zipProgressBarContainerEl || !jobData) return; // READ from state

    const activeJob = getActiveZipJob(); // This would have been an issue too
    const folderName = folderDisplayNameFromJob || activeJob?.folderDisplayName || jobData.source_path?.split('/').pop() || 'Thư mục';
    
    if (zipFolderNameEl) zipFolderNameEl.textContent = folderName; // READ from state

    let percent = 0;
    let statsText = 'Đang chờ...';

    if (jobData.status === 'processing') {
        if (jobData.total_files > 0) {
            percent = (jobData.processed_files / jobData.total_files) * 100;
        }
        statsText = `${jobData.processed_files}/${jobData.total_files} files (${percent.toFixed(0)}%)`;
    } else if (jobData.status === 'pending') {
        statsText = 'Đang chờ trong hàng đợi...';
    } else if (jobData.status === 'completed') {
        percent = 100;
        statsText = 'Hoàn thành!';
    } else if (jobData.status === 'failed') {
        percent = zipOverallProgressEl ? zipOverallProgressEl.value : 0; // READ from state
        statsText = 'Thất bại!';
        if (zipFolderNameEl) zipFolderNameEl.textContent = `Lỗi: ${folderName}`; // READ from state
    }

    if (zipOverallProgressEl) zipOverallProgressEl.value = percent; // READ from state
    if (zipProgressStatsTextEl) zipProgressStatsTextEl.textContent = statsText; // READ from state

    if (zipProgressBarContainerEl.style.display !== 'flex') {
        zipProgressBarContainerEl.style.display = 'flex';
    }
}

function hideZipProgressBar() {
    if (zipProgressBarContainerEl) { // READ from state
        zipProgressBarContainerEl.style.display = 'none'; 
    }
}
*/

// --- Helper fetchData: (MOVED to apiService.js as fetchDataApi) ---
/*
async function fetchData(url, options = {}) { 
    // ... old code ...
}
*/

// --- Hiển thị/ẩn views chính ---
function showDirectoryView() {
    console.log('[app.js] showDirectoryView called.');
    
    // Reset navigation flag
    isProcessingNavigation = false;
    
    // Reset state when going to directory view
    setCurrentFolder('');
    setCurrentImageList([]);
    setCurrentPage(1);
    setTotalImages(0);
    setPreloadedImages([]);
    setIsLoadingMore(false);
    setIsCurrentlyPreloading(false);
    
    // Abort any ongoing requests
    if (paginationAbortController) {
        paginationAbortController.abort();
        setPaginationAbortController(null);
    }
    if (preloadAbortController) {
        preloadAbortController.abort();
        setPreloadAbortController(null);
    }
    if (searchAbortController) {
        searchAbortController.abort();
        setSearchAbortController(null);
    }
    
    // Clear all active page requests
    clearAllActivePageRequests();
    
    // Clear image grid
    clearImageGrid();
    
    // Show/hide appropriate UI elements
    document.getElementById('directory-view').style.display = 'block';
    hideImageViewUI(); // Use imported hide function
    document.getElementById('image-view').style.display = 'none'; // Ensure main container is hidden
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.style.display = 'none';
    }
    document.title = 'Thư viện Ảnh - Guustudio';
    
    // Clear hash if present
    if (location.hash) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    
    showDirectoryViewOnly(); 
    document.body.classList.remove('gallery-view-active'); // << REMOVE class for homepage
}

function showImageView() { // This function now mainly toggles the main view containers
    console.log('[app.js] showImageView called.');
    document.getElementById('directory-view').style.display = 'none';
    document.getElementById('image-view').style.display = 'block';
    showImageViewUI(); // And calls the module to show its specific elements
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.style.display = 'inline-block';
    }
    document.body.classList.add('gallery-view-active'); // << ADD class for album/image view
}

// --- Prompt mật khẩu cho folder protected --- (MOVED to uiModal.js)
/*
async function handlePasswordSubmit(folderName, passwordInputId, errorElementId, promptOverlayId) { ... }
function showPasswordPrompt(folderName) { ... }
function hidePasswordPrompt(overlayId, listener) { ... } // Adjusted to accept listener
const escapePasswordPromptListener = (overlayId) => { ... }; // Adjusted
*/

// --- Load Sub Items (Folders/Images) ---
async function loadSubItems(folderPath) {
    console.log(`[app.js] loadSubItems called for path: ${folderPath}`);
    
    // Prevent double loading of the same folder
    if (currentFolder === folderPath && !isProcessingNavigation) {
        console.log(`[app.js] loadSubItems: Already in folder ${folderPath}, skipping duplicate load.`);
        return;
    }
    
    if (isProcessingNavigation) {
        console.log('[app.js] loadSubItems: isProcessingNavigation is true, returning to prevent concurrent execution.');
        return;
    }

    // Abort any ongoing requests when navigating to new folder
    if (isLoadingMore) {
        console.log('[app.js] loadSubItems: isLoadingMore is true, aborting ongoing requests.');
        if (paginationAbortController) {
             console.log('[app.js] loadSubItems: Aborting pending pagination fetch due to folder navigation.');
             paginationAbortController.abort();
             setPaginationAbortController(null);
             setPageCurrentlyFetching(null);
             setIsLoadingMore(false);
        }
        if (preloadAbortController) {
             console.log('[app.js] loadSubItems: Aborting pending preload fetch due to folder navigation.');
             preloadAbortController.abort();
             setPreloadAbortController(null);
        }
    }

    isProcessingNavigation = true;
    showLoadingIndicator(); 
    setCurrentFolder(folderPath);
    setCurrentPage(1);
    setCurrentImageList([]);
    setPreloadedImages([]); 
    setPageCurrentlyFetching(null);
    setPaginationAbortController(null);
    setPreloadAbortController(null);
    clearAllActivePageRequests(); // Clear all tracked page requests
    clearImageGrid();
    const subfolderDisplayArea = document.getElementById('subfolder-display-area');
    if (subfolderDisplayArea) subfolderDisplayArea.innerHTML = '';
    try {
        console.log(`[app.js] loadSubItems: Fetching list_files for path: ${folderPath}`);

        const initialLoadAbortController = new AbortController();
        const signal = initialLoadAbortController.signal;

        const responseData = await fetchDataApi('list_files', 
            { path: folderPath, page: 1, limit: IMAGES_PER_PAGE },
            { signal }
        );
        console.log(`[app.js] loadSubItems: API response for ${folderPath}:`, responseData);
        if (responseData.status === 'password_required') {
            hideLoadingIndicator();
            showPasswordPrompt(responseData.folder || folderPath);
            return;
        }
        if (responseData.status !== 'success') {
            hideLoadingIndicator();
            showModalWithMessage('Lỗi tải album', `<p>${responseData.message || 'Không rõ lỗi'}</p>`, true);
            return;
        }
        const { folders: subfolders, files: initialImagesMetadata, pagination, current_dir_name: apiDirName } = responseData.data;
        const directoryName = apiDirName || folderPath.split('/').pop();
        console.log(`[app.js] loadSubItems: Directory name: ${directoryName}`);
        console.log('[app.js] loadSubItems: initialImagesMetadata:', initialImagesMetadata);
        document.title = `Album: ${directoryName} - Guustudio`;
        updateImageViewHeader(directoryName);
        const fetchedTotal = pagination ? pagination.total_items : (initialImagesMetadata ? initialImagesMetadata.length : 0);
        setTotalImages(fetchedTotal || 0);
        let contentRendered = false;
        if (subfolders && subfolders.length) {
            const ul = document.createElement('ul');
            ul.className = 'directory-list-styling subfolder-list';
            subfolders.forEach(sf => {
                const listItem = createDirectoryListItem(sf, null);
                ul.appendChild(listItem);
            });
            if (subfolderDisplayArea) subfolderDisplayArea.appendChild(ul);
            contentRendered = true;
            if (initialImagesMetadata && initialImagesMetadata.length) {
                const hr = document.createElement('hr');
                hr.className = 'folder-image-divider';
                if (subfolderDisplayArea) subfolderDisplayArea.appendChild(hr);
            }
        }
        createImageGroupIfNeeded();
        if (initialImagesMetadata && initialImagesMetadata.length) {
            setCurrentImageList(initialImagesMetadata);
            renderImageItemsToGrid(initialImagesMetadata);
            contentRendered = true;
            setupPhotoSwipeIfNeeded();
        } else {
            setCurrentImageList([]);
        }
        const zipLink = document.getElementById('download-all-link');
        const shareBtn = document.getElementById('shareButton');
        zipLink.href = `#`;
        zipLink.onclick = (e) => { 
            e.preventDefault(); 
            const currentFolderInfo = getCurrentFolderInfo(); 
            appHandleDownloadZipAction(currentFolderInfo.path, currentFolderInfo.name);
        };
        shareBtn.onclick = () => { handleShareAction(currentFolder); };
        showImageView();
        if (initialImagesMetadata.length < totalImages) {
            preloadNextBatch();
        }
        if (currentImageList.length >= totalImages && !contentRendered) {
            const targetEmptyMessageContainer = subfolderDisplayArea && subfolderDisplayArea.hasChildNodes() ? subfolderDisplayArea : document.getElementById('image-grid');
            if (targetEmptyMessageContainer) targetEmptyMessageContainer.innerHTML = '<p class="info-text">Album này trống.</p>';
        }
        if (!contentRendered && currentImageList.length === 0) {
            const targetEmptyMessageContainer = subfolderDisplayArea && subfolderDisplayArea.hasChildNodes() ? subfolderDisplayArea : document.getElementById('image-grid');
            if (targetEmptyMessageContainer) targetEmptyMessageContainer.innerHTML = '<p class="info-text">Album này trống.</p>';
        }
    } catch (error) {
        console.error('[app.js] Error in loadSubItems (catch block):', error);
        if (error.name === 'AbortError') {
            console.log('[app.js] loadSubItems fetch aborted.');
        } else {
            showModalWithMessage('Lỗi nghiêm trọng', `<p>Đã có lỗi xảy ra khi tải nội dung thư mục: ${error.message}</p>`, true);
        }
    } finally {
        hideLoadingIndicator();
        isProcessingNavigation = false;
        setPageCurrentlyFetching(null);
        setPaginationAbortController(null);
        setIsLoadingMore(false);
    }
}

// --- Load More Images ---
async function loadMoreImages() {
    console.log('[app.js] loadMoreImages: ENTRY, isLoadingMore:', isLoadingMore, 'currentPage:', currentPage, 'totalImages:', totalImages, 'currentImageList.length:', currentImageList.length, 'preloadedImages.length:', preloadedImages.length);

    // Early exit checks
    if (isLoadingMore) {
        console.log('[app.js] loadMoreImages: Already loading, skipping.');
        return; 
    }

    if (currentImageList.length >= totalImages && totalImages > 0) {
        console.log('[app.js] loadMoreImages: All images loaded, skipping.');
        toggleInfiniteScrollSpinner(false);
        return;
    }

    const pageToFetch = currentPage + 1;

    // Check if this page is already being requested
    if (isPageRequestActive(pageToFetch)) {
        console.log(`[app.js] loadMoreImages: Page ${pageToFetch} is already being requested, skipping.`);
        return;
    }

    // Set loading state immediately to prevent concurrent calls
    setIsLoadingMore(true);
    toggleInfiniteScrollSpinner(true);
    addActivePageRequest(pageToFetch); // Track this request

    console.log(`[app.js] loadMoreImages: Starting request for page ${pageToFetch}`);

    try {
        let imagesWereAdded = false;

        // Prioritize using preloaded images if available
        if (preloadedImages.length > 0) {
            console.log('[app.js] loadMoreImages: Using preloaded images.');
            const imagesToRender = [...preloadedImages];
            setPreloadedImages([]); // Consume preloaded images

            // Append to the list and render
            setCurrentImageList(currentImageList.concat(imagesToRender));
            renderImageItemsToGrid(imagesToRender, true);
            setupPhotoSwipeIfNeeded();
            imagesWereAdded = true;

            if (imagesToRender.length > 0) {
                setCurrentPage(pageToFetch); // Update current page
                console.log(`[app.js] loadMoreImages: Rendered ${imagesToRender.length} preloaded images for page ${pageToFetch}`);
                
                // Trigger preloading the next batch
                if (currentImageList.length < totalImages) {
                    preloadNextBatch();
                }
            }

        } else {
            // No preloaded images available, fetch from API
            console.log(`[app.js] loadMoreImages: No preloaded images, fetching page ${pageToFetch} from API`);
            
            // Abort any previous pagination fetch
            if (paginationAbortController) {
                console.log('[app.js] loadMoreImages: Aborting previous pagination fetch.');
                paginationAbortController.abort();
            }
            
            const abortController = new AbortController();
            setPaginationAbortController(abortController);

            try {
                const responseData = await fetchDataApi('list_files', 
                    { path: currentFolder, page: pageToFetch, limit: IMAGES_PER_PAGE },
                    { signal: abortController.signal }
                );
                
                console.log(`[app.js] loadMoreImages: API response for page ${pageToFetch}:`, responseData);
                
                if (responseData.status === 'success' && responseData.data.files && responseData.data.files.length > 0) {
                    const newImagesMetadata = responseData.data.files;
                    
                    // Filter out duplicates to handle race conditions
                    const currentPaths = new Set(currentImageList.map(item => item.source_path));
                    const trulyNewImages = newImagesMetadata.filter(item => !currentPaths.has(item.source_path));

                    if (trulyNewImages.length > 0) {
                        setCurrentPage(pageToFetch);
                        setCurrentImageList(currentImageList.concat(trulyNewImages));
                        renderImageItemsToGrid(trulyNewImages, true);
                        setupPhotoSwipeIfNeeded();
                        imagesWereAdded = true;

                        console.log(`[app.js] loadMoreImages: Added ${trulyNewImages.length} new images from page ${pageToFetch}. Total: ${currentImageList.length + trulyNewImages.length}`);

                        // Update total images if provided
                        if (responseData.data.pagination && responseData.data.pagination.total_items && responseData.data.pagination.total_items !== totalImages) {
                            setTotalImages(responseData.data.pagination.total_items);
                        }

                        // Trigger preloading the next batch
                        if (currentImageList.length < totalImages) {
                            preloadNextBatch();
                        }

                    } else {
                        console.log(`[app.js] loadMoreImages: Page ${pageToFetch} contained no new images (duplicates filtered).`);
                    }

                } else if (responseData.status === 'success') {
                    console.log(`[app.js] loadMoreImages: Page ${pageToFetch} returned no files, likely reached end.`);
                } else {
                    console.error(`[app.js] loadMoreImages: API error for page ${pageToFetch}:`, responseData.message);
                    showModalWithMessage('Lỗi tải thêm ảnh', `<p>${responseData.message || 'Không rõ lỗi'}</p>`, true);
                }

            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('[app.js] loadMoreImages: Network error:', error);
                    showModalWithMessage('Lỗi nghiêm trọng', `<p>Đã có lỗi xảy ra khi tải thêm ảnh: ${error.message}</p>`, true);
                } else {
                    console.log('[app.js] loadMoreImages: Request aborted');
                }
            } finally {
                setPaginationAbortController(null);
            }
        }

    } finally {
        // Always clean up state
        removeActivePageRequest(pageToFetch); // Remove from tracking
        setIsLoadingMore(false);
        toggleInfiniteScrollSpinner(false);
        console.log('[app.js] loadMoreImages: EXIT, currentPage:', currentPage, 'currentImageList.length:', currentImageList.length);
    }
}

// --- NEW: Preload Next Batch Function ---
async function preloadNextBatch() {
    console.log('[app.js] preloadNextBatch: ENTRY, isCurrentlyPreloading:', isCurrentlyPreloading, 'preloadedImages.length:', preloadedImages.length, 'currentPage:', currentPage, 'totalImages:', totalImages);

    // Prevent concurrent preloading and skip if we already have preloaded images or loaded all
    if (isCurrentlyPreloading || preloadedImages.length > 0) {
        console.log('[app.js] preloadNextBatch: Skipping (already preloading or preloaded images exist).');
        return; 
    }

    if (currentImageList.length >= totalImages && totalImages > 0) {
        console.log('[app.js] preloadNextBatch: All images loaded, no need to preload.');
        return;
    }

    // Calculate the page number to preload (next page after current)
    const pageToPreload = currentPage + 1;

    // Check if this page is already being requested (by main loading or previous preload)
    if (isPageRequestActive(pageToPreload)) {
        console.log(`[app.js] preloadNextBatch: Page ${pageToPreload} is already being requested, skipping preload.`);
        return;
    }

    // Check if we've reached the theoretical end
    const expectedOffset = currentPage * IMAGES_PER_PAGE;
    if (expectedOffset >= totalImages && totalImages > 0) {
        console.log('[app.js] preloadNextBatch: Calculated offset', expectedOffset, 'is >= totalImages', totalImages, ', skipping preload.');
        return;
    }

    setIsCurrentlyPreloading(true);
    addActivePageRequest(pageToPreload); // Track this preload request

    console.log(`[app.js] preloadNextBatch: Starting preload for page ${pageToPreload}`);

    // Abort any previous preload
    if (preloadAbortController) {
        console.log('[app.js] preloadNextBatch: Aborting previous preload fetch.');
        preloadAbortController.abort();
    }
    
    const abortController = new AbortController();
    setPreloadAbortController(abortController);

    try {
        const responseData = await fetchDataApi('list_files', 
            { path: currentFolder, page: pageToPreload, limit: IMAGES_PER_PAGE },
            { signal: abortController.signal }
        );
        
        if (responseData.status === 'success' && responseData.data.files && responseData.data.files.length > 0) {
            setPreloadedImages(responseData.data.files);
            console.log(`[app.js] preloadNextBatch: Successfully preloaded ${responseData.data.files.length} images for page ${pageToPreload}.`);
            
            // Update total images if API provides a new total
            if (responseData.data.pagination && responseData.data.pagination.total_items && responseData.data.pagination.total_items !== totalImages) {
                setTotalImages(responseData.data.pagination.total_items);
            }

        } else {
            setPreloadedImages([]);
            if (responseData.status !== 'success') {
                console.warn(`[app.js] preloadNextBatch: Failed to preload page ${pageToPreload}. Status: ${responseData.status}, Message: ${responseData.message}`);
            } else {
                console.log(`[app.js] preloadNextBatch: No more images to preload for page ${pageToPreload}.`);
            }
        }

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`[app.js] preloadNextBatch: Error preloading page ${pageToPreload}:`, error);
            setPreloadedImages([]);
        } else {
            console.log('[app.js] preloadNextBatch: Preload aborted');
        }
    } finally {
        removeActivePageRequest(pageToPreload); // Remove from tracking
        setPreloadAbortController(null);
        setIsCurrentlyPreloading(false);
        console.log('[app.js] preloadNextBatch: EXIT, preloadedImages.length:', preloadedImages.length);
    }
}

// --- Navigate Function (handles hash update) ---
function navigateToFolder(folderPath) {
    console.log(`[app.js] navigateToFolder called with path: ${folderPath}`);
    console.log('[app.js] navigateToFolder: Attempting to set location.hash');
    location.hash = `#?folder=${encodeURIComponent(folderPath)}`;
    console.log('[app.js] navigateToFolder: location.hash set to', location.hash);
}

// --- Back button --- 
const backButton = document.getElementById('backButton');
if (backButton) {
    backButton.onclick = () => {
        // Use hash change to navigate back
        history.back(); 
    };
}

// --- Hash Handling ---
async function handleUrlHash() { // Make function async
    console.log("[app.js] handleUrlHash: ENTRY. Current hash:", location.hash);
    
    // Reset navigation flag at start
    isProcessingNavigation = false;
    
    showGlobalLoadingOverlay(); // Show global overlay at the start

    try {
        const hash = location.hash;
        if (hash.startsWith('#?folder=')) {
            try {
                const encodedFolderName = hash.substring('#?folder='.length);
                const folderRelativePath = decodeURIComponent(encodedFolderName);
                console.log(`[app.js] handleUrlHash: Decoded folder path: ${folderRelativePath}`);
                if (folderRelativePath && !folderRelativePath.includes('..')) {
                    console.log('[app.js] handleUrlHash: Path is valid, calling loadSubItems.');
                    await loadSubItems(folderRelativePath); // Await the async operation
                    // return true; // Return value might not be strictly needed if not used by caller
                } else {
                    // If folderRelativePath is invalid (e.g. empty after decode, or contains '..')
                    // Fall through to show directory view
                    console.warn('[app.js] handleUrlHash: Invalid folder path after decoding. Showing directory view.');
                    showDirectoryView();
                    await loadTopLevelDirectories(); // Await the async operation
                }
            } catch (e) { 
                console.error("[app.js] Error parsing URL hash or loading sub items:", e);
                history.replaceState(null, '', ' '); 
                // Fallback to directory view on error
                showDirectoryView();
                await loadTopLevelDirectories(); // Await the async operation
            }
        } else {
            // No hash or invalid hash - show home page
            console.log('[app.js] handleUrlHash: No valid folder in hash, showing directory view.');
            showDirectoryView();
            await loadTopLevelDirectories(); // Await the async operation
            // return false; // Return value might not be strictly needed
        }
    } catch (error) {
        console.error('[app.js] Critical error in handleUrlHash logic:', error);
        // Optionally show a user-friendly error message here using showModalWithMessage
        // For now, just logging, as specific views also have error handling.
    } finally {
        hideGlobalLoadingOverlay(); // Hide global overlay at the end, regardless of success or failure
    }
}

// --- Load Top Level Directories --- (MOVED to uiDirectoryView.js)
/*
async function loadTopLevelDirectories(searchTerm = null) { 
    const listEl = document.getElementById('directory-list');
    const promptEl = document.getElementById('search-prompt');
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    const loadingIndicator = document.getElementById('loading-indicator'); // Added loading indicator

    if (!listEl || !promptEl || !searchInput || !clearSearch || !loadingIndicator) {
        console.error("Required elements not found for loadTopLevelDirectories");
        return;
    }

    loadingIndicator.style.display = 'block'; // Show loading indicator
    promptEl.style.display = 'none'; // Hide prompt while loading
    listEl.innerHTML = '<div class="loading-placeholder">Đang tải danh sách album...</div>'; // Initial placeholder

    const isSearching = searchTerm !== null && searchTerm !== '';

    // Update search input and clear button visibility
    searchInput.value = searchTerm || '';
    clearSearch.style.display = isSearching ? 'inline-block' : 'none';

    if (searchAbortController) { // READ from state
        searchAbortController.abort();
    }
    const newAbortController = new AbortController();
    setSearchAbortController(newAbortController); // WRITE to state
    const { signal } = newAbortController;

    showLoadingIndicator();
    
    const params = {};
    if (searchTerm) {
        params.search = searchTerm;
    }

    const responseData = await fetchDataApi('list_files', params, { signal });

    loadingIndicator.style.display = 'none'; // Hide loading indicator
    listEl.innerHTML = ''; // Clear placeholder/previous content

    if (responseData.status === 'success') {
        // The response format for list_files root is different: { folders: [...], files: [], ... }
        // where folders contain the source info.
        let dirs = responseData.data.folders || []; // Get the source folders
        
        // Client-side filtering if a search term was provided
        if (isSearching) {
            dirs = dirs.filter(dir => 
                dir.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // If not searching, and we got more than 10, maybe shuffle and slice?
        // Or just display all sources returned.
        if (!isSearching && dirs.length > 10) {
            // Optional: Shuffle and slice if you want random display for non-search
            // shuffleArray(dirs); // Implement shuffleArray if needed
            // dirs = dirs.slice(0, 10);
        }

        renderTopLevelDirectories(dirs, isSearching);
        // Store the full list if needed for subsequent client-side searches without refetching
        // allTopLevelDirs = responseData.data.folders || []; 

    } else {
        console.error("Lỗi tải album:", responseData.message);
        listEl.innerHTML = `<div class="error-placeholder">Lỗi tải danh sách album: ${responseData.message}</div>`;
        promptEl.textContent = 'Đã xảy ra lỗi. Vui lòng thử lại.';
        promptEl.style.display = 'block';
    }
}
*/

// --- Initialize App Function ---
async function initializeApp() {
    console.log("Initializing app...");

    // DOM Caching - directly assign to variables if not using setters from state.js
    // These were previously causing issues with incorrect imports
    const albumTitleEl = document.getElementById('album-title'); // Example ID, adjust if necessary
    const breadcrumbEl = document.getElementById('breadcrumb'); // Example ID
    const imageGridEl = document.getElementById('image-grid');
    const loadingOverlayEl = document.getElementById('loading-overlay');
    const paginationEl = document.getElementById('pagination-container'); // Example ID
    const searchInputEl = document.getElementById('searchInput');
    const searchClearEl = document.getElementById('clearSearch');
    const searchFormEl = document.querySelector('.search-container'); // Example selector
    const modalOverlayEl = document.getElementById('passwordPromptOverlay'); // Assuming this is the main modal overlay
    const modalBoxEl = modalOverlayEl ? modalOverlayEl.querySelector('.modal-box') : null;
    const modalTitleEl = modalBoxEl ? modalBoxEl.querySelector('h3') : null; // Example selector
    const modalMessageEl = modalBoxEl ? modalBoxEl.querySelector('p') : null; // Example selector
    const modalCloseButtonEl = modalBoxEl ? modalBoxEl.querySelector('.close-button') : null; // Example selector
    const modalOkButtonEl = modalBoxEl ? modalBoxEl.querySelector('.ok-button') : null; // Example selector
    const modalCancelButtonEl = modalBoxEl ? modalBoxEl.querySelector('.cancel-button') : null; // Example selector

    // Use setters for state variables that have them and are managed via state.js
    setZipProgressBarContainerEl(document.getElementById('zip-progress-bar-container'));
    setZipFolderNameEl(document.getElementById('zip-folder-name'));
    setZipOverallProgressEl(document.getElementById('zip-overall-progress'));
    setZipProgressStatsTextEl(document.getElementById('zip-progress-stats-text'));
    // Verify if elements were found (optional but good for debugging)
    console.log('[app.js] ZIP Progress Bar Elements after setting:', {
        container: zipProgressBarContainerEl, // Read directly from state to check
        folderName: zipFolderNameEl,
        overallProgress: zipOverallProgressEl,
        statsText: zipProgressStatsTextEl
    });

    setGeneralModalOverlay(document.getElementById('passwordPromptOverlay'));
    initModalSystem(loadSubItems);

    console.log('[app.js] About to initialize DirectoryView...');
    initializeDirectoryView({
        navigateToFolder: navigateToFolder, 
        showLoadingIndicator: showLoadingIndicator, 
        hideLoadingIndicator: hideLoadingIndicator 
    });
    console.log('[app.js] DirectoryView initialized (or call completed).');

    initializeImageView({
        openPhotoSwipe: (itemIndex) => {
            if (!isSelectionModeActiveGlobal()) {
                openPhotoSwipeAtIndex(itemIndex);
            } else {
                console.log("[app.js] Wrapped openPhotoSwipe in initializeImageView: In select mode, PhotoSwipe opening prevented.");
            }
        },
        loadMoreImages: loadMoreImages 
    });
    initializePhotoSwipeHandler();
    // --- NEW: Initialize ZIP Jobs Panel Elements ---
    const panelContainer = document.getElementById('zip-jobs-panel-container');
    const listContainer = document.getElementById('zip-jobs-list');
    if (panelContainer && listContainer) {
        setZipJobPanelDOMElements(panelContainer, listContainer);
    } else {
        console.error("[app.js] Failed to find ZIP Job Panel DOM elements.");
    }
    // --- END NEW ---
    // Now initialize the ZIP Manager (must be after DOM elements are set)
    initializeZipManager();
    
    // LoadMoreBtn listener is now in uiImageView.js

    if (!handleUrlHash()) { /* ... */ }
    window.addEventListener('hashchange' , handleUrlHash);

    initializeAppEventListeners();

    console.log("App initialized.");
}

// ... (DOMContentLoaded listener)
document.addEventListener('DOMContentLoaded', () => {
    console.log('[app.js] DOMContentLoaded event fired.');
    initializeApp();
});

// =======================================
// === ZIP DOWNLOAD FUNCTIONS (NEW)    ===
// =======================================

// --- Share Action ---
function handleShareAction(folderPath) {
    if (!folderPath) return;
    const shareUrl = `${location.origin}${location.pathname}#?folder=${encodeURIComponent(folderPath)}`;
    const shareButton = document.getElementById('shareButton');
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        if (shareButton) {
            const originalText = shareButton.dataset.originalText || 'Sao chép Link';
            if (!shareButton.dataset.originalText) shareButton.dataset.originalText = originalText;
            shareButton.textContent = 'Đã sao chép!';
            shareButton.disabled = true;
            setTimeout(() => { shareButton.textContent = originalText; shareButton.disabled = false; }, 2000);
        }
    }).catch(err => {
        showModalWithMessage('Lỗi sao chép','<p>Không thể tự động sao chép link.</p>', true);
    });
}

// --- Password Prompt Specific Functions ---
// ... (showPasswordPrompt, hidePasswordPrompt, escapePasswordPromptListener) ...

// DOM Elements - Gallery View Controls
const toggleSelectModeButton = document.getElementById('toggleSelectModeButton');
const downloadSelectedButton = document.getElementById('downloadSelectedButton');
const clearSelectionButton = document.getElementById('clearSelectionButton');
const downloadAllLink = document.getElementById('download-all-link');

function initializeAppEventListeners() {
    // DOM Elements for selection - get them here to pass to the manager
    const toggleSelectModeButton = document.getElementById('toggleSelectModeButton');
    const downloadSelectedButton = document.getElementById('downloadSelectedButton');
    const clearSelectionButton = document.getElementById('clearSelectionButton');
    const imageGrid = document.getElementById('image-grid');
    const downloadAllLink = document.getElementById('download-all-link'); // For visibility toggle

    // Initialize the Selection Manager
    if (imageGrid && toggleSelectModeButton && downloadSelectedButton && clearSelectionButton) {
        initializeSelectionMode({
            imageGridElement: imageGrid,
            toggleSelectModeButtonElement: toggleSelectModeButton,
            downloadSelectedButtonElement: downloadSelectedButton,
            clearSelectionButtonElement: clearSelectionButton,
            downloadAllLinkElement: downloadAllLink,
            onDownloadRequestInitiated: handleDownloadSelectedRequest, 
            showModalCallback: showModalWithMessage, 
            getCurrentFolderInfoCallback: getCurrentFolderInfo, 
            getPhotoswipeLightboxCallback: () => photoswipeLightbox, 
            setPhotoswipeLightboxCallback: setPhotoswipeLightbox, 
            setupPhotoSwipeIfNeededCallback: setupPhotoSwipeIfNeeded 
        });
    } else {
        console.error("[app.js] Could not initialize SelectionManager: one or more required DOM elements not found.");
    }

    // Logo click handler for home navigation
    const logoLink = document.querySelector('.logo-link');
    if (logoLink) {
        logoLink.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[app.js] Logo clicked, navigating to home');
            
            // Reset navigation flag
            isProcessingNavigation = false;
            
            // Clear the hash to go to home
            if (location.hash) {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
            
            // Reset state
            setCurrentFolder('');
            setCurrentImageList([]);
            setCurrentPage(1);
            setTotalImages(0);
            
            // Show directory view and load top level directories
            showDirectoryView();
            await loadTopLevelDirectories();
        });
    } else {
        console.warn('[app.js] Logo link not found for home navigation');
    }

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const clearSearchButton = document.getElementById('clearSearch'); // Assuming you have a clear search button

    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const searchTerm = e.target.value.trim();
            // When searching, always show the top-level directory view
            // and let loadTopLevelDirectories handle showing/hiding based on search term
            showDirectoryView(); 
            await loadTopLevelDirectories(searchTerm);
            if (clearSearchButton) { // Show clear button if there's text
                clearSearchButton.style.display = searchTerm ? 'inline-block' : 'none';
            }
        }, 300));
    }
    if (clearSearchButton && searchInput) {
        clearSearchButton.addEventListener('click', async () => {
            searchInput.value = '';
            clearSearchButton.style.display = 'none';
            showDirectoryView();
            await loadTopLevelDirectories(''); // Load all top-level directories
        });
         // Initially hide clear button
        clearSearchButton.style.display = 'none';
    }


    // Back to top button
    const backToTopButton = document.getElementById('backToTop');
    if (backToTopButton) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTopButton.style.display = 'block';
            } else {
                backToTopButton.style.display = 'none';
            }
        });
        backToTopButton.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        backToTopButton.style.display = 'none'; // Initially hidden
    }

    // Infinite scroll listener
    window.addEventListener('scroll', debounce(() => {
        // Start performance timing for scroll response
        const scrollStartTime = globalPerformanceMonitor.startTiming('scroll-response');
        
        // Update scroll tracking for smart preloading (now handled automatically in utils.js)
        // globalScrollTracker.update(); // Removed - now handled globally
        
        const imageView = document.getElementById('image-view');
        if (imageView && imageView.style.display === 'block' &&
            !isLoadingMore && 
            currentImageList.length < totalImages && 
            totalImages > 0) {
            
            // Use a smaller threshold to prevent over-eager triggering
            const threshold = window.innerHeight * 1.5; 
            if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - threshold) { 
                console.log(`[app.js] Infinite scroll triggered with threshold: ${threshold}px (1.5x viewport)`);
                
                // Start performance timing for infinite scroll load
                const infiniteScrollStartTime = globalPerformanceMonitor.startTiming('infinite-scroll-load');
                
                loadMoreImages().then(() => {
                    globalPerformanceMonitor.endTiming('infinite-scroll-load', infiniteScrollStartTime, 'scrollLoad');
                }).catch(error => {
                    console.error('[app.js] Error in infinite scroll loadMoreImages:', error);
                    globalPerformanceMonitor.endTiming('infinite-scroll-load-error', infiniteScrollStartTime, 'scrollLoadErrors');
                });
            }
        }
        
        // End scroll response timing
        globalPerformanceMonitor.endTiming('scroll-response', scrollStartTime, 'scrollResponse');
        
    }, 750)); // Increased debounce time to 750ms for better duplicate prevention

    // Handle popstate for back/forward navigation
    window.addEventListener('popstate', (event) => {
        console.log("[app.js] popstate event triggered:", event.state, location.hash);
        // Re-evaluate the hash to handle navigation
        handleUrlHash();
    });
}

// New function in app.js to handle the download request initiated by selectionManager
export async function handleDownloadSelectedRequest(pathsToDownload, folderNameHint) {
    if (!pathsToDownload || pathsToDownload.length === 0) {
        showModalWithMessage('Lỗi', '<p>Không có đường dẫn nào được cung cấp để tải về.</p>', true);
        return;
    }

    console.log('[app.js] Handling download request from selectionManager. Paths:', pathsToDownload, 'Folder hint:', folderNameHint);

    const formData = new FormData();
    pathsToDownload.forEach(path => {
        formData.append('file_paths[]', path);
    });
    formData.append('zip_filename_hint', `selected_images_from_${folderNameHint}.zip`);
    formData.append('source_path', '_multiple_selected_');

    try {
        const result = await fetchDataApi('request_zip', {}, {
            method: 'POST',
            body: formData
        });

        if (result.status === 'success' && result.data && result.data.job_token) {
            const initialJobData = result.data;
            const jobToken = initialJobData.job_token;
            if (!initialJobData.status) initialJobData.status = 'pending';

            addOrUpdateZipJob(jobToken, { 
                jobData: initialJobData, 
                folderDisplayName: `Tuyển chọn (${pathsToDownload.length} ảnh)`, 
                lastUpdated: Date.now() 
            });
            
            startPanelPolling(); // This is imported from zipManager.js
            
        } else {
            const errorMessage = result.message || result.data?.error || 'Không thể yêu cầu tạo ZIP cho các ảnh đã chọn.';
            showModalWithMessage('Lỗi tạo ZIP', `<p>${errorMessage}</p>`, true);
        }
    } catch (error) {
        console.error("[app.js] Error in handleDownloadSelectedRequest during fetchDataApi for request_zip:", error);
        showModalWithMessage('Lỗi kết nối', '<p>Không thể kết nối đến máy chủ để yêu cầu tạo ZIP.</p>', true);
    }
}

// Modify renderImageItem to include checkbox and attach selection listener
function renderImageItem(item, parentElement, isSubfolderItem = false) {
    const galleryItem = document.createElement(isSubfolderItem ? 'li' : 'div');
    galleryItem.className = 'gallery-item';
    galleryItem.dataset.sourcePath = item.source_path; // Store for selection

    const link = document.createElement('a');
    link.href = '#'; // Prevent actual navigation, PhotoSwipe handles click

    const img = document.createElement('img');
    img.src = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(item.source_path)}&size=${THUMBNAIL_SIZE_GALLERY_VIEW}`;
    img.alt = item.name;
    img.loading = 'lazy';

    link.appendChild(img);

    // Checkbox for selection mode - always add, CSS handles visibility
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'selection-checkbox';
    checkbox.setAttribute('aria-label', `Chọn ${item.name}`);
    galleryItem.appendChild(checkbox);

    // Item Name Overlay (Optional - if you want names on thumbnails)
    const nameOverlay = document.createElement('div');
    nameOverlay.className = 'item-name-overlay';
    nameOverlay.textContent = item.name;
    link.appendChild(nameOverlay);
    
    galleryItem.appendChild(link);

    // Event listener for selection (delegation is better, but for simplicity now direct if fewer items)
    galleryItem.addEventListener('click', (event) => {
        if (isSelectModeActive) {
            event.preventDefault();
            event.stopPropagation();

            if (event.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            handleImageItemSelectFromCheckbox(item, galleryItem, checkbox.checked);
        }
    });

    // Listener for PhotoSwipe if not in select mode
    link.addEventListener('click', (e) => {
        if (!isSelectModeActive) {
            e.preventDefault();
            const itemIndex = currentLoadedItems.findIndex(loadedItem => loadedItem.source_path === item.source_path);
            if (itemIndex !== -1) {
                openPhotoSwipe(itemIndex, currentLoadedItems); 
            }
        } else {
            e.preventDefault();
        }
    });

    parentElement.appendChild(galleryItem);
    return galleryItem;
}

// New helper for selection logic tied to checkbox state
function handleImageItemSelectFromCheckbox(itemData, galleryItemElement, isSelected) {
    if (!isSelectModeActive) return;

    const itemPath = itemData.source_path;
    if (isSelected) {
        selectedImagePaths.add(itemPath);
        galleryItemElement.classList.add('selected-item');
    } else {
        selectedImagePaths.delete(itemPath);
        galleryItemElement.classList.remove('selected-item');
    }
    updateDownloadSelectedButton();
}

// Make sure to call initializeAppEventListeners in your main app flow
// Example: document.addEventListener('DOMContentLoaded', initializeAppEventListeners);
// Or if initializeAppEventListeners is part of a larger init function, ensure it's called.

// Also, ensure zipManager is imported if you are calling its methods directly like zipManager.addOrUpdateZipJob
// import * as zipManager from './zipManager.js'; // At the top of app.js

// Modify showThumbnailsForDirectory to correctly pass item data to renderImageItem
// Ensure currentLoadedItems is populated correctly for PhotoSwipe indexing.

// Near the top of app.js, with other DOM element declarations:
// const downloadAllLink = document.getElementById('download-all-link');

// Ensure getCurrentFolderInfo() is defined and returns { name: 'current_folder_name' }
// function getCurrentFolderInfo() {
//    return currentDirectoryPath ? { name: currentDirectoryPath.split('/').pop() || 'gallery' } : { name: 'gallery' };
// }

// At the top of app.js, add import for zipManager if not already there:
// import * as zipManager from './zipManager.js';

// Function to trigger a direct file download
export function triggerDirectDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || 'download'); // Provide a filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // No need to revoke ObjectURL if an actual URL is used.
}

// Export a getter for the current image list data
export function getCurrentImageListData() {
    return currentImageList;
}
  