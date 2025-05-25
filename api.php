<?php
// error_log('--- API.PHP TOP LEVEL EXECUTION MARKER ---'); // New marker (commented out)
// api.php (Main Entry Point)

// --- 1. Initialization & Global Setup ---
// This file now handles error reporting, session, db connection, constants, and basic variables ($pdo, $action, etc.)
require_once __DIR__ . '/api/init.php';

// --- 2. Load Helper Functions ---
require_once __DIR__ . '/api/helpers.php';

// --- 3. Route Action to Appropriate Handler ---

// LOG THE ACTION (commented out to reduce log noise)
// error_log("[API ROUTING] Action received: " . ($action ?? 'NOT SET'));
// error_log('--- API.PHP BEFORE ACTION ROUTING ---');

// Define specific Jet application actions that are handled by actions_jet.php
// $jetAppSpecificActions = ['jet_list_images', 'jet_get_raw_preview']; // REMOVED

// Restore the first if block as it was, but make it general for all jet_ actions
// Condition: action starts with 'jet_' AND is NOT 'jet_list_raw_sources'
if (strpos($action, 'jet_') === 0 && $action !== 'jet_list_raw_sources') { 
    // These are Jet culling app specific actions processed by actions_jet.php
    // IMPORTANT: Changed to check for admin_logged_in for consistency
    if (empty($_SESSION['admin_logged_in'])) { 
        error_log('--- API.PHP SESSION FAIL for Jet App Specific Action: ' . $action . ' (Reason: admin_logged_in is empty) Session data: ' . print_r($_SESSION, true) . ' SID: ' . session_id());
        json_error("Truy cập bị Từ chối. Yêu cầu xác thực quản trị viên cho hành động Jet (app specific).", 403);
        exit;
    }
    error_log('--- API.PHP SESSION OK for Jet App Specific Action: ' . $action . ' (admin_logged_in is set) SID: ' . session_id());
    require_once __DIR__ . '/api/actions_jet.php';
}

// New log after the first if block (commented out to reduce log noise)
// error_log('--- API.PHP AFTER JET APP SPECIFIC ACTIONS IF --- Action: ' . $action);

// The second block (previously elseif, now if from the successful test)
// handles admin actions and jet_list_raw_sources
// Condition: action starts with 'admin_' OR IS 'jet_list_raw_sources'
if (strpos($action, 'admin_') === 0 || $action === 'jet_list_raw_sources') {
    error_log('--- API.PHP INSIDE ADMIN/JET_LIST_RAW_SOURCES IF --- Checking session for action: ' . $action);
    // IMPORTANT: Temporarily changed to check for admin_logged_in instead of user_id for broader compatibility
    if (empty($_SESSION['admin_logged_in'])) { 
        error_log('--- API.PHP SESSION FAIL for action: ' . $action . ' (Reason: admin_logged_in is empty) Session data: ' . print_r($_SESSION, true) . ' SID: ' . session_id());
        json_error("Truy cập bị Từ chối. Yêu cầu xác thực quản trị viên (" . htmlspecialchars($action) . ").", 403);
        exit;
    }
    // If admin_logged_in is set, we can assume user_id should correspond to admin_username if needed by actions_admin/jet.
    // For now, just ensuring admin_logged_in is sufficient for this auth check.
    error_log('--- API.PHP SESSION OK (admin_logged_in is set) for action: ' . $action . ' SID: ' . session_id());
    require_once __DIR__ . '/api/actions_admin.php';

} elseif (!empty($action)) { // Catches any other non-empty action as potentially public
    // Load and execute public actions
    // The switch statement inside actions_public.php will handle the specific action
    // or fall through if it's not a known public action.
    require_once __DIR__ . '/api/actions_public.php';
} else {
    // If action is empty, it's an invalid request directly to api.php without parameters
    json_error("Hành động không được cung cấp.", 400);
    exit;
}

// Fallback for Unknown Actions within loaded files (actions_public.php, actions_admin.php, actions_jet.php)
// Each of those files should have a default case in their switch that calls json_error and exits.
// If execution reaches here, it means a required file was loaded, but the action wasn't in its switch, AND it didn't exit.
// This part of the code should ideally not be reached if action files are well-behaved.
// However, the original fallback is kept, but it might be slightly redundant now.

// json_error function is loaded from helpers.php
json_error("Hành động không xác định hoặc không được hỗ trợ (fallback api.php): " . htmlspecialchars($action), 400);

// Note: The json_error function includes an exit call, so the script terminates here.

?>