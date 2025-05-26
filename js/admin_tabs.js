// Admin Tabs JavaScript
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
});

function initializeTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Show corresponding content
            const targetContent = document.getElementById(`${targetTab}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // Special handling for different tabs
            handleTabSwitch(targetTab);
        });
    });
}

function handleTabSwitch(tabName) {
    switch(tabName) {
        case 'gallery':
            // Reload gallery data if needed
            if (typeof loadFolders === 'function') {
                loadFolders();
            }
            break;
        case 'users':
            // Load user data if needed
            if (typeof loadDesigners === 'function') {
                loadDesigners();
            }
            // Load Jet overview if available
            if (typeof loadJetOverview === 'function') {
                loadJetOverview();
            }
            break;
    }
}

// Export functions for global access
window.initializeTabs = initializeTabs;
window.handleTabSwitch = handleTabSwitch; 