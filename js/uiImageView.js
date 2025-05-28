import { currentImageList, updateImageListItem } from './state.js';
import { API_BASE_URL, fetchDataApi } from './config.js';
import { refreshCurrentPhotoSwipeSlideIfNeeded } from './photoswipeHandler.js';
import { globalScrollTracker, globalPerformanceMonitor } from './utils.js';

// DOM Elements
let imageViewEl, currentDirectoryNameEl, imageGridEl, loadMoreContainerEl, loadMoreBtnEl;
let masonryInstance = null;

// Intersection Observer for lazy loading
let imageObserver = null;

// === PERFORMANCE OPTIMIZATIONS ===
const MAX_CONCURRENT_LOADS = 3; // Reduced from 4 for larger 750px images
const CLEANUP_THRESHOLD = 80; // Reduced from 100 for larger images
const DEBOUNCE_LAYOUT = 150; // Increased from 100ms for larger images

// Performance tracking
let loadingQueue = new Set();
let cleanupCounter = 0;
let layoutDebounceTimer = null;

// Callbacks
let appOpenPhotoSwipe = (index) => console.error('openPhotoSwipe not initialized in uiImageView');

// === OPTIMIZED SKELETON LOADING ===
function createSkeletonElement(aspectRatio = '1 / 1') {
    const skeleton = document.createElement('div');
    skeleton.className = 'image-skeleton';
    skeleton.style.aspectRatio = aspectRatio;
    
    // Add minimal shimmer effect
    skeleton.innerHTML = '<div class="skeleton-shimmer"></div>';
    
    return skeleton;
}

function getOptimalThumbnailSize() {
    // Use 750px for better quality in gallery grid
    return 750;
}

function getAspectRatioFromMetadata(imgData) {
    if (imgData.width && imgData.height && imgData.width > 0 && imgData.height > 0) {
        return `${imgData.width} / ${imgData.height}`;
    }
    return '1 / 1';
}

// === DEBOUNCED LAYOUT UPDATE ===
function debouncedLayoutUpdate() {
    if (layoutDebounceTimer) {
        clearTimeout(layoutDebounceTimer);
    }
    
    layoutDebounceTimer = setTimeout(() => {
        if (masonryInstance) {
            requestAnimationFrame(() => {
                const layoutStartTime = globalPerformanceMonitor.startTiming('masonry-layout-update');
                masonryInstance.layout();
                globalPerformanceMonitor.endTiming('masonry-layout-update', layoutStartTime, 'masonryLayout');
            });
        }
    }, DEBOUNCE_LAYOUT);
}

// === OPTIMIZED INTERSECTION OBSERVER ===
function initializeImageObserver() {
    if (imageObserver) return;
    
    imageObserver = new IntersectionObserver((entries) => {
        // Process only visible entries and limit concurrent loads
        const visibleEntries = entries
            .filter(entry => entry.isIntersecting)
            .slice(0, MAX_CONCURRENT_LOADS);

        visibleEntries.forEach((entry) => {
            const placeholder = entry.target;
            const imgData = JSON.parse(placeholder.dataset.imgData);
            
            // Check if already loading
            if (!loadingQueue.has(imgData.path)) {
                loadImageWithPriority(placeholder, imgData);
                imageObserver.unobserve(placeholder);
            }
        });
    }, {
        rootMargin: '50px 0px', // Reduced from 100px for better control
        threshold: 0.1
    });
}

// === OPTIMIZED SMART PRELOADING ===
function triggerSmartPreload(currentElement) {
    if (!globalScrollTracker) return;
    
    // Only preload when scroll velocity is low and direction is consistent
    if (globalScrollTracker.isScrolling || !globalScrollTracker.shouldPreload()) {
        return;
    }
    
    // Find next 2 skeleton elements in DOM order for batch preloading
    const allSkeletons = document.querySelectorAll('.image-skeleton[data-img-data]');
    const currentIndex = Array.from(allSkeletons).indexOf(currentElement);
    
    if (currentIndex === -1) return;
    
    // Preload next 2 images in sequence for better performance
    const preloadCount = Math.min(2, allSkeletons.length - currentIndex - 1);
    
    for (let i = 1; i <= preloadCount; i++) {
        const nextSkeleton = allSkeletons[currentIndex + i];
        if (nextSkeleton && nextSkeleton.dataset.imgData) {
            setTimeout(() => {
                if (nextSkeleton.parentNode) {
                    const imgData = JSON.parse(nextSkeleton.dataset.imgData);
                    loadImageWithPriority(nextSkeleton, imgData, true);
                    imageObserver.unobserve(nextSkeleton);
                }
            }, i * 100);
        }
    }
}

// === OPTIMIZED IMAGE LOADING ===
function loadImageWithPriority(skeletonElement, imgData, isPreload = false) {
    // Add to loading queue
    loadingQueue.add(imgData.path);
    
    let imageIndex = parseInt(skeletonElement.dataset.imageIndex);
    
    if (isNaN(imageIndex) || imageIndex === -1) {
        imageIndex = currentImageList.findIndex(item => 
            item.path === imgData.path || item.source_path === imgData.path
        );
    }
    
    const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, !isPreload);
    
    if (isPreload) {
        imageElement.classList.add('image-item--preloaded');
    }
    
    // Maintain aspect ratio during transition
    const aspectRatio = getAspectRatioFromMetadata(imgData);
    imageElement.style.aspectRatio = aspectRatio;
    
    // Start with skeleton dimensions to prevent layout shift
    imageElement.style.opacity = '0';
    imageElement.style.transform = 'translateY(10px)';
    
    // Copy the imageIndex from skeleton to maintain order
    imageElement.dataset.imageIndex = skeletonElement.dataset.imageIndex || imageIndex;
    
    // Replace skeleton with image element
    skeletonElement.parentNode.replaceChild(imageElement, skeletonElement);
    
    // Wait for image to load with optimized Masonry integration
    const img = imageElement.querySelector('img');
    if (img) {
        const showElement = () => {
            // Smooth reveal with optimized timing
            imageElement.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
            imageElement.style.opacity = '1';
            imageElement.style.transform = 'translateY(0)';
            imageElement.classList.add('image-item--visible');
            
            // Remove from loading queue
            loadingQueue.delete(imgData.path);
            
            // Debounced layout update
            debouncedLayoutUpdate();
            
            // Cleanup check
            performCleanupCheck();
        };
        
        if (img.complete && img.naturalHeight !== 0) {
            setTimeout(showElement, 10); // Reduced delay
        } else {
            img.addEventListener('load', showElement, { once: true });
            img.addEventListener('error', () => {
                loadingQueue.delete(imgData.path);
                showElement();
            }, { once: true });
        }
    } else {
        loadingQueue.delete(imgData.path);
        imageElement.style.opacity = '1';
        imageElement.style.transform = 'translateY(0)';
        imageElement.classList.add('image-item--visible');
        
        debouncedLayoutUpdate();
    }
}

// === PERFORMANCE CLEANUP ===
function performCleanupCheck() {
    cleanupCounter++;
    
    if (cleanupCounter >= CLEANUP_THRESHOLD) {
        cleanupCounter = 0;
        
        // Cleanup completed images that are far from viewport
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        const cleanupDistance = window.innerHeight * 2.5; // Reduced from 3 for larger images
        
        const images = document.querySelectorAll('.image-item');
        let cleanedCount = 0;
        
        images.forEach(img => {
            const rect = img.getBoundingClientRect();
            const imgTop = rect.top + viewportTop;
            
            // If image is far above viewport, convert back to skeleton
            if (imgTop < viewportTop - cleanupDistance) {
                convertToSkeleton(img);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`[Performance] Cleaned up ${cleanedCount} images`);
            debouncedLayoutUpdate();
        }
    }
}

function convertToSkeleton(imageElement) {
    const imgData = {
        path: imageElement.dataset.sourcePath,
        name: imageElement.querySelector('img')?.alt || 'image'
    };
    
    const aspectRatio = imageElement.style.aspectRatio || '1 / 1';
    const skeleton = createSkeletonElement(aspectRatio);
    skeleton.dataset.imgData = JSON.stringify(imgData);
    skeleton.dataset.imageIndex = imageElement.dataset.imageIndex;
    
    imageElement.parentNode.replaceChild(skeleton, imageElement);
    
    // Re-observe for lazy loading
    if (imageObserver) {
        imageObserver.observe(skeleton);
    }
}

// === OPTIMIZED IMAGE ELEMENT CREATION ===
function createImageItemElement(imgData, imageIndex, openPhotoSwipeCallback, isLazyLoaded = false) {
    const div = document.createElement('div');
    div.className = 'image-item';
    div.dataset.sourcePath = imgData.path;
    div.dataset.itemType = imgData.type || 'image';
    div.dataset.imageIndex = imageIndex;
    
    // Set aspect ratio if available
    const aspectRatio = getAspectRatioFromMetadata(imgData);
    div.style.aspectRatio = aspectRatio;

    const anchor = document.createElement('a');
    anchor.className = 'photoswipe-trigger';
    const mediaPath = `api.php?action=get_image&path=${encodeURIComponent(imgData.path)}`;
    anchor.href = mediaPath;
    
    if (imageIndex !== -1) {
        anchor.dataset.pswpIndex = imageIndex;
    }

    anchor.onclick = (e) => {
        e.preventDefault();
        
        let freshIndex = currentImageList.findIndex(item => 
            item.path === imgData.path || item.source_path === imgData.path
        );
        
        if (freshIndex !== -1) {
            openPhotoSwipeCallback(freshIndex);
        } else {
            console.error("Could not find media index for (onclick):", imgData.name);
        }
    };

    // Create SINGLE quality image (no progressive loading)
    const img = createSingleQualityImage(imgData, () => {
        // Callback when image loads - make container visible
        setTimeout(() => {
            div.classList.add('image-item--visible');
        }, 50);
    });
    
    anchor.appendChild(img);

    // Add play icon overlay for video items
    if (imgData.type === 'video') {
        const playIcon = document.createElement('div');
        playIcon.className = 'play-icon-overlay';
        playIcon.innerHTML = '&#9658;';
        anchor.appendChild(playIcon);
        div.classList.add('video-item');
    }

    div.appendChild(anchor);
    
    return div;
}

// === SINGLE QUALITY IMAGE (NO PROGRESSIVE LOADING) ===
function createSingleQualityImage(imgData, onLoadCallback) {
    const img = document.createElement('img');
    img.alt = imgData.name;
    
    // Use 750px for better quality in gallery grid
    const thumbSrc = `api.php?action=get_thumbnail&path=${encodeURIComponent(imgData.path)}&size=750`;
    img.src = thumbSrc;
    img.loading = 'lazy'; // Native lazy loading
    
    // Set up event listeners
    img.addEventListener('load', () => {
        if (onLoadCallback) onLoadCallback();
    }, { once: true });
    
    img.addEventListener('error', () => {
        console.error(`[uiImageView] Thumbnail loading failed: ${imgData.name}`);
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        if (onLoadCallback) onLoadCallback();
    }, { once: true });
    
    return img;
}

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
        imageGridEl.innerHTML = '';
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
    
    // Clear performance counters
    loadingQueue.clear();
    cleanupCounter = 0;
    
    if (layoutDebounceTimer) {
        clearTimeout(layoutDebounceTimer);
        layoutDebounceTimer = null;
    }
}

export function renderImageItems(imagesDataToRender, append = false) {
    if (!imageGridEl) {
        console.error('[uiImageView] imageGridEl NOT found in renderImageItems.');
        return;
    }
    
    let imageGroupContainer = imageGridEl.querySelector('.image-group'); 
    if (!imageGroupContainer) {
        console.error('[uiImageView] .image-group container NOT found in renderImageItems. This should have been created by createImageGroupIfNeeded.');
        return;
    }

    if (!imagesDataToRender || imagesDataToRender.length === 0) {
        if (!append && imageGroupContainer) {
            imageGroupContainer.innerHTML = '<p class="info-text">Không có ảnh trong album này.</p>';
        }
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
        const masonryStartTime = globalPerformanceMonitor.startTiming('masonry-init');
        
        masonryInstance = new Masonry(imageGroupContainer, {
            itemSelector: '.image-item, .image-skeleton',
            columnWidth: '.image-item, .image-skeleton',
            gutter: 16,
            percentPosition: true,
            transitionDuration: '0.1s' // Faster transitions for better performance
        });
        
        globalPerformanceMonitor.endTiming('masonry-init', masonryStartTime, 'masonryLayout');
    }

    const itemsPerRow = getItemsPerRowForCurrentScreen();
    
    // Load fewer images initially for 750px thumbnails
    const initialLoadCount = Math.min(itemsPerRow * 1.5, 6); // Reduced for larger images
    
    // Process images with optimized batching
    imagesDataToRender.forEach((imgData, index) => {
        const shouldLoadImmediately = index < initialLoadCount;
        
        if (shouldLoadImmediately) {
            // Load first batch immediately in correct order
            createAndAppendImageElement(imgData, imageGroupContainer, false);
        } else {
            // Create skeleton immediately for layout, will be lazy loaded
            const aspectRatio = getAspectRatioFromMetadata(imgData);
            const skeletonElement = createSkeletonElement(aspectRatio);
            skeletonElement.dataset.imgData = JSON.stringify(imgData);
            skeletonElement.dataset.imageIndex = index;
            
            // Append skeleton immediately
            imageGroupContainer.appendChild(skeletonElement);
            if (masonryInstance) {
                masonryInstance.appended(skeletonElement);
            }
            
            // Observe skeleton for intersection
            if (imageObserver) {
                imageObserver.observe(skeletonElement);
            }
        }
    });
    
    // Single layout update at the end
    debouncedLayoutUpdate();
}

// Helper function to create and append individual image elements with optimization
function createAndAppendImageElement(imgData, container, isLazyLoaded = false) {
    const imageLoadStartTime = globalPerformanceMonitor.startTiming(`image-load-${imgData.name}`);
    
    // Use consistent path matching logic
    let imageIndex = currentImageList.findIndex(item => 
        item.path === imgData.path || item.source_path === imgData.path
    );
    
    const imageElement = createImageItemElement(imgData, imageIndex, appOpenPhotoSwipe, isLazyLoaded);
    
    // Add to DOM immediately but hidden
    imageElement.style.opacity = '0';
    imageElement.style.transform = 'scale(0.9)';
    
    // Insert in correct position to maintain order
    const existingItems = container.children;
    let insertPosition = null;
    
    // Find the correct position to insert based on imageIndex
    for (let i = 0; i < existingItems.length; i++) {
        const existingItem = existingItems[i];
        const existingIndex = parseInt(existingItem.dataset.imageIndex) || 
                             (existingItem.dataset.imgData ? 
                              currentImageList.findIndex(item => 
                                  item.path === JSON.parse(existingItem.dataset.imgData).path) : -1);
        
        if (existingIndex > imageIndex) {
            insertPosition = existingItem;
            break;
        }
    }
    
    // Insert at correct position or append at end
    if (insertPosition) {
        container.insertBefore(imageElement, insertPosition);
    } else {
        container.appendChild(imageElement);
    }
    
    // Update Masonry layout with optimized timing
    if (masonryInstance) {
        masonryInstance.appended(imageElement);
    }
    
    // Wait for image to load, then show with smooth animation
    const img = imageElement.querySelector('img');
    if (img) {
        const showElement = () => {
            // End image loading performance timing
            globalPerformanceMonitor.endTiming(`image-load-${imgData.name}`, imageLoadStartTime, 'imageLoad');
            
            // Smooth reveal animation with optimized timing
            imageElement.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            imageElement.style.opacity = '1';
            imageElement.style.transform = 'scale(1)';
            imageElement.classList.add('image-item--visible');
            
            // Debounced layout update
            debouncedLayoutUpdate();
        };
        
        if (img.complete && img.naturalHeight !== 0) {
            // Image already loaded
            showElement();
        } else {
            // Wait for image to load
            img.addEventListener('load', showElement, { once: true });
            img.addEventListener('error', () => {
                // End timing even on error
                globalPerformanceMonitor.endTiming(`image-load-${imgData.name}`, imageLoadStartTime, 'imageLoad');
                showElement();
            }, { once: true });
        }
    } else {
        // No image found, show immediately
        globalPerformanceMonitor.endTiming(`image-load-${imgData.name}`, imageLoadStartTime, 'imageLoad');
        imageElement.style.opacity = '1';
        imageElement.style.transform = 'scale(1)';
        imageElement.classList.add('image-item--visible');
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