<?php
/**
 * Directory Index Worker - Background process to build and maintain directory cache
 * 
 * This worker should be run periodically via cron job to keep the directory index fresh.
 * It dramatically improves search and browse performance by pre-caching directory structure.
 * 
 * Usage:
 * - Via CLI: php worker_directory_index.php [source_key] [max_time_seconds]
 * - Via Web: /worker_directory_index.php?source=main&max_time=300
 * 
 * Examples:
 * - php worker_directory_index.php (scan all sources, 300s limit)
 * - php worker_directory_index.php main 180 (scan only 'main' source, 180s limit)
 * - curl "https://photo.guustudio.vn/worker_directory_index.php?source=main&max_time=120"
 */

// Prevent timeout for long-running operations
set_time_limit(0);
ini_set('memory_limit', '512M');

// Load dependencies
require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/api/helpers.php';

// Security check for web access
if (!defined('STDIN')) {
    // Web access - require basic authentication or API key
    $allowed_ips = ['127.0.0.1', '::1']; // Add your server IPs
    $client_ip = $_SERVER['REMOTE_ADDR'] ?? '';
    
    if (!in_array($client_ip, $allowed_ips) && !isset($_GET['api_key'])) {
        http_response_code(403);
        die('Access denied. This worker requires CLI access or valid API key.');
    }
}

/**
 * Log with timestamp for worker tracking
 */
function worker_log($message, $level = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $log_message = "[{$timestamp}] [{$level}] [DirectoryIndexWorker] {$message}";
    
    error_log($log_message);
    
    // Also output to console if CLI
    if (defined('STDIN')) {
        echo $log_message . "\n";
    }
}

/**
 * Get worker parameters from CLI or web request
 */
function get_worker_params() {
    // CLI parameters
    if (defined('STDIN')) {
        global $argv;
        return [
            'source_key' => $argv[1] ?? null,
            'max_time' => isset($argv[2]) ? (int)$argv[2] : 300,
            'force_rebuild' => isset($argv[3]) && $argv[3] === 'force'
        ];
    }
    
    // Web parameters
    return [
        'source_key' => $_GET['source'] ?? null,
        'max_time' => isset($_GET['max_time']) ? (int)$_GET['max_time'] : 300,
        'force_rebuild' => isset($_GET['force']) && $_GET['force'] === 'true'
    ];
}

/**
 * Check if directory index needs rebuilding
 */
function needs_index_rebuild($max_age_hours = 24) {
    global $pdo;
    
    try {
        $stmt = $pdo->query("
            SELECT 
                COUNT(*) as total_dirs,
                COUNT(CASE WHEN updated_at > DATE_SUB(NOW(), INTERVAL {$max_age_hours} HOUR) THEN 1 END) as fresh_dirs,
                MAX(updated_at) as last_update
            FROM directory_index 
            WHERE is_active = 1
        ");
        
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($stats['total_dirs'] == 0) {
            worker_log("No directories in index, rebuild needed");
            return true;
        }
        
        $fresh_ratio = $stats['fresh_dirs'] / $stats['total_dirs'];
        
        if ($fresh_ratio < 0.8) {
            worker_log("Index freshness {$fresh_ratio}% < 80%, rebuild needed");
            return true;
        }
        
        worker_log("Index is fresh ({$fresh_ratio}%), last update: {$stats['last_update']}");
        return false;
        
    } catch (Exception $e) {
        worker_log("Error checking index status: " . $e->getMessage(), 'ERROR');
        return true; // Rebuild on error
    }
}

/**
 * Main worker execution
 */
function run_directory_index_worker() {
    $start_time = time();
    
    worker_log("Directory Index Worker starting");
    
    // Get parameters
    $params = get_worker_params();
    $source_key = $params['source_key'];
    $max_time = max(60, min(3600, $params['max_time'])); // Limit between 1 min and 1 hour
    $force_rebuild = $params['force_rebuild'];
    
    worker_log("Parameters: source_key=" . ($source_key ?? 'all') . ", max_time={$max_time}s, force=" . ($force_rebuild ? 'true' : 'false'));
    
    // Check if rebuild is needed (unless forced)
    if (!$force_rebuild && !needs_index_rebuild()) {
        worker_log("Directory index is fresh, skipping rebuild");
        return [
            'status' => 'skipped',
            'reason' => 'Index is fresh',
            'duration' => time() - $start_time
        ];
    }
    
    // Run the index builder
    worker_log("Starting directory index build" . ($source_key ? " for source: {$source_key}" : " for all sources"));
    
    try {
        $scan_results = build_directory_index($source_key, $max_time);
        
        $duration = time() - $start_time;
        
        // Log detailed results
        worker_log("Index build completed in {$duration}s");
        worker_log("Sources scanned: {$scan_results['sources_scanned']}");
        worker_log("Directories found: {$scan_results['directories_found']}");
        worker_log("Directories created: {$scan_results['directories_created']}");
        worker_log("Directories updated: {$scan_results['directories_updated']}");
        worker_log("Thumbnails found: {$scan_results['thumbnails_found']}");
        worker_log("Protected folders: {$scan_results['protected_folders']}");
        worker_log("Peak memory: " . round($scan_results['memory_peak'] / 1024 / 1024, 2) . "MB");
        
        if (isset($scan_results['error'])) {
            worker_log("Build completed with errors: " . $scan_results['error'], 'WARNING');
        }
        
        // Get final index statistics
        $index_stats = get_directory_index_stats();
        worker_log("Final index stats: {$index_stats['active_directories']} active directories, health score: {$index_stats['health_score']}%");
        
        return [
            'status' => 'completed',
            'scan_results' => $scan_results,
            'index_stats' => $index_stats,
            'duration' => $duration
        ];
        
    } catch (Exception $e) {
        $duration = time() - $start_time;
        worker_log("Fatal error during index build: " . $e->getMessage(), 'ERROR');
        
        return [
            'status' => 'error',
            'error' => $e->getMessage(),
            'duration' => $duration
        ];
    }
}

// Execute worker
$worker_result = run_directory_index_worker();

// Output results
if (defined('STDIN')) {
    // CLI output
    echo "\n=== DIRECTORY INDEX WORKER COMPLETED ===\n";
    echo "Status: " . $worker_result['status'] . "\n";
    echo "Duration: " . $worker_result['duration'] . "s\n";
    
    if (isset($worker_result['scan_results'])) {
        $results = $worker_result['scan_results'];
        echo "Directories processed: " . ($results['directories_created'] + $results['directories_updated']) . "\n";
        echo "Cache effectiveness: " . round(($results['thumbnails_found'] / max(1, $results['directories_found'])) * 100, 1) . "%\n";
    }
    
    if (isset($worker_result['error'])) {
        echo "Error: " . $worker_result['error'] . "\n";
        exit(1);
    }
    
    exit(0);
} else {
    // Web output
    header('Content-Type: application/json');
    echo json_encode($worker_result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} 