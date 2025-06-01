// Shared Menu Component - Có thể tái sử dụng ở tất cả các trang
// js/shared-menu.js

class UnifiedMenu {
    constructor() {
        this.menuToggle = null;
        this.menuDropdown = null;
        this.isInitialized = false;
        this.currentPage = 'unknown';
    }

    init(currentPage = 'unknown') {
        this.currentPage = currentPage;
        
        if (this.isInitialized) {
            console.log('[SharedMenu] Already initialized, skipping...');
            return;
        }

        this.menuToggle = document.getElementById('main-menu-toggle');
        this.menuDropdown = document.getElementById('main-menu-dropdown');

        if (!this.menuToggle || !this.menuDropdown) {
            console.error('[SharedMenu] Menu elements not found in DOM');
            return;
        }

        this.setupEventListeners();
        this.updateActiveMenuItem();
        this.isInitialized = true;
        
        console.log(`[SharedMenu] Initialized for page: ${currentPage}`);
    }

    setupEventListeners() {
        // Toggle menu on click
        this.menuToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleMenu();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.menuToggle.contains(e.target) && !this.menuDropdown.contains(e.target)) {
                this.closeMenu();
            }
        });

        // Handle menu item clicks
        this.menuDropdown.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                // Check if it's a tab switch function call
                const onclickAttr = menuItem.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes('switchToTab')) {
                    e.preventDefault();
                    this.closeMenu();
                    // Execute the onclick function if it exists
                    try {
                        eval(onclickAttr);
                    } catch (error) {
                        console.error('[SharedMenu] Error executing tab switch:', error);
                    }
                    return;
                }
                
                // For regular links, let them proceed naturally but close menu
                if (menuItem.href && menuItem.href !== 'javascript:void(0)') {
                    this.closeMenu();
                }
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMenu();
            }
        });
    }

    toggleMenu() {
        const isOpen = this.menuDropdown.classList.contains('show');
        if (isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        this.menuDropdown.classList.add('show');
        this.menuToggle.classList.add('active');
        this.menuToggle.setAttribute('aria-expanded', 'true');
    }

    closeMenu() {
        this.menuDropdown.classList.remove('show');
        this.menuToggle.classList.remove('active');
        this.menuToggle.setAttribute('aria-expanded', 'false');
    }

    updateActiveMenuItem() {
        // Remove existing active classes
        const allMenuItems = this.menuDropdown.querySelectorAll('.menu-item');
        allMenuItems.forEach(item => item.classList.remove('active'));

        // Add active class based on current page
        let activeSelector = '';
        switch (this.currentPage) {
            case 'gallery':
                activeSelector = 'a[href="index.php"]';
                break;
            case 'jet':
                activeSelector = 'a[href="jet.php"]';
                break;
            case 'admin':
                activeSelector = 'a[href="admin.php"]';
                break;
        }

        if (activeSelector) {
            const activeItem = this.menuDropdown.querySelector(activeSelector);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }
    }

    // Static method to create and initialize menu
    static init(currentPage) {
        if (window.unifiedMenuInstance) {
            window.unifiedMenuInstance.init(currentPage);
        } else {
            window.unifiedMenuInstance = new UnifiedMenu();
            window.unifiedMenuInstance.init(currentPage);
        }
    }

    // Make switchToTab function globally accessible for admin panel
    static switchToTab(tabId) {
        if (typeof window.switchToTab === 'function') {
            window.switchToTab(tabId);
        } else {
            console.error('[SharedMenu] switchToTab function not found on window object');
        }
        
        // Close menu after tab switch
        if (window.unifiedMenuInstance) {
            window.unifiedMenuInstance.closeMenu();
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedMenu;
}

// Global function for onclick handlers
function switchToTabFromMenu(tabId) {
    UnifiedMenu.switchToTab(tabId);
}

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Detect current page from URL or body class
        let currentPage = 'unknown';
        const path = window.location.pathname;
        if (path.includes('jet.php')) {
            currentPage = 'jet';
        } else if (path.includes('admin.php')) {
            currentPage = 'admin';
        } else if (path.includes('index.php') || path === '/' || path.endsWith('/')) {
            currentPage = 'gallery';
        }
        
        UnifiedMenu.init(currentPage);
    });
} else {
    // DOM already loaded
    let currentPage = 'unknown';
    const path = window.location.pathname;
    if (path.includes('jet.php')) {
        currentPage = 'jet';
    } else if (path.includes('admin.php')) {
        currentPage = 'admin';
    } else if (path.includes('index.php') || path === '/' || path.endsWith('/')) {
        currentPage = 'gallery';
    }
    
    UnifiedMenu.init(currentPage);
} 