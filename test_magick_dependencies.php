<?php
// test_magick_dependencies.php - Enhanced ImageMagick dependency diagnostic
echo "=== ImageMagick Dependency Diagnostic ===\n";
echo "Date: " . date('Y-m-d H:i:s') . "\n\n";

$magick_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "magick.exe";
$exe_dir = __DIR__ . DIRECTORY_SEPARATOR . "exe";

// Test 1: Basic file information
echo "1. File Information:\n";
if (file_exists($magick_path)) {
    $magick_size = filesize($magick_path);
    $magick_time = filemtime($magick_path);
    echo "   File: {$magick_path}\n";
    echo "   Size: " . number_format($magick_size) . " bytes\n";
    echo "   Modified: " . date('Y-m-d H:i:s', $magick_time) . "\n";
    echo "   Readable: " . (is_readable($magick_path) ? "YES" : "NO") . "\n";
    echo "   Executable: " . (is_executable($magick_path) ? "YES" : "NO") . "\n";
} else {
    echo "   ERROR: File not found\n";
    exit(1);
}

// Test 2: Directory contents
echo "\n2. EXE Directory Contents:\n";
if (is_dir($exe_dir)) {
    $files = scandir($exe_dir);
    foreach ($files as $file) {
        if ($file !== '.' && $file !== '..') {
            $file_path = $exe_dir . DIRECTORY_SEPARATOR . $file;
            $size = is_file($file_path) ? filesize($file_path) : 0;
            $type = is_dir($file_path) ? "DIR" : "FILE";
            echo "   {$type}: {$file} (" . number_format($size) . " bytes)\n";
        }
    }
} else {
    echo "   ERROR: EXE directory not found\n";
}

// Test 3: Direct execution test with different methods
echo "\n3. Direct Execution Tests:\n";

// Method 1: Basic execution
echo "   Method 1 - Basic shell_exec:\n";
$basic_cmd = "\"{$magick_path}\"";
echo "   Command: {$basic_cmd}\n";
$start_time = microtime(true);
$basic_output = shell_exec($basic_cmd . " 2>&1");
$exec_time = round((microtime(true) - $start_time) * 1000, 2);
echo "   Time: {$exec_time}ms\n";
echo "   Output: " . (trim($basic_output) ?: "EMPTY") . "\n";

// Method 2: With timeout and error capture
echo "\n   Method 2 - With cmd wrapper:\n";
$cmd_wrapper = "cmd /c \"{$magick_path}\" 2>&1";
echo "   Command: {$cmd_wrapper}\n";
$start_time = microtime(true);
$wrapper_output = shell_exec($cmd_wrapper);
$exec_time = round((microtime(true) - $start_time) * 1000, 2);
echo "   Time: {$exec_time}ms\n";
echo "   Output: " . (trim($wrapper_output) ?: "EMPTY") . "\n";

// Method 3: Test with help parameter
echo "\n   Method 3 - With help parameter:\n";
$help_cmd = "\"{$magick_path}\" -help";
echo "   Command: {$help_cmd}\n";
$start_time = microtime(true);
$help_output = shell_exec($help_cmd . " 2>&1");
$exec_time = round((microtime(true) - $start_time) * 1000, 2);
echo "   Time: {$exec_time}ms\n";
echo "   Output: " . (trim($help_output) ?: "EMPTY") . "\n";

// Test 4: System information
echo "\n4. System Information:\n";
echo "   PHP Version: " . PHP_VERSION . "\n";
echo "   OS: " . PHP_OS . "\n";
echo "   Architecture: " . php_uname('m') . "\n";
echo "   Processor: " . (php_uname('p') ?: 'Unknown') . "\n";

// Test 5: Check for known DLL dependencies in exe directory
echo "\n5. DLL Dependency Check:\n";
$required_dlls = [
    'CORE_RL_MagickCore_.dll',
    'CORE_RL_MagickWand_.dll', 
    'IM_MOD_RL_jpeg_.dll',
    'IM_MOD_RL_tiff_.dll',
    'msvcr120.dll',
    'msvcp120.dll',
    'vcomp120.dll'
];

foreach ($required_dlls as $dll) {
    $dll_path = $exe_dir . DIRECTORY_SEPARATOR . $dll;
    if (file_exists($dll_path)) {
        $dll_size = filesize($dll_path);
        echo "   ✓ Found: {$dll} (" . number_format($dll_size) . " bytes)\n";
    } else {
        echo "   ✗ Missing: {$dll}\n";
    }
}

// Test 6: Alternative ImageMagick executable names
echo "\n6. Alternative Executable Check:\n";
$alt_executables = ['magick.exe', 'convert.exe', 'identify.exe'];
foreach ($alt_executables as $exe) {
    $exe_path = $exe_dir . DIRECTORY_SEPARATOR . $exe;
    if (file_exists($exe_path)) {
        $exe_size = filesize($exe_path);
        echo "   ✓ Found: {$exe} (" . number_format($exe_size) . " bytes)\n";
        
        // Test this executable
        $test_cmd = "\"{$exe_path}\" -version 2>&1";
        $test_output = shell_exec($test_cmd);
        $first_line = strtok(trim($test_output), "\n");
        echo "     Test: " . ($first_line ?: "NO OUTPUT") . "\n";
    } else {
        echo "   ✗ Missing: {$exe}\n";
    }
}

// Test 7: Windows specific checks
echo "\n7. Windows Specific Checks:\n";
if (function_exists('exec')) {
    echo "   exec() function: Available\n";
    $where_output = [];
    $where_return = 0;
    exec('where magick 2>NUL', $where_output, $where_return);
    if ($where_return === 0 && !empty($where_output)) {
        echo "   System ImageMagick: Found at " . implode(', ', $where_output) . "\n";
    } else {
        echo "   System ImageMagick: Not found in PATH\n";
    }
} else {
    echo "   exec() function: Disabled\n";
}

echo "\n=== Diagnostic Complete ===\n";
echo "This will help identify the specific ImageMagick execution issue.\n";
?> 