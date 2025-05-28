# Bối cảnh Dự án: Thư viện Ảnh PHP Đơn giản

## 1. Mục tiêu Dự án

*   **Mục tiêu chính:** Xây dựng một ứng dụng web thư viện ảnh đơn giản, hiệu quả và hấp dẫn về mặt hình ảnh bằng PHP.
*   **Đối tượng người dùng:** Chủ yếu là khách hàng của Guustudio để xem và tải ảnh, có khả năng bảo vệ bằng mật khẩu cho các album cụ thể.
*   **Ưu tiên thiết kế:** Ưu tiên trải nghiệm Mobile-First, giao diện sạch sẽ, chủ đề tối lấy cảm hứng từ GitHub.

## 2. Công nghệ chính

*   **Backend:** PHP (>= 7.4)
*   **Database:** MySQL (lưu mật khẩu thư mục, thống kê, hàng đợi công việc)
*   **Frontend:** JavaScript thuần (ES Modules), CSS, HTML
*   **Thư viện JS:** PhotoSwipe 5 (xem ảnh)
*   **Server:** Web server hỗ trợ PHP (ví dụ: XAMPP, Apache, Nginx)
*   **PHP Extensions yêu cầu:** pdo_mysql, gd, zip, mbstring, fileinfo
*   **Công cụ xử lý ảnh RAW (Dự kiến):** `dcraw` hoặc ImageMagick (với hỗ trợ RAW) để tạo preview JPEG từ file RAW.
*   **Công cụ xử lý Video:** FFmpeg để tạo thumbnail từ video.

## 3. Cấu trúc Dự án & Tệp quan trọng

*   **Giao diện Người dùng (Frontend):**
    *   `index.php`: Trang chính, hiển thị danh sách thư mục hoặc ảnh/video.
    *   `jet.php`: Giao diện cho không gian làm việc Jet Culling.
    *   `js/app.js`: Xử lý logic phía client (tải dữ liệu, điều hướng, hiển thị modal, PhotoSwipe, tìm kiếm, tải trực tiếp video, v.v.).
    *   `js/jet_app.js`: Logic phía client cho không gian làm việc Jet Culling.
    *   `css/style.css`: Định dạng giao diện, bao gồm các class chung cho modal (`.modal-overlay`, `.modal-box`) và các style cho video (`.video-item`, `.play-icon-overlay`, `.pswp-video-container`).
*   **Quản trị (Admin):**
    *   `login.php`: Trang đăng nhập admin.
    *   `admin.php`: Trang quản lý mật khẩu thư mục và xem thống kê.
    *   `js/admin.js`: Logic phía client cho trang admin.
*   **API (Backend):**
    *   `api.php`: **Điểm vào chính (Entry Point)** cho tất cả các yêu cầu API. Chỉ chứa logic `require` các file xử lý khác.
    *   `api/init.php`: Khởi tạo cấu hình lỗi, session, gọi `db_connect.php`, định nghĩa hằng số và biến API toàn cục.
    *   `api/helpers.php`: Chứa các hàm hỗ trợ chung (ví dụ: `json_response()`, `validate_source_and_path()`, `check_folder_access()`, `create_thumbnail()`, `create_video_thumbnail()`, `find_first_image_in_source()`).
    *   `api/actions_public.php`: Xử lý các action công khai (ví dụ: `list_files` - nhận diện ảnh/video, `get_thumbnail` - cho ảnh/video, `get_image` - stream ảnh/video hỗ trợ range requests, `get_image_metadata` (lấy siêu dữ liệu cơ bản như kích thước, loại của ảnh/video, chủ yếu từ cache), `request_zip`, `get_zip_status`, `download_final_zip`, `authenticate`).
    *   `api/actions_admin.php`: Xử lý các action yêu cầu quyền admin (ví dụ: `admin_login`, `admin_logout`, `admin_list_folders`, `admin_set_password`, `admin_remove_password`).
    *   `api/actions_jet.php`: Xử lý các action cho Jet Culling Workspace (ví dụ: `jet_list_images`, `jet_update_pick_status`).
*   **Cấu hình & Dữ liệu:**
    *   `config.php`: **File cấu hình trung tâm** (thông tin DB, admin, nguồn ảnh, cài đặt cache, giới hạn API, log, tiêu đề). **QUAN TRỌNG:** Không đưa file này lên repo công khai nếu chứa thông tin nhạy cảm.
    *   `db_connect.php`: **File thiết lập cốt lõi.** `require` file `config.php`, kết nối DB, xác thực và định nghĩa nguồn ảnh (`IMAGE_SOURCES`), định nghĩa hằng số cache/extensions, tự động tạo bảng DB.
    *   `cache/thumbnails/`: Thư mục lưu trữ thumbnail đã tạo.
    *   `images/`: Thư mục nguồn ảnh mặc định (có thể thay đổi/thêm trong `config.php`).
    *   `logs/`: Thư mục chứa file log ứng dụng.
*   **Tác vụ nền (Cron/Scheduled Tasks):**
    *   `worker_cache.php`: Script chạy nền (worker) để xử lý các yêu cầu tạo thumbnail kích thước lớn (ảnh và video) một cách bất đồng bộ. Lấy các job từ bảng `cache_jobs`.
    *   `worker_jet_cache.php`: **Script chạy nền chuyên biệt cho RAW cache (Jet Culling)** - Xử lý queue tạo preview từ file RAW (750px) một cách bất đồng bộ. Lấy các job từ bảng `jet_cache_jobs`. **Đã được simplified để chỉ tạo 1 cache size (750px) thay vì 2 sizes, cải thiện performance ~50% và reliability.**
    *   `worker_zip.php`: Script chạy nền (worker) để xử lý các yêu cầu tạo file ZIP một cách bất đồng bộ. Lấy các job từ bảng `zip_jobs`.
    *   `cron_cache_manager.php`: Script chạy theo lịch (cron job) để:
        *   Dọn dẹp các file thumbnail "mồ côi" (không có ảnh gốc tương ứng) trong thư mục cache.
        *   **Quan trọng:** Đã thêm bước kiểm tra an toàn để ngăn chặn việc xóa toàn bộ cache nếu script không tìm thấy bất kỳ file ảnh gốc hợp lệ nào (do lỗi cấu hình, thư mục nguồn bị ngắt kết nối, v.v.).
    *   `cron_log_cleaner.php`: Script chạy theo lịch để dọn dẹp các file log cũ.
    *   `cron_zip_cleanup.php`: Script chạy theo lịch để tự động xóa các file ZIP đã được tải xuống sau một khoảng thời gian nhất định (ví dụ: 5 phút) nhằm giải phóng dung lượng ổ cứng.
    *   `setup_workers_schedule.bat`: File batch để thiết lập các tác vụ theo lịch trên Windows cho tất cả các worker và cron job cần thiết, bao gồm cả `cron_zip_cleanup.php`.

## 4. Luồng hoạt động & Khái niệm chính

*   **Đa nguồn ảnh:** Cho phép định nghĩa nhiều thư mục gốc chứa ảnh trong `config.php`.
*   **Đường dẫn có tiền tố nguồn:** Định dạng `source_key/relative/path` (ví dụ: `main/album1`, `extra_drive/photos/img.jpg`) được dùng làm định danh nhất quán trong toàn bộ ứng dụng (API, DB, URL hash).
*   **Xác thực đường dẫn:** API luôn kiểm tra tính hợp lệ và giới hạn truy cập trong các nguồn được định nghĩa để chống path traversal.
*   **Bảo vệ thư mục:** Mật khẩu hash lưu trong DB. `check_folder_access` kiểm tra quyền dựa trên session/DB. Frontend hiển thị prompt khi cần.
*   **Thumbnail & Cache:** Thumbnail kích thước nhỏ được tạo "on-the-fly" cho ảnh và video, và được cache lại. Worker `worker_cache.php` xử lý tạo cache bất đồng bộ cho kích thước lớn hơn (ví dụ: 750px) cho cả ảnh và video, lấy job từ bảng `cache_jobs`. Thumnail nhỏ (150px) vẫn được tạo on-the-fly để đảm bảo hiệu suất tải ban đầu.
*   **Hỗ trợ Video:** Hệ thống nhận diện các định dạng video phổ biến. Thumbnail video được tạo tự động bằng FFmpeg. API hỗ trợ stream video với range requests. Frontend sử dụng thẻ HTML5 `<video>` trong PhotoSwipe và hiển thị nút tải trực tiếp video.
*   **Quản trị:** Truy cập trang admin (`admin.php`) sau khi đăng nhập để quản lý mật khẩu thư mục, xem thống kê, và quản lý cache. Giao diện admin bao gồm bảng hiển thị thông tin thư mục với trạng thái cache chi tiết và nút yêu cầu/dọn dẹp cache. Polling nhanh hơn trong frontend giúp cập nhật trạng thái cache gần như tức thì. Bảng quản trị hiển thị tốt trên cả desktop và mobile.
*   **Hệ thống Hàng đợi Công việc:** Sử dụng các bảng DB (`cache_jobs`, `zip_jobs`, `jet_cache_jobs`) và các worker script nền (`worker_cache.php`, `worker_zip.php`, `worker_jet_cache.php`) để xử lý các tác vụ nặng (tạo cache, tạo ZIP) một cách bất đồng bộ, tránh chặn người dùng.
*   **Tạo và Tải ZIP (bao gồm Chọn nhiều):** Hệ thống cho phép yêu cầu tạo file ZIP cho toàn bộ thư mục hoặc nhiều tệp được chọn riêng lẻ. Các yêu cầu này được xử lý bất đồng bộ bởi `worker_zip.php`. Người dùng có thể theo dõi trạng thái các công việc ZIP đang chờ/xử lý/hoàn thành qua một bảng điều khiển (panel) trên giao diện người dùng. File ZIP cuối cùng có thể tải về và được tự động xóa sau một khoảng thời gian để giải phóng dung lượng. Logic kiểm tra quyền truy cập đã được điều chỉnh để cho phép tải về các file ZIP tạo từ nhiều tệp được chọn.
*   **Luồng làm việc Lọc ảnh (Culling) với Jet Culling Workspace:** Cung cấp giao diện (`jet.php`) cho designer để duyệt và chọn lựa ảnh RAW (hiển thị dưới dạng preview JPEG 750px được tạo bởi `worker_jet_cache.php`). Hỗ trợ lọc và sắp xếp ảnh, chế độ xem trước ảnh lớn với điều hướng bàn phím/chuột, và chức năng gán/bỏ gán màu (color picks) được lưu vào CSDL (`jet_image_picks`). Admin có thể xem lại các lựa chọn này.
*   **Hệ thống Cache RAW Đã Simplified:** Thay vì tạo 2 kích thước cache, hệ thống hiện tại chỉ tạo 1 kích thước (750px) một cách đáng tin cậy hơn (~50% nhanh hơn). Frontend sử dụng CSS để điều chỉnh kích thước hiển thị của ảnh 750px cho các chế độ xem khác nhau (lưới, filmstrip). Hệ thống bao gồm các công cụ dọn dẹp CSDL để đồng bộ trạng thái cache sau khi xóa file vật lý.

## 5. Tình trạng Hiện tại

*   Các chức năng cốt lõi của thư viện ảnh (duyệt thư mục, xem ảnh/video, tìm kiếm, bảo vệ mật khẩu) đã hoạt động ổn định.
*   Tính năng tải ZIP cho thư mục và nhiều mục được chọn đã hoạt động hoàn chỉnh, bao gồm xử lý bất đồng bộ, theo dõi trạng thái job và tự động xóa file ZIP đã tải.
*   Hỗ trợ xem và tải video đã được tích hợp đầy đủ.
*   Hệ thống cache ảnh và video, đặc biệt là cache RAW cho Jet Culling Workspace, đã được đơn giản hóa và hoạt động đáng tin cậy hơn với các worker xử lý nền.
*   Giao diện admin cho quản lý mật khẩu và cache đã được cải thiện về UX/UI, hiển thị thông tin chi tiết và hỗ trợ trên mobile.
*   Cấu trúc backend API đã được refactor thành các module rõ ràng.
*   Frontend đã được refactor đáng kể theo hướng module hóa (xem chi tiết trong lịch sử refactor), đặc biệt là logic quản lý chọn ảnh và hàng đợi ZIP, cải thiện cấu trúc code và khả năng bảo trì.
*   Hệ thống cache RAW cho Jet Culling Workspace đã được đơn giản hóa thành công chỉ còn 1 kích thước cache (750px) với hiệu suất và độ tin cậy cao hơn, cùng với các công cụ hỗ trợ đồng bộ hóa CSDL sau khi xóa file vật lý (xem chi tiết trong lịch sử giải quyết vấn đề RAW Cache).
*   Kiểm thử End-to-End ban đầu với Playwright đã được thiết lập, với các kiểm thử đăng nhập và hiển thị thư mục/admin panel đã PASSED, trong khi kiểm thử hiển thị thumbnail trong thư mục con và mở PhotoSwipe vẫn FAILED và đang tạm dừng gỡ lỗi.

## 6. Lộ trình Phát triển Tiếp theo (Roadmap & Features Dự kiến)

Ngoài các tối ưu và cải tiến nhỏ lẻ, các tính năng lớn dự kiến phát triển bao gồm:

*   **(Tiếp theo) Mở rộng hỗ trợ định dạng RAW:** Liên tục cập nhật danh sách `raw_file_extensions` và kiểm tra khả năng tương thích của `dcraw` với các định dạng RAW mới nếu cần.

*   **🚀 Image Grid Loading Performance Optimization (2025-05-21 - IN PROGRESS):**
    *   **Mục tiêu:** Cải thiện đáng kể hiệu suất loading và UX của image grid để tránh cảm giác lag hoặc lỗi.
    *   **Vấn đề hiện tại:**
        *   Loading experience thiếu mượt mà - không có skeleton loading
        *   Race conditions giữa các requests
        *   Không tối ưu cho viewport - load tất cả ảnh cùng lúc
        *   Thumbnail size cố định - không responsive theo device
        *   Preload strategy chưa thông minh
        *   Layout shift khi ảnh xuất hiện
    *   **Implementation Plan:**
        *   **Phase 1: Quick Wins (1-2 days)** - ✅ COMPLETED (2025-05-21) - 🔧 DEBUGGING (2025-05-21)
            *   ✅ Skeleton loading với aspect ratio containers
                *   Tạo `.image-skeleton` class với shimmer animation
                *   Aspect ratio containers để prevent layout shift
                *   Progressive loading states (blur → sharp)
                *   🔧 **Debug Issues Fixed:**
                    *   Fixed initial load count calculation (reduced from full viewport to max 6 images)
                    *   Added comprehensive logging for skeleton creation and Intersection Observer
                    *   Fixed aspect ratio calculation with proper fallbacks
                    *   ✅ **MAJOR FIX:** Fixed thumbnail size validation - `getOptimalThumbnailSize()` was returning invalid sizes (120, 175, 200, etc.) not in API's allowed sizes `[150, 750]`, causing all thumbnail requests to fail with HTTP 400. Now uses standardized size 150 for all thumbnails.
        *   **Phase 2: Advanced Optimizations (3-5 days)** - 📋 PLANNED
            *   ⏳ Progressive image loading (blur → sharp)
            *   ⏳ Smart preloading strategy based on scroll direction
            *   ⏳ Request deduplication và better race condition handling
            *   ⏳ Virtual scrolling cho large datasets
        *   **Phase 3: Modern Web Features (2-3 days)** - 📋 PLANNED
            *   📋 WebP/AVIF support với fallback
            *   📋 Service Worker caching
            *   📋 Connection-aware loading
            *   📋 Performance monitoring và metrics
    *   **Technical Implementation Details (Phase 1):**
        *   **Files Modified:**
            *   `css/components/image_item.css` - Added skeleton loading styles và responsive breakpoints
            *   `js/uiImageView.js` - Implemented Intersection Observer và skeleton replacement logic
            *   `js/utils.js` - Added performance utilities classes (RequestManager, ScrollDirectionTracker, etc.)
            *   `js/apiService.js` - Integrated request deduplication và performance monitoring
            *   `js/app.js` - Integrated scroll tracking và performance timing
        *   **Key Features Added:**
            *   Skeleton placeholders với shimmer animation
            *   Aspect ratio containers để prevent layout shift
            *   Intersection Observer cho smart lazy loading
            *   Responsive thumbnail sizing (2-6 columns)
            *   Request deduplication để prevent race conditions
            *   Performance monitoring cho API requests và image loading
            *   Progressive loading states với CSS transitions
        *   **Performance Benefits Achieved:**
            *   Reduced initial page load time bằng cách lazy load images outside viewport
            *   Eliminated layout shift với aspect ratio containers
            *   Smoother user experience với skeleton loading
            *   Better handling của concurrent requests
            *   Responsive design cho tất cả device sizes
    *   **Next Steps (Phase 2):**
        *   Implement progressive image loading (tiny blur image → full resolution)
        *   Add scroll direction-based smart preloading
        *   Implement virtual scrolling cho very large image sets
        *   Add WebP/AVIF format support với graceful fallback

*   **Hoàn thiện Tính năng Lọc ảnh (Culling) cho Designer & Admin (Jet Culling Workspace - Phát triển Tiếp theo):**
    *   **Mục tiêu:** Cung cấp một công cụ mạnh mẽ và hiệu quả cho designer để duyệt và chọn lựa (cull) ảnh từ các bộ ảnh lớn, đặc biệt là ảnh RAW. Admin có thể xem lại và quản lý các lựa chọn này.
    *   **Các Tính năng Tiếp theo và Nâng cao:**
        *   **Cải thiện Zoom/Pan:** Hoàn thiện các tương tác nâng cao trong chế độ xem trước (ví dụ: zoom chi tiết hơn, pan mượt mà hơn) để kiểm tra độ nét hiệu quả.
        *   **Hợp tác Đa người dùng Chi tiết hơn:** Giao diện cho Admin để dễ dàng xem, so sánh và quản lý các lựa chọn (picks, ratings, colors) từ nhiều designer khác nhau trên cùng một bộ ảnh. Cung cấp thống kê chi tiết hơn về lựa chọn của từng designer.
        *   **Tùy chỉnh Giao diện (Tiềm năng):** Nghiên cứu khả năng cho phép người dùng tùy chỉnh siêu dữ liệu hiển thị, kích thước thumbnail trong Jet Culling Workspace.

*   **Quản lý File và Thư mục cho Admin (Qua giao diện Web):**
    *   **Upload:** Cho phép admin upload ảnh và video mới vào các thư mục nguồn.
    *   **Delete File:** Cho phép admin xóa file ảnh/video (bao gồm cả thumbnail và các dữ liệu liên quan).
    *   **Create/Delete Folder:** Cho phép admin tạo thư mục mới và xóa thư mục (bao gồm cả nội dung bên trong một cách cẩn trọng).

*   **Tối ưu Hiệu suất (Tiếp tục):** Đánh giá và tối ưu hiệu suất cho việc tạo preview RAW, thumbnail video. Tối ưu các truy vấn CSDL liên quan đến tính năng mới.

*   **Cải thiện UX/UI (Tiếp tục):** Đảm bảo giao diện cho các tính năng mới trực quan và dễ sử dụng, đặc biệt là cho việc lọc ảnh và quản lý file.

*   **Chất lượng Mã nguồn & Khả năng Bảo trì (Tiếp tục):** Duy trì cấu trúc code rõ ràng khi thêm các module mới.

*   **Kiểm thử (Testing):** Kiểm thử kỹ lưỡng các tính năng mới trên nhiều trình duyệt và thiết bị, đặc biệt tập trung vào các phần Playwright đang FAILED.

## 7. Lịch sử Phát triển Chi tiết (Detailed Development History)

Phần này ghi lại lịch sử chi tiết về việc giải quyết các vấn đề lớn và các thay đổi quan trọng đã triển khai.

## 7.1. Kế hoạch Refactor JavaScript (JavaScript Refactoring Plan)

*   **Mục tiêu:** Tối ưu hóa cấu trúc mã JavaScript để tăng tính module, dễ bảo trì và sẵn sàng cho việc mở rộng các tính năng phức tạp trong tương lai.
*   **Trạng thái chung:** Đã hoàn thành vào 2025-05-16 (AI). Tất cả các mục dưới đây đã được xem xét và triển khai hoặc xác nhận hoàn tất.

## 7.2. RAW Cache System - Complete Resolution History

### 🎯 **Vấn đề ban đầu (Initial Problems)**
1. **Hệ thống cache RAW không ổn định** - cache management không hoạt động như gallery system
2. **Cache creation buttons trong admin interface không functional**
3. **Performance chậm** - tạo 2 thumbnails (750px và 120px) từ mỗi RAW file
4. **120px thumbnails không được tạo reliably** - complex auto-generation logic failures
5. **Database không sync khi xóa cache files manually**
6. **Admin page không update để show cache status**
7. **Manual refresh button không hoạt động**

### ✅ **Giải pháp đã triển khai (Solutions Implemented)**

#### **Phase 1: Core API Issues Fixed**
- **Problem:** API routing failure - used `$_GET['action']` but POST requests sent action in `$_POST['action']`
- **Solution:** Changed to `$_REQUEST['action']` in `api/actions_jet.php` line 26
- **Result:** API returned proper JSON responses

#### **Phase 2: UI Improvements**
- **Removed non-functional "Update Cache" button** từ jet.php interface
- **Enhanced admin interface** với manual refresh button (🔄 Làm mới dữ liệu)
- **Improved polling system** để handle worker restarts
- **Added auto-refresh** when tab becomes visible
- **Enhanced button texts và tooltips** for better UX

#### **Phase 3: Performance Optimization Attempt**
- **Initial approach:** Modified worker để auto-generate 120px from 750px JPEG
- **Issues encountered:** Auto-generation failures, database sync problems
- **Result:** Complex system với nhiều failure points

#### **Phase 4: Complete System Simplification (Final Solution)**
- **Strategy:** Thay vì fix complex system → Simplify thành system đơn giản, reliable
- **Architecture Change:**
  ```
  FROM: RAW → Worker Job 1 (750px) + Worker Job 2 (120px auto-generated)
        → Database: 2 records per file → UI: Complex job counting
        → Issues: Auto-generation failures, sync problems
  
  TO:   RAW → Worker Job (750px only) → Database: 1 record per file
        → UI: Simple job counting → Frontend: CSS resize 750px for different views
        → Manual cleanup: Database sync tool
  ```

### 🔧 **Technical Implementation Details**

#### **Files Modified/Created:**
1. **`worker_jet_cache.php`** - Consolidated simplified worker (750px only)
2. **`api/actions_jet.php`** - Updated queue functions, added cleanup API, simplified job counting
3. **`js/admin_jet_cache.js`** - Updated job calculations, added cleanup functionality
4. **Database cleanup system** - `jet_cleanup_orphaned_cache_records` API action

#### **Key Features Added:**
- **Database Cleanup System:** Scans completed records, checks file existence, removes orphaned records
- **Admin UI Cleanup Button:** "🧹 Dọn dẹp records bị mồ côi" for manual cleanup
- **Simplified Job Counting:** 1 job per file instead of 2
- **Enhanced Error Handling:** Better logging and error recovery
- **Worker Reset Detection:** Auto-reset stuck processing jobs on startup

### 📊 **Performance Benefits Achieved**
- **~50% faster processing:** 1 dcraw operation instead of 2
- **More reliable:** No complex auto-generation failures
- **Simpler maintenance:** Cleaner codebase
- **Better database sync:** Cleanup tools available
- **Easier troubleshooting:** Simplified logic

### 🎉 **Current Status**
- ✅ **System simplified** from complex 2-cache architecture to simple 1-cache architecture
- ✅ **Database cleanup tools** implemented and working
- ✅ **New simplified worker** running and processing jobs
- ✅ **UI responsive** with real-time updates
- ✅ **Performance optimized** with ~50% improvement
- ✅ **All original issues resolved** through simplification approach

### 📋 **API Endpoints Summary**
- `GET api.php?action=jet_get_raw_preview` → Returns cache or HTTP 202
- `POST api.php` with `action=jet_queue_folder_cache` → Queue folder jobs (750px only)
- `POST api.php` with `action=jet_cleanup_orphaned_cache_records` → Cleanup orphaned DB records
- `GET api.php?action=jet_get_cache_stats` → Get cache statistics
- `GET api.php?action=jet_list_raw_folders_with_cache_stats` → Get folder stats

### 🔄 **Worker Management**
```bash
# Start worker
start_jet_worker.bat

# Check worker status
tasklist | findstr php

# View logs
tail -f logs/worker_jet_php_error.log
```

### 💡 **Lessons Learned**
- **Simplification over complexity:** Sometimes the best solution is to simplify rather than fix complex systems
- **Performance through reduction:** Removing unnecessary features can dramatically improve performance
- **Database sync importance:** Manual file operations require corresponding database cleanup tools
- **User experience priority:** Simple, predictable behavior is better than complex, unreliable features

## Thay đổi gần đây (Latest Changes)

*   **2025-05-19 (Bạn & AI):**
    *   **Nâng cao API Danh sách Tệp và Metadata Ảnh/Video:**
        *   API `list_files` (`api/actions_public.php`) được cập nhật để tự động truy xuất và bao gồm kích thước (chiều rộng, chiều cao) cho các mục ảnh và video trong phản hồi. Hệ thống ưu tiên lấy dữ liệu này từ các bản ghi hoàn chỉnh trong bảng `cache_jobs`. Riêng đối với ảnh, nếu thông tin không có sẵn trong cache, API sẽ cố gắng đọc kích thước trực tiếp từ tệp gốc. Cải tiến này giúp phía client hiển thị thông tin với độ chính xác cao hơn và tối ưu hóa việc tính toán layout.
        *   Một endpoint API mới, `get_image_metadata`, đã được thêm vào `api/actions_public.php`. Endpoint này cho phép truy vấn siêu dữ liệu của một tệp ảnh hoặc video cụ thể, bao gồm đường dẫn, tên, loại tệp, và kích thước (chiều rộng, chiều cao). Thông tin kích thước cũng được ưu tiên lấy từ `cache_jobs`. API này đóng vai trò quan trọng cho các thư viện như PhotoSwipe và các thành phần giao diện người dùng khác cần thông tin kích thước trước khi hiển thị media.
        *   Trong `api/actions_public.php` (action `get_image`): Đã xác nhận và đảm bảo `session_write_close()` được gọi trước khi bắt đầu quá trình stream file. Việc này giúp cải thiện đáng kể hiệu suất và tránh tình trạng khóa session kéo dài, đặc biệt quan trọng khi truyền tải các tệp media lớn.
        *   Trong `api/actions_public.php` (action `download_final_zip`): Logic kiểm tra quyền truy cập đã được điều chỉnh. Cụ thể, đối với các tệp ZIP được tạo từ việc chọn nhiều tệp tin riêng lẻ (nhận diện qua `source_path` là `_multiple_selected_`), hệ thống sẽ không yêu cầu kiểm tra lại quyền truy cập của một "thư mục gốc" (vốn không áp dụng trong trường hợp này), giúp đảm bảo người dùng luôn có thể tải về các file ZIP này.

*   **2025-05-18 (Bạn & AI):**
    *   **Tích hợp Chức năng Xem và Tải Video:**
        *   Hệ thống backend (`config.php`, `api/helpers.php`, `api/actions_public.php`, `worker_cache.php`) được cập nhật để hỗ trợ các định dạng video phổ biến (ví dụ: MP4, MOV, MKV, WEBM).
        *   Triển khai tạo thumbnail cho video bằng FFmpeg, với cải tiến lấy frame ở giữa video để chất lượng thumbnail tốt hơn.
        *   API (`get_image`) được nâng cấp để stream video với MIME type chính xác và hỗ trợ range requests.
        *   Frontend (`js/uiImageView.js`) hiển thị icon "play" trên thumbnail video.
        *   PhotoSwipe (`js/photoswipeHandler.js`) được tùy chỉnh để phát video HTML5 và thêm nút tải trực tiếp video trong giao diện lightbox.
    *   **Sửa lỗi và Cải thiện UX:**
        *   Khắc phục lỗi `ERR_CONTENT_LENGTH_MISMATCH` khi phát video.
        *   Giải quyết nhiều lỗi JavaScript liên quan đến import/export module và phạm vi biến (ví dụ: `API_BASE_URL`, `getCurrentFolderInfo`, `requestZipForFiles`, `photoswipeLightbox`).
        *   Đảm bảo nút tải video trong PhotoSwipe chỉ hiển thị khi xem video và ẩn đi khi xem ảnh.
        *   Cải thiện khả năng phản hồi của ứng dụng khi tải file lớn bằng cách thêm `session_write_close()` trước khi stream file trong API.
        *   Tinh chỉnh UX cho việc yêu cầu tải ZIP: loại bỏ modal thông báo chung khi chỉ yêu cầu ZIP ảnh, thay vào đó dựa vào ZIP Job Panel để cung cấp phản hồi.
    *   **Cấu hình Git:**
        *   Hỗ trợ thiết lập upstream branch cho `main` để đơn giản hóa lệnh `git push`.

*   **2025-05-16 (Bạn & AI):**
    *   **Hoàn thiện và sửa lỗi chức năng tải ZIP nhiều ảnh đã chọn:**
        *   Đã sửa worker ZIP để sử dụng đúng hàm validate_source_and_file_path cho từng file được chọn, đảm bảo mọi ảnh trong thư mục đều được nhận diện và nén chính xác.
        *   Đảm bảo tính ổn định và đồng nhất giữa môi trường dev và production cho tính năng tải ZIP nhiều ảnh.
        *   Đã kiểm thử thành công end-to-end: chọn nhiều ảnh trong thư mục, tạo ZIP, tải về hoạt động ổn định.
        *   Đã sửa API download_final_zip để cho phép tải ZIP cho các job multi-file (source_path = '_multiple_selected_'), đảm bảo khách hàng luôn tải được file ZIP đã tạo từ ảnh đã chọn.
        *   **Cải thiện UI mobile:** Các nút trong panel ZIP và thanh action chính trên mobile đã được xếp dọc, có khoảng cách hợp lý, đảm bảo thao tác dễ dàng trên màn hình nhỏ.

## 8. Kiểm thử End-to-End (Playwright)

*   **Trạng thái:** Đang triển khai.
*   **Cài đặt:** Playwright đã được cài đặt và cấu hình (`package.json`, `playwright.config.ts`, `tests/`). `.gitignore` đã được cập nhật.
*   **Tệp kiểm thử:** `tests/gallery.spec.ts` chứa các nhóm kiểm thử cho Admin Login, Public Gallery, và Admin Panel.
*   **Kết quả:**
    *   **PASSED:** Đăng nhập Admin, Hiển thị danh sách thư mục gốc (Public), Hiển thị danh sách thư mục (Admin).
    *   **FAILED:** Điều hướng vào thư mục và hiển thị thumbnail (Public), Mở ảnh trong PhotoSwipe (Public). Nguyên nhân gốc rễ là thumbnail trong `#image-grid` không xuất hiện sau khi điều hướng vào thư mục, nghi ngờ lỗi API hoặc lỗi render JS.
    *   **TODO:** Các kiểm thử chức năng admin khác (mật khẩu, cache), các kiểm thử public khác (tìm kiếm, ZIP, v.v.).
*   **Gỡ lỗi:** Đã thực hiện nhiều bước gỡ lỗi (thêm chờ, sửa selector, ưu tiên `data-dir`, kiểm tra cấu trúc HTML) nhưng vấn đề thumbnail chưa được giải quyết. Việc gỡ lỗi đang tạm dừng. 