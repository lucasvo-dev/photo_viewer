import { fetchDataApi } from './apiService.js';
import { API_BASE_URL } from './config.js';
import { searchAbortController, setSearchAbortController } from './state.js';
import { showPasswordPrompt } from './uiModal.js';
import { debounce } from './utils.js';

// DOM Elements (cache them for performance)
let directoryViewEl, searchInputEl, directoryListEl, searchPromptEl, clearSearchBtnEl, loadingIndicatorEl;

// Callbacks from app.js
let appNavigateToFolder = () => console.error('navigateToFolder not initialized in uiDirectoryView');
let appShowLoadingIndicator = () => console.error('showLoadingIndicator not initialized');
let appHideLoadingIndicator = () => console.error('hideLoadingIndicator not initialized');

export function initializeDirectoryView(callbacks) {
    console.log('[uiDirectoryView] Initializing...');
    directoryViewEl = document.getElementById('directory-view');
    searchInputEl = document.getElementById('searchInput');
    directoryListEl = document.getElementById('directory-list');
    searchPromptEl = document.getElementById('search-prompt');
    clearSearchBtnEl = document.getElementById('clearSearch');
    loadingIndicatorEl = document.getElementById('loading-indicator'); // Assuming it exists

    console.log('[uiDirectoryView] DOM Elements:', {
        directoryViewEl, searchInputEl, directoryListEl, searchPromptEl, clearSearchBtnEl, loadingIndicatorEl
    });

    if (!directoryViewEl || !searchInputEl || !directoryListEl || !searchPromptEl || !clearSearchBtnEl || !loadingIndicatorEl) {
        console.error("[uiDirectoryView] One or more directory view elements are missing!");
        return;
    }

    if (callbacks) {
        if (callbacks.navigateToFolder) appNavigateToFolder = callbacks.navigateToFolder;
        if (callbacks.showLoadingIndicator) appShowLoadingIndicator = callbacks.showLoadingIndicator;
        if (callbacks.hideLoadingIndicator) appHideLoadingIndicator = callbacks.hideLoadingIndicator;
    }
    
    setupSearchHandlers();
}

function setupSearchHandlers() {
    console.log('[uiDirectoryView] Setting up search handlers...');
    if (!searchInputEl || !clearSearchBtnEl) {
        console.error('[uiDirectoryView] Search input or clear button not found for handlers.');
        return;
    }

    const performSearch = debounce(async () => {
        console.log('[uiDirectoryView] performSearch triggered.');
        const term = searchInputEl.value.trim();
        if (term.length > 0 && term.length < 2) {
            if (searchAbortController) { searchAbortController.abort(); }
            if (searchPromptEl) searchPromptEl.textContent = 'Nhập ít nhất 2 ký tự để tìm kiếm.';
            if (directoryListEl) directoryListEl.innerHTML = '';
            return;
        }
        loadTopLevelDirectories(term || null);
    }, 350);

    searchInputEl.addEventListener('input', performSearch);
    clearSearchBtnEl.addEventListener('click', () => {
        searchInputEl.value = ''; 
        clearSearchBtnEl.style.display = 'none'; 
        performSearch(); 
    });
}

export function showDirectoryViewOnly() {
    if (directoryViewEl) directoryViewEl.style.display = 'block';
    // Any other specific UI elements within directory view can be handled here.
}

export function createDirectoryListItem(dirData, itemClickHandler) {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = `#?folder=${encodeURIComponent(dirData.path)}`;
    a.dataset.dir = dirData.path;

    const img = document.createElement('img');
    img.className = 'folder-thumbnail';
    const thumbnailUrl = dirData.thumbnail
        ? `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(dirData.thumbnail)}&size=150`
        : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.src = thumbnailUrl;
    img.alt = dirData.name;
    img.loading = 'lazy';
    img.onerror = () => {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.alt = 'Lỗi thumbnail';
    };

    const span = document.createElement('span');
    span.textContent = dirData.name;

    if (dirData.protected) {
        span.innerHTML += dirData.authorized
            ? ' <span class="lock-icon unlocked" title="Đã mở khóa">🔓</span>'
            : ' <span class="lock-icon locked" title="Yêu cầu mật khẩu">🔒</span>';
    }
    a.append(img, span);

    if (dirData.protected && !dirData.authorized) {
        a.onclick = e => { e.preventDefault(); showPasswordPrompt(dirData.path); };
    } else if (itemClickHandler) {
        a.onclick = e => { e.preventDefault(); itemClickHandler(dirData.path); };
    }
    // If no itemClickHandler, the default href behavior will apply for non-protected items.

    li.appendChild(a);
    return li;
}

export function renderTopLevelDirectories(dirs, isSearchResult = false) {
    console.log('[uiDirectoryView] renderTopLevelDirectories called with:', dirs, 'isSearchResult:', isSearchResult);
    if (!directoryListEl || !searchPromptEl) {
        console.error("[uiDirectoryView] Directory list or search prompt element not found in renderTopLevelDirectories");
        return;
    }
    directoryListEl.innerHTML = ''; 

    if (!dirs || dirs.length === 0) {
        if (isSearchResult) {
            searchPromptEl.textContent = 'Không tìm thấy album nào khớp với tìm kiếm của bạn.';
        } else {
            searchPromptEl.textContent = 'Không có album nào để hiển thị.';
        }
        searchPromptEl.style.display = 'block';
        return;
    }

    if (isSearchResult) {
        searchPromptEl.textContent = `Đã tìm thấy ${dirs.length} album khớp:`;
    } else {
        searchPromptEl.textContent = `Tìm thấy ${dirs.length} thư mục gốc.`;
    }
    searchPromptEl.style.display = 'block';
    

    dirs.forEach(dir => {
        const listItem = createDirectoryListItem(dir, appNavigateToFolder);
        directoryListEl.appendChild(listItem);
    });
}

export async function loadTopLevelDirectories(searchTerm = null) { 
    console.log('[uiDirectoryView] loadTopLevelDirectories called with searchTerm:', searchTerm);
    if (!directoryListEl || !searchPromptEl || !searchInputEl || !clearSearchBtnEl || !loadingIndicatorEl) {
        console.error("[uiDirectoryView] Required elements not found for loadTopLevelDirectories");
        return;
    }

    appShowLoadingIndicator();
    searchPromptEl.style.display = 'none';
    directoryListEl.innerHTML = '<div class="loading-placeholder">Đang tải danh sách album...</div>';

    const isSearching = searchTerm !== null && searchTerm !== '';
    searchInputEl.value = searchTerm || '';
    clearSearchBtnEl.style.display = isSearching ? 'inline-block' : 'none';

    if (searchAbortController) {
        searchAbortController.abort();
    }
    const newAbortController = new AbortController();
    setSearchAbortController(newAbortController);
    const { signal } = newAbortController;
    
    const params = {};
    if (searchTerm) {
        params.search = searchTerm;
    }
    console.log('[uiDirectoryView] Fetching top level directories with params:', params);
    const responseData = await fetchDataApi('list_files', params, { signal });
    console.log('[uiDirectoryView] API response for list_files:', responseData);

    appHideLoadingIndicator();
    directoryListEl.innerHTML = ''; 

    if (responseData.status === 'error' && responseData.isAbortError) {
        console.log('Search aborted by user.');
        return; 
    }

    if (responseData.status === 'success') {
        let dirs = responseData.data.folders || [];
        if (isSearching) {
            dirs = dirs.filter(dir => 
                dir.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        // if (!isSearching) { setAllTopLevelDirs(dirs); } // Consider if allTopLevelDirs state is still needed
        renderTopLevelDirectories(dirs, isSearching);
    } else {
        console.error("Lỗi tải album:", responseData.message);
        directoryListEl.innerHTML = `<div class="error-placeholder">Lỗi tải danh sách album: ${responseData.message}</div>`;
        searchPromptEl.textContent = 'Đã xảy ra lỗi. Vui lòng thử lại.';
        searchPromptEl.style.display = 'block';
    }
} 