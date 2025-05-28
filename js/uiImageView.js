import { currentImageList, updateImageListItem } from './state.js';
import { API_BASE_URL, fetchDataApi } from './config.js';
import { refreshCurrentPhotoSwipeSlideIfNeeded } from './photoswipeHandler.js';

// DOM Elements
let imageViewEl, currentDirectoryNameEl, imageGridEl, loadMoreContainerEl, loadMoreBtnEl;
let masonryInstance = null; // Variable to store the Masonry instance

// Intersection Observer for lazy loading
let imageObserver = null;

// Callbacks
let appOpenPhotoSwipe = (index) => console.error('openPhotoSwipe not initialized in uiImageView');

// === SKELETON LOADING UTILITIES ===
function createSkeletonElement(aspectRatio = '1 / 1') {
    const skeleton = document.createElement('div');
    skeleton.className = 'image-skeleton';
    skeleton.style.aspectRatio = aspectRatio;
    
    // Add some debug info
    console.log(`[uiImageView] Created skeleton with aspect ratio: ${aspectRatio}`);
    
    return skeleton;
}

function getOptimalThumbnailSize() {
    const connection = navigator.connection;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.innerWidth;
    
    // API only accepts sizes: [150, 750]
    // Always use 150 for thumbnails, 750 is for large images
    const baseSize = 150; // Use standard API size
    
    console.log(`[uiImageView] Optimal thumbnail size: ${baseSize} (API standard)`);
    return baseSize;
}

function getAspectRatioFromMetadata(imgData) {
    // Check for width and height in the metadata
    if (imgData.width && imgData.height && imgData.width > 0 && imgData.height > 0) {
        const ratio = `${imgData.width} / ${imgData.height}`;
        console.log(`[uiImageView] Calculated aspect ratio for ${imgData.name}: ${ratio} (${imgData.width}x${imgData.height})`);
        return ratio;
    }
    
    // Fallback to square aspect ratio
    console.log(`[uiImageView] Using default square aspect ratio for ${imgData.name} (no metadata: width=${imgData.width}, height=${imgData.height})`);
    return '1 / 1'; // Default square
}

// === INTERSECTION OBSERVER SETUP ===
function initializeImageObserver() {
    if (imageObserver) return; // Already initialized
    
    imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const placeholder = entry.target;
                const imgData = JSON.parse(placeholder.dataset.imgData);
                
                // Replace skeleton with actual image
                loadImageWithPriority(placeholder, imgData);
                imageObserver.unobserve(placeholder);
            }
        });
    }, {
        rootMargin: '50px 0px', // Start loading 50px before entering viewport
        threshold: 0.1
    });
}

function loadImageWithPriority(skeletonElement, imgData) {
    // Create the actual image item
    const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
    const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, true);
    
    // Replace skeleton with image element
    skeletonElement.parentNode.replaceChild(imageElement, skeletonElement);
    
    // Trigger layout update for Masonry
    if (masonryInstance) {
        // Use imagesLoaded for the new element
        if (typeof imagesLoaded !== 'undefined') {
            imagesLoaded(imageElement).on('always', () => {
                masonryInstance.reloadItems();
                masonryInstance.layout();
            });
        } else {
            // Fallback without imagesLoaded
            setTimeout(() => {
                masonryInstance.reloadItems();
                masonryInstance.layout();
            }, 100);
        }
    }
}

// NEW INTERNAL HELPER FUNCTION
function createImageItemElement(imgData, imageIndex, openPhotoSwipeCallback, isLazyLoaded = false) {
    const div = document.createElement('div');
    div.className = 'image-item'; // Masonry will use this class as its itemSelector
    div.dataset.sourcePath = imgData.path;
    div.dataset.itemType = imgData.type || 'image'; // Store item type
    
    // Set aspect ratio if available
    const aspectRatio = getAspectRatioFromMetadata(imgData);
    div.style.aspectRatio = aspectRatio;

    const anchor = document.createElement('a');
    anchor.className = 'photoswipe-trigger';
    // For images, fullImagePath is the image itself. For videos, this will be the video file.
    const mediaPath = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(imgData.path)}`;
    anchor.href = mediaPath; 

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
    
    // Use optimal thumbnail size
    const optimalSize = getOptimalThumbnailSize();
    
    // Simplified URL construction - test with direct format
    const thumbSrc = `api.php?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=${optimalSize}`;
    
    console.log(`[uiImageView] Creating image for ${imgData.name}:`);
    console.log(`[uiImageView] - Optimal size: ${optimalSize}`);
    console.log(`[uiImageView] - Image path: ${imgData.path}`);
    console.log(`[uiImageView] - Encoded path: ${encodeURIComponent(imgData.path)}`);
    console.log(`[uiImageView] - Final thumbnail src: ${thumbSrc}`);
    console.log(`[uiImageView] - Image data:`, imgData);
    
    // TEMPORARY: Test with a manual URL to debug 400 error
    console.log(`[uiImageView] - Manual test URL: api.php?action=get_thumbnail&path=main%2F12G%20THPT%20PHU%20XUAN%2FMAY%201%2FGuukyyeu%20(1).jpg&size=150`);
    
    img.alt = imgData.name;
    
    // Progressive loading setup
    if (isLazyLoaded) {
        // For lazy loaded images, load immediately
        img.src = thumbSrc;
        img.loading = 'eager'; // Load immediately since it's already in viewport
        console.log(`[uiImageView] Set lazy loaded image src: ${thumbSrc}`);
    } else {
        // For images loaded on initial page load, use lazy loading
        img.loading = 'lazy';
        img.src = thumbSrc;
        console.log(`[uiImageView] Set initial image src: ${thumbSrc}`);
    }

    // Add loading classes for progressive enhancement
    img.classList.add('img-placeholder');
    console.log(`[uiImageView] Added img-placeholder class to: ${imgData.name}`);

    // Function to update image source and potentially re-layout Masonry
    const updateImageAndLayout = (newSrc) => {
        img.src = newSrc;
        // If Masonry is active, it might need to re-layout if image dimensions change significantly
        if (masonryInstance && typeof imagesLoaded !== 'undefined') {
            imagesLoaded(img, function() {
                masonryInstance.layout();
            });
        }
    };

    // Check for placeholder and start polling if necessary
    const checkAndPollThumbnail = async () => {
        try {
            const response = await fetch(thumbSrc, { method: 'HEAD' });
            const thumbnailStatusHeader = response.headers.get('x-thumbnail-status');

            if (thumbnailStatusHeader && thumbnailStatusHeader.includes('placeholder')) {
                const parts = thumbnailStatusHeader.split(';').reduce((acc, part) => {
                    const [key, value] = part.trim().split('=');
                    acc[key] = value;
                    return acc;
                }, {});

                const actualSize = parseInt(parts['actual-size'], 10);
                const targetSize = parseInt(parts['target-size'], 10);
                
                // If a placeholder was served (e.g. 150px instead of requested size)
                if (actualSize < targetSize) {
                    const actualSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=${actualSize}`;
                    pollForFinalThumbnail(imgData.path, targetSize, img, updateImageAndLayout);
                }
            }
        } catch (error) {
            console.error(`[uiImageView] Error checking thumbnail status for ${imgData.path}:`, error);
        }
    };

    img.onload = () => {
        console.log(`[uiImageView] Image loaded successfully: ${imgData.name}`);
        // Remove placeholder class and add loaded class
        img.classList.remove('img-placeholder');
        img.classList.add('img-loaded');
        
        // Make the container visible with animation
        setTimeout(() => {
            div.classList.add('image-item--visible');
            console.log(`[uiImageView] Made image visible: ${imgData.name}, classes:`, div.className);
        }, 50);
    };

    img.onerror = async () => {
        console.error(`[uiImageView] Image failed to load: ${imgData.name}, src: ${img.src}`);
        
        // Try to get more detailed error information
        try {
            const response = await fetch(img.src, { method: 'HEAD' });
            console.error(`[uiImageView] Thumbnail HTTP status: ${response.status} ${response.statusText}`);
            console.error(`[uiImageView] Response headers:`, [...response.headers.entries()]);
        } catch (fetchError) {
            console.error(`[uiImageView] Fetch error for debugging:`, fetchError);
        }
        
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.alt = 'Lỗi tải ảnh xem trước';
        img.classList.remove('img-placeholder');
        img.classList.add('img-loaded');
        div.classList.add('image-item--visible');
        console.log(`[uiImageView] Set fallback image for: ${imgData.name}`);
    };

    // Set up thumbnail polling after initial load
    const handleInitialLoad = async () => {
        img.removeEventListener('load', handleInitialLoad);
        img.removeEventListener('error', handleInitialError);
        await checkAndPollThumbnail();
    };
    
    const handleInitialError = () => {
        img.removeEventListener('load', handleInitialLoad);
        img.removeEventListener('error', handleInitialError);
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
    
    console.log(`[uiImageView] Created image item element for ${imgData.name}:`);
    console.log(`[uiImageView] - Element classes: ${div.className}`);
    console.log(`[uiImageView] - Element style.aspectRatio: ${div.style.aspectRatio}`);
    console.log(`[uiImageView] - Image src: ${img.src}`);
    console.log(`[uiImageView] - Image classes: ${img.className}`);
    
    // TEMPORARY: Commented out force visibility for debugging
    // setTimeout(() => {
    //     div.classList.add('image-item--visible');
    //     console.log(`[uiImageView] Force added visible class to: ${imgData.name}`);
    // }, 100);
    
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

    // Initialize Intersection Observer for lazy loading
    console.log('[uiImageView] About to initialize Intersection Observer...');
    initializeImageObserver();
    console.log('[uiImageView] Intersection Observer initialized:', !!imageObserver);

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

    // Determine how many images to show immediately vs lazy load
    const viewportHeight = window.innerHeight;
    const estimatedItemHeight = 200; // Rough estimate for initial calculation
    const itemsPerRow = getItemsPerRowForCurrentScreen();
    
    // Reduce initial load count to ensure we see skeletons
    const initialLoadCount = Math.min(6, Math.ceil(itemsPerRow * 1.5)); // Load max 6 images or 1.5 rows, whichever is smaller
    
    console.log(`[uiImageView] Viewport: ${viewportHeight}px, ItemsPerRow: ${itemsPerRow}, InitialLoadCount: ${initialLoadCount}, TotalImages: ${imagesDataToRender.length}`);
    
    imagesDataToRender.forEach((imgData, index) => {
        const shouldLoadImmediately = index < initialLoadCount;
        
        console.log(`[uiImageView] Image ${index}: ${imgData.name}, LoadImmediately: ${shouldLoadImmediately}`);
        
        if (shouldLoadImmediately) {
            // Create actual image element for immediate loading
            const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
            const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, false);
            fragment.appendChild(imageElement);
            newElements.push(imageElement);
        } else {
            // Create skeleton placeholder for lazy loading
            const aspectRatio = getAspectRatioFromMetadata(imgData);
            const skeletonElement = createSkeletonElement(aspectRatio);
            skeletonElement.dataset.imgData = JSON.stringify(imgData);
            
            console.log(`[uiImageView] Creating skeleton for ${imgData.name} with aspect ratio: ${aspectRatio}`);
            
            fragment.appendChild(skeletonElement);
            newElements.push(skeletonElement);
            
            // Observe skeleton for intersection
            if (imageObserver) {
                imageObserver.observe(skeletonElement);
                console.log(`[uiImageView] Observing skeleton for ${imgData.name}`);
            } else {
                console.warn('[uiImageView] imageObserver not initialized!');
            }
        }
    });

    imageGroupContainer.appendChild(fragment); // Append all new items at once

    if (typeof Masonry !== 'undefined' && typeof imagesLoaded !== 'undefined') {
        // Filter only actual image elements for imagesLoaded (not skeletons)
        const imageElements = newElements.filter(el => el.classList.contains('image-item'));
        const skeletonElements = newElements.filter(el => el.classList.contains('image-skeleton'));
        
        console.log(`[uiImageView] Created ${imageElements.length} image elements and ${skeletonElements.length} skeleton elements`);
        
        if (imageElements.length > 0) {
            const imgLoad = imagesLoaded(imageElements);

            imgLoad.on('always', function() {
                if (!masonryInstance) {
                    // Initialize Masonry with all elements (including skeletons)
                    masonryInstance = new Masonry(imageGroupContainer, {
                        itemSelector: '.image-item, .image-skeleton',
                        columnWidth: '.image-item, .image-skeleton',
                        gutter: 16,
                        percentPosition: true,
                        transitionDuration: 0 // Let CSS handle transitions
                    });
                    console.log('[uiImageView] Masonry initialized with mixed elements');
                } else {
                    // Append only the new elements and layout
                    masonryInstance.appended(newElements);
                    masonryInstance.layout();
                    console.log('[uiImageView] Masonry appended new elements');
                }

                // After Masonry has laid out the items, make image items visible
                setTimeout(() => {
                    imageElements.forEach(el => {
                        if (!el.classList.contains('image-item--visible')) {
                            el.classList.add('image-item--visible');
                        }
                    });
                }, 50);
            });

            // Layout on progress to handle varying image sizes
            imgLoad.on('progress', function() {
                if (masonryInstance) {
                    masonryInstance.layout();
                }
            });
        } else {
            // Only skeletons were added, just update Masonry layout
            if (!masonryInstance) {
                masonryInstance = new Masonry(imageGroupContainer, {
                    itemSelector: '.image-item, .image-skeleton',
                    columnWidth: '.image-item, .image-skeleton',
                    gutter: 16,
                    percentPosition: true,
                    transitionDuration: 0
                });
                console.log('[uiImageView] Masonry initialized with only skeletons');
            } else {
                masonryInstance.appended(newElements);
                masonryInstance.layout();
                console.log('[uiImageView] Masonry appended skeleton elements');
            }
        }

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
            const response = await fetch(targetThumbnailUrl);
            if (response.ok) {
                const thumbnailStatus = response.headers.get('X-Thumbnail-Status');
                if (thumbnailStatus && thumbnailStatus.startsWith('placeholder')) {
                    console.log(`[uiImageView] Polling for ${imagePath} size ${targetSize}: Still a placeholder. Attempt ${attempts}`);
                } else {
                    clearInterval(intervalId);
                    console.log(`[uiImageView] Successfully loaded final thumbnail for ${imagePath} size ${targetSize}. Not a placeholder.`);
                    updateCallback(targetThumbnailUrl); // Update grid <img> src

                    // Fetch updated metadata (especially dimensions) and update state
                    try {
                        const metaApiResponse = await fetchDataApi('get_image_metadata', { path: imagePath });
                        if (metaApiResponse && metaApiResponse.status === 'success' && metaApiResponse.data) {
                            updateImageListItem(imagePath, metaApiResponse.data); // Update item in currentImageList
                            console.log(`[uiImageView] Updated metadata in currentImageList for ${imagePath}:`, metaApiResponse.data);

                            if (typeof refreshCurrentPhotoSwipeSlideIfNeeded === 'function') {
                                refreshCurrentPhotoSwipeSlideIfNeeded(imagePath);
                            }
                        } else {
                            console.warn(`[uiImageView] Could not fetch updated metadata for ${imagePath}. API response:`, metaApiResponse);
                        }
                    } catch (metaError) {
                        console.error(`[uiImageView] Error fetching metadata for ${imagePath}:`, metaError);
                    }
                }
            } else {
                console.warn(`[uiImageView] Poll request failed for ${imagePath} size ${targetSize}. Status: ${response.status}. Attempt ${attempts}`);
                // Optional: Stop polling on certain errors, e.g., 404 not found
                if (response.status === 404) clearInterval(intervalId);
            }
        } catch (error) {
            console.error(`[uiImageView] Polling error for ${imagePath} size ${targetSize}:`, error);
            // Optional: Stop polling on network errors
            // clearInterval(intervalId);
        }
    }, THUMBNAIL_POLL_INTERVAL);

    imgElement.dataset.pollIntervalId = intervalId.toString();
}

// Helper function to determine items per row based on screen size
function getItemsPerRowForCurrentScreen() {
    const screenWidth = window.innerWidth;
    
    if (screenWidth <= 480) return 2;          // Mobile: 2 columns
    else if (screenWidth <= 768) return 3;    // Tablet: 3 columns  
    else if (screenWidth <= 1024) return 4;   // Small desktop: 4 columns
    else if (screenWidth <= 1440) return 5;   // Large desktop: 5 columns
    else return 6;                             // Very large: 6 columns
} 