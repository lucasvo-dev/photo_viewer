export let currentFolder = '';
export let currentImageList = [];
export let allTopLevelDirs = [];
export let searchAbortController = null;
export let photoswipeLightbox = null;
export let isLoadingMore = false;
export let currentPage = 1;
export let totalImages = 0;

// DOM Elements references - these are more like UI state, but closely tied to app state
export let zipProgressBarContainerEl = null;
export let zipFolderNameEl = null;
export let zipOverallProgressEl = null;
export let zipProgressStatsTextEl = null;
export let generalModalOverlay = null;

// --- NEW: ZIP Jobs Panel State ---
export let zipJobsPanelContainerEl = null;
export let zipJobsListEl = null;

// NEW STATE for preloaded images
export let preloadedImages = [];
export function setPreloadedImages(images) {
    preloadedImages = Array.isArray(images) ? images : [];
    console.log('[state.js] Preloaded images set:', preloadedImages.length);
}

// Functions to update state if direct export of 'let' becomes problematic
// For now, direct export and modification is assumed to work with ES6 modules live bindings

export function setCurrentFolder(value) { currentFolder = value; }
export function setCurrentImageList(value) { currentImageList = value; }
export function setAllTopLevelDirs(value) { allTopLevelDirs = value; }
export function setSearchAbortController(value) { searchAbortController = value; }
export function setPhotoswipeLightbox(value) { photoswipeLightbox = value; }
export function setIsLoadingMore(val) {
    isLoadingMore = !!val;
    console.log('[state.js] isLoadingMore set to:', isLoadingMore);
}
export function setCurrentPage(val) {
    currentPage = Number(val) || 1;
    console.log('[state.js] currentPage set to:', currentPage);
}
export function setTotalImages(value) { totalImages = value; }

export function setZipProgressBarContainerEl(value) { zipProgressBarContainerEl = value; }
export function setZipFolderNameEl(value) { zipFolderNameEl = value; }
export function setZipOverallProgressEl(value) { zipOverallProgressEl = value; }
export function setZipProgressStatsTextEl(value) { zipProgressStatsTextEl = value; }
export function setGeneralModalOverlay(value) { generalModalOverlay = value; }

export function setZipUIDOMElements(container, folderName, progress, statsText) {
    // ... existing code ...
}

export function setZipJobPanelDOMElements(panelContainer, listContainer) {
    zipJobsPanelContainerEl = panelContainer;
    zipJobsListEl = listContainer;
    console.log("[state.js] ZIP Job Panel DOM elements set:", { panelContainer, listContainer });
}

// --- Search State ---
// ... existing code ...

export let currentAlbumPath = null;
export let masonryInstance = null;

export function setCurrentAlbumPath(path) {
    currentAlbumPath = path;
    console.log('[State] currentAlbumPath updated:', currentAlbumPath);
}

export function setMasonryInstance(instance) {
    masonryInstance = instance;
}

export function setPhotoSwipeLightbox(instance) {
    photoswipeLightbox = instance;
}

/**
 * Updates a specific item in the currentImageList.
 * @param {string} imagePath - The path of the image to update.
 * @param {object} updatedProps - An object containing properties to update (e.g., width, height).
 */
export function updateImageListItem(imagePath, updatedProps) {
    const imageIndex = currentImageList.findIndex(item => item.path === imagePath);
    if (imageIndex > -1) {
        currentImageList[imageIndex] = { ...currentImageList[imageIndex], ...updatedProps };
        console.log(`[State] Updated item ${imagePath} in currentImageList:`, currentImageList[imageIndex]);
    } else {
        console.warn(`[State] Item ${imagePath} not found in currentImageList for update.`);
    }
}

export let isCurrentlyPreloading = false;
export function setIsCurrentlyPreloading(val) {
    isCurrentlyPreloading = !!val;
    console.log('[state.js] isCurrentlyPreloading set to:', isCurrentlyPreloading);
} 