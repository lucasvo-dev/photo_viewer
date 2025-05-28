export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// === PERFORMANCE UTILITIES ===

// Request Manager for deduplication and cancellation
export class RequestManager {
    constructor() {
        this.activeRequests = new Map();
        this.requestQueue = [];
    }
    
    async makeRequest(key, requestFn) {
        // Check if identical request is already in progress
        if (this.activeRequests.has(key)) {
            console.log(`[RequestManager] Deduplicating request for key: ${key}`);
            return this.activeRequests.get(key);
        }
        
        console.log(`[RequestManager] Making new request for key: ${key}`);
        const promise = requestFn();
        this.activeRequests.set(key, promise);
        
        try {
            const result = await promise;
            return result;
        } catch (error) {
            console.error(`[RequestManager] Request failed for key: ${key}`, error);
            throw error;
        } finally {
            this.activeRequests.delete(key);
        }
    }
    
    cancelRequest(key) {
        if (this.activeRequests.has(key)) {
            // If the request has an abort controller, use it
            const request = this.activeRequests.get(key);
            if (request && request.abort) {
                request.abort();
            }
            this.activeRequests.delete(key);
            console.log(`[RequestManager] Cancelled request for key: ${key}`);
        }
    }
    
    cancelAllRequests() {
        console.log(`[RequestManager] Cancelling all ${this.activeRequests.size} active requests`);
        this.activeRequests.forEach((request, key) => {
            if (request && request.abort) {
                request.abort();
            }
        });
        this.activeRequests.clear();
    }
    
    getActiveRequestCount() {
        return this.activeRequests.size;
    }
}

// Scroll Direction Tracker for smart preloading
export class ScrollDirectionTracker {
    constructor() {
        this.scrollDirection = 'down';
        this.lastScrollY = 0;
        this.scrollVelocity = 0;
        this.lastScrollTime = Date.now();
    }
    
    update() {
        const currentScrollY = window.scrollY;
        const currentTime = Date.now();
        const timeDelta = currentTime - this.lastScrollTime;
        
        if (timeDelta > 0) {
            const scrollDelta = currentScrollY - this.lastScrollY;
            this.scrollVelocity = Math.abs(scrollDelta) / timeDelta;
            
            if (scrollDelta > 5) {
                this.scrollDirection = 'down';
            } else if (scrollDelta < -5) {
                this.scrollDirection = 'up';
            }
            // If small delta, keep previous direction
        }
        
        this.lastScrollY = currentScrollY;
        this.lastScrollTime = currentTime;
    }
    
    getDirection() {
        return this.scrollDirection;
    }
    
    getVelocity() {
        return this.scrollVelocity;
    }
    
    isFastScrolling() {
        return this.scrollVelocity > 2; // pixels per millisecond
    }
}

// Connection Quality Detector
export class ConnectionQualityDetector {
    constructor() {
        this.quality = 'unknown';
        this.effectiveType = null;
        this.downlink = null;
        this.rtt = null;
        
        this.detectConnection();
    }
    
    detectConnection() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            this.effectiveType = connection.effectiveType;
            this.downlink = connection.downlink;
            this.rtt = connection.rtt;
            
            // Classify connection quality
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                this.quality = 'poor';
            } else if (connection.effectiveType === '3g') {
                this.quality = 'moderate';
            } else if (connection.effectiveType === '4g' && connection.downlink > 5) {
                this.quality = 'good';
            } else {
                this.quality = 'moderate';
            }
        } else {
            // Fallback detection based on timing
            this.quality = 'unknown';
        }
    }
    
    getQuality() {
        return this.quality;
    }
    
    shouldReduceQuality() {
        return this.quality === 'poor';
    }
    
    getOptimalConcurrency() {
        switch (this.quality) {
            case 'poor': return 1;
            case 'moderate': return 2;
            case 'good': return 4;
            default: return 2;
        }
    }
}

// Image Format Support Detection
export class ImageFormatDetector {
    constructor() {
        this.supportedFormats = new Set();
        this.detectSupport();
    }
    
    async detectSupport() {
        // Test WebP support
        if (await this.testFormat('webp')) {
            this.supportedFormats.add('webp');
        }
        
        // Test AVIF support  
        if (await this.testFormat('avif')) {
            this.supportedFormats.add('avif');
        }
        
        console.log('[ImageFormatDetector] Supported formats:', Array.from(this.supportedFormats));
    }
    
    testFormat(format) {
        return new Promise((resolve) => {
            const testImages = {
                webp: 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
                avif: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8WfhwB8+ErK42A='
            };
            
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = testImages[format];
        });
    }
    
    supportsWebP() {
        return this.supportedFormats.has('webp');
    }
    
    supportsAVIF() {
        return this.supportedFormats.has('avif');
    }
    
    getOptimalFormat() {
        if (this.supportsAVIF()) return 'avif';
        if (this.supportsWebP()) return 'webp';
        return 'jpeg';
    }
}

// Performance Monitor
export class PerformanceMonitor {
    constructor() {
        this.metrics = {
            imageLoadTimes: [],
            apiRequestTimes: [],
            renderTimes: []
        };
    }
    
    startTiming(operation) {
        return performance.now();
    }
    
    endTiming(operation, startTime, category = 'general') {
        const duration = performance.now() - startTime;
        
        if (!this.metrics[category]) {
            this.metrics[category] = [];
        }
        
        this.metrics[category].push(duration);
        
        // Keep only last 50 measurements
        if (this.metrics[category].length > 50) {
            this.metrics[category] = this.metrics[category].slice(-50);
        }
        
        console.log(`[PerformanceMonitor] ${operation} took ${duration.toFixed(2)}ms`);
        return duration;
    }
    
    getAverageTime(category) {
        const times = this.metrics[category];
        if (!times || times.length === 0) return 0;
        
        return times.reduce((sum, time) => sum + time, 0) / times.length;
    }
    
    logReport() {
        console.log('[PerformanceMonitor] Performance Report:');
        Object.entries(this.metrics).forEach(([category, times]) => {
            if (times.length > 0) {
                const avg = this.getAverageTime(category);
                const min = Math.min(...times);
                const max = Math.max(...times);
                console.log(`  ${category}: avg=${avg.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms (${times.length} samples)`);
            }
        });
    }
}

// Global instances
export const globalRequestManager = new RequestManager();
export const globalScrollTracker = new ScrollDirectionTracker();
export const globalConnectionDetector = new ConnectionQualityDetector();
export const globalImageFormatDetector = new ImageFormatDetector();
export const globalPerformanceMonitor = new PerformanceMonitor(); 