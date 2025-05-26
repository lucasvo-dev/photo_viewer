# Jet App - Photo Culling Workspace
## Complete Setup & Usage Guide

### 🎯 Overview
The Jet App is a professional RAW photo culling workspace that allows photographers and designers to efficiently review, select, and color-code RAW images. It features real-time collaboration, background cache processing, and comprehensive admin management.

---

## 📋 Features

### ✅ Core Functionality
- **RAW Image Support**: NEF, ARW, CR2, DNG, and more
- **Color-Coded Selection**: Red, Green, Blue, Grey picks
- **Real-Time Collaboration**: Multiple users can work simultaneously
- **Background Cache Processing**: Fast preview generation
- **Admin Dashboard**: Complete user and project management
- **Statistics & Analytics**: Track work progress and productivity

### ✅ Technical Features
- **Mobile-First Design**: Responsive on all devices
- **High-Performance Caching**: Background workers for smooth experience
- **Security**: Path traversal protection, user authentication
- **Database Management**: Automated schema updates and migrations

---

## 🛠️ Installation & Setup

### Prerequisites
- **XAMPP** with PHP 7.4+ and MySQL
- **Windows 10/11** (for current setup)
- **Git Bash** (included with Git for Windows)
- **Administrator privileges** (for scheduler setup)

### Step 1: Core Installation
1. **Clone/Download** the project to `D:\xampp\htdocs\`
2. **Start XAMPP** services (Apache & MySQL)
3. **Import Database**: The app auto-creates tables on first run
4. **Configure RAW Sources**: Edit `config.php`

### Step 2: Configure RAW Sources
Edit `config.php` and update the `raw_image_sources` section:

```php
'raw_image_sources' => [
    'my_raw_drive_g' => [
        'path' => 'G:\\RAW',
        'name' => 'G Drive RAW'
    ],
    'studio_drive' => [
        'path' => 'D:\\Studio\\RAW',
        'name' => 'Studio RAW'
    ],
    // Add more sources as needed
],
```

### Step 3: Set Up Background Workers

#### Option A: Manual Workers (Development)
```bash
# Start RAW cache worker
php worker_jet_cache.php

# Start regular cache worker  
php worker_cache.php

# Start ZIP worker
php worker_zip.php
```

#### Option B: Windows Task Scheduler (Production)
1. **Run as Administrator**: Open Command Prompt as Administrator
2. **Navigate to project**: `cd D:\xampp\htdocs`
3. **Run setup script**: `setup_workers_schedule.bat`

This creates scheduled tasks:
- `Guu Cache Worker` - Every minute
- `Guu RAW Cache Worker` - Every minute  
- `Guu ZIP Worker` - Every minute
- `Guu ZIP Cleanup Cron` - Every 5 minutes
- `Guu Cache Cleanup Cron` - Daily at 3:00 AM
- `Guu Log Cleanup Cron` - Daily at 3:30 AM

---

## 🎮 Usage Guide

### For Administrators

#### 1. Access Admin Panel
- URL: `http://localhost/admin.php`
- Login with admin credentials

#### 2. Manage RAW Cache
- **View Sources**: See all configured RAW sources
- **Queue Cache**: Pre-generate previews for faster browsing
- **Monitor Progress**: Track cache job status
- **Clear Failed Jobs**: Clean up any processing errors

#### 3. User Management
- **Create Designers**: Add new designer accounts
- **Reset Passwords**: Update user credentials
- **View Statistics**: Monitor work progress

#### 4. Jet Workspace Access
- Click **"Mở Jet Workspace"** to access the culling interface
- Admin can see all picks from all users
- Color-code images for team guidance

### For Designers

#### 1. Access Jet Workspace
- URL: `http://localhost/jet.php`
- Login with designer credentials

#### 2. Browse RAW Folders
- Navigate through RAW source folders
- View high-quality previews (auto-generated)
- See folder structure organized by shoot

#### 3. Color Selection Workflow
- **Red**: Selected/Keep
- **Green**: Maybe/Review
- **Blue**: Favorite/Priority  
- **Grey**: Reject/Delete
- **No Color**: Unpicked/Neutral

#### 4. Collaboration Features
- See admin picks as guidance
- Multiple designers can pick different colors on same image
- Real-time updates across sessions

---

## 🔧 Configuration Reference

### Database Tables
- `users` - User accounts and authentication
- `jet_image_picks` - Color picks and selections
- `jet_cache_jobs` - Background processing queue
- `folder_stats` - Gallery view counts and access
- `image_cache` - Regular photo cache management

### Cache Structure
```
cache/
├── jet_previews/           # RAW preview cache
│   ├── 750/               # Preview size (750px height)
│   └── 120/               # Filmstrip size (120px height)
├── thumbnails/            # Regular photo thumbnails
└── zips/                  # Generated ZIP files
```

### Log Files
```
logs/
├── worker_jet_php_error.log    # RAW worker errors
├── api_error.log               # API errors
├── login_attempts.log          # Authentication logs
└── cache_operations.log        # Cache activity
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. RAW Previews Not Loading
**Symptoms**: Black squares, "processing" indefinitely
**Solutions**:
- Check if RAW source paths are accessible
- Verify `dcraw.exe` and `magick.exe` in `/exe` folder
- Start background worker: `php worker_jet_cache.php`
- Check logs: `logs/worker_jet_php_error.log`

#### 2. Cache Jobs Stuck in "Processing"
**Symptoms**: Jobs stuck, worker not progressing
**Solutions**:
- Restart worker (jobs auto-reset from "processing" to "pending")
- Check executable permissions
- Monitor worker output for errors

#### 3. Database Migration Issues
**Symptoms**: Column errors, table structure problems
**Solutions**:
- The app includes auto-migration logic
- Check `db_connect.php` for migration status
- Backup database before major updates

#### 4. Permission Errors
**Symptoms**: "Access denied" when creating scheduled tasks
**Solutions**:
- Run Command Prompt as Administrator
- Use manual workers for development
- Check folder permissions for cache directories

### Performance Optimization

#### 1. Cache Management
- Run cache pre-generation for frequently accessed folders
- Schedule cleanup jobs to manage disk space
- Monitor cache hit rates in admin panel

#### 2. Database Optimization
- Regular cleanup of old cache jobs
- Index optimization for large datasets
- Monitor query performance in logs

#### 3. Worker Tuning
- Adjust worker sleep intervals based on load
- Monitor memory usage for large RAW files
- Scale workers based on concurrent users

---

## 📊 Monitoring & Maintenance

### Health Checks
Run `php test_jet_final.php` to verify:
- ✅ Database connectivity
- ✅ RAW source accessibility  
- ✅ Cache directory structure
- ✅ Worker functionality
- ✅ Executable availability

### Regular Maintenance
1. **Weekly**: Review failed cache jobs
2. **Monthly**: Clean up old logs and cache
3. **Quarterly**: Database optimization
4. **As Needed**: User management and source updates

### Backup Strategy
**Critical Data**:
- Database (contains all picks and user data)
- Configuration files (`config.php`)
- Cache can be regenerated

**Backup Command**:
```bash
mysqldump -u root photo_culling_db > backup_$(date +%Y%m%d).sql
```

---

## 🚀 Advanced Features

### API Integration
The app provides REST API endpoints for:
- Image listing and metadata
- Pick status management
- Cache operations
- User management
- Statistics and reporting

### Customization Options
- **Color Schemes**: Modify CSS for different color coding
- **Preview Sizes**: Adjust `JET_PREVIEW_SIZE` constants
- **Cache Policies**: Configure cleanup intervals
- **User Roles**: Extend permission system

### Scaling Considerations
- **Multi-Server**: Database can be shared across servers
- **Storage**: RAW sources can be network drives
- **Load Balancing**: Workers can run on separate machines
- **Caching**: Redis integration for session management

---

## 📞 Support & Documentation

### Configuration Files
- `config.php` - Main configuration
- `db_connect.php` - Database and constants
- `api/helpers.php` - Utility functions

### Key URLs
- **Jet Workspace**: `/jet.php`
- **Admin Panel**: `/admin.php`
- **API Endpoint**: `/api.php`
- **Regular Gallery**: `/index.php`

### Logs Location
- Application logs: `/logs/`
- PHP errors: Check PHP error log
- Worker output: Console/Task Scheduler logs

---

*Last Updated: 2025-05-26*
*Version: 2.0 - Complete Jet Implementation* 