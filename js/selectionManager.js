console.log('[selectionManager.js] Script start');

// External dependencies that might be needed (will be refined)
import { fetchDataApi } from './apiService.js';
import { API_BASE_URL } from './config.js';
import { showModalWithMessage } from './uiModal.js';
import { triggerDirectDownload, getCurrentImageListData, getCurrentFolderInfo, handleDownloadSelectedRequest } from './app.js';

// --- Module State ---
let isSelectModeActive = false;
const selectedImagePaths = new Set();

// --- DOM Element References (to be set via initialize) ---
let imageGridEl = null;
let toggleSelectModeButtonEl = null;
let downloadSelectedButtonEl = null;
let clearSelectionButtonEl = null;
let downloadAllLinkEl = null; // If its visibility is affected

// --- Callbacks & External Functions (to be set via initialize) ---
let onDownloadRequestInitiated = null; // e.g., to call addOrUpdateZipJob and startPanelPolling from app.js
let showModalCallback = null; // for displaying messages
let getCurrentFolderInfoCallback = null; // to get folder info for zip naming
let getPhotoswipeLightboxCallback = null; // to get photoswipe instance
let setPhotoswipeLightboxCallback = null; // to set photoswipe instance
let setupPhotoSwipeIfNeededCallback = null; // to re-initialize photoswipe

// --- Initialization ---
export function initializeSelectionMode(config) {
    console.log('[selectionManager.js] Initializing selection mode...');
    if (!config || !config.imageGridElement || !config.toggleSelectModeButtonElement || !config.downloadSelectedButtonElement || !config.clearSelectionButtonElement) {
        console.error('[selectionManager.js] Insufficient configuration provided for initialization.');
        return;
    }

    imageGridEl = config.imageGridElement;
    toggleSelectModeButtonEl = config.toggleSelectModeButtonElement;
    downloadSelectedButtonEl = config.downloadSelectedButtonElement;
    clearSelectionButtonEl = config.clearSelectionButtonElement;
    downloadAllLinkEl = config.downloadAllLinkElement; // Optional

    // Callbacks
    onDownloadRequestInitiated = config.onDownloadRequestInitiated;
    showModalCallback = config.showModalCallback;
    getCurrentFolderInfoCallback = config.getCurrentFolderInfoCallback;
    getPhotoswipeLightboxCallback = config.getPhotoswipeLightboxCallback;
    setPhotoswipeLightboxCallback = config.setPhotoswipeLightboxCallback;
    setupPhotoSwipeIfNeededCallback = config.setupPhotoSwipeIfNeededCallback;


    // Attach core event listeners
    if (toggleSelectModeButtonEl) {
        toggleSelectModeButtonEl.addEventListener('click', toggleMode);
    }
    if (downloadSelectedButtonEl) {
        downloadSelectedButtonEl.addEventListener('click', handleDownloadSelected);
    }
    if (clearSelectionButtonEl) {
        clearSelectionButtonEl.addEventListener('click', clearAllSelections);
    }
    if (imageGridEl) {
        imageGridEl.addEventListener('click', handleGridClick);
    }

    updateSelectionControlsUI(); // Initial UI state
    console.log('[selectionManager.js] Selection mode initialized.');
}

// --- Core Mode Toggle ---
function toggleMode() {
    if (!toggleSelectModeButtonEl) return;
    isSelectModeActive = !isSelectModeActive;
    document.body.classList.toggle('select-mode-active', isSelectModeActive);

    const psl = getPhotoswipeLightboxCallback ? getPhotoswipeLightboxCallback() : null;

    if (isSelectModeActive) {
        toggleSelectModeButtonEl.textContent = 'Thoát chọn';
        if (downloadAllLinkEl) downloadAllLinkEl.style.display = 'none';
        // Destroy PhotoSwipe if active
        if (psl) {
            console.log("[selectionManager.js] Destroying PhotoSwipe lightbox for select mode.");
            psl.destroy();
            if (setPhotoswipeLightboxCallback) setPhotoswipeLightboxCallback(null);
        }
    } else {
        toggleSelectModeButtonEl.textContent = 'Chọn ảnh';
        if (downloadAllLinkEl) downloadAllLinkEl.style.display = 'inline-block';
        clearAllSelections(); // Also updates button visibility
        // Re-initialize PhotoSwipe if image view is visible
        const imageView = document.getElementById('image-view'); // TODO: Avoid direct DOM access if possible, or pass from app.js
        if (imageView && imageView.style.display !== 'none' && setupPhotoSwipeIfNeededCallback) {
            console.log("[selectionManager.js] Re-initializing PhotoSwipe lightbox after exiting select mode.");
            setupPhotoSwipeIfNeededCallback();
        }
    }
    updateSelectionControlsUI();
}

// --- Event Handlers ---
function handleGridClick(event) {
    if (!isSelectModeActive || !imageGridEl) {
        return;
    }

    // Prevent default if the click is on something that might navigate (like an <a>)
    // but only if we're actually going to handle the selection.
    
    const clickedItemLink = event.target.closest('a'); // Standard way to find the item
    let visualElementToSelect = event.target.closest('.gallery-item, .image-item'); // More robust selector for the visual container

    if (!visualElementToSelect && clickedItemLink) { // If only <a> found, its parent might be the item
        visualElementToSelect = clickedItemLink.parentElement.closest('.gallery-item, .image-item') || clickedItemLink.parentElement;
    }
    if (!visualElementToSelect && event.target.matches('.gallery-item, .image-item')) { // Click directly on the item
        visualElementToSelect = event.target;
    }


    if (!visualElementToSelect) {
        console.log("[selectionManager.js] Grid click did not originate from a selectable item.", event.target);
        return;
    }
    
    // We need a reliable way to get the item's unique path.
    // Prefer data-source-path on the 'visualElementToSelect' or its 'a' child.
    let itemPath = visualElementToSelect.dataset.sourcePath;
    if (!itemPath && clickedItemLink) {
        itemPath = clickedItemLink.dataset.sourcePath;
    }
    // Fallback if path is on a different structure (less ideal)
    if(!itemPath && visualElementToSelect.querySelector('a[data-source-path]')) {
        itemPath = visualElementToSelect.querySelector('a[data-source-path]').dataset.sourcePath;
    }


    if (!itemPath) {
        console.warn('[selectionManager.js] Clicked item in select mode is missing a valid itemPath.', visualElementToSelect);
        return;
    }

    event.preventDefault(); // Prevent default action only if a valid item is clicked in select mode
    event.stopPropagation(); // Stop propagation to avoid unintended side effects

    const checkbox = visualElementToSelect.querySelector('.selection-checkbox');

    if (selectedImagePaths.has(itemPath)) {
        selectedImagePaths.delete(itemPath);
        visualElementToSelect.classList.remove('selected-item');
        if (checkbox) checkbox.checked = false;
    } else {
        selectedImagePaths.add(itemPath);
        visualElementToSelect.classList.add('selected-item');
        if (checkbox) checkbox.checked = true;
    }
    updateSelectionControlsUI();
}

// --- Public Actions ---
function clearAllSelections() {
    selectedImagePaths.clear();
    document.querySelectorAll('.gallery-item.selected-item, .image-item.selected-item').forEach(item => {
        item.classList.remove('selected-item');
        const checkbox = item.querySelector('.selection-checkbox');
        if (checkbox) checkbox.checked = false;
    });
    updateSelectionControlsUI();
}

export async function handleDownloadSelected() {
    if (selectedImagePaths.size === 0) {
        showModalWithMessage('Không có mục nào được chọn để tải về.');
        return;
    }

    const allItemsInView = getCurrentImageListData();
    if (!allItemsInView || allItemsInView.length === 0) {
        showModalWithMessage('Không thể lấy thông tin chi tiết của các mục đã chọn.');
        return;
    }

    const imagesToZipPaths = [];
    const videosToDownloadDetails = []; // Store URL and filename

    for (const path of selectedImagePaths) {
        const itemData = allItemsInView.find(item => item.path === path);
        if (itemData) {
            if (itemData.type === 'video') {
                videosToDownloadDetails.push({
                    url: `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`,
                    filename: itemData.name
                });
            } else {
                // Default to adding to ZIP (images, or other types)
                imagesToZipPaths.push(path);
            }
        } else {
            console.warn(`Could not find item data for selected path: ${path}. It will be ignored for download.`);
        }
    }

    let downloadActionTaken = false;

    if (videosToDownloadDetails.length > 0) {
        videosToDownloadDetails.forEach(video => {
            triggerDirectDownload(video.url, video.filename);
        });
        downloadActionTaken = true;
    }

    if (imagesToZipPaths.length > 0) {
        const currentFolderInfo = getCurrentFolderInfo();
        const folderName = currentFolderInfo ? currentFolderInfo.name : 'selected_items';
        const zipFilenameHint = `${folderName}_selected_${imagesToZipPaths.length}_items.zip`;
        
        handleDownloadSelectedRequest(imagesToZipPaths, zipFilenameHint);
        downloadActionTaken = true;
    }

    if (downloadActionTaken) {
        const messages = [];
        if (videosToDownloadDetails.length > 0) {
            messages.push(`${videosToDownloadDetails.length} video(s) are being downloaded directly.`);
        }
        if (imagesToZipPaths.length > 0) {
            messages.push(`A ZIP archive for ${imagesToZipPaths.length} item(s) is being prepared.`);
        }
        showModalWithMessage(messages.join(' '));
        
        clearAllSelections();
        // Consider if selection mode should always be toggled off or only if downloads were actually started.
        // For now, consistent with previous behavior if any action was taken.
        toggleMode();
    } else {
        showModalWithMessage('Không có mục hợp lệ nào được tìm thấy để tải về từ lựa chọn của bạn.');
    }
}

// --- UI Update Functions ---
function updateSelectionControlsUI() {
    if (!downloadSelectedButtonEl || !clearSelectionButtonEl) {
        // Even if toggle button is missing, body class and downloadAllLink can be updated
        // but core functionality relies on these buttons.
        // console.warn("[selectionManager.js] Cannot update selection controls UI: buttons not fully initialized.");
    }

    const count = selectedImagePaths.size;

    if (downloadSelectedButtonEl) {
        downloadSelectedButtonEl.textContent = `Tải ảnh đã chọn (${count})`;
        downloadSelectedButtonEl.style.display = (isSelectModeActive && count > 0) ? 'inline-block' : 'none';
    }
    if (clearSelectionButtonEl) {
        clearSelectionButtonEl.style.display = (isSelectModeActive && count > 0) ? 'inline-block' : 'none';
    }
    
    // If toggleSelectModeButtonEl is not available here (e.g. if app.js handles its text directly)
    // then app.js needs to call this function OR this module needs that button too.
    // For now, assuming toggleSelectModeButtonEl is set during init.
    if (toggleSelectModeButtonEl) {
         toggleSelectModeButtonEl.textContent = isSelectModeActive ? 'Thoát chọn' : 'Chọn ảnh';
    }

    // Visibility of downloadAllLink
    if (downloadAllLinkEl) {
        downloadAllLinkEl.style.display = isSelectModeActive ? 'none' : 'inline-block';
    }
}

// --- Getter for selected paths (if needed by other modules) ---
export function getSelectedFilePaths() {
    return Array.from(selectedImagePaths);
}

export function isSelectionModeActive() {
    return isSelectModeActive;
}

console.log('[selectionManager.js] Script loaded');

// Potential further refinements:
// - Make DOM element finding more robust if elements are not direct children or have dynamic IDs.
// - Consider event delegation patterns more deeply if performance becomes an issue with many items.
// - Add more specific error handling or logging. 