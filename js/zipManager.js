import {
    currentZipJobToken, setCurrentZipJobToken,
    zipPollingIntervalId, setZipPollingIntervalId,
    zipProgressBarContainerEl, zipFolderNameEl, zipOverallProgressEl, zipProgressStatsTextEl,
    zipJobsPanelContainerEl, zipJobsListEl, activeZipJobs,
    addOrUpdateZipJob, removeZipJob, getAllZipJobs, clearAllZipJobIntervals
} from './state.js';
import { ACTIVE_ZIP_JOB_KEY, API_BASE_URL } from './config.js';
import { fetchDataApi } from './apiService.js';
import { showModalWithMessage } from './uiModal.js';
import { closePhotoSwipeIfActive } from './photoswipeHandler.js';

// --- NEW: Single Polling Interval for the Job Panel ---
let panelPollingIntervalId = null;
const PANEL_POLLING_INTERVAL_MS = 1000; // Poll every 1 second for all active jobs

export function initializeZipManager() {
    console.log("[zipManager.js] ZIP Manager Initialized.");
    // Attempt to load and render any jobs stored in sessionStorage from previous page load
    // This is a simple way to persist jobs across refreshes, more robust would be localStorage and job expiry.
    const persistedJobs = getPersistedZipJobs();
    if (persistedJobs && Object.keys(persistedJobs).length > 0) {
        for (const token in persistedJobs) {
            addOrUpdateZipJob(token, persistedJobs[token]);
        }
        renderZipJobsPanel();
        startPanelPolling(); 
    }
}

// --- Functions to manage job persistence (simple version) ---
const PERSISTED_ZIP_JOBS_KEY = 'persistedGalleryZipJobs';
function saveZipJobsToSession() {
    try {
        const jobsToPersist = {};
        const currentJobs = getAllZipJobs();
        for (const token in currentJobs) {
            // Only persist jobs that are not in a final state, or recently completed/failed
            if (currentJobs[token].jobData && 
                (currentJobs[token].jobData.status === 'pending' || 
                 currentJobs[token].jobData.status === 'processing' || 
                 (Date.now() - (currentJobs[token].lastUpdated || 0) < 300000))) { // Persist final states for 5 mins
                jobsToPersist[token] = {
                    jobData: currentJobs[token].jobData,
                    folderDisplayName: currentJobs[token].folderDisplayName,
                    lastUpdated: currentJobs[token].lastUpdated
                };
            }
        }
        sessionStorage.setItem(PERSISTED_ZIP_JOBS_KEY, JSON.stringify(jobsToPersist));
    } catch (e) {
        console.warn("Could not save ZIP jobs to sessionStorage", e);
    }
}

function getPersistedZipJobs() {
    try {
        const storedJobs = sessionStorage.getItem(PERSISTED_ZIP_JOBS_KEY);
        return storedJobs ? JSON.parse(storedJobs) : null;
    } catch (e) {
        console.warn("Could not retrieve ZIP jobs from sessionStorage", e);
        return null;
    }
}

// --- Render Functions for the new ZIP Job Panel ---
function renderZipJobEntry(jobToken, jobDetails) {
    const { jobData, folderDisplayName } = jobDetails;
    if (!jobData) return ''; // Should not happen if jobDetails is well-formed

    let percent = 0;
    let statusText = jobData.status || 'Đang chờ...';
    let currentFileText = '';

    if (jobData.status === 'processing') {
        if (jobData.total_files && jobData.total_files > 0) {
            percent = (jobData.processed_files / jobData.total_files) * 100;
            statusText = `${jobData.processed_files || 0}/${jobData.total_files} files (${percent.toFixed(0)}%)`;
        } else {
            percent = 0;
            statusText = `Đang xử lý... (${jobData.processed_files || 0}/? files)`;
        }
        if (jobData.current_file_processing) {
            currentFileText = `<span class="zip-job-currentfile">Đang nén: ${jobData.current_file_processing}</span>`;
        }
    } else if (jobData.status === 'pending') {
        statusText = 'Đang chờ trong hàng đợi...';
    } else if (jobData.status === 'completed') {
        percent = 100;
        statusText = 'Hoàn thành!';
    } else if (jobData.status === 'failed') {
        statusText = `Thất bại: ${jobData.error_message || 'Lỗi không xác định'}`;
    }

    // Sanitize folderDisplayName and statusText before inserting as HTML if they can contain user input or unexpected characters
    // For now, assuming they are safe or will be properly handled by textContent if set directly.

    const entryHTML = `
        <div class="zip-job-info">
            <span class="zip-job-foldername" title="${folderDisplayName}">${folderDisplayName}</span>
            <span class="zip-job-status">${statusText}</span>
        </div>
        ${currentFileText ? `<div style="font-size:0.8em; color:#8b949e; margin-bottom:3px;">${currentFileText}</div>` : ''}
        <progress class="zip-job-progressbar" value="${percent}" max="100"></progress>
        <div class="zip-job-actions">
            ${jobData.status === 'completed' ? 
                `<a href="${API_BASE_URL}?action=download_final_zip&token=${jobToken}" class="button zip-job-download-button" download>Tải về</a>` : ''}
            ${jobData.status === 'failed' ? 
                `<button class="zip-job-retry-button" data-job-token="${jobToken}" data-folder-path="${jobData.source_path}" data-folder-name="${folderDisplayName}">Thử lại</button>` : ''}
            ${(jobData.status === 'completed' || jobData.status === 'failed') ? 
                `<button class="zip-job-dismiss-button" data-job-token="${jobToken}">Bỏ qua</button>` : 
                `<button class="zip-job-cancel-button" data-job-token="${jobToken}">Hủy</button>`}
        </div>
    `;
    return entryHTML;
}

export function renderZipJobsPanel() {
    if (!zipJobsListEl || !zipJobsPanelContainerEl) return;

    const jobs = getAllZipJobs();
    const jobTokens = Object.keys(jobs);

    if (jobTokens.length === 0) {
        zipJobsPanelContainerEl.style.display = 'none';
        document.body.classList.remove('zip-panel-active');
        if (zipProgressBarContainerEl) zipProgressBarContainerEl.style.display = 'none'; // Hide old bar too
        return;
    }

    zipJobsListEl.innerHTML = ''; // Clear existing entries
    jobTokens.sort((a,b) => (jobs[b].jobData?.created_at || 0) - (jobs[a].jobData?.created_at || 0)); // Show newest first

    jobTokens.forEach(token => {
        const jobDetails = jobs[token];
        if (jobDetails && jobDetails.jobData) { // Ensure jobData exists
            const entryEl = document.createElement('div');
            entryEl.classList.add('zip-job-entry');
            entryEl.setAttribute('data-job-token', token);
            entryEl.innerHTML = renderZipJobEntry(token, jobDetails);
            zipJobsListEl.appendChild(entryEl);
        }
    });

    // Add event listeners for action buttons (retry, dismiss, cancel)
    // This should be done carefully to avoid duplicate listeners.
    // It's often better to add listeners to zipJobsListEl and use event delegation.
    zipJobsListEl.querySelectorAll('.zip-job-retry-button').forEach(button => {
        button.onclick = (e) => {
            const token = e.target.dataset.jobToken;
            const folderPath = e.target.dataset.folderPath;
            const folderName = e.target.dataset.folderName;
            removeZipJob(token); // Remove old job from state
            renderZipJobsPanel(); // Re-render to remove old entry
            handleDownloadZipAction(folderPath, folderName); // Request a new job
        };
    });
    zipJobsListEl.querySelectorAll('.zip-job-dismiss-button').forEach(button => {
        button.onclick = (e) => {
            removeZipJob(e.target.dataset.jobToken);
            renderZipJobsPanel(); // Re-render
            if (Object.keys(getAllZipJobs()).length === 0) stopPanelPolling(); // Stop polling if no jobs left
        };
    });
    zipJobsListEl.querySelectorAll('.zip-job-cancel-button').forEach(button => {
        button.onclick = (e) => {
            const tokenToCancel = e.target.dataset.jobToken;
            // For now, cancel just removes from UI. True cancel needs API.
            console.log(`[zipManager] UI Cancel requested for job ${tokenToCancel}`);
            removeZipJob(tokenToCancel);
            renderZipJobsPanel();
            if (Object.keys(getAllZipJobs()).length === 0) stopPanelPolling();
            // TODO: Implement API call to actually attempt to cancel server-side processing if desired
        };
    });

    zipJobsPanelContainerEl.style.display = 'block';
    document.body.classList.add('zip-panel-active');
    // Hide the old single progress bar if the panel is active and has jobs
    if (zipProgressBarContainerEl) zipProgressBarContainerEl.style.display = 'none'; 
    saveZipJobsToSession(); // Persist jobs when panel is rendered
}

// --- Modified Polling Logic ---
export function startPanelPolling() {
    if (panelPollingIntervalId) {
        clearInterval(panelPollingIntervalId);
    }
    console.log("[zipManager] Starting panel polling.");
    const pollAction = async () => {
        const jobs = getAllZipJobs();
        let activeJobExists = false;
        console.log("[PanelPoll] Running pollAction. Current jobs in state:", JSON.parse(JSON.stringify(jobs)));

        for (const token in jobs) {
            const jobDetails = jobs[token];
            // Log current state of this job before attempting fetch
            console.log(`[PanelPoll] Checking job ${token}:`, JSON.parse(JSON.stringify(jobDetails)));

            if (jobDetails && jobDetails.jobData && 
                (jobDetails.jobData.status === 'pending' || jobDetails.jobData.status === 'processing')) {
                activeJobExists = true;
                console.log(`[PanelPoll] Job ${token} is active (${jobDetails.jobData.status}). Fetching update...`);
                try {
                    const response = await fetchDataApi('get_zip_status', { token: token });
                    console.log(`[PanelPoll] API response for get_zip_status (token ${token}):`, JSON.parse(JSON.stringify(response)));

                    if (response && response.status === 'success' && response.data) {
                        const updatedJobDataFromApi = response.data;
                        console.log(`[PanelPoll] Successfully fetched update for ${token}. New API data:`, JSON.parse(JSON.stringify(updatedJobDataFromApi)));
                        addOrUpdateZipJob(token, { 
                            jobData: updatedJobDataFromApi, 
                            folderDisplayName: jobDetails.folderDisplayName, // Keep existing display name
                            lastUpdated: Date.now() 
                        });
                        // Log state immediately after update for this job
                        console.log(`[PanelPoll] State for job ${token} after addOrUpdateZipJob:`, JSON.parse(JSON.stringify(getAllZipJobs()[token])));
                    } else {
                        console.warn(`[PanelPoll] Failed to get status or bad response for job ${token}:`, response);
                    }
                } catch (error) {
                    console.error(`[PanelPoll] Error fetching status for job ${token}:`, error);
                }
            } else {
                console.log(`[PanelPoll] Job ${token} is NOT active (status: ${jobDetails?.jobData?.status}). Skipping API fetch for it.`);
            }
        }
        console.log("[PanelPoll] Finished fetching updates for all relevant jobs. Re-rendering panel...");
        renderZipJobsPanel(); // Re-render panel with updated data
        if (!activeJobExists && Object.keys(jobs).length > 0) {
            // No jobs are actively processing/pending, but there are jobs (e.g. completed/failed)
            // We can stop polling if all jobs are in a final state for a while.
            // For simplicity now, we stop if no PENDING/PROCESSING jobs are found.
            // More advanced: stop if all jobs are final AND haven't been updated for X minutes.
            console.log("[zipManager] No active (pending/processing) jobs found. Stopping panel polling.");
            stopPanelPolling();
        } else if (Object.keys(jobs).length === 0) {
             console.log("[zipManager] No jobs in queue. Stopping panel polling.");
            stopPanelPolling();
        }
    };

    pollAction(); // Initial fetch and render
    panelPollingIntervalId = setInterval(pollAction, PANEL_POLLING_INTERVAL_MS);
}

function stopPanelPolling() {
    if (panelPollingIntervalId) {
        clearInterval(panelPollingIntervalId);
        panelPollingIntervalId = null;
        console.log("[zipManager] Panel polling stopped.");
    }
}

// --- Original functions (to be adapted or removed) ---
// displayZipProgressBar, updateZipProgressBar, hideZipProgressBar might be deprecated or used only by the new panel logic if needed.
// For now, they are unused if the panel is the primary UI for ZIP progress.

/*
export function displayZipProgressBar(folderDisplayName, statusText = 'Đang khởi tạo...') { ... }
export function updateZipProgressBar(jobData, folderDisplayNameFromJob) { ... }
export function hideZipProgressBar() { ... }
*/

// --- MODIFIED: handleDownloadZipAction ---
export async function handleDownloadZipAction(folderPath, folderName) {
    if (!folderPath || !folderName) {
        showModalWithMessage('Lỗi yêu cầu ZIP', '<p>Đường dẫn hoặc tên thư mục bị thiếu.</p>', true);
        return;
    }
    
    // Hide the old progress bar immediately if using the new panel system
    if (zipProgressBarContainerEl) zipProgressBarContainerEl.style.display = 'none';

    // Add to jobs list with an initial 'requesting' or 'pending_api' state
    // The actual jobToken isn't known yet, so we use a temporary ID or handle after API call.
    // For now, we'll wait for the API call to get the token.

    const formData = new FormData();
    formData.append('path', folderPath);

    try {
        const result = await fetchDataApi('request_zip', {}, {
            method: 'POST',
            body: formData
        });

        if (result.status === 'success' && result.data && result.data.job_token) {
            const initialJobData = result.data; // job_token, and now status should be here
            const jobToken = initialJobData.job_token; // Declare once from initialJobData

            if (!jobToken) {
                console.error("[zipManager] request_zip response missing job_token:", initialJobData);
                showModalWithMessage("Lỗi: Không nhận được mã công việc từ máy chủ.", "Lỗi yêu cầu ZIP");
                return;
            }

            // Ensure initialJobData has a status, defaulting to 'pending' if not provided by request_zip (e.g., for a brand new job)
            if (!initialJobData.status) {
                initialJobData.status = 'pending';
                console.warn(`[zipManager] request_zip response for ${jobToken} did not include status. Defaulting to 'pending'. Response data:`, initialJobData);
            }

            addOrUpdateZipJob(jobToken, { 
                jobData: initialJobData, 
                folderDisplayName: folderName, 
                lastUpdated: Date.now() 
            });
            
            renderZipJobsPanel(); // Show the job in the panel
            startPanelPolling(); // Ensure polling is active

            // The old modal for immediately completed jobs can be removed if the panel handles it.
            // Or, keep it for very quick completions as an extra notification.
            if (initialJobData.status === 'completed') {
                // Job already completed (e.g. recent cached job from API)
                // Panel will show it as completed. An extra modal can be shown if desired.
                showModalWithMessage(
                    'Tải ZIP hoàn thành (có sẵn)',
                    `<p>File ZIP cho thư mục <strong>${folderName}</strong> đã được tạo trước đó và sẵn sàng để tải.</p><p>Kiểm tra bảng trạng thái nén ZIP để tải về.</p>`,
                    false,
                    true
                );
            } 
            // No need to call old pollZipStatus here, panel poller will handle it.

        } else {
            const errorMessage = result.message || result.data?.error || 'Không thể gửi yêu cầu tạo ZIP. Vui lòng thử lại.';
            showModalWithMessage('Lỗi yêu cầu ZIP', `<p>${errorMessage}</p>`, true);
            // No specific job to remove from panel if request_zip itself failed before returning a token.
        }
    } catch (error) {
        console.error("[zipManager] Error in handleDownloadZipAction during fetchDataApi for request_zip:", error);
        showModalWithMessage('Lỗi kết nối', '<p>Không thể kết nối đến máy chủ để yêu cầu tạo ZIP.</p>', true);
    }
}

// --- MODIFIED: pollZipStatus (Original single job poller - to be deprecated/removed) ---
// The new startPanelPolling and its pollAction effectively replace this for multiple jobs.
// Keeping it commented out for reference during transition.
/*
export async function pollZipStatus(jobToken, folderDisplayNameForUI) {
    console.log(`[zipManager.js] OLD pollZipStatus called for token: ${jobToken}, UI Name: ${folderDisplayNameForUI}`);
    // ... (rest of the old function) ...
}
*/

// Remove setActiveZipJob, getActiveZipJob, clearActiveZipJob as panel manages multiple jobs
// setCurrentZipJobToken also becomes less relevant with panel polling.
// These are related to the old single-progress bar system.

// Clean up old polling interval if it exists from previous logic
if (zipPollingIntervalId) {
    clearInterval(zipPollingIntervalId);
    setZipPollingIntervalId(null);
}
clearAllZipJobIntervals(); // Clear any intervals stored in job state from old system.

console.log("[zipManager.js] Module loaded. Old progress bar elements:", {
    zipProgressBarContainerEl, zipFolderNameEl, zipOverallProgressEl, zipProgressStatsTextEl
});

// The export for `pollZipStatus` can be removed if it's fully replaced.
// For now, it is commented out. 