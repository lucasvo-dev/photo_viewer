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

// Kiểm tra quyền cho các action Jet
if (strpos($action, 'jet_') === 0) {
    error_log("[API.PHP] Jet action detected: " . $action);
    error_log("[API.PHP] Session user_id: " . ($_SESSION['user_id'] ?? 'NOT SET'));
    error_log("[API.PHP] Session user_role: " . ($_SESSION['user_role'] ?? 'NOT SET'));
    if (!isset($_SESSION['user_role']) || 
        ($_SESSION['user_role'] !== 'designer' && $_SESSION['user_role'] !== 'admin')) {
        json_error("Truy cập bị từ chối. Yêu cầu quyền designer hoặc admin.", 403);
        exit;
    }
    error_log("[API.PHP] About to include actions_jet.php");
    require_once __DIR__ . '/api/actions_jet.php';
}

// New log after the first if block (commented out to reduce log noise)
// error_log('--- API.PHP AFTER JET APP SPECIFIC ACTIONS IF --- Action: ' . $action);

// Handle admin-only actions
if (strpos($action, 'admin_') === 0) {
    // Check for admin role using the new role-based system
    if (!isset($_SESSION['user_role']) || $_SESSION['user_role'] !== 'admin') {
        json_error("Truy cập bị từ chối. Yêu cầu quyền admin.", 403);
        exit;
    }
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