import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js';
import PhotoSwipe from 'https://unpkg.com/photoswipe@5/dist/photoswipe.esm.js';
import { photoswipeLightbox, setPhotoswipeLightbox, currentImageList } from './state.js';
import { API_BASE_URL } from './config.js';

export function initializePhotoSwipeHandler() {
    // Placeholder if any specific initialization is needed for the handler itself
    // For now, setupPhotoSwipe will be called by other modules when image data is ready.
}

export function setupPhotoSwipeIfNeeded() {
    if (photoswipeLightbox) {
        photoswipeLightbox.destroy();
    }
    const newLightbox = new PhotoSwipeLightbox({
        dataSource: currentImageList.map(itemData => {
            if (itemData.type === 'video') {
                const videoSrc = `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`;
                const posterSrc = `${API_BASE_URL}?action=get_thumbnail&path=${encodeURIComponent(itemData.path)}&size=750`; // Or a larger size if preferred
                return {
                    html: `<div class="pswp-video-container"><video src="${videoSrc}" controls autoplay playsinline poster="${posterSrc}"><p>Your browser does not support HTML5 video.</p></video></div>`,
                    width: itemData.width || 1280, // Provide a default width or use actual if available
                    height: itemData.height || 720, // Provide a default height or use actual if available
                    alt: itemData.name,
                    type: 'video' // Explicitly set type for PhotoSwipe if it uses it
                };
            } else { // Image
                return {
                    src: `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`,
                    width: itemData.width || 0, 
                    height: itemData.height || 0, 
                    alt: itemData.name,
                    type: 'image'
                };
            }
        }),
        pswpModule: PhotoSwipe,
        appendToEl: document.body,
        // Optional: Add event listeners for video handling if needed
        // e.g., to pause video when slide changes, play when slide is active
    });

    // Event listeners for video handling within PhotoSwipe
    newLightbox.on('change', () => {
        const currSlide = newLightbox.pswp.currSlide;
        // Pause all videos when slide changes
        document.querySelectorAll('.pswp-video-container video').forEach(video => {
            if (video !== currSlide?.data?.element?.querySelector('video')) {
                video.pause();
            }
        });
        // Autoplay current slide if it's a video and was previously playing or should autoplay
        if (currSlide?.data?.type === 'video') {
            const videoElement = currSlide.data.element?.querySelector('video');
            if (videoElement && videoElement.paused) { // Only play if paused (respects user interaction)
                 // videoElement.play().catch(e => console.warn("Video autoplay prevented:", e));
                 // Autoplay is already on the video tag, this is more for resuming after slide changes if needed.
                 // PhotoSwipe might handle this internally as well based on its config.
            }
        }
    });

    newLightbox.on('close', () => {
        // Pause all videos when PhotoSwipe closes
        document.querySelectorAll('.pswp-video-container video').forEach(video => {
            video.pause();
        });
    });

    newLightbox.init();
    setPhotoswipeLightbox(newLightbox);
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
                html: `<div class="pswp-video-container"><video src="${videoSrc}" controls autoplay playsinline poster="${posterSrc}"><p>Your browser does not support HTML5 video.</p></video></div>`,
                width: itemData.width || 1280,
                height: itemData.height || 720,
                alt: itemData.name,
                type: 'video'
            };
        } else { // Image
            return {
                src: `${API_BASE_URL}?action=get_image&path=${encodeURIComponent(itemData.path)}`,
                width: itemData.width || 0,
                height: itemData.height || 0,
                alt: itemData.name,
                type: 'image'
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