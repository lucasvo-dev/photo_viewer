import { currentImageList } from './state.js';
import { API_BASE_URL } from './config.js';

// DOM Elements
let imageViewEl, currentDirectoryNameEl, imageGridEl, loadMoreContainerEl, loadMoreBtnEl;
let masonryInstance = null; // Variable to store the Masonry instance

// Callbacks
let appOpenPhotoSwipe = (index) => console.error('openPhotoSwipe not initialized in uiImageView');
let appLoadMoreImages = () => console.error('loadMoreImages not initialized in uiImageView');

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
        // If clearing and there was a masonry instance, ensure it's handled (though clearImageGrid should do this)
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
        const div = document.createElement('div');
        div.className = 'image-item'; // Masonry will use this class as its itemSelector

        const anchor = document.createElement('a');
        anchor.className = 'photoswipe-trigger';
        const fullImagePath = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(imgData.path)}`;
        anchor.href = fullImagePath;
        anchor.dataset.pswpSrc = fullImagePath;
        const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
        if (imageIndex !== -1) {
            anchor.dataset.pswpIndex = imageIndex;
        }
        anchor.onclick = (e) => {
            e.preventDefault();
            if (imageIndex !== -1) {
                appOpenPhotoSwipe(imageIndex);
            } else {
                const fallbackIndex = currentImageList.findIndex(item => item.name === imgData.name);
                if (fallbackIndex !== -1) {
                    appOpenPhotoSwipe(fallbackIndex);
                } else {
                    console.error("Could not find image index for:", imgData.name, imgData.path);
                }
            }
        };
        const img = document.createElement('img');
        const thumbSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=750`; // Reverted to 750 from 300
        img.src = thumbSrc; 
        img.alt = imgData.name;
        img.loading = 'lazy';
        img.onerror = () => { 
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            img.alt = 'Lỗi tải ảnh xem trước'; 
        };
        anchor.appendChild(img);
        div.appendChild(anchor);
        // END of existing image creation logic, now append to fragment
        fragment.appendChild(div);
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