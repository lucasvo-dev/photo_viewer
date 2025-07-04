import { fetchDataApi } from './apiService.js';
import { API_BASE_URL } from './config.js';
import { 
    searchAbortController, setSearchAbortController,
    isHomepageMode, setIsHomepageMode,
    setCurrentPage,
    homepageFeaturedImages,
    currentImageList, totalImages
} from './state.js';
import { showPasswordPrompt } from './uiModal.js';
import { debounce } from './utils.js';

// DOM Elements (cache them for performance)
let directoryViewEl, searchInputEl, directoryListEl, searchPromptEl, clearSearchBtnEl, loadingIndicatorEl;

// Callbacks from app.js
let appNavigateToFolder = () => console.error('navigateToFolder not initialized in uiDirectoryView');
let appShowLoadingIndicator = () => console.error('showLoadingIndicator not initialized');
let appHideLoadingIndicator = () => console.error('hideLoadingIndicator not initialized');
let appLoadHomepageFeatured = () => console.error('loadHomepageFeatured not initialized in uiDirectoryView');

export function initializeDirectoryView(callbacks) {
    console.log('[uiDirectoryView] Initializing...');
    directoryViewEl = document.getElementById('directory-view');
    searchInputEl = callbacks.searchInputEl;
    directoryListEl = document.getElementById('directory-list');
    searchPromptEl = document.getElementById('search-prompt');
    clearSearchBtnEl = callbacks.clearSearchBtnEl;
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
        if (callbacks.loadHomepageFeatured) appLoadHomepageFeatured = callbacks.loadHomepageFeatured;
    }
    
    setupSearchHandlers();
}

function setupSearchHandlers() {
    console.log('[uiDirectoryView] Setting up search handlers...');
    if (!searchInputEl || !clearSearchBtnEl) {
        console.error('[uiDirectoryView] Search input or clear button not found for handlers.');
        return;
    }

    // Initially hide the clear button using visibility
    clearSearchBtnEl.style.visibility = 'hidden';

    const performSearch = debounce(async () => {
        console.log('[uiDirectoryView] performSearch triggered.');
        const term = searchInputEl.value.trim();
        
        // Switch between homepage and search modes
        const hasSearchTerm = term.length > 0;
        const shouldShowSearch = hasSearchTerm && term.length >= 2;
        
        if (hasSearchTerm && term.length < 2) {
            // Still in search mode but term too short
            if (searchAbortController) { searchAbortController.abort(); }
            if (searchPromptEl) searchPromptEl.textContent = 'Nhập ít nhất 2 ký tự để tìm kiếm.';
            if (directoryListEl) directoryListEl.innerHTML = '';
            
            // Switch to search mode but don't load yet
            if (isHomepageMode) {
                setIsHomepageMode(false);
                switchToSearchMode();
            }
            return;
        }
        
        if (shouldShowSearch) {
            // Switch to search mode and load results
            if (isHomepageMode) {
                setIsHomepageMode(false);
                switchToSearchMode();
            }
            loadTopLevelDirectories(term, false);
        } else {
            // No search term - switch back to homepage mode
            if (!isHomepageMode) {
                setIsHomepageMode(true);
                switchToHomepageMode();
            }
        }
    }, 350);

    searchInputEl.addEventListener('input', performSearch);
    clearSearchBtnEl.addEventListener('click', () => {
        searchInputEl.value = ''; 
        // clearSearchBtnEl.style.display = 'none'; 
        clearSearchBtnEl.style.visibility = 'hidden';
        performSearch(); 
    });
}

// Mode switching functions
function switchToSearchMode() {
    console.log('[uiDirectoryView] Switching to search mode');
    setIsHomepageMode(false);
    setCurrentPage(1); // Reset page for search mode
    const homepageGrid = document.getElementById('homepage-featured-grid');
    if (homepageGrid) homepageGrid.style.display = 'none';
    if (directoryListEl) directoryListEl.style.display = 'block';
}

function switchToHomepageMode() {
    console.log('[uiDirectoryView] Switching to homepage mode');
    setIsHomepageMode(true);
    setCurrentPage(1); // Reset page for homepage mode
    const homepageGrid = document.getElementById('homepage-featured-grid');
    if (homepageGrid) homepageGrid.style.display = 'block';
    if (directoryListEl) directoryListEl.style.display = 'none';
    
    // Only load homepage featured images if not already loaded
    // This prevents unnecessary reloads when switching from search back to homepage
    // Featured images will only reload on actual page refresh or first load
    const hasDataInMemory = homepageFeaturedImages.length > 0;
    const hasContentInDOM = homepageGrid && homepageGrid.children.length > 0;
    
    if (!hasDataInMemory || !hasContentInDOM) {
        console.log('[uiDirectoryView] Homepage featured images need loading. Data in memory:', hasDataInMemory, 'Content in DOM:', hasContentInDOM);
        appLoadHomepageFeatured();
    } else {
        console.log('[uiDirectoryView] Homepage featured images already cached, skipping reload. Count:', homepageFeaturedImages.length);
        
        // Update search prompt for cached homepage data
        const searchPromptEl = document.getElementById('search-prompt');
        if (searchPromptEl) {
            const currentCount = currentImageList.length;
            const totalCount = totalImages || currentCount;
            searchPromptEl.textContent = `Hiển thị ${currentCount}/${totalCount} ảnh nổi bật. Nhập từ khóa để tìm album.`;
            searchPromptEl.style.visibility = 'visible';
        }
    }
}

export function showDirectoryViewOnly() {
    if (directoryViewEl) directoryViewEl.style.display = 'block';
    // Any other specific UI elements within directory view can be handled here.
}

export function createDirectoryListItem(dirData, itemClickHandler) {
    const li = document.createElement('li');
    li.classList.add('list-item-fade-in');

    const a  = document.createElement('a');
    // Always set proper href for folder path để support "Mở tab mới"
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
        a.onclick = e => { 
            // Only preventDefault cho left click (button 0), để right click và middle click hoạt động bình thường
            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault(); 
                console.log(`[uiDirectoryView] Folder clicked via itemClickHandler: ${dirData.path}`);
                itemClickHandler(dirData.path); 
            }
            // For right clicks, ctrl+click, cmd+click, shift+click -> let browser handle naturally
        };
    }
    // For normal folders without itemClickHandler, default href behavior applies

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
        searchPromptEl.style.visibility = 'visible';
        return;
    }

    if (isSearchResult) {
        searchPromptEl.textContent = `Đã tìm thấy ${dirs.length} album khớp:`;
    } else {
        searchPromptEl.textContent = `Tìm thấy ${dirs.length} thư mục gốc.`;
    }
    searchPromptEl.style.visibility = 'visible';
    

    dirs.forEach(dir => {
        const listItem = createDirectoryListItem(dir, appNavigateToFolder);
        directoryListEl.appendChild(listItem);
    });
}

export async function loadTopLevelDirectories(searchTerm = null, suppressLoadingIndicator = false) { 
    console.log('[uiDirectoryView] loadTopLevelDirectories called with searchTerm:', searchTerm, 'suppressLoading:', suppressLoadingIndicator);
    if (!directoryListEl || !searchPromptEl || !searchInputEl || !clearSearchBtnEl || !loadingIndicatorEl) {
        console.error("[uiDirectoryView] Required elements not found for loadTopLevelDirectories");
        return;
    }

    // Only show loading indicator if not suppressed (khi không phải từ logo click)
    if (!suppressLoadingIndicator) {
        appShowLoadingIndicator('Đang tải danh sách album...'); // Show main loading indicator
    }
    searchPromptEl.style.visibility = 'hidden'; // Hide specific search prompt text while loading
    
    // Display a professional loading placeholder (tối ưu cho tốc độ)
    directoryListEl.innerHTML = `
        <div class="loading-placeholder">
            <div class="spinner-container">
                <div class="spinner"></div>
            </div>
            <p class="loading-text">Đang tải danh sách album</p>
            <p class="loading-subtext">Đang quét các thư mục...</p>
        </div>
    `;

    const isSearching = searchTerm !== null && searchTerm !== '';
    // searchInputEl.value = searchTerm || ''; // REMOVED - This was likely causing search input flicker
    // clearSearchBtnEl.style.display = isSearching ? 'inline-block' : 'none';
    clearSearchBtnEl.style.visibility = isSearching ? 'visible' : 'hidden';

    // Clean abort logic to prevent race conditions
    if (searchAbortController) {
        console.log('[uiDirectoryView] Aborting previous search controller');
        try {
            searchAbortController.abort(); // Abort previous search if any
        } catch (error) {
            console.warn('[uiDirectoryView] Error aborting previous controller:', error);
        }
        setSearchAbortController(null); // Clear immediately
    }
    
    // Small delay to ensure abort cleanup
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const newAbortController = new AbortController();
    setSearchAbortController(newAbortController);
    const { signal } = newAbortController;
    
    const params = {};
    if (searchTerm) {
        params.search = searchTerm;
    }

    try {
        console.log('[uiDirectoryView] Fetching top level directories with params:', params);
        const responseData = await fetchDataApi('list_files', params, { signal });
        console.log('[uiDirectoryView] API response for list_files:', responseData);

        // Clear the placeholder only after API response, before rendering or showing API error
        // directoryListEl.innerHTML = ''; // REMOVED THIS LINE - THIS WAS LIKELY CAUSING FLICKER

        if (responseData.status === 'error' && responseData.isAbortError) {
            console.log('[uiDirectoryView] Request aborted (likely due to newer request or navigation).');
            // Don't show error messages for aborted requests - this is normal behavior
            return; 
        }
        
        // Check if controller was aborted during the request
        if (signal.aborted) {
            console.log('[uiDirectoryView] Signal was aborted during request processing');
            return;
        }

        if (responseData.status === 'success') {
            let dirs = responseData.data.folders || [];
            // Client-side filtering might still be needed if server doesn't fully support search on root
            if (isSearching && dirs.length > 0 && searchTerm) { // Added searchTerm check for safety
                 // dirs = dirs.filter(dir => 
                 //    dir.name.toLowerCase().includes(searchTerm.toLowerCase())
                 // );
                 // Assuming server-side search is preferred if params.search is sent.
                 // If server returns all and client must filter, uncomment above.
            }
            renderTopLevelDirectories(dirs, isSearching);
            
            // Clear abort controller on successful completion
            setSearchAbortController(null);
        } else {
            console.error("[uiDirectoryView] Error loading albums:", responseData.message);
            directoryListEl.innerHTML = `<div class="error-placeholder">Lỗi tải danh sách album: ${responseData.message || 'Unknown error'}</div>`;
            searchPromptEl.textContent = 'Đã xảy ra lỗi khi tải album. Vui lòng thử lại.';
            searchPromptEl.style.visibility = 'visible';
        }
    } catch (error) {
        // Handle AbortError separately - it's normal behavior
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.log('[uiDirectoryView] Request was aborted:', error.message);
            return; // Don't show error UI for aborted requests
        }
        
        // This catches critical errors (e.g., network failure in fetchDataApi, or errors in processing logic)
        console.error("[uiDirectoryView] Critical error in loadTopLevelDirectories:", error);
        directoryListEl.innerHTML = `<div class="error-placeholder">Lỗi nghiêm trọng: ${error.message || 'Không rõ lỗi'}</div>`;
        searchPromptEl.textContent = 'Đã xảy ra lỗi nghiêm trọng. Vui lòng làm mới trang.';
        searchPromptEl.style.visibility = 'visible';
    } finally {
        // Only hide loading indicator if we showed it earlier
        if (!suppressLoadingIndicator) {
            appHideLoadingIndicator(); // Ensure main loading indicator is hidden regardless of outcome
        }
    }
} 