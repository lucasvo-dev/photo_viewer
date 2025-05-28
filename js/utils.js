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

// === ENHANCED SCROLL DIRECTION TRACKER ===
// Optimized for Masonry galleries with better velocity tracking and preload decisions
class ScrollDirectionTracker {
    constructor() {
        this.lastScrollY = window.scrollY;
        this.lastTimestamp = performance.now();
        this.direction = 'none';
        this.velocity = 0;
        this.isScrolling = false;
        this.scrollHistory = [];
        this.maxHistoryLength = 5; // Track last 5 scroll events for pattern analysis
        this.scrollTimeout = null;
        this.consistentDirectionCount = 0;
        this.lastDirection = 'none';
        
        // Optimized thresholds for Masonry galleries
        this.velocityThreshold = 0.5; // Reduced for more responsive preloading
        this.consistentScrollThreshold = 3; // Require 3 consistent direction changes
        this.preloadCooldown = 1000; // 1 second cooldown between preload decisions
        this.lastPreloadTime = 0;
    }

    update() {
        const currentScrollY = window.scrollY;
        const currentTime = performance.now();
        const deltaY = currentScrollY - this.lastScrollY;
        const deltaTime = currentTime - this.lastTimestamp;
        
        // Calculate velocity (pixels per millisecond)
        this.velocity = deltaTime > 0 ? Math.abs(deltaY) / deltaTime : 0;
        
        // Determine direction
        const newDirection = deltaY > 5 ? 'down' : deltaY < -5 ? 'up' : 'none';
        
        // Track direction consistency for better preload decisions
        if (newDirection !== 'none') {
            if (newDirection === this.lastDirection) {
                this.consistentDirectionCount++;
            } else {
                this.consistentDirectionCount = 1;
                this.lastDirection = newDirection;
            }
            this.direction = newDirection;
        }
        
        // Update scroll history for pattern analysis
        this.scrollHistory.push({
            y: currentScrollY,
            direction: newDirection,
            velocity: this.velocity,
            timestamp: currentTime
        });
        
        // Keep history manageable
        if (this.scrollHistory.length > this.maxHistoryLength) {
            this.scrollHistory.shift();
        }
        
        // Set scrolling state
        this.isScrolling = true;
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
            this.direction = 'none';
            this.consistentDirectionCount = 0;
        }, 150); // Reduced timeout for more responsive state changes
        
        // Update tracking variables
        this.lastScrollY = currentScrollY;
        this.lastTimestamp = currentTime;
    }

    // Enhanced preload decision logic for Masonry galleries
    shouldPreload() {
        const now = performance.now();
        
        // Cooldown check
        if (now - this.lastPreloadTime < this.preloadCooldown) {
            return false;
        }
        
        // Don't preload during active scrolling
        if (this.isScrolling) {
            return false;
        }
        
        // Check for consistent scroll direction
        if (this.consistentDirectionCount < this.consistentScrollThreshold) {
            return false;
        }
        
        // Check velocity - only preload during slow, steady scrolling
        if (this.velocity > this.velocityThreshold) {
            return false;
        }
        
        // Analyze scroll pattern for predictable behavior
        if (this.scrollHistory.length >= 3) {
            const recentDirections = this.scrollHistory.slice(-3).map(h => h.direction);
            const isConsistent = recentDirections.every(dir => dir === recentDirections[0] && dir !== 'none');
            
            if (isConsistent) {
                this.lastPreloadTime = now;
                return true;
            }
        }
        
        return false;
    }

    getScrollDirection() {
        return this.direction;
    }

    getScrollVelocity() {
        return this.velocity;
    }

    isScrollingDown() {
        return this.direction === 'down' && this.consistentDirectionCount >= 2;
    }

    isScrollingUp() {
        return this.direction === 'up' && this.consistentDirectionCount >= 2;
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

// === ENHANCED PERFORMANCE MONITOR ===
// Optimized for Masonry gallery performance tracking
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.timings = new Map();
        this.imageLoadTimes = [];
        this.masonryLayoutTimes = [];
        this.scrollPerformance = [];
        this.maxMetricsHistory = 100; // Keep last 100 measurements
        
        // Performance thresholds for Masonry galleries
        this.thresholds = {
            imageLoad: 2000, // 2 seconds max for image loading
            masonryLayout: 100, // 100ms max for layout operations
            scrollResponse: 16, // 16ms for 60fps scroll response
            apiResponse: 1000 // 1 second max for API responses
        };
        
        // Track performance patterns
        this.performancePatterns = {
            slowImageLoads: 0,
            slowMasonryLayouts: 0,
            slowScrollResponses: 0,
            slowApiResponses: 0
        };
    }

    // Start timing an operation
    startTiming(operationName) {
        const startTime = performance.now();
        this.timings.set(operationName, startTime);
        return startTime;
    }

    // End timing and record metrics
    endTiming(operationName, startTime = null, category = 'general') {
        const endTime = performance.now();
        const actualStartTime = startTime || this.timings.get(operationName);
        
        if (!actualStartTime) {
            console.warn(`[PerformanceMonitor] No start time found for operation: ${operationName}`);
            return null;
        }
        
        const duration = endTime - actualStartTime;
        this.recordMetric(operationName, duration, category);
        this.timings.delete(operationName);
        
        // Check against thresholds and update patterns
        this.checkThresholds(operationName, duration, category);
        
        return duration;
    }

    // Record a performance metric
    recordMetric(name, value, category = 'general') {
        if (!this.metrics.has(category)) {
            this.metrics.set(category, new Map());
        }
        
        const categoryMetrics = this.metrics.get(category);
        if (!categoryMetrics.has(name)) {
            categoryMetrics.set(name, []);
        }
        
        const metricArray = categoryMetrics.get(name);
        metricArray.push({
            value,
            timestamp: performance.now()
        });
        
        // Keep metrics history manageable
        if (metricArray.length > this.maxMetricsHistory) {
            metricArray.shift();
        }
        
        // Store in specialized arrays for analysis
        this.storeSpecializedMetrics(name, value, category);
    }

    // Store metrics in specialized arrays for better analysis
    storeSpecializedMetrics(name, value, category) {
        switch (category) {
            case 'imageLoad':
                this.imageLoadTimes.push(value);
                if (this.imageLoadTimes.length > this.maxMetricsHistory) {
                    this.imageLoadTimes.shift();
                }
                break;
            case 'masonryLayout':
                this.masonryLayoutTimes.push(value);
                if (this.masonryLayoutTimes.length > this.maxMetricsHistory) {
                    this.masonryLayoutTimes.shift();
                }
                break;
            case 'scrollResponse':
                this.scrollPerformance.push(value);
                if (this.scrollPerformance.length > this.maxMetricsHistory) {
                    this.scrollPerformance.shift();
                }
                break;
        }
    }

    // Check performance against thresholds
    checkThresholds(operationName, duration, category) {
        let threshold = this.thresholds.general || 1000;
        
        switch (category) {
            case 'imageLoad':
                threshold = this.thresholds.imageLoad;
                if (duration > threshold) {
                    this.performancePatterns.slowImageLoads++;
                }
                break;
            case 'masonryLayout':
                threshold = this.thresholds.masonryLayout;
                if (duration > threshold) {
                    this.performancePatterns.slowMasonryLayouts++;
                    console.warn(`[PerformanceMonitor] Slow Masonry layout detected: ${duration.toFixed(2)}ms for ${operationName}`);
                }
                break;
            case 'scrollResponse':
                threshold = this.thresholds.scrollResponse;
                if (duration > threshold) {
                    this.performancePatterns.slowScrollResponses++;
                }
                break;
            case 'apiResponse':
                threshold = this.thresholds.apiResponse;
                if (duration > threshold) {
                    this.performancePatterns.slowApiResponses++;
                }
                break;
        }
    }

    // Get performance statistics
    getStats(category = null) {
        if (category) {
            return this.getCategoryStats(category);
        }
        
        return {
            imageLoading: this.getImageLoadingStats(),
            masonryPerformance: this.getMasonryStats(),
            scrollPerformance: this.getScrollStats(),
            overallPatterns: this.performancePatterns
        };
    }

    // Get image loading statistics
    getImageLoadingStats() {
        if (this.imageLoadTimes.length === 0) return null;
        
        const times = this.imageLoadTimes;
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        const median = this.calculateMedian(times);
        
        return {
            average: avg,
            median,
            min,
            max,
            count: times.length,
            slowLoads: this.performancePatterns.slowImageLoads
        };
    }

    // Get Masonry performance statistics
    getMasonryStats() {
        if (this.masonryLayoutTimes.length === 0) return null;
        
        const times = this.masonryLayoutTimes;
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        
        return {
            average: avg,
            min,
            max,
            count: times.length,
            slowLayouts: this.performancePatterns.slowMasonryLayouts
        };
    }

    // Get scroll performance statistics
    getScrollStats() {
        if (this.scrollPerformance.length === 0) return null;
        
        const times = this.scrollPerformance;
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const droppedFrames = times.filter(time => time > 16).length;
        
        return {
            average: avg,
            droppedFrames,
            totalMeasurements: times.length,
            frameDropRate: (droppedFrames / times.length) * 100
        };
    }

    // Calculate median value
    calculateMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Get category-specific statistics
    getCategoryStats(category) {
        const categoryMetrics = this.metrics.get(category);
        if (!categoryMetrics) return null;
        
        const stats = {};
        for (const [metricName, metricArray] of categoryMetrics) {
            const values = metricArray.map(m => m.value);
            if (values.length > 0) {
                stats[metricName] = {
                    average: values.reduce((sum, val) => sum + val, 0) / values.length,
                    min: Math.min(...values),
                    max: Math.max(...values),
                    count: values.length,
                    recent: values.slice(-5) // Last 5 measurements
                };
            }
        }
        
        return stats;
    }

    // Log performance summary
    logPerformanceSummary() {
        const stats = this.getStats();
        console.group('[PerformanceMonitor] Performance Summary');
        
        if (stats.imageLoading) {
            console.log('Image Loading:', {
                avgTime: `${stats.imageLoading.average.toFixed(2)}ms`,
                medianTime: `${stats.imageLoading.median.toFixed(2)}ms`,
                slowLoads: stats.imageLoading.slowLoads,
                totalImages: stats.imageLoading.count
            });
        }
        
        if (stats.masonryPerformance) {
            console.log('Masonry Performance:', {
                avgLayoutTime: `${stats.masonryPerformance.average.toFixed(2)}ms`,
                slowLayouts: stats.masonryPerformance.slowLayouts,
                totalLayouts: stats.masonryPerformance.count
            });
        }
        
        if (stats.scrollPerformance) {
            console.log('Scroll Performance:', {
                avgResponseTime: `${stats.scrollPerformance.average.toFixed(2)}ms`,
                frameDropRate: `${stats.scrollPerformance.frameDropRate.toFixed(1)}%`,
                droppedFrames: stats.scrollPerformance.droppedFrames
            });
        }
        
        console.groupEnd();
    }

    // Clear all metrics
    clearMetrics() {
        this.metrics.clear();
        this.timings.clear();
        this.imageLoadTimes = [];
        this.masonryLayoutTimes = [];
        this.scrollPerformance = [];
        this.performancePatterns = {
            slowImageLoads: 0,
            slowMasonryLayouts: 0,
            slowScrollResponses: 0,
            slowApiResponses: 0
        };
    }
}

// === GLOBAL INSTANCES ===
// Create optimized global instances for Masonry gallery performance
export const globalRequestManager = new RequestManager();
export const globalScrollTracker = new ScrollDirectionTracker();
export const globalPerformanceMonitor = new PerformanceMonitor();

// Initialize scroll tracking
window.addEventListener('scroll', () => {
    globalScrollTracker.update();
}, { passive: true });

// Log performance summary every 2 minutes in development
if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
    setInterval(() => {
        globalPerformanceMonitor.logPerformanceSummary();
    }, 120000); // 2 minutes
}

console.log('[utils.js] Optimized utilities initialized for Masonry gallery performance'); 