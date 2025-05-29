<?php
// test_magick_diagnostic.php - ImageMagick diagnostic script
// Run this script on the server to diagnose the ImageMagick issue

echo "=== ImageMagick Diagnostic Script ===\n";
echo "Testing ImageMagick functionality on server\n";
echo "Date: " . date('Y-m-d H:i:s') . "\n\n";

// Configuration
$magick_path = __DIR__ . DIRECTORY_SEPARATOR . "exe" . DIRECTORY_SEPARATOR . "magick.exe";
$test_output_dir = __DIR__ . DIRECTORY_SEPARATOR . "test_magick_output";

// Create test output directory
if (!is_dir($test_output_dir)) {
    mkdir($test_output_dir, 0775, true);
    echo "Created test output directory: {$test_output_dir}\n";
}

// Check ImageMagick executable
echo "1. Checking ImageMagick executable...\n";
if (file_exists($magick_path)) {
    echo "   ✓ ImageMagick found at: {$magick_path}\n";
    $magick_size = filesize($magick_path);
    echo "   ✓ File size: " . number_format($magick_size) . " bytes\n";
} else {
    echo "   ✗ ImageMagick NOT FOUND at: {$magick_path}\n";
    exit(1);
}

// Test ImageMagick version
echo "\n2. Testing ImageMagick version...\n";
$version_cmd = "\"{$magick_path}\" -version 2>&1";
$version_output = shell_exec($version_cmd);
echo "   Command: {$version_cmd}\n";
echo "   Output:\n" . $version_output . "\n";

// Test ImageMagick policies
echo "\n3. Testing ImageMagick policies...\n";
$policy_cmd = "\"{$magick_path}\" -list policy 2>&1";
$policy_output = shell_exec($policy_cmd);
echo "   Command: {$policy_cmd}\n";
echo "   Output (first 1000 chars):\n" . substr($policy_output, 0, 1000) . "\n";

// Test directory permissions
echo "\n4. Testing directory permissions...\n";
echo "   Test directory: {$test_output_dir}\n";
echo "   Exists: " . (is_dir($test_output_dir) ? "YES" : "NO") . "\n";
echo "   Writable: " . (is_writable($test_output_dir) ? "YES" : "NO") . "\n";
echo "   Readable: " . (is_readable($test_output_dir) ? "YES" : "NO") . "\n";

// Test simple image creation
echo "\n5. Testing simple image creation...\n";
$test_image_path = $test_output_dir . DIRECTORY_SEPARATOR . "test_simple.jpg";
$simple_cmd = "\"{$magick_path}\" -size 100x100 xc:red \"{$test_image_path}\" 2>&1";
echo "   Command: {$simple_cmd}\n";
$simple_output = shell_exec($simple_cmd);
echo "   Output: " . ($simple_output ?: "EMPTY") . "\n";

if (file_exists($test_image_path)) {
    $simple_size = filesize($test_image_path);
    echo "   ✓ Test image created: {$simple_size} bytes\n";
    unlink($test_image_path);
    echo "   ✓ Test image cleaned up\n";
} else {
    echo "   ✗ Test image NOT created\n";
}

// Test TIFF to JPEG conversion (simulate the failing scenario)
echo "\n6. Testing TIFF to JPEG conversion...\n";

// First create a test TIFF
$test_tiff_path = $test_output_dir . DIRECTORY_SEPARATOR . "test_input.tiff";
$create_tiff_cmd = "\"{$magick_path}\" -size 4000x3000 xc:blue \"{$test_tiff_path}\" 2>&1";
echo "   Creating test TIFF: {$create_tiff_cmd}\n";
$create_tiff_output = shell_exec($create_tiff_cmd);
echo "   Create TIFF output: " . ($create_tiff_output ?: "EMPTY") . "\n";

if (file_exists($test_tiff_path)) {
    $tiff_size = filesize($test_tiff_path);
    echo "   ✓ Test TIFF created: {$tiff_size} bytes\n";
    
    // Now test TIFF to JPEG conversion with same parameters as worker
    $test_jpeg_path = $test_output_dir . DIRECTORY_SEPARATOR . "test_output.jpg";
    $convert_cmd = "\"{$magick_path}\" \"{$test_tiff_path}\" -resize x750 -quality 90 -sampling-factor 4:2:0 -colorspace sRGB -define jpeg:optimize-coding=false -define jpeg:dct-method=fast -interlace none -filter Lanczos -limit memory 512MB -limit map 512MB -limit disk 2GB -strip \"{$test_jpeg_path}\" 2>&1";
    
    echo "   Converting TIFF to JPEG: {$convert_cmd}\n";
    $convert_start = microtime(true);
    $convert_output = shell_exec($convert_cmd);
    $convert_time = round((microtime(true) - $convert_start) * 1000, 2);
    echo "   Convert time: {$convert_time}ms\n";
    echo "   Convert output: " . ($convert_output ?: "EMPTY") . "\n";
    
    if (file_exists($test_jpeg_path)) {
        $jpeg_size = filesize($test_jpeg_path);
        echo "   ✓ JPEG conversion successful: {$jpeg_size} bytes\n";
        unlink($test_jpeg_path);
        echo "   ✓ Test JPEG cleaned up\n";
    } else {
        echo "   ✗ JPEG conversion FAILED - no output file created\n";
    }
    
    unlink($test_tiff_path);
    echo "   ✓ Test TIFF cleaned up\n";
} else {
    echo "   ✗ Test TIFF creation failed\n";
}

// Test disk space
echo "\n7. Testing disk space...\n";
$disk_free = disk_free_space($test_output_dir);
$disk_total = disk_total_space($test_output_dir);
echo "   Free space: " . number_format($disk_free / (1024*1024*1024), 2) . " GB\n";
echo "   Total space: " . number_format($disk_total / (1024*1024*1024), 2) . " GB\n";
echo "   Usage: " . number_format(($disk_total - $disk_free) / $disk_total * 100, 1) . "%\n";

// Clean up test directory
rmdir($test_output_dir);
echo "\n✓ Test directory cleaned up\n";

echo "\n=== Diagnostic Complete ===\n";
echo "Please run this script on your server and share the output.\n";
?> 