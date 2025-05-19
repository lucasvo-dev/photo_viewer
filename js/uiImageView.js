import { currentImageList } from './state.js';
import { API_BASE_URL } from './config.js';
import { refreshCurrentPhotoSwipeSlideIfNeeded } from './photoswipeHandler.js';

// DOM Elements
let imageViewEl, currentDirectoryNameEl, imageGridEl, loadMoreContainerEl, loadMoreBtnEl;
let masonryInstance = null; // Variable to store the Masonry instance

// Callbacks
let appOpenPhotoSwipe = (index) => console.error('openPhotoSwipe not initialized in uiImageView');

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
    const thumbSrc750 = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=750`;
    img.src = thumbSrc750; // Initially request 750px
    img.alt = imgData.name;
    img.loading = 'lazy';

    // Function to update image source and potentially re-layout Masonry
    const updateImageAndLayout = (newSrc) => {
        img.src = newSrc;
        // If Masonry is active, it might need to re-layout if image dimensions change significantly
        // This is a simple way; more robust would be to update Masonry item data and then layout
        if (masonryInstance && typeof imagesLoaded !== 'undefined') {
            imagesLoaded(img, function() {
                masonryInstance.layout();
            });
        }
    };

    // Check for placeholder and start polling if necessary
    const checkAndPollThumbnail = async () => {
        try {
            const response = await fetch(thumbSrc750, { method: 'HEAD' });
            const thumbnailStatusHeader = response.headers.get('x-thumbnail-status');

            if (thumbnailStatusHeader && thumbnailStatusHeader.includes('placeholder')) {
                const parts = thumbnailStatusHeader.split(';').reduce((acc, part) => {
                    const [key, value] = part.trim().split('=');
                    acc[key] = value;
                    return acc;
                }, {});

                const actualSize = parseInt(parts['actual-size'], 10);
                const targetSize = parseInt(parts['target-size'], 10);
                
                // If a placeholder was served (e.g. 150px instead of 750px)
                if (actualSize < targetSize) {
                    const actualSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=${actualSize}`;
                    // Update to the placeholder src immediately if not already set (though HEAD request means src is already placeholder)
                    if (img.src !== actualSrc) { // This check might be redundant if HEAD was on thumbSrc750
                         // img.src = actualSrc; // src is already the placeholder effectively
                    }
                    pollForFinalThumbnail(imgData.path, targetSize, img, updateImageAndLayout);
                }
            }
            // If no header or not a placeholder, the initially set src (thumbSrc750) is correct.
        } catch (error) {
            console.error(`[uiImageView] Error checking thumbnail status for ${imgData.path}:`, error);
            // Fallback: img.src is already set to thumbSrc750, browser will show broken if that fails
        }
    };

    img.onload = () => {
        // If the loaded image source is a placeholder (e.g. 150px), polling should have been started by checkAndPollThumbnail
        // If it's the final 750px image, nothing more to do here for polling.
        // This onload might fire for the placeholder first, then for the final image.
    };

    img.onerror = () => {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.alt = 'Lỗi tải ảnh xem trước';
    };

    // Call the check after a brief delay to allow the initial src to be processed by the browser
    // and avoid too many HEAD requests firing simultaneously on page load.
    // setTimeout(checkAndPollThumbnail, 100); 
    // More robust: use img.onload and check if the loaded src is what we expect, or check headers on first load.
    // For now, we'll check headers when the image element is created.
    // Let's use an event listener for 'load' on the image to check headers,
    // but only once, so we remove it after the first successful load.
    const handleInitialLoad = async () => {
        img.removeEventListener('load', handleInitialLoad); // Check only on the first load
        img.removeEventListener('error', handleInitialError); // also remove error if load succeeds
        await checkAndPollThumbnail();
    };
    const handleInitialError = () => {
        img.removeEventListener('load', handleInitialLoad);
        img.removeEventListener('error', handleInitialError);
        // Standard onerror will take over
    };
    img.addEventListener('load', handleInitialLoad);
    img.addEventListener('error', handleInitialError);

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
    loadMoreContainerEl = document.getElementById('load-more-container'); // This will be our spinner container

    if (!imageViewEl || !currentDirectoryNameEl || !imageGridEl || !loadMoreContainerEl) { // Removed loadMoreBtnEl from check
        console.error("One or more image view elements are missing! Check for image-view, current-directory-name, image-grid, load-more-container.");
        return;
    }

    if (callbacks) {
        if (callbacks.openPhotoSwipe) appOpenPhotoSwipe = callbacks.openPhotoSwipe;
    }

    // Style the container for a spinner - this is a placeholder, actual styling via CSS
    if (loadMoreContainerEl) {
        loadMoreContainerEl.innerHTML = '<div class="loading-spinner">Loading...</div>'; // Add a spinner div with text
        loadMoreContainerEl.style.textAlign = 'center';
        loadMoreContainerEl.style.padding = '20px';
        loadMoreContainerEl.style.display = 'none'; // Initially hidden
    }
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
        // Clear polling intervals for all images being removed
        const imagesWithPollers = imageGridEl.querySelectorAll('img[data-poll-interval-id]');
        imagesWithPollers.forEach(img => {
            const intervalId = parseInt(img.dataset.pollIntervalId, 10);
            if (!isNaN(intervalId)) {
                clearInterval(intervalId);
            }
            delete img.dataset.pollIntervalId;
        });
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
    const newElements = []; // Array to store references to the new item elements

    imagesDataToRender.forEach((imgData) => {
        const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
        const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe);
        fragment.appendChild(imageElement);
        newElements.push(imageElement); // Store reference
    });

    imageGroupContainer.appendChild(fragment); // Append all new items at once

    if (typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') {
        // Important: Use imagesLoaded on the specific new elements we just added,
        // to avoid re-processing already loaded images from previous batches.
        const imgLoad = imagesLoaded(newElements);

        imgLoad.on('always', function() {
            if (!masonryInstance) {
                masonryInstance = new Masonry(imageGroupContainer, {
                    itemSelector: '.image-item',
                    columnWidth: '.image-item',
                    gutter: 16,
                    percentPosition: true,
                    // Consider transitionDuration: 0 if CSS transitions handle all animation
                    // transitionDuration: 0 
                });
            } else {
                masonryInstance.appended(newElements); // Inform Masonry about new items
                // No, reloadItems is better if we aren't hiding/showing with 'appended'
                // masonryInstance.reloadItems(); 
            }
            // It might be better to use masonry.appended(newElements) then masonry.layout()
            // For now, reloadItems() and layout() covers adding items. 
            // If performance is an issue with many items, `appended` can be more efficient.
            masonryInstance.reloadItems(); 
            masonryInstance.layout();

            // After Masonry has laid out the items, make them visible
            // Use a slight delay to ensure layout calculation is complete before triggering CSS transition
            setTimeout(() => {
                newElements.forEach(el => {
                    el.classList.add('image-item--visible');
                });
            }, 50); // 50ms delay, adjust if needed, or remove if direct class add works smoothly

        });

        // Optional: if you want items to appear one by one as they load (more complex)
        // imgLoad.on('progress', function(instance, image) {
        //     if (masonryInstance) {
        //         masonryInstance.layout();
        //     }
        //     // If you want individual fade-in on progress:
        //     // const item = image.img.closest('.image-item');
        //     // if (item) item.classList.add('image-item--visible');
        // });

        // Keeping the original progress layout for now, as it helps Masonry adjust.
        // The final reveal is handled by the 'always' callback.
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

export function toggleInfiniteScrollSpinner(show) {
    if (loadMoreContainerEl) {
        loadMoreContainerEl.style.display = show ? 'block' : 'none';
    }
}

// Thumbnail polling interval (milliseconds)
const THUMBNAIL_POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_ATTEMPTS = 12; // Max 1 minute of polling (12 * 5s)

async function pollForFinalThumbnail(imagePath, targetSize, imgElement, updateCallback) {
    let attempts = 0;
    const targetThumbnailUrl = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imagePath)}&size=${targetSize}`;

    const intervalId = setInterval(async () => {
        attempts++;
        if (attempts > MAX_POLL_ATTEMPTS) {
            clearInterval(intervalId);
            console.warn(`[uiImageView] Max polling attempts reached for ${imagePath} size ${targetSize}.`);
            return;
        }

        try {
            const response = await fetch(targetThumbnailUrl, { method: 'HEAD', cache: 'no-cache' });
            const thumbnailStatusHeader = response.headers.get('x-thumbnail-status');
            
            if (response.ok && (!thumbnailStatusHeader || !thumbnailStatusHeader.includes('placeholder'))) {
                clearInterval(intervalId);
                console.log(`[uiImageView] Final ${targetSize}px thumbnail ready for ${imagePath}. Updating src.`);
                updateCallback(targetThumbnailUrl); // Update the img src in the grid and relayout Masonry
                refreshCurrentPhotoSwipeSlideIfNeeded(imagePath);
            } else if (response.ok && thumbnailStatusHeader && thumbnailStatusHeader.includes('placeholder')) {
                console.log(`[uiImageView] Polling for ${imagePath} (size ${targetSize}): Still placeholder.`);
            } else if (!response.ok) {
                console.warn(`[uiImageView] Error polling for ${imagePath} (size ${targetSize}): Status ${response.status}`);
            }
        } catch (error) {
            console.error(`[uiImageView] Error during polling for ${imagePath} size ${targetSize}:`, error);
        }
    }, THUMBNAIL_POLL_INTERVAL);

    imgElement.dataset.pollIntervalId = intervalId.toString();
} 