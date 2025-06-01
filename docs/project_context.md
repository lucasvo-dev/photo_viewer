# Bối cảnh Dự án: Hệ thống Thư viện Ảnh PHP với Jet Culling Workspace

## 1. Tổng quan Dự án

**Mục tiêu:** Xây dựng hệ thống thư viện ảnh chuyên nghiệp với workspace lọc ảnh RAW cho designer.

**Đối tượng sử dụng:**
- **Khách hàng:** Xem và tải ảnh/video từ thư viện
- **Designer:** Sử dụng Jet Culling Workspace để lọc và chọn ảnh RAW
- **Admin:** Quản lý mật khẩu thư mục, cache và thống kê

**Đặc điểm chính:**
- Mobile-First responsive design với UI compact và tinh tế
- Hỗ trợ đa nguồn ảnh (regular + RAW)
- Xử lý bất đồng bộ với worker system
- Bảo vệ thư mục bằng mật khẩu
- Tích hợp PhotoSwipe 5 cho lightbox
- Interface thiết kế tối ưu cho workflow chuyên nghiệp
- **Performance optimizations:** Lazy loading, filmstrip optimization, realtime updates

## 2. Công nghệ & Kiến trúc

### Backend
- **PHP >= 7.4** với PDO MySQL
- **MySQL/MariaDB** cho database
- **Extensions:** pdo_mysql, gd, zip, mbstring, fileinfo
- **External tools:** dcraw (RAW processing), FFmpeg (video thumbnails)

### Frontend
- **Vanilla JavaScript** (ES Modules)
- **CSS3** với responsive design và component-based architecture
- **PhotoSwipe 5** cho image lightbox
- **No framework dependencies**
- **Compact UI Design** tối ưu cho desktop và mobile
- **Advanced Performance Features:**
  - Intersection Observer API cho lazy loading
  - RequestAnimationFrame cho smooth animations
  - Optimized Masonry layout integration
  - Progressive image loading với placeholder system

### Cấu trúc API
- **RESTful API** với JSON responses
- **Modular architecture:** `api/init.php` → `api/actions_*.php`
- **Session-based authentication**
- **Background workers** cho heavy tasks

## 3. Cấu trúc Dự án

### Frontend Pages
```
index.php          # Thư viện ảnh chính
jet.php            # Jet Culling Workspace (UI mới compact)
login.php          # Đăng nhập admin
admin.php          # Quản trị hệ thống
```

### JavaScript Modules
```
js/app.js           # Logic thư viện chính
js/jet_app.js       # Logic Jet Culling (đã tối ưu, filmstrip lazy loading)
js/zipManager.js    # Quản lý ZIP jobs
js/apiService.js    # API communication
js/photoswipeHandler.js  # PhotoSwipe integration
js/admin.js         # Admin interface
js/shared-menu.js   # Shared menu component
js/uiImageView.js   # Optimized image rendering với Masonry
```

### CSS Architecture
```
css/style.css       # Global styles và variables
css/jet.css         # Jet Culling styles (compact design)
css/layout/         # Layout components
css/views/          # View-specific styles
css/views/jet_view.css  # Jet-specific styles với filmstrip optimizations
```

### API Backend
```
api.php             # Entry point chính
api/init.php        # Khởi tạo session, DB, constants
api/helpers.php     # Helper functions
api/actions_public.php   # Public API actions
api/actions_admin.php    # Admin-only actions  
api/actions_jet.php      # Jet Culling actions (optimized caching)
```

### Configuration & Data
```
config.php          # Cấu hình trung tâm (DB, sources, settings)
db_connect.php      # Database connection & setup
cache/thumbnails/   # Generated thumbnails
cache/zips/         # Generated ZIP files
logs/               # Application logs
```

### Background Workers
```
worker_cache.php         # Thumbnail generation worker
worker_jet_cache.php     # RAW preview generation worker  
worker_zip.php           # ZIP creation worker
cron_cache_cleanup.php   # Cache cleanup cron
cron_log_cleanup.php     # Log cleanup cron
cron_zip_cleanup.php     # ZIP cleanup cron (5 min after creation)
```

## 4. Chức năng Chính

### 4.1 Thư viện Ảnh (index.php)
- **Duyệt thư mục:** Hỗ trợ đa nguồn ảnh với breadcrumb navigation
- **Xem ảnh/video:** PhotoSwipe lightbox với keyboard navigation
- **Tìm kiếm:** Real-time search trong thư mục
- **Bảo vệ mật khẩu:** Session-based folder protection
- **Tải ZIP:** Tạo ZIP cho thư mục hoặc nhiều files đã chọn
- **Responsive design:** Tối ưu cho mobile và desktop
- **Performance optimizations:** Masonry layout với lazy loading

### 4.2 Jet Culling Workspace (jet.php) - **ĐÃ HOÀN THIỆN & OPTIMIZED**
- **Compact UI Design:** Interface gọn gàng, buttons nhỏ và tinh tế
- **Filter System tinh tế:**
  - Main filters: Tất cả, Đã chọn, Chưa chọn
  - Color filters: Đỏ, Xanh lá, Xanh dương, Xám (design nhỏ gọn)
  - Layout horizontal trên desktop, vertical trên mobile
- **Duyệt RAW files:** Hiển thị preview 750px từ RAW files
- **Pick management:** Gán màu cho ảnh với keyboard shortcuts (0,1,2,3)
- **Sorting options:** Sắp xếp theo tên, ngày (dropdown compact)
- **Preview mode:** Fullscreen preview với filmstrip navigation
  - **NEW:** Lazy loading filmstrip với Intersection Observer
  - **NEW:** Preload nearby thumbnails khi navigation
  - **NEW:** Smooth scrolling và hover preload
  - **NEW:** Mobile swipe gestures support
- **ZIP filtered images:** Tạo ZIP chỉ từ ảnh đã lọc (button compact)
- **Multi-user support:** Admin xem picks của tất cả designers
- **Realtime updates:** Lightweight polling cho pick changes
- **Optimized workflow:** Loại bỏ search (không cần thiết cho RAW workflow)

### 4.3 Admin Panel (admin.php)
- **Folder password management:** Thêm/xóa mật khẩu thư mục
- **Cache management:** Xem trạng thái và quản lý cache
- **Statistics:** Thống kê views, cache status
- **User management:** Quản lý admin/designer accounts (đã merge data)
- **System monitoring:** Theo dõi workers và jobs

### 4.4 ZIP System - **ĐÃ HOÀN THIỆN**
- **Async processing:** Background worker xử lý tạo ZIP
- **Multi-file support:** ZIP từ nhiều files đã chọn
- **RAW file support:** Hỗ trợ đầy đủ cho RAW images
- **Progress tracking:** Real-time progress updates
- **Auto cleanup:** Tự động xóa ZIP sau 5 phút
- **Download management:** Secure download với access control

## 5. Database Schema - **ĐÃ HOÀN THIỆN**

### Core Tables
```sql
folder_passwords     # Mật khẩu bảo vệ thư mục
folder_stats        # Thống kê views thư mục
admin_users         # Admin/designer accounts (bảng chính)
users              # Bảng cũ (giữ lại để tương thích)
```

### Cache & Jobs
```sql
cache_jobs          # Queue cho thumbnail generation
jet_cache_jobs      # Queue cho RAW preview generation  
jet_image_picks     # Pick status của RAW images (FK → admin_users)
zip_jobs           # Queue cho ZIP creation
```

### Data Migration Status
- **✅ Hoàn thành:** Merge data từ `users` → `admin_users`
- **✅ Hoàn thành:** Update foreign key references trong `jet_image_picks`
- **✅ Verified:** Tất cả 25 pick references hợp lệ
- **✅ User count:** 3 users (admin, designer1, Huy)

## 6. Workflow & Data Flow

### 6.1 Image/Video Viewing
1. **Request:** `api.php?action=list_files&path=folder`
2. **Validation:** Check folder access permissions
3. **Response:** File list với thumbnail URLs
4. **Thumbnail:** On-demand generation với worker fallback
5. **Lightbox:** PhotoSwipe với range request support

### 6.2 RAW Image Processing (Jet) - **OPTIMIZED**
1. **Request:** `api.php?action=jet_list_images&source_key=raw_source&path=folder`
2. **Cache check:** Kiểm tra preview 750px đã tồn tại
3. **Queue job:** Nếu chưa có, queue vào `jet_cache_jobs`
4. **Worker:** `worker_jet_cache.php` xử lý dcraw → JPEG 750px
5. **Response:** Preview URL hoặc HTTP 202 (processing)
6. **Filtering:** Compact UI cho filter và sort operations
7. **Filmstrip:** Lazy loading với Intersection Observer API

### 6.3 ZIP Creation - **ENHANCED**
1. **Request:** `api.php?action=request_zip` với file list
2. **RAW Support:** Hỗ trợ đầy đủ cho RAW sources
3. **Validation:** Validate files và access permissions
4. **Queue job:** Insert vào `zip_jobs` table
5. **Worker:** `worker_zip.php` tạo ZIP file
6. **Download:** `api.php?action=download_final_zip`
7. **Cleanup:** `cron_zip_cleanup.php` xóa sau 5 phút

## 7. Security & Performance

### Security Features
- **Path traversal protection:** Validate tất cả file paths
- **Session-based auth:** Secure folder access
- **Input sanitization:** Escape user inputs
- **File type validation:** Whitelist extensions
- **Source isolation:** Strict source key validation

### Performance Optimizations - **ENHANCED**
- **Lazy loading:** Images load on-demand với Intersection Observer
- **Progressive enhancement:** 150px → 750px thumbnails
- **Background processing:** Heavy tasks qua workers
- **Client-side caching:** Browser cache headers
- **Database indexing:** Optimized queries
- **Compact UI:** Reduced DOM complexity và faster rendering
- **Filmstrip optimizations:**
  - Lazy loading với placeholder SVG
  - Preload nearby thumbnails (±3 range)
  - Hover preload cho main images
  - Smooth scrolling với requestAnimationFrame
- **Realtime updates:** Lightweight polling thay vì full re-render
- **Mobile optimizations:** Touch gestures, swipe support

## 8. Configuration

### Image Sources (config.php)
```php
IMAGE_SOURCES = [
    'main' => ['path' => '/path/to/images'],
    'extra' => ['path' => '/path/to/extra']
];

RAW_IMAGE_SOURCES = [
    'my_raw_drive_g' => ['path' => 'G:\RAW']
];
```

### Key Settings
- **Thumbnail sizes:** 150px (fast), 750px (quality)
- **Cache directories:** `cache/thumbnails/`, `cache/zips/`
- **Worker intervals:** 10s polling
- **ZIP cleanup:** 5 minutes after creation
- **Session timeout:** Browser close
- **Filmstrip lazy loading:** ±2 immediate, ±3 on navigation

## 9. Development Workflow & Deployment

### 9.1 Development Environment (Máy Dev - Windows)
- **Platform:** Windows với XAMPP/WAMP stack
- **Development tools:** VS Code, Git, Browser DevTools
- **Local testing:** `http://localhost/` với full feature testing
- **Database:** Local MySQL instance cho development

### 9.2 Git-based Deployment Workflow
```
[Máy Dev Windows] → [GitHub Repository] → [Máy Server Windows]
     ↓                      ↓                      ↓
  Development           Version Control        Production
  Local testing         Code repository        Live system
```

**Development Process:**
1. **Local Development:** Code và test trên máy dev Windows
2. **Feature Completion:** Hoàn thành chức năng và test đầy đủ
3. **Git Commit:** Push code lên GitHub repository
4. **Server Deployment:** Pull code từ GitHub về máy server Windows
5. **Production Setup:** Configure cho production environment

### 9.3 Environment-Specific Configurations

**Development (Máy Dev):**
```php
// config.php - Development settings
define('DB_HOST', 'localhost');
define('DB_NAME', 'gallery_dev');
define('ENVIRONMENT', 'development');
define('DEBUG_MODE', true);
```

**Production (Máy Server):**
```php
// config.php - Production settings  
define('DB_HOST', 'localhost');
define('DB_NAME', 'gallery_prod');
define('ENVIRONMENT', 'production');
define('DEBUG_MODE', false);
```

### 9.4 Deployment Checklist

**Pre-deployment (Máy Dev):**
- [ ] Test tất cả core functionality
- [ ] Verify worker processes hoạt động
- [ ] Check security configurations
- [ ] Update documentation nếu cần
- [ ] Commit và push lên GitHub

**Post-deployment (Máy Server):**
- [ ] Pull latest code từ GitHub
- [ ] Update `config.php` cho production
- [ ] Run database migrations nếu có
- [ ] Set up cron jobs cho workers
- [ ] Configure web server permissions
- [ ] Test production functionality

### 9.5 File Exclusions (.gitignore)
```
# Sensitive configuration
config.php

# Generated content
cache/thumbnails/*
cache/zips/*
logs/*.log

# Development files
.vscode/
*.tmp
```

### 9.6 Requirements

**Web Server:** Apache/Nginx với PHP support
- **Database:** MySQL 5.7+ hoặc MariaDB
- **Storage:** Sufficient space cho cache và ZIP files
- **External tools:** dcraw, FFmpeg (optional)

### 9.7 Worker Management
```bash
# Start workers (trên cả máy dev và server)
php worker_cache.php &
php worker_jet_cache.php &  
php worker_zip.php &

# Cron jobs (every 5 minutes)
*/5 * * * * php cron_cache_manager.php
*/5 * * * * php cron_zip_cleanup.php
0 2 * * * php cron_log_cleaner.php
```

### 9.8 Monitoring & Maintenance
- **Logs:** `logs/php_error.log`, `logs/worker_*.log`
- **Database:** Monitor job queues và completion rates
- **Storage:** Cache size và ZIP cleanup effectiveness
- **Performance:** Response times và worker efficiency
- **Git sync:** Regular pulls từ GitHub để cập nhật

## 10. Recent Updates & Improvements

### 10.1 UI/UX Enhancements ✅
- **Compact Design:** Hoàn toàn thiết kế lại Jet Culling UI
- **Button Optimization:** Giảm kích thước buttons, typography tinh tế
- **Layout Improvements:** 
  - Horizontal layout trên desktop
  - Responsive vertical layout cho mobile
  - Padding và spacing tối ưu
- **Filter Enhancement:** Color filters nhỏ gọn với hover effects
- **Search Removal:** Loại bỏ search functionality (không cần cho RAW workflow)

### 10.2 Performance Optimizations - **LATEST** ✅
- **Filmstrip Lazy Loading:**
  - Intersection Observer API cho efficient loading
  - Placeholder SVG cho unloaded thumbnails
  - Load current ±2 images immediately, lazy load others
  - Preload nearby thumbnails (±3 range) khi navigation
  - Hover preload cho main images
- **Realtime Updates Optimization:**
  - Lightweight polling thay vì full re-render
  - Efficient pick color updates without DOM reconstruction
  - Optimized all_picks indicator updates
- **Mobile Enhancements:**
  - Touch gesture support cho preview navigation
  - Swipe gestures (left/right) cho image navigation
  - Mobile-optimized context menus
  - Responsive filmstrip sizing

### 10.3 Data Migration & Fixes ✅
- **User Data Merge:** Hoàn thành merge từ `users` → `admin_users`
- **Foreign Key Updates:** Cập nhật tất cả references trong `jet_image_picks`
- **ZIP Functionality:** Sửa lỗi ZIP download cho RAW files
- **Database Integrity:** Verified tất cả 25 pick references hợp lệ

### 10.4 Code Quality & Architecture ✅
- **JavaScript Cleanup:** Loại bỏ search-related code
- **CSS Architecture:** Component-based CSS với compact design
- **Performance:** Optimized rendering và reduced DOM complexity
- **Modular Structure:** Clean separation of concerns
- **Error Handling:** Comprehensive error handling và user feedback

## 11. Tình trạng Hiện tại

### ✅ Hoàn thành (100%)
- **Core gallery functionality:** Browse, view, search, password protection
- **Video support:** Thumbnails, streaming, PhotoSwipe integration
- **ZIP system:** Multi-file, async processing, progress tracking, RAW support
- **Jet Culling Workspace:** 
  - RAW processing, filtering, picking, ZIP export
  - **NEW:** Compact UI design, optimized workflow
  - **NEW:** Advanced filmstrip với lazy loading
  - **NEW:** Mobile touch gestures support
  - **NEW:** Realtime lightweight updates
- **Admin panel:** Password management, cache control, statistics, user management
- **Mobile responsive:** Optimized cho tất cả device sizes với compact design
- **Worker system:** Stable background processing
- **Security:** Path validation, access control, input sanitization
- **Database:** Fully migrated và optimized
- **Performance:** Advanced optimizations với lazy loading và efficient updates

### 🔧 Production Ready
- **Performance monitoring:** Ongoing optimization
- **Cache management:** Automated cleanup systems
- **Log rotation:** Automated log maintenance
- **Database optimization:** Query performance tuning
- **UI/UX:** Professional-grade interface với advanced interactions

### 📋 Future Enhancements (Optional)
- **WebP/AVIF support:** Modern image formats
- **Advanced search:** Metadata-based search (if needed)
- **Batch operations:** Bulk file management
- **API rate limiting:** Enhanced security
- **CDN integration:** Scalability improvements
- **PWA features:** Offline support, push notifications

---

**Dự án đã hoàn thiện 100% với đầy đủ chức năng core, security, advanced performance optimizations và professional UI design. Ready for production deployment với enhanced user experience.** 

### Key Features Summary:
- ✅ **Complete Gallery System** với password protection
- ✅ **Professional Jet Culling Workspace** với compact UI
- ✅ **Advanced Performance Features** (lazy loading, realtime updates)
- ✅ **Multi-format Support** (images, videos, RAW files)
- ✅ **Background Processing** cho heavy operations
- ✅ **Mobile-First Design** với touch gestures
- ✅ **Admin Management** với user và system control
- ✅ **Data Integrity** với migrated database
- ✅ **Production Ready** với monitoring và maintenance tools
- ✅ **Optimized User Experience** với smooth interactions và fast loading 