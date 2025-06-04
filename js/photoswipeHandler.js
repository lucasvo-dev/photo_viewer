import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';
import { 
    photoswipeLightbox, 
    setPhotoswipeLightbox, 
    setCurrentImageList, 
    setCurrentPage 
} from './state.js';

// Dynamic imports for state that changes - avoid stale imports
async function getCurrentState() {
    const state = await import('./state.js');
    return {
        currentImageList: state.currentImageList,
        totalImages: state.totalImages,
        currentPage: state.currentPage,
        isLoadingMore: state.isLoadingMore
    };
}
import { API_BASE_URL, IMAGES_PER_PAGE, PREVIEW_LOADING_STRATEGY, PREVIEW_NEAR_END_THRESHOLD } from './config.js';
import { triggerDirectDownload } from './app.js'; // Import the helper
import { fetchDataApi } from './apiService.js';

// PhotoSwipe Handler Module - Enhanced Preview Loading
console.log('[photoswipeHandler] ✅ Module loaded successfully!');

// SIMPLE: Add immediate test function
window.simplePhotoSwipeTest = async function() {
    console.log('[SIMPLE TEST] Testing PhotoSwipe with current data...');
    
    try {
        const state = await getCurrentState();
        
        console.log('[SIMPLE TEST] currentImageList available:', !!state.currentImageList);
        console.log('[SIMPLE TEST] Length:', state.currentImageList?.length || 'N/A');
        console.log('[SIMPLE TEST] totalImages:', state.totalImages || 'N/A');
        
        return {
            hasImageList: !!state.currentImageList,
            imageCount: state.currentImageList?.length || 0,
            totalImages: state.totalImages || 0
        };
    } catch (error) {
        console.error('[SIMPLE TEST] Error getting state:', error);
        return { error: error.message };
    }
};

console.log('[photoswipeHandler] ✅ window.simplePhotoSwipeTest created');

// DEBUG: Add a simple test function to check if the issue is with loading logic
export async function testPhotoSwipeWithCurrentData(index) {
    console.log('[DEBUG] testPhotoSwipeWithCurrentData called with index:', index);
    
    const state = await getCurrentState();
    console.log('[DEBUG] currentImageList.length:', state.currentImageList.length);
    console.log('[DEBUG] totalImages:', state.totalImages);
    console.log('[DEBUG] First 3 images:', state.currentImageList.slice(0, 3).map(img => img.name));
    
    if (!photoswipeLightbox) {
        console.warn("PhotoSwipe not initialized, attempting to set it up.");
        setupPhotoSwipeIfNeeded();
        if(!photoswipeLightbox) {
            console.error("PhotoSwipe could not be initialized!");
            return;
        }
    }
    
    // Force update dataSource and open
    updatePhotoSwipeDataSource(state.currentImageList);
    photoswipeLightbox.loadAndOpen(index);
    console.log(`[DEBUG] PhotoSwipe opened with ${state.currentImageList.length} images`);
}

// DEBUG: Test function with fake extended data
export async function testPhotoSwipeWithFakeData(index) {
    console.log('[DEBUG-FAKE] Testing PhotoSwipe with fake extended data');
    
    const state = await getCurrentState();
    
    // Create fake extended image list
    const fakeExtendedList = [...state.currentImageList];
    
    // Add fake images if we have less than 50
    if (state.currentImageList.length < 50) {
        for (let i = state.currentImageList.length; i < 50; i++) {
            const fakeImage = {
                ...state.currentImageList[0], // Copy structure from first real image
                name: `fake_image_${i}.jpg`,
                path: `fake/path/fake_image_${i}.jpg`,
                source_path: `fake/path/fake_image_${i}.jpg`
            };
            fakeExtendedList.push(fakeImage);
        }
    }
    
    console.log(`[DEBUG-FAKE] Created fake list with ${fakeExtendedList.length} images`);
    
    if (!photoswipeLightbox) {
        setupPhotoSwipeIfNeeded();
    }
    
    // Temporarily update the datasource with fake data
    const fakeDataSource = fakeExtendedList.map(itemData => {
        const imageUrl = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
        return {
            src: imageUrl,
            thumb: imageUrl,
            width: itemData.width || 800,
            height: itemData.height || 600,
            alt: itemData.name,
            type: 'image',
            filename: itemData.name,
            originalPath: itemData.path
        };
    });
    
    photoswipeLightbox.options.dataSource = fakeDataSource;
    photoswipeLightbox.loadAndOpen(index);
    
    console.log(`[DEBUG-FAKE] PhotoSwipe opened with ${fakeExtendedList.length} fake images`);
}

export function initializePhotoSwipeHandler() {
    // Placeholder if any specific initialization is needed for the handler itself
    // For now, setupPhotoSwipe will be called by other modules when image data is ready.
}

export async function setupPhotoSwipeIfNeeded() {
    if (photoswipeLightbox) {
        photoswipeLightbox.destroy();
        setPhotoswipeLightbox(null);
    }

    const state = await getCurrentState();
    
    const newLightbox = new PhotoSwipeLightbox({
        dataSource: state.currentImageList.map(itemData => {
            if (itemData.type === 'video') {
                const videoSrc = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
                const posterSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(itemData.path)}&size=750`;
                return {
                    html: `<div class="pswp-video-container"><video src="${videoSrc}" controls autoplay playsinline poster="${posterSrc}"></video></div>`,
                    width: itemData.width || 0, // Use actual dimensions if available, else 0 for auto
                    height: itemData.height || 0,
                    type: 'video',
                    videoSrc: videoSrc, // Store for download button
                    filename: itemData.name, // Store filename for download
                    originalPath: itemData.path // <-- ADDED ORIGINAL PATH
                };
            } else { // Image
                // For regular photo gallery, use get_image action for full resolution
                const imageUrl = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
                
                return {
                    src: imageUrl,
                    thumb: imageUrl, // Add thumb property for filmstrip
                    width: itemData.width,
                    height: itemData.height,
                    alt: itemData.name,
                    type: 'image',
                    filename: itemData.name, // Store for consistency, might be useful
                    originalPath: itemData.path // <-- ADDED ORIGINAL PATH
                };
            }
        }),
        pswpModule: PhotoSwipe,
        // Add custom UI button for video download
        appendHeavyHTMLOnInit: false, // Recommended for performance with custom UI
        getViewportSizeFn: (options, pswp) => { // Default function, can be customized
            return {
              x: document.documentElement.clientWidth,
              y: window.innerHeight
            };
        }
    });

    // Add custom download button to UI
    newLightbox.on('uiRegister', function() {
        newLightbox.pswp.ui.registerElement({
            name: 'download-item',
            order: 8,
            isButton: true,
            tagName: 'button',
            title: 'Download',
            html: '<svg aria-hidden="true" class="pswp__icn" viewBox="0 0 24 24" width="24" height="24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>',
            onClick: (event, el, pswp) => {
                const currentSlideData = pswp.currSlide.data;
                if (currentSlideData && currentSlideData.filename) {
                    if (currentSlideData.type === 'video' && currentSlideData.videoSrc) {
                        triggerDirectDownload(currentSlideData.videoSrc, currentSlideData.filename);
                    } else if (currentSlideData.type === 'image' && currentSlideData.src) {
                        triggerDirectDownload(currentSlideData.src, currentSlideData.filename);
                    } else {
                        console.warn('Download button clicked, but current slide data is incomplete or type is unknown.', currentSlideData);
                    }
                } else {
                    console.warn('Download button clicked, but current slide data or filename is missing.');
                }
            }
        });
    });

    // Function to create and add filename display manually
    const createFilenameDisplay = (pswp) => {
        try {
            // Try to find PhotoSwipe container directly
            const pswpContainer = document.querySelector('.pswp');
            if (!pswpContainer) {
                console.warn('[photoswipeHandler] .pswp container not found');
                return null;
            }

            // Check if filename display already exists
            let filenameElement = pswpContainer.querySelector('.pswp__filename-display');
            if (filenameElement) {
                console.log('[photoswipeHandler] Filename display already exists');
                return filenameElement;
            }

            // Create filename display element manually
            filenameElement = document.createElement('div');
            filenameElement.className = 'pswp__filename-display';
            filenameElement.style.cssText = `
                position: absolute;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.5);
                color: rgba(255, 255, 255, 0.9);
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 400;
                max-width: calc(100% - 80px);
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                z-index: 1060;
                backdrop-filter: blur(4px);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                line-height: 1.4;
                transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
                pointer-events: none;
                display: none;
                opacity: 0;
                transform: translateX(-50%) translateY(10px);
            `;

            // Append to PhotoSwipe container
            pswpContainer.appendChild(filenameElement);
            console.log('[photoswipeHandler] Filename display element created and added to .pswp container');
            
            return filenameElement;
        } catch (error) {
            console.error('[photoswipeHandler] Error creating filename display:', error);
            return null;
        }
    };

    // Function to update filename display
    const updateFilenameDisplay = (pswp) => {
        try {
            if (!pswp) {
                console.warn('[photoswipeHandler] updateFilenameDisplay: pswp is null/undefined');
                return;
            }
            
            // Find PhotoSwipe container directly
            const pswpContainer = document.querySelector('.pswp');
            if (!pswpContainer) {
                console.warn('[photoswipeHandler] updateFilenameDisplay: .pswp container not found');
                return;
            }
            
            // Try to get existing element or create new one
            let filenameElement = pswpContainer.querySelector('.pswp__filename-display');
            if (!filenameElement) {
                filenameElement = createFilenameDisplay(pswp);
            }
            
            if (!filenameElement) {
                console.warn('[photoswipeHandler] updateFilenameDisplay: Could not create or find filename element');
                return;
            }
            
            if (!pswp.currSlide || !pswp.currSlide.data) {
                console.warn('[photoswipeHandler] updateFilenameDisplay: currSlide or currSlide.data not available');
                filenameElement.style.display = 'none';
                return;
            }
            
            const currentSlideData = pswp.currSlide.data;
            if (currentSlideData.filename) {
                filenameElement.textContent = currentSlideData.filename;
                filenameElement.style.display = 'block';
                filenameElement.style.transform = 'translateX(-50%) translateY(10px)';
                // Add smooth fade-in effect with slight upward motion
                requestAnimationFrame(() => {
                    filenameElement.style.opacity = '1';
                    filenameElement.style.transform = 'translateX(-50%) translateY(0)';
                });
                console.log('[photoswipeHandler] Filename display updated:', currentSlideData.filename);
            } else {
                filenameElement.style.opacity = '0';
                filenameElement.style.transform = 'translateX(-50%) translateY(10px)';
                setTimeout(() => {
                    filenameElement.style.display = 'none';
                }, 200);
                console.log('[photoswipeHandler] No filename available for current slide');
            }
        } catch (error) {
            console.error('[photoswipeHandler] Error in updateFilenameDisplay:', error);
        }
    };

    // Show/hide download button and update filename display based on slide type
    newLightbox.on('change', () => {
        const pswp = newLightbox.pswp;
        console.log('[photoswipeHandler] change event triggered, updating filename display');
        
        // Always update filename display on slide change
        updateFilenameDisplay(pswp);
        
        // Handle download button if UI is ready
        if (pswp && pswp.ui && pswp.ui.element) {
            const downloadBtn = pswp.ui.element.querySelector('.pswp__button--download-item');
            if (downloadBtn) {
                const currentSlideData = pswp.currSlide && pswp.currSlide.data;
                if (currentSlideData && (currentSlideData.type === 'video' || currentSlideData.type === 'image') && currentSlideData.filename) {
                    downloadBtn.style.display = 'block';
                } else {
                    downloadBtn.style.display = 'none';
                }
            }
            
            // Check if we're near the end and need to load more
            if (pswp && pswp.currSlide) {
                const currentIndex = pswp.currSlide.index;
                checkAndLoadMoreForPreview(currentIndex);
            }
        }
    });
    
    // Also check on initial open
    newLightbox.on('afterInit', () => {
        const pswp = newLightbox.pswp;
        console.log('[photoswipeHandler] afterInit event triggered');
        
        // Delay to ensure UI is ready
        setTimeout(() => {
            if (pswp && pswp.ui && pswp.ui.element) {
                const downloadBtn = pswp.ui.element.querySelector('.pswp__button--download-item');
                if (downloadBtn) {
                    const currentSlideData = pswp.currSlide.data;
                    if (currentSlideData && (currentSlideData.type === 'video' || currentSlideData.type === 'image') && currentSlideData.filename) {
                        downloadBtn.style.display = 'block';
                    } else {
                        downloadBtn.style.display = 'none';
                    }
                }
                
                // Update filename display on initial open
                updateFilenameDisplay(pswp);
            }
        }, 100);
    });

    // Add firstUpdate listener for additional debugging
    newLightbox.on('firstUpdate', () => {
        const pswp = newLightbox.pswp;
        console.log('[photoswipeHandler] firstUpdate event triggered');
        
        // Add delay to ensure UI is fully initialized
        setTimeout(() => {
            updateFilenameDisplay(pswp);
        }, 150);
    });

    // Add openingAnimationEnd listener as another fallback
    newLightbox.on('openingAnimationEnd', () => {
        const pswp = newLightbox.pswp;
        console.log('[photoswipeHandler] openingAnimationEnd event triggered');
        
        // Final attempt with longer delay
        setTimeout(() => {
            updateFilenameDisplay(pswp);
        }, 200);
    });

    // Add container creation watcher using MutationObserver as ultimate fallback
    const containerWatcher = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('pswp')) {
                    console.log('[photoswipeHandler] .pswp container detected by MutationObserver');
                    setTimeout(() => {
                        const pswp = newLightbox.pswp;
                        if (pswp) {
                            updateFilenameDisplay(pswp);
                        }
                    }, 300);
                }
            });
        });
    });

    // Start watching for .pswp container creation
    containerWatcher.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Cleanup observer when PhotoSwipe closes
    newLightbox.on('destroy', () => {
        if (containerWatcher) {
            containerWatcher.disconnect();
            console.log('[photoswipeHandler] MutationObserver disconnected');
        }
    });

    newLightbox.init();
    setPhotoswipeLightbox(newLightbox);
    console.log("[photoswipeHandler.js] PhotoSwipe initialized with custom UI for video download and dynamic loading.");
    
    // Add debug function to window for testing
    window.debugPhotoSwipeFilename = () => {
        const pswp = newLightbox.pswp;
        const pswpContainer = document.querySelector('.pswp');
        const filenameElement = pswpContainer ? pswpContainer.querySelector('.pswp__filename-display') : null;
        
        console.log('=== PhotoSwipe Filename Debug ===');
        console.log('pswp:', pswp);
        console.log('pswpContainer:', pswpContainer);
        console.log('filenameElement:', filenameElement);
        console.log('currSlide:', pswp ? pswp.currSlide : null);
        console.log('currSlide.data:', pswp && pswp.currSlide ? pswp.currSlide.data : null);
        
        if (pswp) {
            updateFilenameDisplay(pswp);
        }
    };
}

export async function openPhotoSwipeAtIndex(index) {
    const state = await getCurrentState();

    if (!photoswipeLightbox) {
        console.warn("PhotoSwipe not initialized, attempting to set it up.");
        await setupPhotoSwipeIfNeeded();
        if(!photoswipeLightbox) {
            console.error("PhotoSwipe could not be initialized!");
            return;
        }
    }

    // BACKUP original state BEFORE any loading
    const originalState = {
        currentImageList: [...state.currentImageList],
        currentPage: state.currentPage,
        totalImages: state.totalImages
    };
    
    try {
        if (PREVIEW_LOADING_STRATEGY === 'LOAD_ALL_ON_OPEN') {
            await loadAllImagesForPreview();
        }
        const updatedState = await getCurrentState();
        updatePhotoSwipeDataSource(updatedState.currentImageList);
        
        // Setup one-time close listener to restore original state
        const restoreStateOnClose = () => {
            setCurrentImageList(originalState.currentImageList);
            setCurrentPage(originalState.currentPage);
            
            // Remove this listener after use
            if (photoswipeLightbox.pswp) {
                photoswipeLightbox.pswp.off('close', restoreStateOnClose);
            }
        };
        
        photoswipeLightbox.loadAndOpen(index);
        
        // Add close listener after opening - with safety check
        if (photoswipeLightbox.pswp) {
            photoswipeLightbox.pswp.on('close', restoreStateOnClose);
        }
    } catch (error) {
        console.error('[photoswipeHandler] Error loading images:', error);
        // Fallback: open with what we have and restore state
        updatePhotoSwipeDataSource(originalState.currentImageList);
        photoswipeLightbox.loadAndOpen(index);
        
        // Still try to add close listener for fallback
        setTimeout(() => {
            if (photoswipeLightbox.pswp) {
                const restoreStateOnClose = () => {
                    setCurrentImageList(originalState.currentImageList);
                    setCurrentPage(originalState.currentPage);
                    photoswipeLightbox.pswp.off('close', restoreStateOnClose);
                };
                photoswipeLightbox.pswp.on('close', restoreStateOnClose);
            }
        }, 100);
    }
}

// NEW: Function to load all images in album when opening preview
async function loadAllImagesForPreview() {
    // Get current state dynamically
    const state = await getCurrentState();
    
    // Skip if we already have all images
    if (state.currentImageList.length >= state.totalImages && state.totalImages > 0) {
        return;
    }

    // Skip if we can't determine folder or total
    if (state.totalImages <= 0) {
        return;
    }

    try {
        // Import required functions
        const { getCurrentFolderInfo } = await import('./app.js');
        
        const { path: currentFolder } = getCurrentFolderInfo();
        if (!currentFolder) {
            return;
        }

        // Calculate how many more images we need
        const remainingImages = state.totalImages - state.currentImageList.length;
        if (remainingImages <= 0) {
            return;
        }

        // Load remaining images in batches
        const imagesToLoad = [];
        let pageToLoad = state.currentPage + 1;
        let loadedCount = 0;

        while (loadedCount < remainingImages) {
                            const responseData = await fetchDataApi('list_files', {
                    path: currentFolder,
                    page: pageToLoad,
                    limit: IMAGES_PER_PAGE
                });

            if (responseData.status === 'success' && responseData.data.files && responseData.data.files.length > 0) {
                // Filter out duplicates - use path fallback when source_path is undefined
                const currentPaths = new Set([...state.currentImageList, ...imagesToLoad].map(item => item.source_path || item.path));
                
                const newImages = responseData.data.files.filter(item => !currentPaths.has(item.source_path || item.path));
                
                imagesToLoad.push(...newImages);
                loadedCount += newImages.length;
                pageToLoad++;

                // Break if we got fewer images than expected (reached end)
                if (newImages.length < IMAGES_PER_PAGE) {
                    break;
                }
                         } else {
                // No more images available
                break;
            }
        }

                 if (imagesToLoad.length > 0) {
             // Update global state
             const updatedImageList = [...state.currentImageList, ...imagesToLoad];
             setCurrentImageList(updatedImageList);
             setCurrentPage(pageToLoad - 1);
         }

    } catch (error) {
        console.error('[photoswipeHandler] Error loading all images for preview:', error);
        // Don't throw - let preview open with current images
    }
}

export function isPhotoSwipeActive() {
    // photoswipeLightbox is the PhotoSwipeLightbox instance from state
    // photoswipeLightbox.pswp is the actual PhotoSwipe gallery instance (if initialized and open)
    if (!photoswipeLightbox || !photoswipeLightbox.pswp) {
        return false;
    }
    return !!photoswipeLightbox.pswp.isOpen;
}

export function closePhotoSwipeIfActive() {
    if (isPhotoSwipeActive()) {
        photoswipeLightbox.pswp.close();
        console.log('[photoswipeHandler] PhotoSwipe closed by system (e.g., ZIP complete).');
        return true;
    }
    return false;
}

// NEW: Dynamic loading for PhotoSwipe preview
let isLoadingMoreForPreview = false;
let lastLoadTriggerIndex = -1; // Prevent rapid repeated loading

async function checkAndLoadMoreForPreview(currentIndex) {
    // Skip if using LOAD_ALL strategy (all images already loaded on open)
    if (PREVIEW_LOADING_STRATEGY === 'LOAD_ALL_ON_OPEN') {
        return;
    }
    
    // Get current state dynamically
    const state = await getCurrentState();
    
    // Don't load if already loading, if we have all images, or if there's no folder context
    if (isLoadingMoreForPreview || state.isLoadingMore || state.currentImageList.length >= state.totalImages) {
        return;
    }
    
    // Check if we're near the end (configurable threshold)
    const isNearEnd = currentIndex >= state.currentImageList.length - PREVIEW_NEAR_END_THRESHOLD;
    
    if (!isNearEnd || currentIndex <= lastLoadTriggerIndex) {
        return;
    }
    
    lastLoadTriggerIndex = currentIndex;
    
    try {
        isLoadingMoreForPreview = true;
        
        // Import required state functions dynamically to avoid circular imports
        const { getCurrentFolderInfo } = await import('./app.js');
        
        const { path: currentFolder } = getCurrentFolderInfo();
        if (!currentFolder) {
            console.warn('[photoswipeHandler] No current folder, cannot load more for preview');
            return;
        }
        
        const nextPage = state.currentPage + 1;
        
        // Fetch next batch
        const responseData = await fetchDataApi('list_files', {
            path: currentFolder,
            page: nextPage, 
            limit: IMAGES_PER_PAGE
        });
        
        if (responseData.status === 'success' && responseData.data.files && responseData.data.files.length > 0) {
            const newImages = responseData.data.files;
            
            // Filter out duplicates - use path fallback when source_path is undefined
            const currentPaths = new Set(state.currentImageList.map(item => item.source_path || item.path));
            const trulyNewImages = newImages.filter(item => !currentPaths.has(item.source_path || item.path));
            
            if (trulyNewImages.length > 0) {
                // Update the global state
                const updatedImageList = [...state.currentImageList, ...trulyNewImages];
                setCurrentImageList(updatedImageList);
                setCurrentPage(nextPage);
                
                // Update PhotoSwipe's dataSource dynamically
                updatePhotoSwipeDataSource(updatedImageList);
                
                console.log(`[photoswipeHandler] Loaded ${trulyNewImages.length} more images for preview. Total: ${updatedImageList.length}`);
            }
        }
        
    } catch (error) {
        console.error('[photoswipeHandler] Error loading more images for preview:', error);
    } finally {
        isLoadingMoreForPreview = false;
    }
}

function updatePhotoSwipeDataSource(newImageList) {
    if (!photoswipeLightbox) {
        return;
    }
    
    // Convert new image list to PhotoSwipe format
    const newDataSource = newImageList.map(itemData => {
        if (itemData.type === 'video') {
            const videoSrc = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
            const posterSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(itemData.path)}&size=750`;
            return {
                html: `<div class="pswp-video-container"><video src="${videoSrc}" controls autoplay playsinline poster="${posterSrc}"></video></div>`,
                width: itemData.width || 0,
                height: itemData.height || 0,
                type: 'video',
                videoSrc: videoSrc,
                filename: itemData.name,
                originalPath: itemData.path
            };
        } else {
            const imageUrl = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
            return {
                src: imageUrl,
                thumb: imageUrl,
                width: itemData.width,
                height: itemData.height,
                alt: itemData.name,
                type: 'image',
                filename: itemData.name,
                originalPath: itemData.path
            };
        }
    });
    
    // Update PhotoSwipe's dataSource
    photoswipeLightbox.options.dataSource = newDataSource;
    
    // If PhotoSwipe instance is active, update its slides array
    const pswp = photoswipeLightbox.pswp;
    if (pswp && pswp.isOpen) {
        // PhotoSwipe 5 doesn't have a direct way to add slides dynamically
        // We need to update the total count and enable navigation to new slides
        pswp.options.dataSource = newDataSource;
        
        // Force PhotoSwipe to recognize the new slide count
        if (pswp.numSlides !== newDataSource.length) {
            pswp.numSlides = newDataSource.length;
        }
        
        // Update the counter if it exists
        if (pswp.ui && pswp.ui.updateCounter) {
            pswp.ui.updateCounter();
        }
    }
}

export async function refreshCurrentPhotoSwipeSlideIfNeeded(imagePath) {
    if (isPhotoSwipeActive()) {
        const pswp = photoswipeLightbox.pswp;
        const currentSlide = pswp.currSlide;
        const slideData = currentSlide.data;

        // Check if the current slide's imagePath matches the one that was updated
        // Assuming slideData.src or a similar property holds the unique identifier or path
        // For images, slideData.src is the full image URL.
        // We need to compare against the original item path used to generate that src.
        // The `currentImageList` is the source of truth for PhotoSwipe's dataSource mapping.

        // Get current state dynamically
        const state = await getCurrentState();
        const originalItem = state.currentImageList.find(item => item.path === imagePath);
        if (originalItem) {
            const expectedSrc = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(originalItem.path)}`;
            const expectedVideoContainer = `<div class="pswp-video-container"><video src="${expectedSrc}"`; // Check start for videos

            let slideMatches = false;
            if (slideData.type === 'image' && slideData.src === expectedSrc) {
                slideMatches = true;
            }
            // For videos, comparing the `html` content might be fragile.
            // Better if we had a direct `path` property on `slideData` from the mapping.
            // Let's refine the dataSource mapping to include the original path.
            // For now, we'll assume the current slide is the one if PhotoSwipe is open.
            // This is a simplification; a more robust check would involve matching slideData.path.
            
            // If the currently displayed slide in PhotoSwipe corresponds to the image path that just got its 750px thumb:
            // We need to update the item in currentImageList first, then tell PhotoSwipe to refresh.
            const itemInState = state.currentImageList[pswp.currIndex];
            if (itemInState && itemInState.path === imagePath) {
                // The dataSource for PhotoSwipe is re-mapped in openPhotoSwipeAtIndex on each open.
                // For live updates, we'd ideally update PhotoSwipe's internal slides array.
                // A simpler way is to tell it to reload the content for the current slide.
                // This assumes the underlying `src` it fetches will now be the 750px version.
                console.log(`[photoswipeHandler] Refreshing content for current slide due to update for: ${imagePath}`);
                pswp.refreshSlideContent(pswp.currIndex);
            }
        }
    }
}

// DEBUG: Expose functions to window for testing (at the end so all functions are defined)
if (typeof window !== 'undefined') {
    window.debugPhotoSwipe = {
        testWithCurrentData: testPhotoSwipeWithCurrentData,
        testWithFakeData: testPhotoSwipeWithFakeData,
        
        // Async state accessors using dynamic imports
        getCurrentImageList: async () => (await getCurrentState()).currentImageList,
        getTotalImages: async () => (await getCurrentState()).totalImages,
        getCurrentPage: async () => (await getCurrentState()).currentPage,
        
        getStrategy: () => PREVIEW_LOADING_STRATEGY,
        loadAllImages: loadAllImagesForPreview,
        openAtIndex: openPhotoSwipeAtIndex,
        
        // Comprehensive state check
        checkState: async () => {
            const state = await getCurrentState();
            return {
                currentImageList: {
                    available: !!state.currentImageList,
                    length: state.currentImageList?.length || 0,
                    first3: state.currentImageList?.slice(0, 3).map(img => img.name) || []
                },
                totalImages: state.totalImages,
                currentPage: state.currentPage,
                isLoadingMore: state.isLoadingMore,
                photoswipeLightbox: !!photoswipeLightbox
            };
        }
    };
    console.log('[photoswipeHandler] Debug functions exposed to window.debugPhotoSwipe with async state access');
} 