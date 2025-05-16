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
    *   `js/app.js`: Xử lý logic phía client (tải dữ liệu, điều hướng, hiển thị modal, PhotoSwipe, tìm kiếm, tải trực tiếp video, v.v.).
    *   `css/style.css`: Định dạng giao diện, bao gồm các class chung cho modal (`.modal-overlay`, `.modal-box`) và các style cho video (`.video-item`, `.play-icon-overlay`, `.pswp-video-container`).
*   **Quản trị (Admin):**
    *   `login.php`: Trang đăng nhập admin.
    *   `admin.php`: Trang quản lý mật khẩu thư mục và xem thống kê.
    *   `js/admin.js`: Logic phía client cho trang admin.
*   **API (Backend):**
    *   `api.php`: **Điểm vào chính (Entry Point)** cho tất cả các yêu cầu API. Chỉ chứa logic `require` các file xử lý khác.
    *   `api/init.php`: Khởi tạo cấu hình lỗi, session, gọi `db_connect.php`, định nghĩa hằng số và biến API toàn cục.
    *   `api/helpers.php`: Chứa các hàm hỗ trợ chung (ví dụ: `json_response()`, `validate_source_and_path()`, `check_folder_access()`, `create_thumbnail()`, `create_video_thumbnail()`, `find_first_image_in_source()`).
    *   `api/actions_public.php`: Xử lý các action công khai (ví dụ: `list_files` - nhận diện ảnh/video, `get_thumbnail` - cho ảnh/video, `get_image` - stream ảnh/video hỗ trợ range requests, `download_zip`, `authenticate`).
    *   `api/actions_admin.php`: Xử lý các action yêu cầu quyền admin (ví dụ: `admin_login`, `admin_logout`, `admin_list_folders`, `admin_set_password`, `admin_remove_password`).
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
*   **(Dự kiến) Xử lý File RAW:**
    *   Hệ thống sẽ nhận diện các file ảnh RAW (ví dụ: .ARW, .NEF, .CR2).
    *   Worker nền sẽ tự động tạo các bản preview JPEG (thumbnail nhỏ và ảnh xem kích thước lớn) từ file RAW gốc.
    *   Người dùng (client, designer, admin) sẽ tương tác (xem, chọn) với các bản preview JPEG này. File RAW gốc được giữ nguyên cho các mục đích xử lý chuyên sâu hoặc tải về (nếu có cấu hình).
*   **(Dự kiến) Luồng làm việc Lọc ảnh (Culling):**
    *   **Designer:** Đăng nhập vào khu vực làm việc, duyệt các album chứa file RAW (hiển thị dưới dạng preview JPEG). Designer có thể "chọn" (pick) các ảnh mong muốn. Lựa chọn này được lưu lại, gắn với thông tin của designer.
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

## 6. Lộ trình Phát triển Tiếp theo (Roadmap & Features Dự kiến)

Ngoài các tối ưu và cải tiến nhỏ lẻ, các tính năng lớn dự kiến phát triển bao gồm:

*   **Hỗ trợ File RAW và Tạo Preview JPEG:**
    *   Tích hợp công cụ xử lý RAW (ví dụ: `dcraw`, ImageMagick) để tự động tạo thumbnail và ảnh preview JPEG từ các định dạng file RAW phổ biến (ARW, NEF, CR2, v.v.).
    *   Cập nhật `worker_cache.php` để xử lý các tác vụ này.
    *   Hiển thị preview JPEG trong lưới ảnh và lightbox, trong khi vẫn quản lý file RAW gốc.

*   **Tính năng Lọc ảnh (Culling) cho Designer & Admin (Lấy cảm hứng từ Photo Mechanic):**
    *   **Mục tiêu:** Cung cấp một công cụ mạnh mẽ và hiệu quả cho designer để duyệt và chọn lựa (cull) ảnh từ các bộ ảnh lớn, đặc biệt là ảnh RAW. Admin có thể xem lại và quản lý các lựa chọn này.
    *   **Các Tính năng Cốt lõi & Luồng làm việc:**
        *   **Nạp ảnh nhanh & Tạo Xem trước (Fast Image Ingestion & Preview Generation):**
            *   Cho phép trỏ tới thư mục nguồn (đã được hỗ trợ qua `IMAGE_SOURCES`).
            *   **Hiển thị nhanh các bản xem trước JPEG** từ file RAW (thông qua `worker_cache.php` với `dcraw` hoặc ImageMagick). Tốc độ là yếu tố then chốt.
            *   Tạo thumbnail nhỏ nhanh chóng.
            *   Hiển thị siêu dữ liệu cơ bản kèm theo ảnh xem trước (tên file, ngày chụp, có thể cả thông số máy ảnh nếu dễ truy cập).
        *   **Duyệt & Xem ảnh Hiệu quả (Efficient Image Browsing & Viewing):**
            *   Trình xem ảnh toàn màn hình hoặc gần toàn màn hình (có thểปรับ PhotoSwipe hiện tại hoặc xây dựng mới cho nhu cầu culling).
            *   **Điều hướng bằng bàn phím** để di chuyển nhanh giữa các ảnh (ví dụ: phím mũi tên trái/phải).
            *   Khả năng **zoom và pan (kéo)** để kiểm tra chi tiết độ nét và các yếu tố quan trọng.
        *   **Hệ thống Gắn thẻ/Chọn lựa (Picking) & Đánh giá (Rating System):**
            *   Cơ chế **"Chọn" (Pick/Tag)** đơn giản: Cách nhanh chóng (ví dụ: phím tắt như 'T' hoặc nút bấm) để đánh dấu ảnh là đã chọn/giữ lại.
            *   **(Tùy chọn) Nhãn màu (Color Labels):** Gán nhãn màu (ví dụ: đỏ, vàng, xanh lá, xanh dương) cho các giai đoạn hoặc hạng mục lựa chọn khác nhau.
            *   **(Tùy chọn) Đánh giá sao (Star Ratings):** Hệ thống đánh giá từ 0-5 sao.
        *   **Lọc & Sắp xếp (Filtering & Sorting):**
            *   Lọc ảnh theo trạng thái "đã chọn" (picked).
            *   Lọc theo nhãn màu hoặc đánh giá sao (nếu có).
            *   Sắp xếp ảnh theo tên file, ngày chụp, hoặc các siêu dữ liệu khác.
        *   **Lưu Lựa chọn (Saving Selections):**
            *   Các lựa chọn (picks, tags, ratings, colors) cần được lưu trữ bền vững.
            *   Dữ liệu này phải được liên kết với ảnh cụ thể (ví dụ: đường dẫn có tiền tố nguồn) và người dùng (designer) đã thực hiện lựa chọn.
            *   **Hợp tác Đa người dùng (Multi-User Collaboration):**
                *   Cho phép các designer khác nhau đăng nhập và thực hiện các lựa chọn riêng của họ trên cùng một bộ ảnh.
                *   Admin có thể xem lại các lựa chọn từ các designer khác nhau, có thể kèm theo dấu hiệu trực quan hoặc thống kê.
        *   **Giao diện & Trải nghiệm Người dùng (UI/UX):**
            *   **Mật độ thông tin (Information Density):** Hiển thị thông tin liên quan một cách hợp lý, không làm rối giao diện.
            *   **Tốc độ và Độ phản hồi (Speed and Responsiveness):** Giao diện phải cực kỳ nhanh, đặc biệt khi duyệt và gắn thẻ ảnh.
            *   **(Tiềm năng) Bố cục Tùy chỉnh (Customizable Layout):** Xem xét khả năng cho phép người dùng tùy chỉnh siêu dữ liệu hiển thị, kích thước thumbnail, v.v. trong tương lai.
            *   **Chỉ báo Trực quan Rõ ràng (Clear Visual Indicators):** Dấu hiệu trực quan rõ ràng cho các ảnh đã pick, ảnh đang được chọn, nhãn màu, đánh giá.
        *   **Cân nhắc Kỹ thuật Triển khai:**
            *   **Cơ sở dữ liệu:** Bảng `image_selections` sẽ là trung tâm. Cần lưu ít nhất `image_path` (đường dẫn đầy đủ có tiền tố nguồn), `user_id` (của designer), `pick_status` (boolean), và tùy chọn các trường cho `rating`, `color_label`. Cân nhắc thêm `timestamp` cho mỗi lựa chọn.
            *   **API (ví dụ: `api/actions_designer.php` hoặc mở rộng `actions_admin.php`):**
                *   Endpoints để thiết lập/cập nhật trạng thái pick, rating, color label cho một ảnh.
                *   Endpoints để lấy danh sách ảnh kèm dữ liệu lựa chọn cho một thư mục/album cụ thể, có thể lọc theo designer.
            *   **Frontend (JavaScript):**
                *   Xây dựng một view (khu vực giao diện) riêng cho quy trình culling.
                *   Logic xử lý việc tải ảnh nhanh, các phím tắt, cập nhật UI dựa trên lựa chọn.
                *   Giao tiếp với các API endpoints mới.
            *   **Xử lý RAW:** Tận dụng `worker_cache.php` hiện có để tạo preview JPEG từ file RAW. App culling sẽ chủ yếu tương tác với các file JPEG này.
        *   **Tập trung cho phiên bản MVP (Minimum Viable Product):**
            *   Hiển thị nhanh các bản xem trước JPEG từ file RAW trong một thư mục được chọn.
            *   Điều hướng bằng bàn phím qua các ảnh xem trước.
            *   Chức năng "Chọn" (Pick) đơn giản (boolean: chọn/bỏ chọn) bằng phím tắt.
            *   Lưu các lựa chọn "Pick" này vào CSDL, liên kết với ảnh và người dùng (designer).
            *   Admin có thể xem lại những ảnh nào đã được designer "pick".
        *   **Cập nhật Tiến độ (Jet Culling Workspace - Giao diện Người dùng):**
            *   **Đã triển khai Chế độ Xem trước Ảnh (Image Preview Mode):**
                *   Khi người dùng nhấp vào một ảnh trong lưới (`image grid`), một lớp phủ (overlay) hiển thị ảnh đó với kích thước lớn hơn.
                *   **Điều hướng:**
                    *   Nút "Trước" (Previous) và "Sau" (Next) trên màn hình cho phép duyệt qua các ảnh trong thư mục hiện tại.
                    *   Phím mũi tên Trái (`ArrowLeft`) và Phải (`ArrowRight`) trên bàn phím cũng thực hiện chức năng điều hướng tương tự.
                *   **Đóng Xem trước:**
                    *   Nút "Đóng" (Close) trên màn hình.
                    *   Phím `Escape` (Esc) trên bàn phím.
                *   **Chọn/Bỏ chọn từ Xem trước:**
                    *   Một nút "Chọn (P)" / "Bỏ chọn (P)" hiển thị trạng thái chọn hiện tại của ảnh.
                    *   Nhấp vào nút này hoặc nhấn phím `P` sẽ thay đổi trạng thái chọn (pick/unpick) cho ảnh đang xem trước.
                    *   Trạng thái chọn được cập nhật đồng bộ trên cả nút trong chế độ xem trước và mục ảnh tương ứng trong lưới nền.
            *   **Cải thiện Giao diện:** Áp dụng chủ đề tối và bố cục lưới cải tiến cho không gian làm việc Jet, tương đồng với ứng dụng thư viện ảnh chính.

*   **Quản lý File và Thư mục cho Admin (Qua giao diện Web):**
    *   **Upload:** Cho phép admin upload ảnh và video mới vào các thư mục nguồn.
    *   **Delete File:** Cho phép admin xóa file ảnh/video (bao gồm cả thumbnail và các dữ liệu liên quan).
    *   **Create/Delete Folder:** Cho phép admin tạo thư mục mới và xóa thư mục (bao gồm cả nội dung bên trong một cách cẩn trọng).

*   **Tính năng Chọn nhiều ảnh để tải về cho Khách hàng:**
    *   Cho phép khách hàng chọn nhiều ảnh trong một album.
    *   Cung cấp nút "Tải về các ảnh đã chọn" để tạo file ZIP chứa các ảnh đó.

*   **Tách biệt Không gian làm việc:**
    *   Phân định rõ ràng khu vực dành cho khách hàng (xem/tải) và khu vực làm việc của admin/designer (quản lý nội dung, lọc ảnh).

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