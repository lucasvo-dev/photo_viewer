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
    *   `cron_cache_manager.php`: Script chạy theo lịch (cron job) để:
        *   Dọn dẹp các file thumbnail "mồ côi" (không có ảnh gốc tương ứng) trong thư mục cache.
        *   **Quan trọng:** Đã thêm bước kiểm tra an toàn để ngăn chặn việc xóa toàn bộ cache nếu script không tìm thấy bất kỳ file ảnh gốc hợp lệ nào (do lỗi cấu hình, thư mục nguồn bị ngắt kết nối, v.v.).
    *   `cron_log_cleaner.php`: Script chạy theo lịch để dọn dẹp các file log cũ.
    *   `run_cache_cleanup.bat`: Ví dụ file batch để chạy các script cron trên Windows.

## 4. Luồng hoạt động & Khái niệm chính

*   **Đa nguồn ảnh:** Cho phép định nghĩa nhiều thư mục gốc chứa ảnh trong `config.php`.
*   **Đường dẫn có tiền tố nguồn:** Định dạng `source_key/relative/path` (ví dụ: `main/album1`, `extra_drive/photos/img.jpg`) được dùng làm định danh nhất quán trong toàn bộ ứng dụng (API, DB, URL hash).
*   **Xác thực đường dẫn:** API luôn kiểm tra tính hợp lệ và giới hạn truy cập trong các nguồn được định nghĩa để chống path traversal.
*   **Bảo vệ thư mục:** Mật khẩu hash lưu trong DB. `check_folder_access` kiểm tra quyền dựa trên session/DB. Frontend hiển thị prompt khi cần.
*   **Thumbnail:** Tạo "on-the-fly" cho ảnh và video (kích thước nhỏ), cache lại. Worker `worker_cache.php` xử lý tạo cache cho kích thước lớn (ảnh và video).
*   **Quản trị:** Truy cập trang admin sau khi đăng nhập để quản lý mật khẩu và xem thống kê cơ bản.
*   **Xử lý File RAW (trong Jet Culling Workspace):**
    *   Hệ thống nhận diện các file ảnh RAW (định nghĩa trong `config.php` qua `raw_file_extensions`).
    *   Bản xem trước JPEG (preview) từ file RAW được tạo tự động **on-the-fly bởi `api/actions_jet.php` (sử dụng `dcraw` và ImageMagick)** khi người dùng truy cập trong Jet Culling Workspace. Các preview này được cache trong thư mục `JET_PREVIEW_CACHE_ROOT`.
    *   Người dùng (client, designer, admin) sẽ tương tác (xem, chọn) với các bản preview JPEG này. File RAW gốc được giữ nguyên cho các mục đích xử lý chuyên sâu hoặc tải về (nếu có cấu hình).
*   **Luồng làm việc Lọc ảnh (Culling) với Jet Culling Workspace (Đã triển khai cơ bản):**
    *   **Designer:** Đăng nhập vào khu vực làm việc, duyệt các album chứa file RAW (hiển thị dưới dạng preview JPEG). Designer có thể "chọn" (pick) các ảnh mong muốn bằng các màu đánh dấu. Lựa chọn này được lưu lại (`jet_image_picks` table), gắn với thông tin của designer.
    *   **Admin:** Đăng nhập, có thể xem lại các lựa chọn của designer trong từng album. Ảnh được designer chọn sẽ có đánh dấu trực quan. Admin có thể xem thống kê (ví dụ: designer nào chọn bao nhiêu ảnh, tổng số ảnh được chọn). Nhiều designer có thể cùng lọc một bộ ảnh.
*   **(Dự kiến) Quản lý File & Thư mục cho Admin:**
    *   Admin có quyền upload ảnh/video mới lên các thư mục nguồn đã định nghĩa.
    *   Admin có quyền xóa file (ảnh/video và thumbnail tương ứng).
    *   Admin có quyền tạo và xóa thư mục trong các nguồn ảnh.
*   **Hỗ trợ Video (Đã triển khai):**
    *   Hệ thống nhận diện các định dạng video phổ biến (MP4, MOV, MKV, WEBM, AVI) được định nghĩa trong `config.php`.
    *   Thumbnail cho video được tự động tạo bằng FFmpeg (lấy frame từ giữa video) thông qua `worker_cache.php` cho kích thước lớn và "on-the-fly" cho kích thước nhỏ.
    *   Video được phát trực tiếp trong PhotoSwipe lightbox sử dụng thẻ HTML5 `<video>`, với hỗ trợ streaming (range requests) từ API.
    *   Người dùng có thể tải video trực tiếp từ giao diện PhotoSwipe hoặc thông qua chức năng chọn nhiều mục.

## 5. Tình trạng Hiện tại

*   Các chức năng cốt lõi (duyệt, xem ảnh, tìm kiếm, tải ZIP, bảo vệ mật khẩu) đã hoạt động.
*   **Đã phân định rõ ràng không gian làm việc:** Khu vực khách hàng (`index.php`), quản trị (`admin.php`), và lọc ảnh (`jet.php`, Jet Culling Workspace) được tách biệt về giao diện và luồng API.
*   **Đã triển khai hỗ trợ video cơ bản:** Nhận diện, tạo thumbnail, phát lại trong lightbox và tải trực tiếp.
*   **Đã chuyển đổi cơ sở dữ liệu từ SQLite sang MySQL.**
*   **API backend (`api.php`) đã được refactor thành cấu trúc module rõ ràng hơn trong thư mục `api/` để dễ bảo trì.**
*   Đã thực hiện nhiều cải tiến về cấu trúc code frontend (tập trung cấu hình, refactor modal CSS) và sửa lỗi giao diện/logic (hiển thị icon khóa, logic prompt mật khẩu, căn chỉnh, v.v.).
*   Hiệu ứng làm mờ nền khi hiển thị modal đã được thêm.
*   Đã thử nghiệm và hoàn nguyên về font chữ hệ thống mặc định.
*   **Đã sửa lỗi hiển thị thumbnail cho thư mục con.**
*   **Đã khắc phục lỗi thông báo "Đang tạo ZIP" không tự ẩn và lỗi "Bad Request"/"Unexpected token" khi tải ZIP.**
*   **Đã sửa lỗi cú pháp JavaScript trong `js/admin.js`.**
*   **Đã thêm tiêu đề cột 'Cache' còn thiếu vào bảng trong trang admin (`admin.php`).**
*   **Đã sửa logic tạo đường dẫn cache thumbnail để đảm bảo lưu vào thư mục con theo kích thước (ví dụ: `cache/thumbnails/150/`, `cache/thumbnails/750/`).**
*   **Đã triển khai cơ chế tạo cache bất đồng bộ bằng hàng đợi công việc (DB table `cache_jobs` và script `worker_cache.php`) để tránh chặn người dùng khi admin tạo cache.**
*   **Đã cấu hình worker cache chỉ tạo trước thumbnail kích thước lớn nhất (ví dụ: 750px), thumbnail nhỏ (150px) vẫn được tạo on-the-fly.**
*   **Đã thêm cơ chế tự động làm mới danh sách thư mục trên trang admin để cập nhật trạng thái nút cache sau khi worker xử lý xong.**
*   **Đã khắc phục lỗi khóa cơ sở dữ liệu (database locked) xảy ra do tranh chấp giữa worker và auto-refresh trang admin bằng cách thêm timeout (PDO::ATTR_TIMEOUT) cho kết nối PDO trong `db_connect.php`.**
*   **Đã cải thiện UX của nút cache: sử dụng polling nhanh hơn trong `js/admin.js` để cập nhật trạng thái nút (Đang chờ/Đang xử lý/Đã cache) gần như tức thì sau khi bấm nút hoặc worker hoàn thành, thay vì phải chờ auto-refresh toàn cục.**
*   **Đã sửa lỗi CSS hiển thị bảng quản trị trên mobile:** Thêm `data-label` vào các ô `<td>` trong `js/admin.js` và điều chỉnh CSS trong `css/style.css` để bảng hiển thị đúng dạng khối trên màn hình nhỏ.**
*   **Đã cải thiện CSS bảng quản trị trên desktop:** Tăng chiều rộng ô input link chia sẻ và loại bỏ giới hạn chiều cao/thanh cuộn cho ô trạng thái cache.**
*   **Đã sửa lỗi JavaScript trên trang admin:** Thay thế các lời gọi `showMessage` thành `showFeedback`, sửa lỗi đọc thuộc tính `folder.protected` và đảm bảo nút "Xóa MK" được gắn event listener đúng cách.**
*   **Đã di chuyển và định dạng lại ô thông báo admin:** Di chuyển `div#admin-feedback` trong `admin.php` lên vị trí dễ thấy hơn và cập nhật CSS để có giao diện panel nhất quán.**
*   **Đã cải thiện hiển thị trạng thái cache:** 
    *   Trong bảng admin, chỉ hiển thị số lượng ảnh đã cache (thay vì timestamp) và thêm icon thông tin (`ℹ️`).
    *   Khi click icon `ℹ️`, hiển thị modal chi tiết (tên, đường dẫn, số lượng, timestamp, kết quả job gần nhất).
    *   Sửa lỗi logic worker (`worker_cache.php`) và API (`api/actions_admin.php`) để lưu và trả về đúng `image_count` và `latest_job_status`.
    *   Sửa lỗi logic frontend (`js/admin.js`) để modal hiển thị đúng thông tin và cảnh báo lỗi chỉ xuất hiện khi job gần nhất thực sự `failed`.
    *   Cải thiện UX nút yêu cầu cache để cập nhật trạng thái "Đang chờ xử lý" ngay lập tức.
*   **Đã triển khai bảng điều khiển (panel) hàng đợi ZIP bất đồng bộ trên giao diện người dùng, cung cấp phản hồi trực quan về nhiều công việc nén ZIP cùng lúc.**
*   **Đã khắc phục các vấn đề CSS và UI (Giao diện Người dùng):**
    *   **Giao diện Thư viện Ảnh Chính:** Đã giải quyết sự không nhất quán về chiều rộng hiển thị lưới ảnh giữa trang chủ và chế độ xem thư mục con. Hiện tại, trang chủ có giao diện "đóng hộp" (boxed-in) và chế độ xem thư mục con/album có giao diện toàn chiều rộng (full-width) như mong muốn, thông qua việc sử dụng lớp `gallery-view-active` trên `<body>` và CSS điều kiện.
    *   **Không gian làm việc Jet (Jet Culling Workspace):** Đã khắc phục lỗi không thể cuộn trang bằng chuột (mouse wheel scroll) và lỗi không thể zoom trang (Ctrl+MouseWheel). Nguyên nhân do `overflow: hidden` trên `body.jet-app-active` đã được sửa thành `overflow: auto` trong `css/views/jet_view.css`.
*   **Triển khai Giao diện và Chức năng Cơ bản cho Jet Culling Workspace:**
    *   **Cấu trúc Giao diện và CSS:** Thiết lập giao diện người dùng cơ bản cho không gian làm việc Jet, bao gồm refactor CSS với việc sử dụng Biến tùy chỉnh CSS (CSS Custom Properties) trong `css/views/jet_view.css`.
    *   **Hiển thị Lưới Ảnh:** Hiển thị danh sách ảnh (preview từ file RAW) dưới dạng lưới trong không gian làm việc.
    *   **Chức năng Lọc Ảnh (Filtering):**
        *   Người dùng có thể lọc ảnh theo các tiêu chí: "Tất cả", "Đã chọn (Bất kỳ màu nào)", "Chưa chọn".
        *   Hỗ trợ lọc theo các màu đã chọn (pick colors): Đỏ (Red), Xanh lá (Green), Xanh dương (Blue), Xám (Grey).
        *   Các nút lọc màu được hiển thị dưới dạng swatch màu (ô màu vuông).
    *   **Chức năng Sắp xếp Ảnh (Sorting):**
        *   Người dùng có thể sắp xếp ảnh theo: Tên file (A-Z, Z-A), Ngày sửa đổi (Mới nhất, Cũ nhất).
    *   **Giao diện Điều khiển Lọc Linh hoạt (Responsive Filter Controls):**
        *   HTML trong `js/jet_app.js` được cấu trúc lại với các `div` (`.filter-group-main`, `.filter-group-colors`) để quản lý nhóm nút lọc.
        *   CSS trong `css/views/jet_view.css` được cập nhật để:
            *   Trên Desktop: Các nút lọc chính (Tất cả, Đã chọn,...) ở bên trái, các nút lọc màu (swatches) ở bên phải, sử dụng `justify-content: space-between`.
            *   Trên Mobile (breakpoint 768px): Các nút lọc màu tự động xuống dòng bên dưới các nút lọc chính, sử dụng `flex-direction: column`. Các nút được căn chỉnh `align-items: center` và có kích thước phù hợp cho thiết bị di động.
    *   **Chế độ Xem trước Ảnh (Image Preview Mode):**
        *   Khi người dùng nhấp đúp vào một ảnh trong lưới, hoặc chọn ảnh rồi nhấn phím `Space`, một lớp phủ (overlay) hiển thị ảnh đó với kích thước lớn hơn.
        *   **Điều hướng:**
            *   Nút "Trước" (Previous) và "Sau" (Next) trên màn hình cho phép duyệt qua các ảnh trong thư mục hiện tại.
            *   Phím mũi tên Trái (`ArrowLeft`) và Phải (`ArrowRight`) trên bàn phím cũng thực hiện chức năng điều hướng tương tự.
        *   **Chọn/Bỏ chọn Màu từ Xem trước:**
            *   Nút chọn màu (hiển thị màu hiện tại) và các phím số (0-3) cho phép người dùng gán hoặc bỏ gán màu (Đỏ, Xanh lá, Xanh dương, Xám/Không màu) cho ảnh đang xem trước.
            *   Trạng thái chọn màu được cập nhật đồng bộ trên cả nút trong chế độ xem trước và mục ảnh tương ứng trong lưới nền.
        *   **Đóng Xem trước:**
            *   Nút "Đóng (Esc)" chuyên dụng trên màn hình.
            *   Nhấn phím `Space` hoặc phím `Escape` (Esc) trên bàn phím.
        *   **Hiển thị Trạng thái Chọn Màu (Color Pick Status Display in Grid):**
            *   Các mục ảnh trong lưới (`image grid`) được chọn màu sẽ hiển thị một cờ màu nhỏ ở góc dưới bên phải của thumbnail.

## 6. Lộ trình Phát triển Tiếp theo (Roadmap & Features Dự kiến)

Ngoài các tối ưu và cải tiến nhỏ lẻ, các tính năng lớn dự kiến phát triển bao gồm:

*   **(Tiếp theo) Mở rộng hỗ trợ định dạng RAW:** Liên tục cập nhật danh sách `raw_file_extensions` và kiểm tra khả năng tương thích của `dcraw` với các định dạng RAW mới nếu cần.

*   **Tính năng Lọc ảnh (Culling) cho Designer & Admin (Jet Culling Workspace - Phát triển Tiếp theo):**
    *   **Mục tiêu:** Cung cấp một công cụ mạnh mẽ và hiệu quả cho designer để duyệt và chọn lựa (cull) ảnh từ các bộ ảnh lớn, đặc biệt là ảnh RAW. Admin có thể xem lại và quản lý các lựa chọn này.
    *   **Các Tính năng Tiếp theo và Nâng cao (Beyond Current MVP):**
        *   **Hiển thị Siêu dữ liệu Nâng cao:** Cho phép hiển thị thêm siêu dữ liệu EXIF quan trọng (ví dụ: thông số máy ảnh, ống kính, ISO, tốc độ màn trập) kèm theo ảnh xem trước trong lưới và chế độ xem chi tiết.
        *   **Cải thiện Zoom/Pan:** Hoàn thiện các tương tác nâng cao trong chế độ xem trước (ví dụ: zoom chi tiết hơn, pan mượt mà hơn) để kiểm tra độ nét hiệu quả.
        *   **Đánh giá Sao (Star Ratings):** Triển khai hệ thống đánh giá từ 0-5 sao cho ảnh, lưu vào CSDL (`jet_image_picks` hoặc bảng mới) và tích hợp vào chức năng lọc/sắp xếp.
        *   **Lọc/Sắp xếp Nâng cao:** Bổ sung các tùy chọn lọc và sắp xếp dựa trên siêu dữ liệu EXIF (ngày chụp chi tiết, thông số camera, v.v.) và đánh giá sao (nếu được triển khai).
        *   **Hợp tác Đa người dùng Chi tiết hơn:**
            *   Giao diện cho Admin để dễ dàng xem, so sánh và quản lý các lựa chọn (picks, ratings, colors) từ nhiều designer khác nhau trên cùng một bộ ảnh.
            *   Cung cấp thống kê chi tiết hơn về lựa chọn của từng designer.
        *   **Tùy chỉnh Giao diện (Tiềm năng):** Nghiên cứu khả năng cho phép người dùng tùy chỉnh siêu dữ liệu hiển thị, kích thước thumbnail trong Jet Culling Workspace.
        *   **(Lưu ý về Tạo Xem trước):** Hiện tại, các bản xem trước JPEG từ file RAW được tạo on-the-fly bởi `api/actions_jet.php` (sử dụng `dcraw` và ImageMagick). Việc tối ưu hóa (ví dụ: chuyển sang worker để pre-cache) được đề cập ở mục "Hoàn thiện Hỗ trợ File RAW...".
    *   **(Tham khảo) Các thành phần MVP đã triển khai (chi tiết trong Mục 5):**
        *   Hiển thị lưới ảnh preview từ RAW, điều hướng bàn phím/chuột trong preview.
        *   Chức năng chọn màu (Color Labels/Pick status) và lưu vào CSDL.
        *   Lọc ảnh cơ bản (theo màu đã chọn, trạng thái chọn).
        *   Sắp xếp ảnh cơ bản (tên file, ngày sửa đổi).

*   **Quản lý File và Thư mục cho Admin (Qua giao diện Web):**
    *   **Upload:** Cho phép admin upload ảnh và video mới vào các thư mục nguồn.
    *   **Delete File:** Cho phép admin xóa file ảnh/video (bao gồm cả thumbnail và các dữ liệu liên quan).
    *   **Create/Delete Folder:** Cho phép admin tạo thư mục mới và xóa thư mục (bao gồm cả nội dung bên trong một cách cẩn trọng).

*   **Tính năng Chọn nhiều ảnh/video để tải về cho Khách hàng (Đã triển khai):**
    *   (Hoàn thành) Cho phép khách hàng chọn nhiều ảnh/video trong một album thông qua `js/selectionManager.js`.
    *   (Hoàn thành) Cung cấp nút "Tải về các mục đã chọn" để tạo file ZIP bất đồng bộ (`request_zip`, theo dõi qua `get_zip_status`) chứa các mục đó. Người dùng tải về qua `download_final_zip`.

*   **Tối ưu Hiệu suất (Tiếp tục):**
    *   Đánh giá và tối ưu hiệu suất cho việc tạo preview RAW, thumbnail video.
    *   Tối ưu các truy vấn CSDL liên quan đến tính năng mới.

*   **Cải thiện UX/UI (Tiếp tục):**
    *   Đảm bảo giao diện cho các tính năng mới trực quan và dễ sử dụng, đặc biệt là cho việc lọc ảnh và quản lý file.

*   **Chất lượng Mã nguồn & Khả năng Bảo trì (Tiếp tục):**
    *   Duy trì cấu trúc code rõ ràng khi thêm các module mới.

*   **Kiểm thử (Testing):**
    *   Kiểm thử kỹ lưỡng các tính năng mới trên nhiều trình duyệt và thiết bị.

## 7.1. Kế hoạch Refactor JavaScript (JavaScript Refactoring Plan)

*   **Mục tiêu:** Tối ưu hóa cấu trúc mã JavaScript để tăng tính module, dễ bảo trì và sẵn sàng cho việc mở rộng các tính năng phức tạp trong tương lai.
*   **Trạng thái chung:** Đã hoàn thành vào 2025-05-16 (AI). Tất cả các mục dưới đây đã được xem xét và triển khai hoặc xác nhận hoàn tất.
*   **Các bước chính (Ưu tiên):**
    1.  **Tạo `js/selectionManager.js`:**
        *   **Nhiệm vụ:** Di chuyển toàn bộ logic và trạng thái liên quan đến chế độ chọn ảnh (multi-select) từ `js/app.js` vào module này.
        *   **Trạng thái:** Hoàn thành. Module `js/selectionManager.js` đã tồn tại và đảm nhiệm các chức năng này. Các biến trạng thái và DOM caching dư thừa liên quan đến selection đã được gỡ bỏ khỏi `js/app.js`.
        *   **Bao gồm (đã xác minh trong `selectionManager.js`):** `isSelectModeActive`, `selectedImagePaths`, `toggleImageSelectionMode()`, `handleImageItemSelect()`, `clearAllImageSelections()`, `updateDownloadSelectedButton()`, `handleDownloadSelected()` (thông qua callback).
        *   `js/app.js` khởi tạo và ủy quyền đúng cách cho module này.
        *   **Lợi ích:** Giảm kích thước và độ phức tạp của `app.js`, đóng gói logic chọn ảnh, cải thiện SRP.
    2.  **Refactor `loadSubItems()` trong `js/app.js`:**
        *   **Nhiệm vụ:** Ủy quyền việc tạo các phần tử DOM cho danh sách thư mục con (subfolder list items) cho một hàm trong `js/uiDirectoryView.js`.
        *   **Trạng thái:** Hoàn thành. Hàm factory `createDirectoryListItem()` đã được tạo và export từ `js/uiDirectoryView.js`. Cả `renderTopLevelDirectories()` (trong `uiDirectoryView.js`) và `loadSubItems()` (trong `app.js`) đều sử dụng hàm factory này, giúp thống nhất việc render item thư mục.
        *   **Lợi ích:** Tách biệt hơn nữa việc lấy dữ liệu/điều phối trong `app.js` khỏi các chi tiết render view cụ thể.
    3.  **Rà soát và áp dụng nguyên tắc DRY (Don't Repeat Yourself):**
        *   **Nhiệm vụ:** Tìm và loại bỏ các đoạn mã lặp lại, ví dụ như logic render folder item và image item.
        *   **Trạng thái:** Hoàn thành.
            *   Logic render folder item đã được giải quyết ở mục 2.
            *   Logic render image item trong `js/uiImageView.js` cũng đã được refactor để sử dụng hàm factory nội bộ `createImageItemElement()`.
        *   **Lợi ích:** Giảm sự trùng lặp, dễ bảo trì hơn.
    4.  **Đánh giá lại việc quản lý State (`state.js`):**
        *   **Nhiệm vụ:** Đảm bảo tất cả trạng thái ứng dụng chia sẻ thực sự nằm trong `js/state.js` hoặc trong các manager module chuyên biệt của chúng.
        *   **Trạng thái:** Hoàn thành.
            *   Trạng thái và logic quản lý `activeZipJobs` (bao gồm các hàm `addOrUpdateZipJob`, `getZipJob`, `getAllZipJobs`, `removeZipJob`, `clearAllZipJobIntervals`) đã được di chuyển từ `js/state.js` vào `js/zipManager.js`.
            *   Các biến trạng thái ZIP cũ và không còn sử dụng (`zipDownloadTimerId`, `currentZipJobToken`, `zipPollingIntervalId`) đã được gỡ bỏ khỏi `js/state.js` và các file liên quan.
        *   Các trạng thái chia sẻ khác vẫn nằm trong `state.js`, trong khi trạng thái cụ thể của module (selection, ZIP jobs) nằm trong các manager tương ứng.
    5.  **Kiểm tra và chuẩn hóa DOM Manipulation & Event Handling:**
        *   **Nhiệm vụ:** Duy trì sự nhất quán trong cách tạo phần tử DOM và quản lý event listener.
        *   **Trạng thái:** Hoàn thành.
            *   Việc tạo DOM cho item thư mục và item ảnh đã được chuẩn hóa bằng các hàm factory (xem mục 2 và 3).
            *   Event handling trong `js/zipManager.js` cho các action của ZIP job panel đã được refactor để sử dụng event delegation, thay vì gắn listener riêng lẻ cho từng button.
        *   Các module khác đã được xem xét và sử dụng phương pháp gắn event listener phù hợp với phạm vi của chúng.
    6.  **Chuẩn hóa Xử lý Lỗi Asynchronous:**
        *   **Nhiệm vụ:** Đảm bảo tất cả các lỗi từ API và các tác vụ bất đồng bộ được hiển thị nhất quán cho người dùng.
        *   **Trạng thái:** Hoàn thành. Hệ thống hiện tại sử dụng `fetchDataApi` (trong `js/apiService.js`) với cấu trúc response chuẩn. Các lỗi từ API call do người dùng khởi tạo được hiển thị qua `showModalWithMessage`. Các lỗi từ tác vụ nền (ví dụ: polling ZIP status) được phản ánh trong UI chuyên biệt của chúng (ví dụ: ZIP panel) để tránh làm phiền người dùng bằng modal liên tục. Cách tiếp cận này được đánh giá là nhất quán và phù hợp.

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