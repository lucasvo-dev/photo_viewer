<?php declare(strict_types=1);

// tests/api/HelpersTest.php

// Chắc chắn rằng file helpers.php được nạp
// Vì chúng ta đang test các hàm global, chúng ta cần require_once nó
// Lưu ý: Cách này không lý tưởng bằng việc sử dụng class và autoload,
// nhưng phù hợp với cấu trúc hiện tại của dự án.
require_once __DIR__ . '/../../api/helpers.php'; 

use PHPUnit\Framework\TestCase;

// Forward declare PDO and PDOStatement if not already available for mocking
if (!class_exists('PDO')) {
    class PDO extends \stdClass {}
}
if (!class_exists('PDOStatement')) {
    class PDOStatement extends \stdClass {}
}

final class HelpersTest extends TestCase
{
    private static string $testFilesRoot;
    private static $originalPdo; // To store original global $pdo
    private static $originalSession; // To store original $_SESSION
    private static string $sampleImagesDir; // Khai báo thuộc tính static
    private static string $thumbnailTestCacheDir; // Khai báo thuộc tính static

    public static function setUpBeforeClass(): void
    {
        // Ensure the base directory for test files exists and is resolved properly
        $baseValidationDir = __DIR__ . '/../_data/files_for_validation';
        if (!is_dir($baseValidationDir)) {
            mkdir($baseValidationDir, 0777, true);
        }
        self::$testFilesRoot = realpath($baseValidationDir);

        if (self::$testFilesRoot === false || !is_dir(self::$testFilesRoot)) {
            throw new \Exception("Test files root directory for validation could not be resolved or does not exist: " . $baseValidationDir);
        }
        self::$testFilesRoot .= DIRECTORY_SEPARATOR; // This is for files_for_validation (e.g., source1, source2)

        // Setup for sample images used in thumbnail tests
        $baseSampleImagesDir = __DIR__ . '/../_data/sample_images';
        if (!is_dir($baseSampleImagesDir)) {
            mkdir($baseSampleImagesDir, 0777, true);
            // User should have placed 1x1.jpg, 1x1.png here.
        }
        self::$sampleImagesDir = realpath($baseSampleImagesDir);
        if (self::$sampleImagesDir === false || !is_dir(self::$sampleImagesDir)) {
            throw new \Exception("Sample images directory could not be resolved or does not exist: " . $baseSampleImagesDir);
        }
        self::$sampleImagesDir .= DIRECTORY_SEPARATOR;

        self::$thumbnailTestCacheDir = self::$testFilesRoot . 'thumbnails_created' . DIRECTORY_SEPARATOR; // Keep cache within files_for_validation structure for easier cleanup of all test-generated files if needed
        $baseTestCacheDir = __DIR__ . '/../_data/thumbnails_created_during_test';
        if(!is_dir($baseTestCacheDir)) mkdir($baseTestCacheDir, 0777, true);
        self::$thumbnailTestCacheDir = realpath($baseTestCacheDir) . DIRECTORY_SEPARATOR;

        // Define IMAGE_SOURCES for testing (uses self::$testFilesRoot which points to files_for_validation)
        if (!defined('IMAGE_SOURCES')) {
            define('IMAGE_SOURCES', [
                'source1' => ['path' => self::$testFilesRoot . 'source1'],
                'source2' => ['path' => self::$testFilesRoot . 'source2'],
                'unreadable' => ['path' => self::$testFilesRoot . 'unreadable_source']
            ]);
        }

        // Ensure subdirectories for sources exist, as they were created by mkdir previously
        // This is more of a sanity check or recreation if needed during test setup itself.
        $source1Dir = self::$testFilesRoot . 'source1';
        if (!is_dir($source1Dir)) mkdir($source1Dir, 0777, true);
        if (!is_dir($source1Dir . DIRECTORY_SEPARATOR . 'albumA')) mkdir($source1Dir . DIRECTORY_SEPARATOR . 'albumA', 0777, true);
        if (!is_dir($source1Dir . DIRECTORY_SEPARATOR . 'albumB')) mkdir($source1Dir . DIRECTORY_SEPARATOR . 'albumB', 0777, true);
        if (!file_exists($source1Dir . DIRECTORY_SEPARATOR . 'albumA' . DIRECTORY_SEPARATOR . 'image1.jpg')) {
            touch($source1Dir . DIRECTORY_SEPARATOR . 'albumA' . DIRECTORY_SEPARATOR . 'image1.jpg');
        }

        $source2Dir = self::$testFilesRoot . 'source2';
        if (!is_dir($source2Dir)) mkdir($source2Dir, 0777, true);
        if (!file_exists($source2Dir . DIRECTORY_SEPARATOR . 'image2.png')) {
            touch($source2Dir . DIRECTORY_SEPARATOR . 'image2.png');
        }
        
        $unreadableSourceDir = self::$testFilesRoot . 'unreadable_source';
        if (!is_dir($unreadableSourceDir)) mkdir($unreadableSourceDir, 0777, true);


        if (!defined('CACHE_THUMB_ROOT')) {
            define('CACHE_THUMB_ROOT', self::$testFilesRoot . 'cache_thumb_test');
            if (!is_dir(CACHE_THUMB_ROOT)) {
                mkdir(CACHE_THUMB_ROOT, 0777, true);
            }
        }
        // Store original $_SESSION, start session if not already active for testing session manipulation
        // Note: @session_start() is used to suppress headers already sent warning if tests run in CLI after web output
        if (session_status() === PHP_SESSION_NONE) {
            @session_start(); 
        }
        self::$originalSession = $_SESSION;
    }

    public static function tearDownAfterClass(): void
    {
        // Clean up created directories and files
        if (self::$thumbnailTestCacheDir && is_dir(self::$thumbnailTestCacheDir)) {
             self::deleteDirectory(self::$thumbnailTestCacheDir);
        }
        if (is_dir(self::$testFilesRoot . 'cache_thumb_test')) { // This was the old CACHE_THUMB_ROOT path
             self::deleteDirectory(self::$testFilesRoot . 'cache_thumb_test');
        }
        // Remove the files_for_validation directory
        if (self::$testFilesRoot && is_dir(self::$testFilesRoot)) {
            $expectedRoot = realpath(__DIR__ . '/../_data/files_for_validation');
            $actualRoot = realpath(self::$testFilesRoot);
            if (is_string($actualRoot) && is_string($expectedRoot) && $actualRoot === $expectedRoot) {
                 self::deleteDirectory(self::$testFilesRoot);
            }
        }
        // We don't delete self::$sampleImagesDir as user placed files there manually.

        // Restore original $_SESSION and destroy test session
        $_SESSION = self::$originalSession;
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    protected function setUp(): void
    {
        global $pdo;
        // Store and nullify global $pdo before each test that might use it
        self::$originalPdo = $pdo ?? null;
        $pdo = null;

        // Reset $_SESSION for each test to avoid interference
        $_SESSION = []; 
        // Seed with original session data if needed, but usually tests want a clean slate
        // Or, more robustly, copy self::$originalSession to $_SESSION if tests expect pre-existing session state from setup.
        // For check_folder_access, starting fresh and setting specific keys is better.
    }

    protected function tearDown(): void
    {
        global $pdo;
        // Restore original global $pdo
        $pdo = self::$originalPdo;
        self::$originalPdo = null; // Clear static property
        
        // Clean up session modifications for most tests
        // $_SESSION = self::$originalSession; // This might be too broad if other tests set specific session states.
                                        // tearDownAfterClass handles the final restoration.
    }

    // Helper function to delete directory recursively
    private static function deleteDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $items = array_diff(scandir($dir), array('.', '..'));
        foreach ($items as $item) {
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            is_dir($path) ? self::deleteDirectory($path) : unlink($path);
        }
        rmdir($dir);
    }

    /**
     * @dataProvider pathNormalizationProvider
     * @covers ::normalize_path_input
     */
    public function testNormalizePathInput(?string $input, string $expected): void // Chấp nhận null input
    {
        $this->assertSame($expected, normalize_path_input($input));
    }

    /**
     * Cung cấp dữ liệu cho testNormalizePathInput
     */
    public static function pathNormalizationProvider(): array
    {
        return [
            'Empty string' => ['', ''],
            'Null input' => [null, ''], // Test case cho null input
            'Single slash' => ['/', ''],
            'Multiple slashes' => ['///', ''],
            'Simple path' => ['folder/subfolder', 'folder/subfolder'],
            'Leading slash' => ['/folder/subfolder', 'folder/subfolder'],
            'Trailing slash' => ['folder/subfolder/', 'folder/subfolder'],
            'Leading and trailing slashes' => ['/folder/subfolder/', 'folder/subfolder'],
            'Backslashes' => ['folder\\subfolder', 'folder/subfolder'],
            'Mixed slashes' => ['/folder\\subfolder/', 'folder/subfolder'],
            'Parent directory (..) should be removed' => ['folder/../subfolder', 'folder/subfolder'],
            'Multiple parent directories' => ['folder/../../subfolder', 'folder/subfolder'],
            'Leading parent directories' => ['../folder/subfolder', 'folder/subfolder'],
            'Trailing parent directories' => ['folder/subfolder/..', 'folder/subfolder'],
            'Null byte removal' => ["folder/subfolder\0hidden", 'folder/subfolderhidden'],
            'Complex case' => ['/../folder\\..\\another/./subfolder/../final/', 'folder/another/./subfolder/final'], // Note: '.' is not removed by this simple normalization
        ];
    }

    // --- Tests for validate_source_and_path ---
    /**
     * @dataProvider validPathProvider
     * @covers ::validate_source_and_path
     * @covers ::normalize_path_input
     */
    public function testValidateSourceAndPathValid(string $inputPath, array $expected): void
    {
        $result = validate_source_and_path($inputPath);
        $this->assertNotNull($result, "Validation failed for valid path: {$inputPath}");
        // Adjust absolute_path in expected to match the dynamic test environment
        $expected['absolute_path'] = realpath(IMAGE_SOURCES[$expected['source_key']]['path'] . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $expected['relative_path']));
        if ($expected['relative_path'] === '' && $expected['source_key'] !== null) { // Root of a source
            $expected['absolute_path'] = realpath(IMAGE_SOURCES[$expected['source_key']]['path']);
        }
        
        // For the special case of validating empty string (overall root)
        if ($inputPath === '' && $expected['source_key'] === null) {
            $expected['absolute_path'] = null; // No absolute path for overall root
        }

        $this->assertEquals($expected['source_key'], $result['source_key'], "Source key mismatch for {$inputPath}");
        $this->assertEquals($expected['relative_path'], $result['relative_path'], "Relative path mismatch for {$inputPath}");
        $this->assertEquals($expected['source_prefixed_path'], $result['source_prefixed_path'], "Source prefixed path mismatch for {$inputPath}");
        $this->assertEquals($expected['is_root'], $result['is_root'], "Is_root flag mismatch for {$inputPath}");
        // For absolute_path, it can vary based on OS, so we check if it resolves correctly and matches structure.
        // The key is that it should resolve to the correct location within our test setup.
        $this->assertEquals($expected['absolute_path'], $result['absolute_path'], "Absolute path mismatch for {$inputPath}");
    }

    public static function validPathProvider(): array
    {
        return [
            'Root of source1' => ['source1', ['source_key' => 'source1', 'relative_path' => '', 'source_prefixed_path' => 'source1', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
            'Subfolder in source1' => ['source1/albumA', ['source_key' => 'source1', 'relative_path' => 'albumA', 'source_prefixed_path' => 'source1/albumA', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
            'Empty subfolder in source1' => ['source1/albumB', ['source_key' => 'source1', 'relative_path' => 'albumB', 'source_prefixed_path' => 'source1/albumB', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
            'Root of source2' => ['source2', ['source_key' => 'source2', 'relative_path' => '', 'source_prefixed_path' => 'source2', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
            'Overall root (empty string)' => ['', ['source_key' => null, 'relative_path' => '', 'source_prefixed_path' => '', 'is_root' => true, 'absolute_path' => null]],
            'Trailing slash' => ['source1/albumA/', ['source_key' => 'source1', 'relative_path' => 'albumA', 'source_prefixed_path' => 'source1/albumA', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
            'Backslashes' => ['source1\\albumA', ['source_key' => 'source1', 'relative_path' => 'albumA', 'source_prefixed_path' => 'source1/albumA', 'is_root' => false, 'absolute_path' => 'to_be_replaced']],
        ];
    }

    /**
     * @dataProvider invalidPathProvider
     * @covers ::validate_source_and_path
     * @covers ::normalize_path_input
     */
    public function testValidateSourceAndPathInvalid(string $inputPath, ?string $reason = null): void
    {
        $result = validate_source_and_path($inputPath);
        $this->assertNull($result, "Validation should have failed for: {$inputPath}" . ($reason ? " ({$reason})" : ''));
    }

    public static function invalidPathProvider(): array
    {
        return [
            'Invalid source key' => ['invalidSource/albumA', 'bad source key'],
            'Path traversal attempt up from source' => ['source1/../other', 'path traversal up'],
            'Path traversal within source to non-existent' => ['source1/albumA/../../albumC', 'path traversal non-existent'], // Resolves to source1/albumC
            'Non-existent subfolder' => ['source1/nonExistentAlbum', 'non-existent subfolder'],
            'Path is a file, not a directory' => ['source1/albumA/image1.jpg', 'path is a file'],
            // 'Unreadable source' => ['unreadable', 'unreadable source directory'], // This needs special setup or mock for realpath/is_readable to fail for it
            'Path outside defined sources (deep traversal)' => ['source1/albumA/../../../etc/passwd', 'deep path traversal'],
            'Relative path from nowhere' => ['somefolder/image.jpg', 'relative path from nowhere'],
            'Just a filename' => ['image.jpg', 'just filename'],
        ];
    }

    // --- Tests for validate_source_and_file_path ---
    /**
     * @dataProvider validFilePathProvider
     * @covers ::validate_source_and_file_path
     * @covers ::normalize_path_input
     */
    public function testValidateSourceAndFilePathValid(string $inputPath, array $expected): void
    {
        $result = validate_source_and_file_path($inputPath);
        $this->assertNotNull($result, "File validation failed for valid path: {$inputPath}");

        // Adjust absolute_path in expected to match the dynamic test environment
        $expectedAbsolutePath = realpath(IMAGE_SOURCES[$expected['source_key']]['path'] . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $expected['relative_path']));

        $this->assertEquals($expected['source_key'], $result['source_key'], "Source key mismatch for file {$inputPath}");
        $this->assertEquals($expected['relative_path'], $result['relative_path'], "Relative path mismatch for file {$inputPath}");
        $this->assertEquals($expected['source_prefixed_path'], $result['source_prefixed_path'], "Source prefixed path mismatch for file {$inputPath}");
        $this->assertEquals($expectedAbsolutePath, $result['absolute_path'], "Absolute path mismatch for file {$inputPath}");
    }

    public static function validFilePathProvider(): array
    {
        // Format: [input, [expected_source_key, expected_relative_path, expected_source_prefixed_path]]
        return [
            'Valid image in source1' => [
                'source1/albumA/image1.jpg', 
                ['source_key' => 'source1', 'relative_path' => 'albumA/image1.jpg', 'source_prefixed_path' => 'source1/albumA/image1.jpg']
            ],
            'Valid image in source2' => [
                'source2/image2.png', 
                ['source_key' => 'source2', 'relative_path' => 'image2.png', 'source_prefixed_path' => 'source2/image2.png']
            ],
            'Path with backslashes' => [
                'source1\\albumA\\image1.jpg', 
                ['source_key' => 'source1', 'relative_path' => 'albumA/image1.jpg', 'source_prefixed_path' => 'source1/albumA/image1.jpg']
            ],
        ];
    }

    /**
     * @dataProvider invalidFilePathProvider
     * @covers ::validate_source_and_file_path
     * @covers ::normalize_path_input
     */
    public function testValidateSourceAndFilePathInvalid(string $inputPath, ?string $reason = null): void
    {
        $result = validate_source_and_file_path($inputPath);
        $this->assertNull($result, "File validation should have failed for: {$inputPath}" . ($reason ? " ({$reason})" : ''));
    }

    public static function invalidFilePathProvider(): array
    {
        return [
            'Path is a directory, not a file' => ['source1/albumA', 'path is dir'],
            'Non-existent file' => ['source1/albumA/nonexistent.jpg', 'file not found'],
            'Invalid source key for file' => ['invalidSource/image1.jpg', 'bad source for file'],
            'File path traversal up' => ['source1/../image_outside.jpg', 'file traversal up'],
            'Empty path' => ['', 'empty file path'],
            'Only source key' => ['source1', 'only source key for file'],
        ];
    }

    // --- Tests for check_folder_access ---
    /**
     * @dataProvider folderAccessProvider
     * @covers ::check_folder_access
     */
    public function testCheckFolderAccess(
        string $folderPath,
        array|bool|null $dbRow,
        ?array $sessionAuthorizedFolders,
        array $expectedOutcome
    ): void {
        global $pdo;

        $mockPdoStatement = $this->createMock(PDOStatement::class);
        $mockPdoStatement->method('execute'); // Assumes execute is always successful for these tests
        $mockPdoStatement->method('fetch')->willReturn($dbRow);

        $mockPdo = $this->createMock(PDO::class);
        $mockPdo->method('prepare')->willReturn($mockPdoStatement);
        
        $pdo = $mockPdo; // Set the global $pdo to our mock

        if ($sessionAuthorizedFolders !== null) {
            $_SESSION['authorized_folders'] = $sessionAuthorizedFolders;
        }

        $result = check_folder_access($folderPath);
        $this->assertEquals($expectedOutcome, $result, "Mismatch in folder access check for path: {$folderPath}");

        // Clean up global $pdo and session for the next test if not handled by tearDown
        $pdo = self::$originalPdo; // Restore immediately if tearDown is not sufficient or too broad
        unset($_SESSION['authorized_folders']);
    }

    public static function folderAccessProvider(): array
    {
        $testPath = 'source1/albumA';
        return [
            // Case 'PDO not available' is handled by testCheckFolderAccessPdoUnavailable()
            'Empty path (root access)' => [
                '', null, null, 
                ['protected' => false, 'authorized' => true, 'password_required' => false]
            ],
            'Not protected (no DB row)' => [
                $testPath, false, [], // false from fetch() means row not found
                ['protected' => false, 'authorized' => true, 'password_required' => false]
            ],
            'Protected, not in session' => [
                $testPath, ['password_hash' => 'some_hash'], [], 
                ['protected' => true, 'authorized' => false, 'password_required' => true]
            ],
            'Protected, authorized in session' => [
                $testPath, ['password_hash' => 'some_hash'], [$testPath => true], 
                ['protected' => true, 'authorized' => true, 'password_required' => false]
            ],
            'Protected, different path in session' => [
                $testPath, ['password_hash' => 'some_hash'], ['source1/otherAlbum' => true], 
                ['protected' => true, 'authorized' => false, 'password_required' => true]
            ],
            // Case 'DB error during fetch' is handled by testCheckFolderAccessPdoException()
        ];
    }

    // Special test case for PDO unavailable because it requires setting global $pdo to null
    /**
     * @covers ::check_folder_access
     */
    public function testCheckFolderAccessPdoUnavailable(): void
    {
        global $pdo;
        $originalPdoForThisTest = $pdo;
        $pdo = null;

        $expected = ['protected' => true, 'authorized' => false, 'error' => 'Lỗi server nghiêm trọng (DB unavailable).'];
        $this->assertEquals($expected, check_folder_access('some/path'));
        
        $pdo = $originalPdoForThisTest; // Restore
    }

    // Special test case for PDOException
    /**
     * @covers ::check_folder_access
     */
    public function testCheckFolderAccessPdoException(): void
    {
        global $pdo;
        $mockPdo = $this->createMock(PDO::class);
        $mockPdo->method('prepare')->willThrowException(new PDOException('Test DB Error'));
        $pdo = $mockPdo;

        $expected = ['protected' => true, 'authorized' => false, 'error' => 'Lỗi server khi kiểm tra quyền truy cập.'];
        $this->assertEquals($expected, check_folder_access('some/path'));

        $pdo = self::$originalPdo; // Restore to original state before this test if any
    }

    // --- Tests for find_first_image_in_source ---
    /**
     * @dataProvider findFirstImageProvider
     * @covers ::find_first_image_in_source
     * @covers ::normalize_path_input // If it's used internally by find_first_image_in_source, though it appears not to be directly from snippet.
     *                                 // Let's assume it might use path normalization implicitly or for robustness.
     */
    public function testFindFirstImageInSource(
        string $sourceKey,
        string $relativeDirPath,
        array $allowedExt,
        ?string $expectedImagePath // Expected path relative to the source's base path
    ): void {
        // Ensure the files are created as per the test setup before running this specific test
        // This can be redundant if setUpBeforeClass is robust, but good for clarity
        $source1AlbumADir = self::$testFilesRoot . 'source1' . DIRECTORY_SEPARATOR . 'albumA';
        if (!file_exists($source1AlbumADir . DIRECTORY_SEPARATOR . 'image0.gif')) {
            touch($source1AlbumADir . DIRECTORY_SEPARATOR . 'image0.gif');
        }
        if (!file_exists($source1AlbumADir . DIRECTORY_SEPARATOR . 'image1.jpg')) {
            touch($source1AlbumADir . DIRECTORY_SEPARATOR . 'image1.jpg');
        }
        $subAlbumDir = $source1AlbumADir . DIRECTORY_SEPARATOR . 'subAlbum';
        if (!is_dir($subAlbumDir)) mkdir($subAlbumDir, 0777, true);
        if (!file_exists($subAlbumDir . DIRECTORY_SEPARATOR . 'image2.png')) {
            touch($subAlbumDir . DIRECTORY_SEPARATOR . 'image2.png');
        }
        if (!file_exists($source1AlbumADir . DIRECTORY_SEPARATOR . 'another.txt')) {
            touch($source1AlbumADir . DIRECTORY_SEPARATOR . 'another.txt');
        }

        // Define ALLOWED_EXTENSIONS if it's used as a global constant by the function
        // However, the function signature `array &$allowed_ext` means it's passed as param.
        // So, no need to define a global constant here.

        $result = find_first_image_in_source($sourceKey, $relativeDirPath, $allowedExt);
        $this->assertSame($expectedImagePath, $result);
    }

    public static function findFirstImageProvider(): array
    {
        // Note: The function is expected to return path relative to the *source base path*.
        // If $relativeDirPath is 'albumA', and image is 'subAlbum/image2.png' inside albumA,
        // the expected result should be 'albumA/subAlbum/image2.png' if the function adds $relativeDirPath prefix back.
        // Based on the function's internal logic: `substr($image_real_path, strlen($resolved_target_dir_absolute))`
        // and then prefixing with `$source_key . '/' . $normalized_relative_dir . '/' . $first_image_relative_path` (if this is how it forms final path)
        // Or, more likely, the current implementation as read: 
        // `$first_image_relative_path = key($image_files);` where `$image_relative_to_target_dir` is calculated. 
        // This path is relative *to the directory being scanned* ($resolved_target_dir_absolute).
        // The function signature indicates it returns source-prefixed path. Let's re-check the actual return logic.
        // Reading the code again: `return $first_image_relative_path;` -- this is NOT source-prefixed.
        // It seems to be relative to the $relative_dir_path provided. 
        // If $relative_dir_path = 'albumA', and it finds 'subAlbum/image2.png', it returns 'subAlbum/image2.png'
        // This matches the current understanding of the function from its body.

        // Update: `find_first_image_in_source` is called by `list_files` in `actions_public`
        // `'representative_image_path' => $first_image_rel_path ? ($subdir_path_from_source_root . '/' . $first_image_rel_path) : null,`
        // So, `find_first_image_in_source` itself returns path relative to the scanned sub-directory.
        // Then, the caller prepends the scanned sub-directory path.
        // The docblock says: "@return string|null Source-prefixed relative path..." -- THIS IS MISLEADING OR OLD.
        // The code `return $first_image_relative_path;` returns path relative to $relative_dir_path. 
        // I will test based on the code's behavior. The docblock might need an update later.

        $allowed = ['jpg', 'jpeg', 'png', 'gif'];
        return [
            // image0.gif comes before image1.jpg due to strnatcasecmp of the full filename
            'Find jpg in source1/albumA' => ['source1', 'albumA', $allowed, 'image0.gif'], 
            'Find gif in source1/albumA (jpg not allowed)' => ['source1', 'albumA', ['gif', 'png'], 'image0.gif'],
            'Find png in source1/albumA/subAlbum' => ['source1', 'albumA/subAlbum', $allowed, 'image2.png'],
            // image0.gif in albumA/ is found before image1.jpg in albumA/
            'Find first in source1 root (image2.png in source2 should not be found)' => ['source1', '', $allowed, 'albumA/image0.gif'], 
            'No images in source1/albumB (empty dir)' => ['source1', 'albumB', $allowed, null],
            // If 'txt' is in allowed_ext, and a .txt file exists, it should be found by current function logic.
            'Only txt file allowed (should find the txt file)' => ['source1', 'albumA', ['txt'], 'another.txt'], 
            'Invalid source key' => ['invalidSource', 'albumA', $allowed, null],
            'Invalid relative_dir_path (non-existent)' => ['source1', 'nonExistentDir', $allowed, null],
            'Relative_dir_path is a file' => ['source1', 'albumA/image1.jpg', $allowed, null],
            'Allowed extensions empty' => ['source1', 'albumA', [], null],
            'Search in source2 root' => ['source2', '', $allowed, 'image2.png'],
        ];
    }

    // --- Tests for create_thumbnail ---
    /**
     * @dataProvider thumbnailCreationProvider
     * @covers ::create_thumbnail
     */
    public function testCreateThumbnailSuccess(string $sourceFileName, int $thumbSize, string $expectedMimeType): void
    {
        $sourcePath = self::$sampleImagesDir . $sourceFileName;
        $this->assertFileExists($sourcePath, "Sample image {$sourceFileName} does not exist.");

        // Generate a unique cache path for each test run to avoid collisions if tests run in parallel (though PHPUnit runs sequentially by default)
        $cacheFileName = 'thumb_' . pathinfo($sourceFileName, PATHINFO_FILENAME) . '_' . $thumbSize . '.' . pathinfo($sourceFileName, PATHINFO_EXTENSION);
        $cachePath = self::$thumbnailTestCacheDir . $cacheFileName;
        
        // Ensure cache path is clean before test
        if (file_exists($cachePath)) {
            unlink($cachePath);
        }

        $result = create_thumbnail($sourcePath, $cachePath, $thumbSize);
        $this->assertTrue($result, "create_thumbnail failed for {$sourceFileName}");
        $this->assertFileExists($cachePath, "Thumbnail file was not created at {$cachePath}");

        $imageInfo = getimagesize($cachePath);
        $this->assertNotFalse($imageInfo, "Generated thumbnail is not a valid image: {$cachePath}");
        $this->assertEquals($expectedMimeType, $imageInfo['mime'], "MIME type mismatch for thumbnail of {$sourceFileName}");
        
        // Check if one of the dimensions matches thumb_size (aspect ratio is maintained)
        $this->assertTrue(
            $imageInfo[0] == $thumbSize || $imageInfo[1] == $thumbSize,
            "Thumbnail dimensions ({$imageInfo[0]}x{$imageInfo[1]}) do not match expected size ({$thumbSize}) for {$cachePath}"
        );
        
        // Optional: More precise dimension check if original dimensions are known and aspect ratio logic is tested

        // Clean up the created thumbnail
        if (file_exists($cachePath)) {
            unlink($cachePath);
        }
    }

    public static function thumbnailCreationProvider(): array
    {
        // Assuming 1x1.jpg and 1x1.png exist in tests/_data/sample_images/
        // Assuming create_thumbnail currently saves all output as JPEG
        return [
            'JPG to 50px' => ['1x1.jpg', 50, 'image/jpeg'],
            'PNG to 75px (output as JPEG)' => ['1x1.png', 75, 'image/jpeg'], // Expected MIME is jpeg
            // Add more cases if you have more sample images (e.g., GIF, WebP if GD supports them)
            // 'GIF to 60px (output as JPEG)' => ['2x2.gif', 60, 'image/jpeg'],
        ];
    }

    /**
     * @dataProvider thumbnailErrorProvider
     * @covers ::create_thumbnail
     */
    public function testCreateThumbnailErrors(string $sourceFileName, int $thumbSize, ?string $cachePathSuffix, string $expectedExceptionMessagePart): void
    {
        // Always prepend sampleImagesDir if the sourceFileName is one of our known sample files, 
        // otherwise, assume it might be a deliberately non-existent path for testing.
        if ($sourceFileName === '1x1.jpg' || $sourceFileName === '1x1.png' || $sourceFileName === '2x2.gif') { // Add other known sample files here
            $sourcePath = self::$sampleImagesDir . $sourceFileName;
        } elseif ($sourceFileName === 'non_existent.jpg' || $sourceFileName === 'unreadable.jpg') {
            $sourcePath = self::$sampleImagesDir . $sourceFileName; 
        } else {
            // For other arbitrary strings that might be passed for specific error message tests not relating to actual files
            $sourcePath = $sourceFileName;
        }

        $cachePath = self::$thumbnailTestCacheDir . ($cachePathSuffix ?? 'error_thumb.jpg');

        if ($sourceFileName === 'unreadable.jpg') {
            // Create a dummy file and try to make it unreadable (chmod might not work reliably on all OS/FS within tests)
            // This case is hard to test reliably without true FS control or mocking file_exists/is_readable
            touch($sourcePath);
            // @chmod($sourcePath, 0000); // Attempt, may not work
            // For now, we rely on the function's internal file_exists/is_readable checks for non-existent primarily.
        }

        $this->expectException(Exception::class);
        $this->expectExceptionMessageMatches("/{$expectedExceptionMessagePart}/");

        try {
            create_thumbnail($sourcePath, $cachePath, $thumbSize);
        } finally {
            // @chmod($sourcePath, 0644); // Restore permissions if changed for unreadable.jpg test
            if (file_exists($sourcePath) && $sourceFileName === 'unreadable.jpg') {
                unlink($sourcePath);
            }
        }
    }

    public static function thumbnailErrorProvider(): array
    {
        return [
            'Source non-existent' => ['non_existent.jpg', 50, 'thumb.jpg', 'Source file does not exist or is not readable'],
            // 'Source unreadable' => ['unreadable.jpg', 50, 'thumb.jpg', 'Source file does not exist or is not readable'], // Hard to test reliably
            'Invalid thumb size (zero)' => ['1x1.jpg', 0, 'thumb.jpg', 'Invalid thumbnail size specified'],
            'Invalid thumb size (negative)' => ['1x1.jpg', -50, 'thumb.jpg', 'Invalid thumbnail size specified'],
            // 'Unsupported image type' => ['dummy.txt', 50, 'thumb.jpg', 'Unsupported image type: text/plain'], // Requires dummy.txt and getimagesize mock or real file
            // 'Failed to load (corrupt)' => ['corrupt.jpg', 50, 'thumb.jpg', 'Failed to load image resource'], // Requires a corrupt image file
            // 'Cache dir not writable' requires making the cache dir un-writable, hard to do reliably x-platform in test
        ];
    }

    // TODO: Thêm các test case khác cho các hàm helper khác sau này
} 