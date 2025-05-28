import { currentImageList, updateImageListItem } from './state.js';
import { API_BASE_URL, fetchDataApi } from './config.js';
import { refreshCurrentPhotoSwipeSlideIfNeeded } from './photoswipeHandler.js';
import { globalScrollTracker } from './utils.js';

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

// === ENHANCED INTERSECTION OBSERVER WITH SMART PRELOADING ===
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
                
                // Simplified smart preloading: only preload next image to maintain order
                setTimeout(() => triggerSmartPreload(placeholder), 200);
            }
        });
    }, {
        rootMargin: '200px 0px', // Start loading 200px before entering viewport for smoother experience
        threshold: 0.01 // Trigger as soon as any part becomes visible
    });
}

// Smart preloading based on scroll direction and velocity - SIMPLIFIED
function triggerSmartPreload(currentElement) {
    // Simplified: only preload the very next skeleton to maintain loading order
    if (!globalScrollTracker) {
        console.log('[uiImageView] No scroll tracker available');
        return;
    }
    
    // Only preload when scroll has stopped and direction is consistent
    if (globalScrollTracker.isScrolling || !globalScrollTracker.shouldPreload()) {
        return;
    }
    
    console.log('[uiImageView] Triggering smart preload');
    
    // Find next skeleton element in DOM order
    const allSkeletons = document.querySelectorAll('.image-skeleton[data-img-data]');
    const currentIndex = Array.from(allSkeletons).indexOf(currentElement);
    
    if (currentIndex === -1) return;
    
    // Only preload the very next image to maintain strict order
    const nextSkeleton = allSkeletons[currentIndex + 1];
    if (nextSkeleton && nextSkeleton.dataset.imgData) {
        setTimeout(() => {
            if (nextSkeleton.parentNode) {
                console.log(`[uiImageView] Preloading next image at index ${currentIndex + 1}`);
                const imgData = JSON.parse(nextSkeleton.dataset.imgData);
                loadImageWithPriority(nextSkeleton, imgData, true);
                imageObserver.unobserve(nextSkeleton);
            }
        }, 100); // Small delay to ensure current image loads first
    }
}

function loadImageWithPriority(skeletonElement, imgData, isPreload = false) {
    // Create the actual image item
    const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
    const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, !isPreload);
    
    // Add preload class for styling differentiation
    if (isPreload) {
        imageElement.classList.add('image-item--preloaded');
        console.log(`[uiImageView] Created preloaded image for: ${imgData.name}`);
    }
    
    // Start hidden for smooth transition
    imageElement.style.opacity = '0';
    imageElement.style.transform = 'scale(0.95)';
    
    // Replace skeleton with image element
    skeletonElement.parentNode.replaceChild(imageElement, skeletonElement);
    
    // Wait for image to load, then show with smooth animation
    const img = imageElement.querySelector('img');
    if (img) {
        const showElement = () => {
            // Smooth reveal animation
            imageElement.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            imageElement.style.opacity = '1';
            imageElement.style.transform = 'scale(1)';
            imageElement.classList.add('image-item--visible');
            
            // Update Masonry layout after animation
            setTimeout(() => {
                if (masonryInstance) {
                    masonryInstance.reloadItems();
                    masonryInstance.layout();
                }
            }, 400);
        };
        
        if (img.complete && img.naturalHeight !== 0) {
            // Image already loaded
            setTimeout(showElement, 50); // Small delay for smooth transition
        } else {
            // Wait for image to load
            img.addEventListener('load', showElement, { once: true });
            img.addEventListener('error', showElement, { once: true }); // Show even on error
        }
    } else {
        // No image found, show immediately
        imageElement.style.opacity = '1';
        imageElement.style.transform = 'scale(1)';
        imageElement.classList.add('image-item--visible');
        
        // Update Masonry layout
        if (masonryInstance) {
            setTimeout(() => {
                masonryInstance.reloadItems();
                masonryInstance.layout();
            }, 100);
        }
    }
    
    console.log(`[uiImageView] Lazy loaded image: ${imgData.name}`);
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
    // For images, use get_image action for full resolution, not get_thumbnail
    const mediaPath = `api.php?action=get_image&path=${encodeURIComponent(imgData.path)}`;
    anchor.href = mediaPath;
    
    console.log(`[uiImageView] PhotoSwipe media path: ${mediaPath}`);

    if (imageIndex !== -1) {
        anchor.dataset.pswpIndex = imageIndex;
    }

    anchor.onclick = (e) => {
        e.preventDefault();
        console.log(`[uiImageView] Image clicked: ${imgData.name}, Index: ${imageIndex}`);
        
        if (imageIndex !== -1) {
            openPhotoSwipeCallback(imageIndex);
        } else {
            const freshIndex = currentImageList.findIndex(item => item.path === imgData.path);
            if (freshIndex !== -1) {
                console.log(`[uiImageView] Found fresh index: ${freshIndex} for ${imgData.name}`);
                openPhotoSwipeCallback(freshIndex);
            } else {
                console.error("Could not find media index for (onclick):", imgData.name, imgData.path);
            }
        }
    };

    console.log(`[uiImageView] Creating image for ${imgData.name}:`);
    
    // TEMPORARY: Less verbose logging
    // console.log(`[uiImageView] - Manual test URL: api.php?action=get_thumbnail&path=main%2F12G%20THPT%20PHU%20XUAN%2FMAY%201%2FGuukyyeu%20(1).jpg&size=150`);
    
    // Create progressive thumbnail (150px → 750px) instead of single size
    const img = createProgressiveThumbnailImage(imgData, () => {
        // Callback when fast thumbnail loads - make container visible
        setTimeout(() => {
            div.classList.add('image-item--visible');
            // console.log(`[uiImageView] Made image visible after fast load: ${imgData.name}`);
        }, 50);
    });
    
    // console.log(`[uiImageView] Added progressive thumbnail loading for: ${imgData.name}`);

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

    // Note: Thumbnail polling and old onload/onerror handlers are now managed by createProgressiveThumbnailImage
    // The progressive thumbnail system handles all loading states and upgrades automatically

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

    // Initialize Masonry if not exists
    if (!masonryInstance) {
        masonryInstance = new Masonry(imageGroupContainer, {
            itemSelector: '.image-item, .image-skeleton',
            columnWidth: '.image-item, .image-skeleton',
            gutter: 16,
            percentPosition: true,
            transitionDuration: '0.2s' // Smooth transitions
        });
        console.log('[uiImageView] Masonry initialized');
    }

    const viewportHeight = window.innerHeight;
    const itemsPerRow = getItemsPerRowForCurrentScreen();
    
    // Reduce initial immediate load - only load first row for instant feedback
    const initialLoadCount = Math.min(itemsPerRow, 6); // Just first row, max 6
    
    console.log(`[uiImageView] Viewport: ${viewportHeight}px, ItemsPerRow: ${itemsPerRow}, InitialLoadCount: ${initialLoadCount}, TotalImages: ${imagesDataToRender.length}`);
    
    // Process images with staggered loading for smooth experience
    imagesDataToRender.forEach((imgData, index) => {
        const shouldLoadImmediately = index < initialLoadCount;
        
        if (shouldLoadImmediately) {
            // Load first row immediately but staggered
            setTimeout(() => {
                createAndAppendImageElement(imgData, imageGroupContainer, false);
            }, index * 50); // 50ms stagger between each image
        } else {
            // Create skeleton immediately for layout, will be lazy loaded
            const aspectRatio = getAspectRatioFromMetadata(imgData);
            const skeletonElement = createSkeletonElement(aspectRatio);
            skeletonElement.dataset.imgData = JSON.stringify(imgData);
            
            // Append skeleton immediately
            imageGroupContainer.appendChild(skeletonElement);
            masonryInstance.appended(skeletonElement);
            masonryInstance.layout();
            
            // Observe skeleton for intersection
            if (imageObserver) {
                imageObserver.observe(skeletonElement);
                console.log(`[uiImageView] Observing skeleton for ${imgData.name}`);
            } else {
                console.warn('[uiImageView] imageObserver not initialized!');
            }
        }
    });
}

// Helper function to create and append individual image elements smoothly
function createAndAppendImageElement(imgData, container, isLazyLoaded = false) {
    const imageIndex = currentImageList.findIndex(item => item.path === imgData.path);
    const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, isLazyLoaded);
    
    // Add to DOM immediately but hidden
    imageElement.style.opacity = '0';
    imageElement.style.transform = 'scale(0.9)';
    container.appendChild(imageElement);
    
    // Update Masonry layout
    if (masonryInstance) {
        masonryInstance.appended(imageElement);
        masonryInstance.layout();
    }
    
    // Wait for image to load, then show with smooth animation
    const img = imageElement.querySelector('img');
    if (img) {
        const showElement = () => {
            // Smooth reveal animation
            imageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            imageElement.style.opacity = '1';
            imageElement.style.transform = 'scale(1)';
            imageElement.classList.add('image-item--visible');
            
            // Update layout after animation
            setTimeout(() => {
                if (masonryInstance) {
                    masonryInstance.layout();
                }
            }, 300);
        };
        
        if (img.complete && img.naturalHeight !== 0) {
            // Image already loaded
            showElement();
        } else {
            // Wait for image to load
            img.addEventListener('load', showElement, { once: true });
            img.addEventListener('error', showElement, { once: true }); // Show even on error
        }
    } else {
        // No image found, show immediately
        imageElement.style.opacity = '1';
        imageElement.style.transform = 'scale(1)';
        imageElement.classList.add('image-item--visible');
    }
    
    console.log(`[uiImageView] Created and appended image element: ${imgData.name}`);
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

// === PROGRESSIVE IMAGE LOADING UTILITIES ===
function createProgressiveImage(imgData, thumbSrc) {
    const img = document.createElement('img');
    img.alt = imgData.name;
    
    // Create a tiny placeholder (could be base64 encoded micro-image)
    const tinyPlaceholder = createTinyImagePlaceholder(imgData);
    
    // Start with progressive loading classes
    img.classList.add('img-progressive');
    img.src = tinyPlaceholder;
    
    // Load the actual thumbnail
    const actualImg = new Image();
    actualImg.onload = () => {
        // Progressive reveal: replace src and remove blur
        img.src = thumbSrc;
        setTimeout(() => {
            img.classList.add('loaded');
            img.classList.remove('img-progressive');
            img.classList.add('img-loaded');
        }, 50);
    };
    
    actualImg.onerror = () => {
        // Fallback handling
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.classList.remove('img-progressive');
        img.classList.add('img-loaded');
    };
    
    actualImg.src = thumbSrc;
    
    return img;
}

function createTinyImagePlaceholder(imgData) {
    // Create a tiny colored placeholder based on aspect ratio
    const aspectRatio = getAspectRatioFromMetadata(imgData);
    const [width, height] = aspectRatio.split(' / ').map(num => parseInt(num) || 1);
    
    // Create a tiny canvas-based image (10px max dimension)
    const canvas = document.createElement('canvas');
    const maxDim = 10;
    const scale = Math.min(maxDim / width, maxDim / height);
    
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    
    const ctx = canvas.getContext('2d');
    
    // Fill with a subtle gradient based on filename hash
    const hash = simpleStringHash(imgData.name);
    const hue = hash % 360;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `hsl(${hue}, 20%, 85%)`);
    gradient.addColorStop(1, `hsl(${hue + 30}, 20%, 75%)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL('image/png');
}

function simpleStringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// === PROGRESSIVE THUMBNAIL LOADING (150px → 750px) ===
function createProgressiveThumbnailImage(imgData, onLoadCallback) {
    const img = document.createElement('img');
    img.alt = imgData.name;
    
    // URLs for progressive loading
    const fastThumbSrc = `api.php?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=150`;
    const highQualityThumbSrc = `api.php?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=750`;
    
    // State tracking to prevent loops
    let fastLoaded = false;
    let highQualityLoaded = false;
    let isUpgrading = false;
    
    console.log(`[uiImageView] Progressive loading started: ${imgData.name}`);
    
    // Start with 150px thumbnail
    img.classList.add('img-progressive-thumb');
    img.src = fastThumbSrc;
    img.dataset.currentQuality = 'loading';
    
    // Handle fast thumbnail load (150px)
    const handleFastLoad = () => {
        if (fastLoaded || isUpgrading) return; // Prevent duplicate handling
        fastLoaded = true;
        
        console.log(`[uiImageView] Fast thumbnail (150px) loaded: ${imgData.name}`);
        img.classList.remove('img-progressive-thumb');
        img.classList.add('img-loaded-fast');
        img.dataset.currentQuality = 'fast';
        
        // Trigger callback for visibility
        if (onLoadCallback) onLoadCallback();
        
        // Start high quality loading after a delay (non-blocking)
        setTimeout(() => {
            if (!highQualityLoaded && !isUpgrading && img.parentNode) {
                loadHighQuality();
            }
        }, 150); // Reduced from 300ms to 150ms for faster upgrades
    };
    
    // Handle high quality upgrade (750px)
    const loadHighQuality = () => {
        if (highQualityLoaded || isUpgrading) return;
        isUpgrading = true;
        
        const highResImg = new Image();
        
        highResImg.onload = () => {
            if (highQualityLoaded || !img.parentNode) return; // Check if still needed
            highQualityLoaded = true;
            
            console.log(`[uiImageView] High quality (750px) loaded: ${imgData.name}`);
            
            // Smooth transition
            img.style.transition = 'opacity 0.2s ease';
            img.style.opacity = '0.8';
            
            setTimeout(() => {
                if (img.parentNode) { // Final check before upgrade
                    img.src = highQualityThumbSrc;
                    img.dataset.currentQuality = 'high';
                    img.style.opacity = '1';
                    img.classList.remove('img-loaded-fast');
                    img.classList.add('img-loaded-hq');
                }
            }, 100);
        };
        
        highResImg.onerror = () => {
            console.log(`[uiImageView] High quality failed, keeping 150px: ${imgData.name}`);
            img.classList.add('img-loaded-final');
            img.dataset.currentQuality = 'final';
        };
        
        highResImg.src = highQualityThumbSrc;
    };
    
    // Error handling
    const handleError = () => {
        console.error(`[uiImageView] Thumbnail loading failed: ${imgData.name}`);
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.classList.add('img-error');
        img.dataset.currentQuality = 'error';
        if (onLoadCallback) onLoadCallback();
    };
    
    // Set up event listeners (once only)
    img.addEventListener('load', handleFastLoad, { once: true });
    img.addEventListener('error', handleError, { once: true });
    
    return img;
} 