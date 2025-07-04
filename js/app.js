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
    isPageRequestActive, clearAllActivePageRequests,
    isHomepageMode, setIsHomepageMode,
    homepageFeaturedImages, setHomepageFeaturedImages,
    isLoadingHomepageFeatured, setIsLoadingHomepageFeatured
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
let isAppInitialized = false; // Prevent double initialization
let isLogoClickInProgress = false; // Prevent conflicts during logo click navigation
let globalLoadingState = {
    isGlobalOverlayActive: false,
    isMainIndicatorActive: false
};

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
    // Don't show main indicator if global overlay is active
    if (globalLoadingState.isGlobalOverlayActive) {
        console.log('[app.js] Skipping main loading indicator - global overlay is active');
        return;
    }
    
    const indicator = document.getElementById('loading-indicator');
    if (indicator && !globalLoadingState.isMainIndicatorActive) {
        const textEl = indicator.querySelector('p');
        if (textEl) textEl.textContent = message;
        
        // Show with animation
        indicator.style.display = 'flex';
        
        // Trigger animation
        requestAnimationFrame(() => {
            indicator.classList.add('indicator-visible');
        });
        
        globalLoadingState.isMainIndicatorActive = true;
        console.log('[app.js] Main loading indicator shown:', message);
    }
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator && globalLoadingState.isMainIndicatorActive) {
        // Fade out animation
        indicator.classList.remove('indicator-visible');
        
        // Hide after animation completes
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 250);
        
        globalLoadingState.isMainIndicatorActive = false;
        console.log('[app.js] Main loading indicator hidden');
    }
}

// --- Global Overlay Functions --- START
function showGlobalLoadingOverlay(message = 'Đang tải dữ liệu', subtext = 'Vui lòng chờ trong giây lát...') {
    const overlay = document.getElementById('loading-overlay');
    if (overlay && !globalLoadingState.isGlobalOverlayActive) {
        // Update loading text
        const loadingText = overlay.querySelector('.loading-text');
        const loadingSubtext = overlay.querySelector('.loading-subtext');
        if (loadingText) loadingText.textContent = message;
        if (loadingSubtext) loadingSubtext.textContent = subtext;
        
        // Show with animation
        overlay.style.display = 'flex';
        document.body.classList.add('loading-active');
        
        // Trigger fade-in animation
        requestAnimationFrame(() => {
            overlay.classList.add('overlay-visible');
        });
        
        globalLoadingState.isGlobalOverlayActive = true;
        console.log('[app.js] Global loading overlay shown:', message);
    }
}

function hideGlobalLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay && globalLoadingState.isGlobalOverlayActive) {
        // Fade out animation
        overlay.classList.remove('overlay-visible');
        document.body.classList.remove('loading-active');
        
        // Hide after animation completes
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
        
        globalLoadingState.isGlobalOverlayActive = false;
        console.log('[app.js] Global loading overlay hidden');
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
function showDirectoryView(forceHomepageMode = null) {
    console.log('[app.js] showDirectoryView called, forceHomepageMode:', forceHomepageMode);
    
    // Reset navigation and loading flags
    isProcessingNavigation = false;
    
    // Clear any remaining loading indicators to ensure clean state
    globalLoadingState.isMainIndicatorActive = false;
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.style.display = 'none';
    
    // Reset state when going to directory view
    setCurrentFolder('');
    setCurrentImageList([]);
    setCurrentPage(1);
    setTotalImages(0);
    setPreloadedImages([]);
    setIsLoadingMore(false);
    setIsCurrentlyPreloading(false);
    
    // Abort any ongoing requests to prevent conflicts
    if (paginationAbortController) {
        console.log('[app.js] Aborting pagination controller');
        paginationAbortController.abort();
        setPaginationAbortController(null);
    }
    if (preloadAbortController) {
        console.log('[app.js] Aborting preload controller');
        preloadAbortController.abort();
        setPreloadAbortController(null);
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
    
    // Determine display mode
    if (forceHomepageMode !== null) {
        setIsHomepageMode(forceHomepageMode);
    }
    
    // Show/hide appropriate containers based on mode
    const homepageGrid = document.getElementById('homepage-featured-grid');
    const directoryList = document.getElementById('directory-list');
    const searchInput = document.getElementById('searchInput');
    
    if (isHomepageMode) {
        // Homepage mode: show featured grid, hide folder list
        if (homepageGrid) homepageGrid.style.display = 'block';
        if (directoryList) directoryList.style.display = 'none';
        if (searchInput) searchInput.value = ''; // Clear search when going to homepage
        console.log('[app.js] Showing homepage featured grid mode');
    } else {
        // Search mode: hide featured grid, show folder list
        if (homepageGrid) homepageGrid.style.display = 'none';
        if (directoryList) directoryList.style.display = 'block';
        console.log('[app.js] Showing folder search mode');
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
    
    // Explicitly set to false when loading a folder's content
    setIsHomepageMode(false);

    // Prevent conflicts with logo click navigation
    if (isLogoClickInProgress) {
        console.log('[app.js] loadSubItems: Logo click in progress, aborting folder navigation');
        return;
    }
    
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
    showLoadingIndicator('Đang tải album...'); 
    
    // Reset states immediately for better UX
    setCurrentFolder(folderPath);
    setCurrentPage(1);
    setCurrentImageList([]);
    setPreloadedImages([]); 
    setPageCurrentlyFetching(null);
    setPaginationAbortController(null);
    setPreloadAbortController(null);
    clearAllActivePageRequests(); // Clear all tracked page requests
    
    // Clear UI elements quickly
    clearImageGrid();
    const subfolderDisplayArea = document.getElementById('subfolder-display-area');
    if (subfolderDisplayArea) subfolderDisplayArea.innerHTML = '';
    
    // Show image view immediately để user không thấy directory view nhấp nháy
    showImageView();
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
        
        // Update loading message với tên album
        showLoadingIndicator(`Đang tải album "${directoryName}"...`);
        
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
    console.log('[app.js] loadMoreImages: ENTRY, isLoadingMore:', isLoadingMore, 'currentPage:', currentPage, 'totalImages:', totalImages, 'currentImageList.length:', currentImageList.length, 'preloadedImages.length:', preloadedImages.length, 'isHomepageMode:', isHomepageMode);

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

    // Handle homepage mode differently
    if (isHomepageMode) {
        console.log('[app.js] loadMoreImages: Homepage mode detected, loading more featured images');
        return loadMoreHomepageFeaturedImages();
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
        console.log('[app.js] Back button clicked');
        
        // Reset processing flag immediately to prevent locks
        isProcessingNavigation = false;
        
        // Force back to home by clearing hash and showing directory view
        if (location.hash) {
            // Clear hash to go back to home
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
        
        // Directly show directory view instead of relying on history.back()
        showDirectoryView();
        loadTopLevelDirectories().catch(error => {
            console.error('[app.js] Error loading top level directories from back button:', error);
        });
    };
}

// --- Hash Handling ---
async function handleUrlHash() { // Make function async
    console.log("[app.js] handleUrlHash: ENTRY. Current hash:", location.hash);
    
    // Reset navigation flag at start
    isProcessingNavigation = false;
    
    try {
        const hash = location.hash;
        if (hash.startsWith('#?folder=')) {
            try {
                const encodedFolderName = hash.substring('#?folder='.length);
                const folderRelativePath = decodeURIComponent(encodedFolderName);
                console.log(`[app.js] handleUrlHash: Decoded folder path: ${folderRelativePath}`);
                if (folderRelativePath && !folderRelativePath.includes('..')) {
                    console.log('[app.js] handleUrlHash: Path is valid, calling loadSubItems.');
                    // loadSubItems sẽ tự handle loading indicator - không cần global overlay
                    await loadSubItems(folderRelativePath); // Await the async operation
                } else {
                    // If folderRelativePath is invalid (e.g. empty after decode, or contains '..')
                    // Fall through to show homepage
                    console.warn('[app.js] handleUrlHash: Invalid folder path after decoding. Showing homepage.');
                    showGlobalLoadingOverlay('Đang tải trang chủ...');
                    showDirectoryView(true); // Force homepage mode
                    await loadHomepageFeaturedImages(); // Load featured images
                    hideGlobalLoadingOverlay();
                }
            } catch (e) { 
                console.error("[app.js] Error parsing URL hash or loading sub items:", e);
                
                // Reset processing flag on error
                isProcessingNavigation = false;
                
                history.replaceState(null, '', ' '); 
                // Fallback to homepage on error
                showGlobalLoadingOverlay('Đang tải trang chủ...');
                showDirectoryView(true); // Force homepage mode
                await loadHomepageFeaturedImages(); // Load featured images
                hideGlobalLoadingOverlay();
            }
        } else {
            // No hash or invalid hash - show home page with featured images
            console.log('[app.js] handleUrlHash: No valid folder in hash, showing homepage with featured images.');
            
            // Reset processing flag to ensure clean state
            isProcessingNavigation = false;
            
            showGlobalLoadingOverlay('Đang tải trang chủ...');
            showDirectoryView(true); // Force homepage mode
            await loadHomepageFeaturedImages(); // Load featured images instead of directories
            hideGlobalLoadingOverlay();
        }
    } catch (error) {
        console.error('[app.js] Critical error in handleUrlHash logic:', error);
        hideGlobalLoadingOverlay(); // Ensure cleanup on error
        // Optionally show a user-friendly error message here using showModalWithMessage
        // For now, just logging, as specific views also have error handling.
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

    showLoadingIndicator('Đang tìm kiếm album...');
    
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
    if (isAppInitialized) {
        console.log('[app.js] App already initialized, skipping...');
        return;
    }
    
    console.log("Initializing app...");
    isAppInitialized = true;

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
        hideLoadingIndicator: hideLoadingIndicator,
        loadHomepageFeatured: loadHomepageFeaturedImages, // Pass homepage loader
        searchInputEl: searchInputEl, // Pass the search input element
        clearSearchBtnEl: searchClearEl // Pass the clear search button element
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

    // Handle initial URL hash or show home page
    await handleUrlHash(); // Make this async and await it
    window.addEventListener('hashchange' , handleUrlHash);

    initializeAppEventListeners();

    console.log("App initialized.");
}

// --- Load Homepage Featured Images ---
async function loadHomepageFeaturedImages(page = 1, append = false) {
    console.log('[app.js] loadHomepageFeaturedImages called, page:', page, 'append:', append);
    
    if (isLoadingHomepageFeatured) {
        console.log('[app.js] Already loading homepage featured images, skipping');
        return;
    }
    
    setIsLoadingHomepageFeatured(true);
    
    try {
        if (!append) {
            showLoadingIndicator('Đang tải ảnh nổi bật...');
        }
        
        const responseData = await fetchDataApi('get_homepage_featured', { limit: 50, page: page });
        
        if (responseData.status !== 'success') {
            throw new Error(responseData.message || 'Không thể tải ảnh featured');
        }
        
        const featuredImages = responseData.data.files || [];
        const pagination = responseData.data.pagination || {};
        console.log('[app.js] Loaded featured images:', featuredImages.length, 'pagination:', pagination);
        
        // Update state
        if (append) {
            // Append to existing list
            const newImages = featuredImages.filter(newImg => 
                !currentImageList.some(existing => existing.path === newImg.path));
            setCurrentImageList([...currentImageList, ...newImages]);
            setHomepageFeaturedImages([...homepageFeaturedImages, ...newImages]);
        } else {
            // Replace list (first load)
            setHomepageFeaturedImages(featuredImages);
            setCurrentImageList(featuredImages); // For PhotoSwipe compatibility
        }
        
        setTotalImages(pagination.total_items || featuredImages.length);
        
        // Render images to homepage grid
        const homepageGrid = document.getElementById('homepage-featured-grid');
        if (homepageGrid && featuredImages.length > 0) {
            if (!append) {
                // Clear previous content on first load
                homepageGrid.innerHTML = '';
            }
            
            // Use the same masonry rendering as album view
            renderImageItemsToGrid(featuredImages, append, homepageGrid);
            
            // Setup PhotoSwipe for homepage grid
            setupPhotoSwipeIfNeeded();
            
            // Update search prompt for homepage
            const searchPromptEl = document.getElementById('search-prompt');
            if (searchPromptEl) {
                const totalShown = currentImageList.length;
                const totalAvailable = pagination.total_items || totalShown;
                searchPromptEl.textContent = `Hiển thị ${totalShown}/${totalAvailable} ảnh nổi bật. Nhập từ khóa để tìm album.`;
                searchPromptEl.style.visibility = 'visible';
            }
        } else if (homepageGrid && !append) {
            homepageGrid.innerHTML = '<div class="no-featured-message"><p>Chưa có ảnh nổi bật nào được đánh dấu.</p></div>';
            
            const searchPromptEl = document.getElementById('search-prompt');
            if (searchPromptEl) {
                searchPromptEl.textContent = 'Chưa có ảnh nổi bật. Nhập từ khóa để tìm album.';
                searchPromptEl.style.visibility = 'visible';
            }
        }
        
        if (!append) {
            hideLoadingIndicator();
        }
        console.log('[app.js] Homepage featured images loaded successfully');
        
    } catch (error) {
        console.error('[app.js] Error loading homepage featured images:', error);
        if (!append) {
            hideLoadingIndicator();
        }
        
        if (!append) {
            const homepageGrid = document.getElementById('homepage-featured-grid');
            if (homepageGrid) {
                homepageGrid.innerHTML = '<div class="error-message"><p>Không thể tải ảnh nổi bật. Vui lòng thử lại sau.</p></div>';
            }
            
            const searchPromptEl = document.getElementById('search-prompt');
            if (searchPromptEl) {
                searchPromptEl.textContent = 'Lỗi tải ảnh nổi bật. Nhập từ khóa để tìm album.';
                searchPromptEl.style.visibility = 'visible';
            }
        }
    } finally {
        setIsLoadingHomepageFeatured(false);
    }
}

// --- Load More Homepage Featured Images (for infinite scroll) ---
async function loadMoreHomepageFeaturedImages() {
    console.log('[app.js] loadMoreHomepageFeaturedImages called');
    
    // Set loading state immediately to prevent concurrent calls
    setIsLoadingMore(true);
    toggleInfiniteScrollSpinner(true);

    const pageToFetch = currentPage + 1;
    console.log(`[app.js] loadMoreHomepageFeaturedImages: Loading page ${pageToFetch}`);

    try {
        const responseData = await fetchDataApi('get_homepage_featured', { 
            limit: 50, 
            page: pageToFetch 
        });

        if (responseData.status === 'success' && responseData.data.files && responseData.data.files.length > 0) {
            const newFeaturedImages = responseData.data.files;
            const pagination = responseData.data.pagination || {};
            
            console.log(`[app.js] loadMoreHomepageFeaturedImages: Loaded ${newFeaturedImages.length} new images for page ${pageToFetch}`);
            
            // Filter out duplicates to handle race conditions
            const currentPaths = new Set(currentImageList.map(item => item.path));
            const trulyNewImages = newFeaturedImages.filter(item => !currentPaths.has(item.path));

            if (trulyNewImages.length > 0) {
                // Update state
                setCurrentPage(pageToFetch);
                setCurrentImageList([...currentImageList, ...trulyNewImages]);
                setHomepageFeaturedImages([...homepageFeaturedImages, ...trulyNewImages]);
                
                // Update total if provided
                if (pagination.total_items && pagination.total_items !== totalImages) {
                    setTotalImages(pagination.total_items);
                }

                // Render new images to homepage grid
                const homepageGrid = document.getElementById('homepage-featured-grid');
                if (homepageGrid) {
                    renderImageItemsToGrid(trulyNewImages, true, homepageGrid); // append=true, customContainer=homepageGrid
                    setupPhotoSwipeIfNeeded();
                }

                // Update search prompt
                const searchPromptEl = document.getElementById('search-prompt');
                if (searchPromptEl) {
                    const totalShown = currentImageList.length;
                    const totalAvailable = pagination.total_items || totalShown;
                    searchPromptEl.textContent = `Hiển thị ${totalShown}/${totalAvailable} ảnh nổi bật. Nhập từ khóa để tìm album.`;
                }

                console.log(`[app.js] loadMoreHomepageFeaturedImages: Successfully added ${trulyNewImages.length} new featured images. Total: ${currentImageList.length}`);
            } else {
                console.log(`[app.js] loadMoreHomepageFeaturedImages: Page ${pageToFetch} contained no new images (duplicates filtered).`);
            }

        } else if (responseData.status === 'success') {
            console.log(`[app.js] loadMoreHomepageFeaturedImages: Page ${pageToFetch} returned no files, likely reached end.`);
        } else {
            console.error(`[app.js] loadMoreHomepageFeaturedImages: API error for page ${pageToFetch}:`, responseData.message);
            showModalWithMessage('Lỗi tải thêm ảnh', `<p>Không thể tải thêm ảnh nổi bật: ${responseData.message}</p>`, true);
        }

    } catch (error) {
        console.error('[app.js] loadMoreHomepageFeaturedImages: Network error:', error);
        showModalWithMessage('Lỗi kết nối', `<p>Đã có lỗi xảy ra khi tải thêm ảnh nổi bật: ${error.message}</p>`, true);
    } finally {
        // Always clean up state
        setIsLoadingMore(false);
        toggleInfiniteScrollSpinner(false);
        console.log('[app.js] loadMoreHomepageFeaturedImages: EXIT, currentPage:', currentPage, 'currentImageList.length:', currentImageList.length);
    }
}

// --- Initialize Home Page Function ---
async function initializeHomePage() {
    console.log('[app.js] initializeHomePage called');
    try {
        showDirectoryView();
        setIsHomepageMode(true);
        setCurrentPage(1); // Reset page for homepage
        await loadHomepageFeaturedImages();
        console.log('[app.js] Home page initialized successfully');
    } catch (error) {
        console.error('[app.js] Error initializing home page:', error);
        showModalWithMessage('Lỗi khởi tạo', '<p>Không thể tải trang chủ. Vui lòng thử lại.</p>', true);
    }
}

// ... (DOMContentLoaded listener)
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[app.js] DOMContentLoaded event fired.');
    
    // Small delay to ensure DOM is fully ready
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await initializeApp();
    
    // Check initialState and navigate accordingly
    if (initialState.view === 'image' && initialState.folderPath) {
        loadSubItems(initialState.folderPath);
    } else {
        // Don't call initializeHomePage here since handleUrlHash in initializeApp already handles home page
        console.log('[app.js] Home page will be handled by handleUrlHash in initializeApp');
    }
    
    // Initialize navigation highlighting
    document.addEventListener('DOMContentLoaded', () => {
        // Set active navigation based on current page
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => link.classList.remove('active'));
        
        const galleryNav = document.getElementById('nav-gallery');
        if (galleryNav) {
            galleryNav.classList.add('active');
        }
    });
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
            e.stopPropagation();
            
            // Prevent multiple concurrent logo clicks
            if (isLogoClickInProgress) {
                console.log('[app.js] Logo click already in progress, ignoring');
                return;
            }
            
            console.log('[app.js] Logo clicked, navigating to home');
            isLogoClickInProgress = true;
            
            try {
                // SIMPLIFIED LOGIC: Always force immediate reset để tránh race conditions
                
                // Immediately reset all processing flags to prevent locks
                isProcessingNavigation = false;
                setIsLoadingMore(false);
                setIsCurrentlyPreloading(false);
            
            // Abort ALL ongoing requests immediately and forcefully
            try {
                if (paginationAbortController) {
                    paginationAbortController.abort();
                    setPaginationAbortController(null);
                }
                if (preloadAbortController) {
                    preloadAbortController.abort();
                    setPreloadAbortController(null);
                }
                // Don't abort searchAbortController here - let showDirectoryView handle it safely
            } catch (abortError) {
                console.warn('[app.js] Error aborting controllers:', abortError);
            }
            
            // Clear all tracked requests
            clearAllActivePageRequests();
            
            // Clear URL hash immediately
            if (location.hash) {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
            
            // Reset all state immediately
            setCurrentFolder('');
            setCurrentImageList([]);
            setCurrentPage(1);
            setTotalImages(0);
            setPreloadedImages([]);
            setAllTopLevelDirs([]);
            
            // Clear UI immediately
            clearImageGrid();
            
            // Force show directory view in homepage mode
            showDirectoryView(true); // Force homepage mode
            
            // Load homepage featured images
            try {
                showGlobalLoadingOverlay('Đang tải trang chủ...');
                await loadHomepageFeaturedImages();
                console.log('[app.js] Logo click navigation completed successfully');
            } catch (error) {
                console.error('[app.js] Error during logo click navigation:', error);
                // Simple fallback: try once more, then reload if still fails
                try {
                    await loadHomepageFeaturedImages();
                } catch (retryError) {
                    console.error('[app.js] Retry failed, forcing page reload:', retryError);
                    window.location.reload();
                }
                         } finally {
                 hideGlobalLoadingOverlay();
             }
            
            } finally {
                // Always reset logo click flag
                isLogoClickInProgress = false;
            }
        });
        
        console.log('[app.js] Logo click handler initialized successfully');
    } else {
        console.warn('[app.js] Logo link not found for home navigation');
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
        const directoryView = document.getElementById('directory-view');
        const homepageGrid = document.getElementById('homepage-featured-grid');
        
        // Check for infinite scroll in both album view and homepage mode
        const isInAlbumView = imageView && imageView.style.display === 'block';
        const isInHomepageMode = directoryView && directoryView.style.display === 'block' && 
                                 isHomepageMode && homepageGrid && homepageGrid.style.display === 'block';
        
        if ((isInAlbumView || isInHomepageMode) && 
            !isLoadingMore && 
            currentImageList.length < totalImages && 
            totalImages > 0) {
            
            // Use a smaller threshold to prevent over-eager triggering
            const threshold = window.innerHeight * 1.5; 
            if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - threshold) { 
                console.log(`[app.js] Infinite scroll triggered (${isInHomepageMode ? 'homepage' : 'album'} mode) with threshold: ${threshold}px (1.5x viewport)`);
                
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
        
        // Ignore popstate during logo click navigation
        if (isLogoClickInProgress) {
            console.log('[app.js] Logo click in progress, ignoring popstate');
            return;
        }
        
        // Reset processing flag immediately to prevent locks
        isProcessingNavigation = false;
        
        // Re-evaluate the hash to handle navigation
        handleUrlHash().catch(error => {
            console.error('[app.js] Error in handleUrlHash from popstate:', error);
            // Fallback: force show directory view
            showDirectoryView();
            loadTopLevelDirectories().catch(fallbackError => {
                console.error('[app.js] Fallback error in popstate:', fallbackError);
            });
        });
    });
    
    // Additional page visibility handler để đảm bảo consistency
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Page became visible again, check if we need to refresh home page
            const isAtHomePage = !location.hash && !currentFolder;
            const hasStaleState = isProcessingNavigation || isLoadingMore;
            
            if (isAtHomePage && hasStaleState) {
                console.log('[app.js] Page visible again with stale state, refreshing home');
                isProcessingNavigation = false;
                setIsLoadingMore(false);
                showDirectoryView();
                loadTopLevelDirectories().catch(error => {
                    console.error('[app.js] Error refreshing on visibility change:', error);
                });
            }
        }
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

// Dropdown Menu Handler
document.addEventListener('DOMContentLoaded', function() {
    initializeDropdownMenus();
});

function initializeDropdownMenus() {
    // Navigation dropdown
    const navToggle = document.getElementById('nav-dropdown-toggle');
    const navMenu = document.getElementById('nav-dropdown-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = navMenu.classList.contains('show');
            closeAllDropdowns();
            if (!isOpen) {
                navMenu.classList.add('show');
                navToggle.classList.add('active');
            }
        });
    }
    
    // User menu dropdown
    const userToggle = document.getElementById('user-menu-toggle');
    const userMenu = document.getElementById('user-menu-dropdown-menu');
    
    if (userToggle && userMenu) {
        userToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = userMenu.classList.contains('show');
            closeAllDropdowns();
            if (!isOpen) {
                userMenu.classList.add('show');
            }
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', closeAllDropdowns);
    
    // Close dropdowns when pressing Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllDropdowns();
        }
    });
}

function closeAllDropdowns() {
    const navMenu = document.getElementById('nav-dropdown-menu');
    const navToggle = document.getElementById('nav-dropdown-toggle');
    const userMenu = document.getElementById('user-menu-dropdown-menu');
    
    if (navMenu) navMenu.classList.remove('show');
    if (navToggle) navToggle.classList.remove('active');
    if (userMenu) userMenu.classList.remove('show');
}

// Export for global access
window.closeAllDropdowns = closeAllDropdowns;

function closeAllMenus() {
    closeAllDropdowns();
}

// Export switchToTab globally for admin panel menu access
window.switchToTab = function(tabId) {
    if (typeof switchToTab === 'function') {
        switchToTab(tabId);
    } else {
        console.error('[App] switchToTab function not found');
    }
};
  