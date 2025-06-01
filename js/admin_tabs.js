// Admin Tabs JavaScript
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
});

function initializeTabs() {
    const tabs = document.querySelectorAll('.admin-tab-button');
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
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            console.log(`Switched to tab: ${targetTab}`);
            
            // Special handling for different tabs
            handleTabSwitch(targetTab);
        });
    });
}

function handleTabSwitch(tabName) {
    console.log(`[AdminTabs] Switching to tab: ${tabName}`);
    
    switch(tabName) {
        case 'gallery-tab':
            // Reload gallery data if needed
            if (typeof loadFolders === 'function') {
                loadFolders();
            }
            break;
        case 'jet-cache-tab':
            // Load RAW cache management data
            if (typeof loadJetCacheStats === 'function') {
                loadJetCacheStats();
            } else {
                console.log('loadJetCacheStats function not found');
            }
            break;
        case 'jet-admin-tab':
            // Load user data if needed
            if (typeof loadDesigners === 'function') {
                loadDesigners();
            }
            // Load Jet overview if available
            if (typeof loadJetOverview === 'function') {
                loadJetOverview();
            } else {
                console.log('loadJetOverview function not found');
            }
            break;
        case 'users-tab':
            // Load users data - allow both admin and designer to see this
            console.log('[AdminTabs] Loading users tab...');
            if (typeof loadAllUsers === 'function') {
                console.log('[AdminTabs] Calling loadAllUsers()');
                loadAllUsers();
            } else {
                console.log('[AdminTabs] loadAllUsers function not found - creating placeholder');
                initializeUsersTab();
            }
            break;
        default:
            console.log(`[AdminTabs] Unknown tab: ${tabName}`);
    }
}

function initializeUsersTab() {
    const usersTableBody = document.getElementById('users-table-body');
    if (usersTableBody) {
        usersTableBody.innerHTML = '<tr><td colspan="5">Chức năng quản lý người dùng sẽ được thêm vào sau.</td></tr>';
    }
}

// Export functions for global access
window.initializeTabs = initializeTabs;
window.handleTabSwitch = handleTabSwitch;

// Function to programmatically switch to a tab (for menu and other external calls)
function switchToTab(tabId) {
    console.log(`[AdminTabs] switchToTab called with: ${tabId}`);
    
    const targetTab = document.querySelector(`[data-tab="${tabId}"]`);
    if (targetTab) {
        targetTab.click(); // Trigger the existing click handler
        console.log(`[AdminTabs] Switched to tab: ${tabId}`);
    } else {
        console.error(`[AdminTabs] Tab button not found for: ${tabId}`);
    }
}

// Export switchToTab globally
window.switchToTab = switchToTab;

// Function for menu calls
function switchToTabFromMenu(tabId) {
    console.log(`[AdminTabs] switchToTabFromMenu called with: ${tabId}`);
    return switchToTab(tabId);
}

window.switchToTabFromMenu = switchToTabFromMenu;

// Alias for showTab (for backward compatibility)
function showTab(tabId) {
    return switchToTab(tabId);
}

window.showTab = showTab; 