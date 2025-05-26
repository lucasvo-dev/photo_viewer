import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';
import { photoswipeLightbox, setPhotoswipeLightbox, currentImageList } from './state.js';
import { API_BASE_URL } from './config.js';
import { triggerDirectDownload } from './app.js'; // Import the helper

export function initializePhotoSwipeHandler() {
    // Placeholder if any specific initialization is needed for the handler itself
    // For now, setupPhotoSwipe will be called by other modules when image data is ready.
}

export function setupPhotoSwipeIfNeeded() {
    if (photoswipeLightbox) {
        photoswipeLightbox.destroy();
        setPhotoswipeLightbox(null);
    }

    const newLightbox = new PhotoSwipeLightbox({
        dataSource: currentImageList.map(itemData => {
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
                // Check if it's a RAW image for the Jet app context
                // Assuming itemData has a property like 'is_raw' or similar, or checking size specifically
                // Given the context, if it's not a video, and we're dealing with Jet app, it's likely a RAW preview.
                // We should request the 'preview' size (750px) for the main image source.
                const imageUrl = `${API_BASE_URL}?action=jet_get_raw_preview&path=${encodeURIComponent(itemData.path)}&size=preview`;
                
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

    // Show/hide download button based on slide type
    newLightbox.on('change', () => {
        const pswp = newLightbox.pswp;
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
        } else {
            // console.warn('[photoswipeHandler] 'change' event: pswp.ui or pswp.ui.element not available yet.');
        }
    });
    // Also check on initial open
    newLightbox.on('afterInit', () => {
        const pswp = newLightbox.pswp;
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
        } else {
            // console.warn('[photoswipeHandler] 'afterInit' event: pswp.ui or pswp.ui.element not available yet.');
        }
    });

    newLightbox.init();
    setPhotoswipeLightbox(newLightbox);
    console.log("[photoswipeHandler.js] PhotoSwipe initialized with custom UI for video download.");
}

export function openPhotoSwipeAtIndex(index) {
    if (!photoswipeLightbox) {
        console.warn("PhotoSwipe not initialized, attempting to set it up.");
        setupPhotoSwipeIfNeeded();
        if(!photoswipeLightbox) {
            console.error("PhotoSwipe could not be initialized!");
            return;
        }
    }
    // Ensure dataSource is up-to-date before opening
    // This is crucial if currentImageList changes dynamically without re-initing the whole lightbox
    photoswipeLightbox.options.dataSource = currentImageList.map(itemData => {
        if (itemData.type === 'video') {
            const videoSrc = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
            const posterSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(itemData.path)}&size=750`;
            return {
                html: `<div class="pswp-video-container"><video src="${videoSrc}" controls autoplay playsinline poster="${posterSrc}"></video></div>`,
                width: itemData.width || 0, // Use actual dimensions if available, else 0 for auto
                height: itemData.height || 0,
                type: 'video',
                videoSrc: videoSrc, // Ensure videoSrc is added
                filename: itemData.name, // Ensure filename is added
                originalPath: itemData.path // <-- ADDED ORIGINAL PATH
            };
        } else { // Image
            // Check if it's a RAW image for the Jet app context
            // Assuming itemData has a property like 'is_raw' or similar, or checking size specifically
            // Given the context, if it's not a video, and we're dealing with Jet app, it's likely a RAW preview.
            // We should request the the RAW preview size for the main image source and the thumbnail.
            const imageUrl = `${API_BASE_URL}?action=jet_get_raw_preview&path=${encodeURIComponent(itemData.path)}&size=preview`;
            
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
    });
    photoswipeLightbox.loadAndOpen(index);
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

export function refreshCurrentPhotoSwipeSlideIfNeeded(imagePath) {
    if (isPhotoSwipeActive()) {
        const pswp = photoswipeLightbox.pswp;
        const currentSlide = pswp.currSlide;
        const slideData = currentSlide.data;

        // Check if the current slide's imagePath matches the one that was updated
        // Assuming slideData.src or a similar property holds the unique identifier or path
        // For images, slideData.src is the full image URL.
        // We need to compare against the original item path used to generate that src.
        // The `currentImageList` is the source of truth for PhotoSwipe's dataSource mapping.

        const originalItem = currentImageList.find(item => item.path === imagePath);
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
            const itemInState = currentImageList[pswp.currIndex];
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