<?php
// Central Configuration File

return [
    // --- Database --- 
    
    'type' => 'mysql',             // Added MySQL type
    'host' => 'localhost',         // Added MySQL host (default)
    'name' => 'photo_gallery',    // Added MySQL database name (default)
    'user' => 'root',              // Added MySQL user (default)
    'pass' => '', // MySQL password updated

    // --- Admin Credentials ---
    'admin_username' => 'admin',
    'admin_password_hash' => '$2y$10$9PS7RkGuPIXkMtSA2QWL8O8DW5838jGueBkPrr/fTI8cbevzdA1YO', // Default: "@Floha123". CHANGE THIS!

    // --- Image & Thumbnail Settings ---
    'image_sources' => [
        'main' => [
            'path' => __DIR__ . '/images', // Use __DIR__ instead of realpath
            'name' => 'Thư mục chính' 
        ],
        'extra_drive' => [
            'path' => 'G:\\2020',
            'name' => 'Ổ G 2020'
        ],
        'guu_2025_e' => [
            'path' => 'E:\\2025',
            'name' => 'E Drive 2025'
        ]
    ],
     // --- RAW Image Sources for Jet Culling App ---
     'raw_image_sources' => [
        'my_raw_drive_g' => [
            'path' => 'G:\\RAW',
            'name' => 'G Drive RAW'
        ],
        'my_raw_drive_e' => [
            'path' => 'E:\\RAW',
            'name' => 'E Drive RAW'
        ],
        // Remove test configurations since we want to use the real RAW drive
    ],
    'cache_thumb_root' => __DIR__ . '/cache/thumbnails', // Use __DIR__ here, db_connect will resolve realpath
    'allowed_extensions' => ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
    'thumbnail_sizes' => [150, 750],

    // --- RAW File Extensions for Jet Culling App ---
    'raw_file_extensions' => ['cr2', 'nef', 'arw', 'dng', 'cr3', 'raf', 'orf', 'pef', 'rw2'], // Add more as needed

    // --- Jet Culling App Specific Settings ---
    'jet_preview_cache_root' => __DIR__ . '/cache/jet_previews',
    'jet_preview_size' => 750, // Default width for grid previews in Jet app
    'jet_filmstrip_thumb_size' => 120, // New: Size for thumbnails in the horizontal filmstrip

    // --- API Settings ---
    'pagination_limit' => 100, // Default limit for list_files pagination (API currently uses 100, JS uses 50)
    'zip_max_execution_time' => 300, // Max execution time for zip creation (seconds)
    'zip_memory_limit' => '4096M',   // Memory limit for zip creation

    // --- Cron/Log Settings ---
    'log_max_age_days' => 30,
    'log_max_size_bytes' => 50 * 1024 * 1024, // 50 MB

    // --- Application Settings ---
    'app_title' => 'Thư viện Ảnh - Guustudio',
];

?> 