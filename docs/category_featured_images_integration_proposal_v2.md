# Đề xuất Tích hợp Category và Featured Images vào File Manager v2

**Ngày:** 29/01/2025  
**Phương án:** Tích hợp vào Admin File Manager  
**Scope:** Chỉ thay đổi trong Admin, không ảnh hưởng Jet App và Gallery

## 🎯 Yêu cầu Cụ thể

1. **Category Inheritance:** Album root được phân loại → tất cả folder con tự động inherit
2. **Quyền hạn:** Chỉ Admin được phép set categories và featured status
3. **Featured Marking:**
   - Phím số `1`: Đánh dấu ảnh đặc biệt (featured)
   - Phím số `2`: Đánh dấu ảnh chân dung (portrait + featured)
4. **UI/UX:** Grid view + Preview system giống Jet App

## 🏗️ Thiết kế Hệ thống

### 1. Category Inheritance System

```
📁 2025_Wedding_Nguyen_Van_A [Category: Ảnh Đám Cưới]
  ├── 📁 Ceremony         [Inherited: Ảnh Đám Cưới]
  ├── 📁 Reception        [Inherited: Ảnh Đám Cưới]
  └── 📁 Photoshoot       [Inherited: Ảnh Đám Cưới]
      └── 📁 Outdoor      [Inherited: Ảnh Đám Cưới]
```

**Implementation:**
- Chỉ cần set category cho root folder
- Khi query, check parent folders để get inherited category
- Có thể override category cho specific subfolder nếu cần

### 2. Database Schema Updated

```sql
-- 1. Categories table (không đổi)
CREATE TABLE folder_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    category_slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color_code VARCHAR(7) DEFAULT '#3B82F6',
    icon_class VARCHAR(50) DEFAULT 'fas fa-folder',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Folder-Category mapping (simplified)
-- Chỉ lưu mapping cho root folders
CREATE TABLE folder_category_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_key VARCHAR(50) NOT NULL,
    folder_path VARCHAR(500) NOT NULL, -- Root folder path
    category_id INT NOT NULL,
    is_inherited BOOLEAN DEFAULT FALSE, -- Flag for inherited categories
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES folder_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_folder_category (source_key, folder_path),
    KEY idx_source_folder (source_key, folder_path)
);

-- 3. Featured images với portrait support
CREATE TABLE featured_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_key VARCHAR(50) NOT NULL,
    image_relative_path VARCHAR(500) NOT NULL,
    folder_path VARCHAR(500) NOT NULL,
    featured_type ENUM('featured', 'portrait') DEFAULT 'featured',
    is_featured BOOLEAN DEFAULT TRUE,
    priority_order INT DEFAULT 0,
    featured_by INT DEFAULT NULL,
    alt_text VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (featured_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_featured_image (source_key, image_relative_path),
    KEY idx_folder_featured (source_key, folder_path, is_featured),
    KEY idx_featured_type (featured_type, is_featured)
);
```

### 3. Grid View UI Design

```
┌─────────────────────────────────────────────────────────────────┐
│ 📁 File Manager - Grid View          [List] [Grid] [⚙️]         │
├─────────────────────────────────────────────────────────────────┤
│ 🏠 Home > 2025_Wedding > Nguyen_Van_A                          │
│ Category: 🎊 Ảnh Đám Cưới (inherited from parent)              │
├─────────────────────────────────────────────────────────────────┤
│ Filters: [All] [Featured ⭐] [Portrait 👤] [Regular]           │
│                                                                 │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│ │ 📁      │ │ 📁      │ │  🖼️ ⭐  │ │  🖼️    │                   │
│ │Ceremony │ │Reception│ │DSC_001 │ │DSC_002 │                   │
│ │12 items │ │45 items │ │Featured│ │        │                   │
│ └────────┘ └────────┘ └────────┘ └────────┘                   │
│                                                                 │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│ │  🖼️ 👤  │ │  🖼️    │ │  🖼️ ⭐  │ │  🖼️    │                   │
│ │DSC_003 │ │DSC_004 │ │DSC_005 │ │DSC_006 │                   │
│ │Portrait│ │        │ │Featured│ │        │                   │
│ └────────┘ └────────┘ └────────┘ └────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4. Preview System (Giống Jet App)

```javascript
// Khi click vào ảnh trong grid
function openImagePreview(imageData) {
    // Full screen preview với keyboard controls
    const preview = `
        <div class="fm-preview-overlay">
            <div class="fm-preview-container">
                <img src="${imageData.fullUrl}" />
                <div class="fm-preview-info">
                    <h3>${imageData.name}</h3>
                    <div class="fm-preview-badges">
                        ${imageData.featured_type === 'featured' ? '<span class="badge featured">⭐ Featured</span>' : ''}
                        ${imageData.featured_type === 'portrait' ? '<span class="badge portrait">👤 Portrait</span>' : ''}
                    </div>
                </div>
                <div class="fm-preview-controls">
                    <button class="prev-btn">◀ Previous</button>
                    <button class="next-btn">Next ▶</button>
                    <button class="close-btn">✕ Close</button>
                </div>
            </div>
            
            <!-- Filmstrip giống Jet -->
            <div class="fm-preview-filmstrip">
                <!-- Thumbnail list -->
            </div>
        </div>
    `;
}

// Keyboard event handlers
document.addEventListener('keydown', (e) => {
    if (!isPreviewOpen) return;
    
    switch(e.key) {
        case '1':
            toggleFeaturedStatus('featured');
            break;
        case '2':
            toggleFeaturedStatus('portrait');
            break;
        case 'ArrowLeft':
            navigatePrevious();
            break;
        case 'ArrowRight':
            navigateNext();
            break;
        case 'Escape':
            closePreview();
            break;
    }
});
```

### 5. API Endpoints

```php
// Category inheritance helper
function getCategoryForPath($source_key, $folder_path) {
    global $pdo;
    
    // Split path into parts
    $path_parts = explode('/', $folder_path);
    
    // Check from current path up to root
    while (!empty($path_parts)) {
        $current_path = implode('/', $path_parts);
        
        $stmt = $pdo->prepare("
            SELECT fc.* FROM folder_category_mapping fcm
            JOIN folder_categories fc ON fcm.category_id = fc.id
            WHERE fcm.source_key = ? AND fcm.folder_path = ?
            LIMIT 1
        ");
        $stmt->execute([$source_key, $current_path]);
        
        if ($category = $stmt->fetch()) {
            return $category;
        }
        
        // Go up one level
        array_pop($path_parts);
    }
    
    return null; // No category found
}

// Enhanced file_manager_browse with grid data
case 'file_manager_browse':
    // ... existing code ...
    
    // Add featured status and inherited category
    foreach ($items as &$item) {
        if ($item['type'] === 'directory') {
            // Get inherited category
            $item['category'] = getCategoryForPath($source_key, $item['path']);
        } else if ($item['is_image']) {
            // Check featured status
            $stmt = $pdo->prepare("
                SELECT featured_type, priority_order 
                FROM featured_images 
                WHERE source_key = ? AND image_relative_path = ?
            ");
            $stmt->execute([$source_key, $item['path']]);
            $featured = $stmt->fetch();
            
            $item['is_featured'] = !empty($featured);
            $item['featured_type'] = $featured['featured_type'] ?? null;
            $item['priority_order'] = $featured['priority_order'] ?? 999;
        }
    }
    break;

// Toggle featured status
case 'toggle_featured_image':
    if ($_SESSION['user_role'] !== 'admin') {
        json_error("Chỉ admin mới có quyền đánh dấu featured", 403);
    }
    
    $source_key = $_POST['source_key'];
    $image_path = $_POST['image_path'];
    $featured_type = $_POST['featured_type']; // 'featured' or 'portrait'
    
    // Toggle logic
    $stmt = $pdo->prepare("
        INSERT INTO featured_images 
        (source_key, image_relative_path, folder_path, featured_type, featured_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        featured_type = IF(featured_type = ?, NULL, ?),
        is_featured = IF(featured_type = ?, FALSE, TRUE),
        updated_at = NOW()
    ");
    
    $folder_path = dirname($image_path);
    $user_id = $_SESSION['user_id'];
    
    $stmt->execute([
        $source_key, $image_path, $folder_path, $featured_type, $user_id,
        $featured_type, $featured_type, $featured_type
    ]);
    
    json_response(['success' => true]);
    break;
```

### 6. CSS cho Grid View

```css
/* Grid Layout */
.fm-grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
    padding: 16px;
}

.fm-grid-item {
    position: relative;
    aspect-ratio: 1;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
}

.fm-grid-item:hover {
    border-color: #007bff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.fm-grid-item.folder {
    background: #f5f5f5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.fm-grid-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* Featured Badges */
.fm-grid-item .featured-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.fm-grid-item .featured-badge.featured {
    background: #ffc107;
    color: #fff;
}

.fm-grid-item .featured-badge.portrait {
    background: #6c757d;
    color: #fff;
}

/* Preview Overlay giống Jet */
.fm-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    z-index: 9999;
    display: flex;
    flex-direction: column;
}

.fm-preview-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.fm-preview-filmstrip {
    height: 100px;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    padding: 0 20px;
    overflow-x: auto;
    gap: 10px;
}
```

### 7. JavaScript Grid Implementation

```javascript
class FileManagerGrid {
    constructor() {
        this.currentView = 'grid'; // or 'list'
        this.previewOpen = false;
        this.currentPreviewIndex = -1;
        this.images = [];
    }

    toggleView(view) {
        this.currentView = view;
        this.render();
    }

    renderGrid(items) {
        const content = document.getElementById('file-manager-content');
        const gridHtml = items.map((item, index) => {
            if (item.type === 'directory') {
                return this.renderFolderItem(item);
            } else if (item.is_image) {
                return this.renderImageItem(item, index);
            }
        }).join('');

        content.innerHTML = `
            <div class="fm-toolbar">
                <div class="fm-view-toggle">
                    <button class="${this.currentView === 'list' ? 'active' : ''}" onclick="fileManager.toggleView('list')">
                        <i class="fas fa-list"></i>
                    </button>
                    <button class="${this.currentView === 'grid' ? 'active' : ''}" onclick="fileManager.toggleView('grid')">
                        <i class="fas fa-th"></i>
                    </button>
                </div>
                <div class="fm-filters">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="featured">Featured ⭐</button>
                    <button class="filter-btn" data-filter="portrait">Portrait 👤</button>
                </div>
            </div>
            <div class="fm-grid-view">
                ${gridHtml}
            </div>
        `;

        this.bindGridEvents();
    }

    renderImageItem(item, index) {
        const badge = item.featured_type === 'featured' ? '⭐' : 
                     item.featured_type === 'portrait' ? '👤' : '';

        return `
            <div class="fm-grid-item image" data-index="${index}" data-path="${item.path}">
                <img src="/api.php?action=serve_thumbnail&source=${this.currentSource}&path=${item.path}&size=300" 
                     loading="lazy" alt="${item.name}" />
                ${badge ? `<span class="featured-badge ${item.featured_type}">${badge}</span>` : ''}
                <div class="fm-grid-item-name">${item.name}</div>
            </div>
        `;
    }

    openPreview(index) {
        this.currentPreviewIndex = index;
        this.previewOpen = true;
        
        // Create preview overlay similar to Jet app
        const overlay = document.createElement('div');
        overlay.className = 'fm-preview-overlay';
        overlay.innerHTML = this.renderPreview(this.images[index]);
        
        document.body.appendChild(overlay);
        this.bindPreviewEvents();
    }

    bindPreviewEvents() {
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handlePreviewKeypress.bind(this));
    }

    handlePreviewKeypress(e) {
        if (!this.previewOpen) return;

        switch(e.key) {
            case '1':
                e.preventDefault();
                this.toggleFeatured('featured');
                break;
            case '2':
                e.preventDefault();
                this.toggleFeatured('portrait');
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.navigatePreview(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.navigatePreview(1);
                break;
            case 'Escape':
                e.preventDefault();
                this.closePreview();
                break;
        }
    }

    async toggleFeatured(type) {
        const currentImage = this.images[this.currentPreviewIndex];
        
        const response = await fetch('/api.php?action=toggle_featured_image', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                source_key: this.currentSource,
                image_path: currentImage.path,
                featured_type: type
            })
        });

        if (response.ok) {
            // Update UI
            currentImage.featured_type = currentImage.featured_type === type ? null : type;
            this.updatePreviewBadge();
            this.updateGridBadge(currentImage.path);
        }
    }
}
```

## 🚀 Implementation Steps

### Phase 1: Backend (Week 1)
1. Create database tables với category inheritance support
2. Implement API endpoints cho category và featured management
3. Add helper functions cho category inheritance lookup

### Phase 2: UI Transformation (Week 2)
1. Convert File Manager từ list view sang grid/list toggle
2. Implement image preview system giống Jet app
3. Add keyboard shortcuts (1, 2) cho featured marking
4. Add filters cho featured/portrait images

### Phase 3: Integration & Testing (Week 3)
1. Test category inheritance với nested folders
2. Optimize grid view performance với lazy loading
3. Add caching cho thumbnail generation
4. Test keyboard navigation trong preview mode

### Phase 4: AI Agent API (Week 4)
1. Implement get_featured_images endpoint với inherited categories
2. Add smart selection logic (ưu tiên portrait cho content về người)
3. Performance optimization cho large datasets
4. Documentation và training

## 📝 Key Features Summary

1. **Category Inheritance:** Set once at root, auto-inherit to subfolders
2. **Admin-only Controls:** Chỉ admin set categories và featured
3. **Keyboard Shortcuts:** 
   - `1` = Featured
   - `2` = Portrait (auto-featured)
   - Arrow keys = Navigate
   - `Esc` = Close preview
4. **Grid View:** Visual browsing như modern photo apps
5. **Preview System:** Full-screen với filmstrip navigation
6. **No Impact:** Không ảnh hưởng Jet App và Gallery

## 🎯 Benefits

1. **Simplified Management:** Category inheritance giảm công việc manual
2. **Visual Selection:** Grid view giúp chọn featured images dễ dàng
3. **Efficient Workflow:** Keyboard shortcuts tăng tốc độ làm việc
4. **AI-Ready:** Featured images có sẵn cho AI Content Agent
5. **Clean Separation:** Admin tools riêng biệt với user-facing apps 