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
    zipDownloadTimerId, setZipDownloadTimerId,
    currentZipJobToken, setCurrentZipJobToken,
    zipPollingIntervalId, setZipPollingIntervalId,
    zipProgressBarContainerEl, setZipProgressBarContainerEl,
    zipFolderNameEl, setZipFolderNameEl,
    zipOverallProgressEl, setZipOverallProgressEl,
    zipProgressStatsTextEl, setZipProgressStatsTextEl,
    generalModalOverlay, setGeneralModalOverlay,
    zipJobsPanelContainerEl, zipJobsListEl, setZipJobPanelDOMElements,
    activeZipJobs, addOrUpdateZipJob, getZipJob, getAllZipJobs, removeZipJob, clearAllZipJobIntervals
} from './state.js';

// Import utils
import { debounce } from './utils.js';

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
    loadTopLevelDirectories
} from './uiDirectoryView.js';
import {
    initializeImageView,
    showImageViewOnly as showImageViewUI,
    hideImageViewOnly as hideImageViewUI,
    updateImageViewHeader,
    clearImageGrid,
    renderImageItems as renderImageItemsToGrid,
    createImageGroupIfNeeded,
    toggleLoadMoreButton
} from './uiImageView.js';
import {
    initializePhotoSwipeHandler,
    setupPhotoSwipeIfNeeded,
    openPhotoSwipeAtIndex
} from './photoswipeHandler.js';
import {
    initializeZipManager,
    handleDownloadZipAction as appHandleDownloadZipAction
} from './zipManager.js';

// ========================================
// === STATE VARIABLES                 ===
// ========================================
// All state variables moved to js/state.js

// ========================================
// === GLOBAL HELPER FUNCTIONS        ===
// ========================================

function getCurrentFolderInfo() {
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
    document.getElementById('directory-view').style.display = 'block';
    hideImageViewUI(); // Use imported hide function
    document.getElementById('image-view').style.display = 'none'; // Ensure main container is hidden
    document.getElementById('backButton').style.display = 'none';
    document.title = 'Thư viện Ảnh - Guustudio';
    if (location.hash) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    showDirectoryViewOnly(); 
}

function showImageView() { // This function now mainly toggles the main view containers
    console.log('[app.js] showImageView called.');
    document.getElementById('directory-view').style.display = 'none';
    document.getElementById('image-view').style.display = 'block';
    showImageViewUI(); // And calls the module to show its specific elements
    document.getElementById('backButton').style.display = 'inline-block';
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
    if (isLoadingMore) {
        console.log('[app.js] loadSubItems: isLoadingMore is true, returning.');
        return;
    }
    showLoadingIndicator();
    setCurrentFolder(folderPath);
    setCurrentPage(1);
    setCurrentImageList([]);
    // Clear existing content
    clearImageGrid(); // This now clears #image-grid and destroys Masonry
    const subfolderDisplayArea = document.getElementById('subfolder-display-area');
    if (subfolderDisplayArea) subfolderDisplayArea.innerHTML = ''; // Clear subfolder area too

    // alert('Attempting to load path: ' + folderPath); // REMOVED Temporary debug alert
    console.log(`[app.js] loadSubItems: Fetching list_files for path: ${folderPath}`);
    const responseData = await fetchDataApi('list_files', 
        { path: folderPath, page: currentPage, limit: IMAGES_PER_PAGE }
    );
    console.log(`[app.js] loadSubItems: API response for ${folderPath}:`, responseData);
    hideLoadingIndicator();
    if (responseData.status === 'password_required') {
        showPasswordPrompt(responseData.folder || folderPath);
        return;
    }
    if (responseData.status !== 'success') {
        showModalWithMessage('Lỗi tải album', `<p>${responseData.message || 'Không rõ lỗi'}</p>`, true);
        return;
    }
    const { folders: subfolders, files: initialImagesMetadata, pagination, current_dir_name: apiDirName } = responseData.data;
    const directoryName = apiDirName || folderPath.split('/').pop();
    console.log(`[app.js] loadSubItems: Directory name: ${directoryName}`);
    console.log('[app.js] loadSubItems: initialImagesMetadata:', initialImagesMetadata); // Log the metadata
    document.title = `Album: ${directoryName} - Guustudio`;
    updateImageViewHeader(directoryName);
    const fetchedTotal = pagination ? pagination.total_items : (initialImagesMetadata ? initialImagesMetadata.length : 0);
    setTotalImages(fetchedTotal || 0);
    let contentRendered = false;
    if (subfolders && subfolders.length) {
        const ul = document.createElement('ul');
        ul.className = 'directory-list-styling subfolder-list';
        subfolders.forEach(sf => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#?folder=${encodeURIComponent(sf.path)}`;
            a.dataset.dir = sf.path;
            const imgThumb = document.createElement('img');
            imgThumb.className = 'folder-thumbnail';
            const thumbnailUrl = sf.thumbnail 
                ? `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(sf.thumbnail)}&size=150` 
                : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            imgThumb.src = thumbnailUrl;
            imgThumb.alt = sf.name;
            imgThumb.loading = 'lazy';
            imgThumb.onerror = () => { imgThumb.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; imgThumb.alt = 'Lỗi thumbnail'; };
            const span = document.createElement('span');
            span.textContent = sf.name;
            if (sf.protected) { span.innerHTML += sf.authorized ? ' <span class="lock-icon unlocked" title="Đã mở khóa">🔓</span>' : ' <span class="lock-icon locked" title="Yêu cầu mật khẩu">🔒</span>'; }
            a.append(imgThumb, span);
            if (sf.protected && !sf.authorized) { 
                a.onclick = e => { 
                    e.preventDefault(); 
                    showPasswordPrompt(sf.path); 
                }; 
            }
            // For non-protected folders, no explicit onclick is needed here.
            // The browser will navigate to a.href, which triggers handleUrlHash.
            li.appendChild(a);
            ul.appendChild(li);
        });
        // document.getElementById('image-grid').appendChild(ul); // OLD location
        if (subfolderDisplayArea) subfolderDisplayArea.appendChild(ul); // NEW location
        contentRendered = true;
        if (initialImagesMetadata && initialImagesMetadata.length) {
            const hr = document.createElement('hr');
            hr.className = 'folder-image-divider';
            // document.getElementById('image-grid').appendChild(hr); // OLD location for divider
            if (subfolderDisplayArea) subfolderDisplayArea.appendChild(hr); // Append divider after subfolders
        }
    }
    createImageGroupIfNeeded(); // This creates .image-group inside #image-grid
    if (initialImagesMetadata && initialImagesMetadata.length) {
        console.log('[app.js] loadSubItems: initialImagesMetadata IS valid and has length. About to call renderImageItemsToGrid.');
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

    console.log('[app.js] loadSubItems: About to call showImageView().');
    showImageView();
    toggleLoadMoreButton(currentImageList.length < totalImages);
    if (currentImageList.length >= totalImages && !contentRendered) {
         // document.getElementById('image-grid').innerHTML = '<p class="info-text">Album này trống.</p>';
         const targetEmptyMessageContainer = subfolderDisplayArea && subfolderDisplayArea.hasChildNodes() ? subfolderDisplayArea : document.getElementById('image-grid');
         if (targetEmptyMessageContainer) targetEmptyMessageContainer.innerHTML = '<p class="info-text">Album này trống.</p>';

    }
    if (!contentRendered && currentImageList.length === 0) {
        // document.getElementById('image-grid').innerHTML = '<p class="info-text">Album này trống.</p>';
        const targetEmptyMessageContainer = subfolderDisplayArea && subfolderDisplayArea.hasChildNodes() ? subfolderDisplayArea : document.getElementById('image-grid');
        if (targetEmptyMessageContainer) targetEmptyMessageContainer.innerHTML = '<p class="info-text">Album này trống.</p>';
    }
}

// --- Load More Images ---
async function loadMoreImages() {
    if (isLoadingMore || (currentPage * IMAGES_PER_PAGE >= totalImages && totalImages > 0)) {
        return;
    }
    setIsLoadingMore(true);
    setCurrentPage(currentPage + 1);
    showLoadingIndicator();
    const responseData = await fetchDataApi('list_files', 
        { path: currentFolder, page: currentPage, limit: IMAGES_PER_PAGE }
    );
    if (responseData.status === 'success' && responseData.data.files) {
        const newImagesMetadata = responseData.data.files;
        if (newImagesMetadata.length > 0) {
            setCurrentImageList(currentImageList.concat(newImagesMetadata));
            renderImageItemsToGrid(newImagesMetadata, true);
            setupPhotoSwipeIfNeeded(); 
        } 
        toggleLoadMoreButton(currentImageList.length < totalImages);
    } else {
        showModalWithMessage('Lỗi tải thêm ảnh', `<p>${responseData.message || 'Không rõ lỗi'}</p>`, true);
        toggleLoadMoreButton(false);
    }
    setIsLoadingMore(false);
}

// --- Navigate Function (handles hash update) ---
function navigateToFolder(folderPath) {
    console.log(`[app.js] navigateToFolder called with path: ${folderPath}`);
    location.hash = `#?folder=${encodeURIComponent(folderPath)}`;
}

// --- Back button --- 
document.getElementById('backButton').onclick = () => {
    // Use hash change to navigate back
    history.back(); 
};

// --- Hash Handling ---
function handleUrlHash() {
    console.log("[app.js] handleUrlHash: Hash changed to:", location.hash); // Existing log, made it more specific
    const hash = location.hash;
    if (hash.startsWith('#?folder=')) {
        try {
            const encodedFolderName = hash.substring('#?folder='.length);
            const folderRelativePath = decodeURIComponent(encodedFolderName);
            console.log(`[app.js] handleUrlHash: Decoded folder path: ${folderRelativePath}`);
            if (folderRelativePath && !folderRelativePath.includes('..')) {
                console.log('[app.js] handleUrlHash: Path is valid, calling loadSubItems.');
                loadSubItems(folderRelativePath);
                return true; 
            }
        } catch (e) { 
            console.error("[app.js] Error parsing URL hash:", e);
            history.replaceState(null, '', ' '); 
        }
    }
    console.log('[app.js] handleUrlHash: No valid folder in hash, showing directory view.');
    showDirectoryView();
    loadTopLevelDirectories(); // This is the imported one
    return false;
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
        openPhotoSwipe: openPhotoSwipeAtIndex,
        loadMoreImages: loadMoreImages 
    });
    initializePhotoSwipeHandler();
    initializeZipManager();
    
    document.getElementById('backButton').onclick = () => { history.back(); };
    // LoadMoreBtn listener is now in uiImageView.js

    if (!handleUrlHash()) { /* ... */ }
    window.addEventListener('hashchange' , handleUrlHash);

    // --- NEW: Initialize ZIP Jobs Panel Elements ---
    const panelContainer = document.getElementById('zip-jobs-panel-container');
    const listContainer = document.getElementById('zip-jobs-list');
    if (panelContainer && listContainer) {
        setZipJobPanelDOMElements(panelContainer, listContainer);
    } else {
        console.error("[app.js] Failed to find ZIP Job Panel DOM elements.");
    }
    // --- END NEW ---

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
  