import { currentImageList } from './state.js';
import { API_BASE_URL } from './config.js';

// DOM Elements
let imageViewEl, currentDirectoryNameEl, imageGridEl, loadMoreContainerEl, loadMoreBtnEl;
let masonryInstance = null; // Variable to store the Masonry instance

// Callbacks
let appOpenPhotoSwipe = (index) => console.error('openPhotoSwipe not initialized in uiImageView');
let appLoadMoreImages = () => console.error('loadMoreImages not initialized in uiImageView');

// NEW INTERNAL HELPER FUNCTION
function createImageItemElement(imgData, imageIndex, openPhotoSwipeCallback) {
    const div = document.createElement('div');
    div.className = 'image-item'; // Masonry will use this class as its itemSelector
    div.dataset.sourcePath = imgData.path;
    div.dataset.itemType = imgData.type || 'image'; // Store item type

    const anchor = document.createElement('a');
    anchor.className = 'photoswipe-trigger';
    // For images, fullImagePath is the image itself. For videos, this will be the video file.
    const mediaPath = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(imgData.path)}`;
    anchor.href = mediaPath; 
    // data-pswp-src will be handled by photoswipeHandler based on type
    // anchor.dataset.pswpSrc = mediaPath; 

    if (imageIndex !== -1) {
        anchor.dataset.pswpIndex = imageIndex;
    }

    anchor.onclick = (e) => {
        e.preventDefault();
        if (imageIndex !== -1) {
            openPhotoSwipeCallback(imageIndex);
        } else {
            const freshIndex = currentImageList.findIndex(item => item.path === imgData.path);
            if (freshIndex !== -1) {
                openPhotoSwipeCallback(freshIndex);
            } else {
                console.error("Could not find media index for (onclick):", imgData.name, imgData.path);
            }
        }
    };

    const img = document.createElement('img');
    // Thumbnail path is the same for images and videos (get_thumbnail handles it)
    const thumbSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=750`;
    img.src = thumbSrc;
    img.alt = imgData.name;
    img.loading = 'lazy';
    img.onerror = () => {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.alt = 'Lỗi tải ảnh xem trước';
    };

    anchor.appendChild(img);

    // Add play icon overlay for video items
    if (imgData.type === 'video') {
        const playIcon = document.createElement('div');
        playIcon.className = 'play-icon-overlay';
        playIcon.innerHTML = '&#9658;'; // Unicode play symbol (▶)
        anchor.appendChild(playIcon);
        div.classList.add('video-item'); // Add class for specific video item styling
    }

    div.appendChild(anchor);
    return div;
}
// END NEW INTERNAL HELPER FUNCTION

export function initializeImageView(callbacks) {
    console.log('[uiImageView] initializeImageView called.');
    imageViewEl = document.getElementById('image-view');
    currentDirectoryNameEl = document.getElementById('current-directory-name');
    imageGridEl = document.getElementById('image-grid');
    loadMoreContainerEl = document.getElementById('load-more-container');
    loadMoreBtnEl = document.getElementById('loadMoreBtn');

    if (!imageViewEl || !currentDirectoryNameEl || !imageGridEl || !loadMoreContainerEl || !loadMoreBtnEl) {
        console.error("One or more image view elements are missing!");
        return;
    }

    if (callbacks) {
        if (callbacks.openPhotoSwipe) appOpenPhotoSwipe = callbacks.openPhotoSwipe;
        if (callbacks.loadMoreImages) appLoadMoreImages = callbacks.loadMoreImages;
    }

    loadMoreBtnEl.addEventListener('click', () => appLoadMoreImages());
}

export function showImageViewOnly() {
    console.log('[uiImageView] showImageViewOnly called.');
    if (imageViewEl) {
        console.log('[uiImageView] imageViewEl found, setting display to block.');
        imageViewEl.style.display = 'block';
    } else {
        console.error('[uiImageView] imageViewEl NOT found in showImageViewOnly.');
    }
}

export function hideImageViewOnly() {
    if (imageViewEl) imageViewEl.style.display = 'none';
}

export function updateImageViewHeader(directoryName) {
    if (currentDirectoryNameEl) {
        currentDirectoryNameEl.textContent = `Album: ${directoryName}`;
    }
}

export function clearImageGrid() {
    if (imageGridEl) {
        imageGridEl.innerHTML = ''; // Clear ALL content from #image-grid
    }
    // Destroy Masonry instance if it exists
    if (masonryInstance) {
        try {
            masonryInstance.destroy();
        } catch (e) {
            console.warn("Error destroying Masonry instance:", e);
        }
        masonryInstance = null;
    }
}

export function renderImageItems(imagesDataToRender, append = false) {
    console.log('[uiImageView] renderImageItems called. Appending:', append, 'Data:', imagesDataToRender);
    if (!imageGridEl) {
        console.error('[uiImageView] imageGridEl NOT found in renderImageItems.');
        return;
    }
    
    let imageGroupContainer = imageGridEl.querySelector('.image-group'); 
    if (!imageGroupContainer) {
        console.error('[uiImageView] .image-group container NOT found in renderImageItems. This should have been created by createImageGroupIfNeeded.');
        return; // Cannot proceed without the group container
    }

    if (!imagesDataToRender || imagesDataToRender.length === 0) {
        console.log('[uiImageView] No imagesDataToRender provided or empty.');
        if (!append && imageGroupContainer) imageGroupContainer.innerHTML = '<p class="info-text">Không có ảnh trong album này.</p>';
        if (!append && masonryInstance) {
            try {
                masonryInstance.destroy();
            } catch (e) {
                console.warn("Error destroying Masonry instance on empty render:", e);
            }
            masonryInstance = null;
        }
        return;
    }

    const fragment = document.createDocumentFragment();

    imagesDataToRender.forEach((imgData) => {
        // Determine the correct index from the global currentImageList
        const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
        
        const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe);
        fragment.appendChild(imageElement);
    });

    imageGroupContainer.appendChild(fragment); // Append all new items at once

    // Initialize or update Masonry after images are loaded
    if (typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') {
        const imgLoad = imagesLoaded(imageGroupContainer);

        imgLoad.on('always', function() {
            if (!masonryInstance) {
                masonryInstance = new Masonry(imageGroupContainer, {
                    itemSelector: '.image-item',
                    columnWidth: '.image-item',
                    gutter: 16,
                    percentPosition: true,
                });
            } else {
                masonryInstance.reloadItems();
                masonryInstance.layout();
            }
            // Additional layout for desktop after a short delay
            setTimeout(function() {
                if (masonryInstance) {
                    masonryInstance.layout();
                }
            }, 150); // 150ms delay
        });

        // Layout on progress for smoother loading as images appear
        imgLoad.on('progress', function() {
            if (masonryInstance) {
                masonryInstance.layout();
            }
        });

    } else {
        if (typeof Masonry === 'undefined') console.error("Masonry library not found!");
        if (typeof imagesLoaded === 'undefined') console.error("imagesLoaded library not found!");
    }
}

export function createImageGroupIfNeeded(){
    console.log('[uiImageView] createImageGroupIfNeeded called.');
    if (!imageGridEl) {
        console.error('[uiImageView] imageGridEl NOT found in createImageGroupIfNeeded.');
        return;
    }
    if (!imageGridEl.querySelector('.image-group')){
        console.log('[uiImageView] No .image-group found, creating one.');
        const imageGroupContainer = document.createElement('div');
        imageGroupContainer.className = 'image-group';
        imageGridEl.appendChild(imageGroupContainer);
    }
}

export function toggleLoadMoreButton(show) {
    if (loadMoreContainerEl) {
        loadMoreContainerEl.style.display = show ? 'block' : 'none';
    }
} 