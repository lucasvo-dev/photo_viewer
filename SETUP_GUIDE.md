# Photo Gallery System Setup Guide

## Overview

This is a comprehensive photo gallery system with RAW image processing capabilities using the Jet Culling Workspace. The system includes:

- **Main Gallery App**: View and manage regular image galleries with password protection
- **Jet Culling Workspace**: Professional RAW image culling interface for photographers and designers
- **Cache Management**: Automated thumbnail and RAW preview generation with background workers
- **Admin Dashboard**: Comprehensive management interface with user management and statistics

## System Requirements

### Software Requirements
- **PHP 7.4+** with extensions:
  - `pdo_mysql` - Database connectivity
  - `gd` - Image processing
  - `zip` - ZIP file creation
  - `mbstring` - String handling
  - `fileinfo` - File type detection
- **MySQL 5.7+** or **MariaDB 10.2+**
- **Web Server** (Apache/Nginx) with PHP support

### For RAW Image Processing
- **dcraw.exe** - RAW image decoder
- **ImageMagick magick.exe** - Image processing toolkit

## Installation Steps

### 1. Basic System Setup

1. **Extract Files**
   ```bash
   # Extract to your web server document root
   # e.g., D:\xampp\htdocs\ or /var/www/html/
   ```

2. **Set Directory Permissions**
   ```bash
   # Linux/Mac
   chmod -R 755 /path/to/gallery/
   chmod -R 777 cache/
   chmod -R 777 logs/
   
   # Windows - Ensure IIS_IUSRS or IUSR has write access to:
   # - cache/ folder and subfolders
   # - logs/ folder
   ```

3. **Create Required Directories**
   ```
   project_root/
   ├── cache/
   │   ├── thumbnails/     # Auto-created by system
   │   └── jet_previews/   # Auto-created by system
   ├── logs/               # Create manually
   ├── exe/                # Create and place executables here
   │   ├── dcraw.exe
   │   └── magick.exe
   └── images/             # Your image folders (optional default)
   ```

### 2. Database Setup

1. **Create Database**
   ```sql
   CREATE DATABASE photo_gallery DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'gallery_user'@'localhost' IDENTIFIED BY 'secure_password';
   GRANT ALL PRIVILEGES ON photo_gallery.* TO 'gallery_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. **Configure Database Connection**
   ```php
   // Copy config.example.php to config.php and edit:
   return [
       'type' => 'mysql',
       'host' => 'localhost',
       'name' => 'photo_gallery',
       'user' => 'gallery_user', 
       'pass' => 'secure_password',
       // ... other settings
   ];
   ```

### 3. RAW Processing Setup

#### 3.1 Download Required Executables

1. **dcraw.exe**
   - Download from: https://www.cybercom.net/~dcoffin/dcraw/
   - Or compile from source: https://github.com/LibRaw/LibRaw
   - Place in `exe/dcraw.exe`

2. **ImageMagick magick.exe**
   - Download from: https://imagemagick.org/script/download.php#windows
   - Extract `magick.exe` from the portable version
   - Place in `exe/magick.exe`

#### 3.2 Verify Executables

Create a test script to verify the executables work:

```php
<?php
// test_raw_processing.php
$dcraw_path = __DIR__ . '/exe/dcraw.exe';
$magick_path = __DIR__ . '/exe/magick.exe';

echo "Testing dcraw...\n";
if (file_exists($dcraw_path)) {
    $output = shell_exec("\"$dcraw_path\" 2>&1");
    echo "dcraw found and executable\n";
} else {
    echo "ERROR: dcraw.exe not found at $dcraw_path\n";
}

echo "\nTesting ImageMagick...\n";
if (file_exists($magick_path)) {
    $output = shell_exec("\"$magick_path\" -version 2>&1");
    echo "ImageMagick version info:\n$output\n";
} else {
    echo "ERROR: magick.exe not found at $magick_path\n";
}
?>
```

### 4. Configuration

#### 4.1 Main Configuration (`config.php`)

```php
<?php
return [
    // Database configuration
    'type' => 'mysql',
    'host' => 'localhost',
    'name' => 'photo_gallery',
    'user' => 'gallery_user',
    'pass' => 'your_secure_password',

    // Regular image sources for gallery
    'image_sources' => [
        'main' => [
            'path' => __DIR__ . '/images',
            'name' => 'Main Gallery'
        ],
        'external_drive' => [
            'path' => 'E:/Photos',
            'name' => 'External Drive Photos'
        ]
    ],

    // RAW image sources for Jet app
    'raw_image_sources' => [
        'my_raw_drive_g' => [
            'path' => 'G:/RAW',
            'name' => 'G Drive RAW'
        ]
    ],

    // Cache settings
    'cache_thumb_root' => __DIR__ . '/cache/thumbnails',
    'jet_preview_cache_root' => __DIR__ . '/cache/jet_previews',
    'thumbnail_sizes' => [150, 750],
    'jet_preview_size' => 750,
    'jet_filmstrip_thumb_size' => 120,

    // RAW file extensions
    'raw_image_extensions' => ['arw', 'nef', 'cr2', 'cr3', 'raf', 'dng', 'orf', 'pef', 'rw2'],

    // Regular image extensions
    'allowed_extensions' => ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],

    // Admin user (created automatically)
    'admin_user' => [
        'username' => 'admin',
        'password' => 'admin123' // Change this!
    ]
];
?>
```

#### 4.2 Web Server Configuration

##### Apache (.htaccess)
```apache
# Security headers
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set X-XSS-Protection "1; mode=block"

# Block access to sensitive files
<FilesMatch "^(config\.php|\.env|.*\.log)$">
    Require all denied
</FilesMatch>

# Enable gzip compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Cache static assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType text/css "access plus 1 week"
    ExpiresByType application/javascript "access plus 1 week"
</IfModule>
```

##### Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/gallery;
    index index.php index.html;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    # Block sensitive files
    location ~ ^/(config\.php|\.env|.*\.log)$ {
        deny all;
    }

    # PHP processing
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|css|js)$ {
        expires 1M;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5. Background Workers Setup

#### 5.1 Regular Image Cache Worker
```bash
# Start the thumbnail cache worker
php worker_cache.php

# Or run in background (Linux/Mac)
nohup php worker_cache.php > logs/worker_cache.log 2>&1 &

# Windows - create a batch file
echo php worker_cache.php > start_cache_worker.bat
```

#### 5.2 RAW Cache Worker
```bash
# Start the RAW cache worker
php worker_jet_cache.php

# Or run in background (Linux/Mac)
nohup php worker_jet_cache.php > logs/worker_jet_cache.log 2>&1 &

# Windows - create a batch file
echo php worker_jet_cache.php > start_jet_worker.bat
```

#### 5.3 Cache Cleanup (Cron Job)

##### Linux/Mac Crontab
```bash
# Edit crontab
crontab -e

# Add this line to run cleanup daily at 2 AM
0 2 * * * /usr/bin/php /path/to/gallery/cron_cache_cleanup.php >> /path/to/gallery/logs/cleanup.log 2>&1
```

##### Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: Daily at 2:00 AM
4. Action: Start a program
5. Program: `C:\path\to\php.exe`
6. Arguments: `C:\path\to\gallery\cron_cache_cleanup.php`

### 6. User Management

#### 6.1 Admin Access
1. Visit: `http://your-domain.com/admin.php`
2. Login with configured admin credentials
3. Change the default password immediately

#### 6.2 Create Designer Users
1. Go to Admin Dashboard → Jet Admin tab
2. Click "Create Designer"
3. Enter username and password
4. Designer can now access Jet workspace at `/jet.php`

### 7. Usage

#### 7.1 Main Gallery
- **Public Access**: `http://your-domain.com/`
- **Features**: Browse images, slideshow, download ZIP files
- **Password Protection**: Set per-folder in admin dashboard

#### 7.2 Jet Culling Workspace
- **Access**: `http://your-domain.com/jet.php`
- **Login Required**: Designer or admin account
- **Features**: RAW image preview, color-coded picking, filtering

#### 7.3 Admin Dashboard
- **Access**: `http://your-domain.com/admin.php`
- **Tabs**:
  - **Gallery & Cache**: Manage passwords, view stats, control cache
  - **RAW Cache**: Monitor RAW processing, queue folder cache
  - **Jet Admin**: User management, work progress statistics

## Troubleshooting

### Common Issues

#### 1. RAW Images Not Processing
```bash
# Check if executables are working
php test_raw_processing.php

# Check worker logs
tail -f logs/worker_jet_php_error.log

# Verify file permissions
ls -la exe/
```

#### 2. Database Connection Issues
```bash
# Test database connection
php -r "
require 'db_connect.php';
echo 'Database connection: ' . (\$pdo ? 'SUCCESS' : 'FAILED') . \"\n\";
"
```

#### 3. Cache Directory Issues
```bash
# Check permissions
ls -la cache/
chmod -R 777 cache/  # Linux/Mac

# Windows: Right-click cache folder → Properties → Security → Add IIS_IUSRS with Full Control
```

#### 4. Worker Not Processing Jobs
```bash
# Check if worker is running
ps aux | grep worker  # Linux/Mac
tasklist | findstr php  # Windows

# Check job queue
mysql -u gallery_user -p photo_gallery -e "SELECT * FROM cache_jobs WHERE status='pending' LIMIT 5;"
mysql -u gallery_user -p photo_gallery -e "SELECT * FROM jet_cache_jobs WHERE status='pending' LIMIT 5;"
```

### Performance Optimization

#### 1. PHP Configuration
```ini
; php.ini optimizations
memory_limit = 2048M
max_execution_time = 300
upload_max_filesize = 100M
post_max_size = 100M
max_file_uploads = 100
```

#### 2. Database Optimization
```sql
-- Add indexes for better performance
CREATE INDEX idx_folder_stats_views ON folder_stats(views);
CREATE INDEX idx_jet_picks_user_source ON jet_image_picks(user_id, source_key);
CREATE INDEX idx_cache_jobs_status_created ON cache_jobs(status, created_at);
CREATE INDEX idx_jet_cache_status_created ON jet_cache_jobs(status, created_at);
```

#### 3. Web Server Optimization
- Enable gzip compression
- Set up proper caching headers
- Use a CDN for static assets
- Consider using nginx as reverse proxy

## Security Considerations

1. **Change Default Passwords**: Update admin password immediately
2. **File Permissions**: Restrict access to sensitive files
3. **Web Server Security**: Block access to config files and logs
4. **Database Security**: Use strong passwords and limit privileges
5. **HTTPS**: Enable SSL/TLS in production
6. **Regular Updates**: Keep PHP and dependencies updated

## Maintenance

### Daily Tasks (Automated)
- Cache cleanup via cron job
- Log rotation

### Weekly Tasks
- Check worker status
- Review error logs
- Monitor disk space

### Monthly Tasks
- Database optimization
- Security updates
- Backup configuration

## Support

For issues and questions:
1. Check the error logs in `/logs/` directory
2. Verify configuration in `config.php`
3. Test individual components using provided test scripts
4. Review this documentation for common solutions

## License

This system is provided as-is. Please ensure you have proper licenses for:
- dcraw (GPL)
- ImageMagick (Apache 2.0)
- Any other third-party components used 