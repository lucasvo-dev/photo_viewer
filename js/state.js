export let currentFolder = '';
export let currentImageList = []; 
export let allTopLevelDirs = [];
export let searchAbortController = null; 
export let photoswipeLightbox = null; 
export let isLoadingMore = false; 
export let currentPage = 1;
export let totalImages = 0;
export let zipDownloadTimerId = null;
export let currentZipJobToken = null;
export let zipPollingIntervalId = null;

// DOM Elements references - these are more like UI state, but closely tied to app state
export let zipProgressBarContainerEl = null;
export let zipFolderNameEl = null;
export let zipOverallProgressEl = null;
export let zipProgressStatsTextEl = null;
export let generalModalOverlay = null; 

// --- NEW: ZIP Jobs Panel State ---
export let zipJobsPanelContainerEl = null;
export let zipJobsListEl = null;
export let activeZipJobs = {}; // Stores jobToken: { data, folderName, pollingIntervalId (optional) }

// Functions to update state if direct export of 'let' becomes problematic
// For now, direct export and modification is assumed to work with ES6 modules live bindings

export function setCurrentFolder(value) { currentFolder = value; }
export function setCurrentImageList(value) { currentImageList = value; }
export function setAllTopLevelDirs(value) { allTopLevelDirs = value; }
export function setSearchAbortController(value) { searchAbortController = value; }
export function setPhotoswipeLightbox(value) { photoswipeLightbox = value; }
export function setIsLoadingMore(value) { isLoadingMore = value; }
export function setCurrentPage(value) { currentPage = value; }
export function setTotalImages(value) { totalImages = value; }
export function setZipDownloadTimerId(value) { zipDownloadTimerId = value; }
export function setCurrentZipJobToken(value) { currentZipJobToken = value; }
export function setZipPollingIntervalId(value) { zipPollingIntervalId = value; }

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

// Functions to manage activeZipJobs
export function addOrUpdateZipJob(jobToken, jobDetails) {
    activeZipJobs[jobToken] = { ...activeZipJobs[jobToken], ...jobDetails };
    // Example jobDetails: { jobData, folderDisplayName, pollingIntervalId (if managing per job) }
    console.log("[state.js] addOrUpdateZipJob:", jobToken, activeZipJobs[jobToken]);
}

export function getZipJob(jobToken) {
    return activeZipJobs[jobToken];
}

export function getAllZipJobs() {
    return activeZipJobs;
}

export function removeZipJob(jobToken) {
    if (activeZipJobs[jobToken] && activeZipJobs[jobToken].pollingIntervalId) {
        clearInterval(activeZipJobs[jobToken].pollingIntervalId);
    }
    delete activeZipJobs[jobToken];
    console.log("[state.js] removeZipJob:", jobToken, "Remaining jobs:", Object.keys(activeZipJobs).length);
}

export function clearAllZipJobIntervals() {
    for (const token in activeZipJobs) {
        if (activeZipJobs[token].pollingIntervalId) {
            clearInterval(activeZipJobs[token].pollingIntervalId);
            activeZipJobs[token].pollingIntervalId = null; // Clear the ID
        }
    }
    console.log("[state.js] Cleared all zip job polling intervals.");
}

// --- Search State ---
// ... existing code ... 