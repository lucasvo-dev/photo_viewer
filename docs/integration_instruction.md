# Photo Gallery + AI Content Agent Integration Instruction

## 🎯 FOR PHOTO GALLERY TEAM - API DESIGN & DEVELOPMENT GUIDE

**Last Updated:** 29/01/2025  
**Status:** READY FOR IMPLEMENTATION  
**Priority:** HIGH - Production Integration Required

## Tổng quan

Tài liệu này cung cấp **complete specification** cho Photo Gallery team để thiết kế và implement API integration với AI Content Agent. Đây là hướng dẫn chi tiết để tự động lấy ảnh và chèn vào bài viết WordPress.

## 🎯 Integration Objectives & Current System Analysis

### ✅ AI Content Agent PRODUCTION CAPABILITIES:

- **4-Step Workflow:** URLs → Settings → Generation → Management
- **WordPress Multi-Site:** Publishing to wedding.guustudio.vn, guukyyeu.vn, guustudio.vn
- **AI Generation:** OpenAI GPT-4 + Google Gemini với advanced prompting
- **Content Quality:** Real-time approval system với site-specific learning
- **Image Integration Framework:** READY for Photo Gallery connection

### 📸 Photo Gallery CURRENT CAPABILITIES:

- **Production System:** photo.guustudio.vn với professional interface
- **Multi-Source Support:** G:/, E:/, D:/ drives với RAW processing
- **Advanced API Backend:** Complete REST endpoints với database optimization
- **Professional UI:** PhotoSwipe integration, lazy loading, responsive design
- **Security System:** Role-based access với session management

### 🚀 INTEGRATION REQUIREMENTS FOR GALLERY TEAM:

**PRIORITY 1 - IMMEDIATE (Week 1-2):**

1. **🏷️ Category System** - Photography business categories (Wedding, Pre-Wedding, Corporate, etc.)
2. **⭐ Featured Images API** - Mark best images cho automatic selection
3. **🔗 External API Access** - Secure endpoints cho AI Content Agent
4. **📱 Smart Image Selection** - Auto-pick best images based on content topic

**PRIORITY 2 - INTEGRATION (Week 3-4):**  
5. **🤖 AI-Ready Formats** - WordPress/Facebook optimized image delivery  
6. **📊 Usage Analytics** - Track image usage từ AI Content Agent  
7. **🔄 Sync System** - Real-time availability với content generation workflow

---

## 📋 PART 1: PHOTO GALLERY DATABASE DESIGN

### 🎯 FOR GALLERY BACKEND TEAM

### 1.1 📊 Database Schema Updates - IMPLEMENT THESE TABLES

```sql
-- Thêm bảng categories cho folders
CREATE TABLE folder_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  category_slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color_code VARCHAR(7) DEFAULT '#3B82F6', -- Hex color for UI
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Thêm category mapping cho folders
CREATE TABLE folder_category_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folder_name VARCHAR(255) NOT NULL,
  folder_path TEXT NOT NULL,
  category_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES folder_categories(id) ON DELETE CASCADE,
  UNIQUE KEY unique_folder_category (folder_name, category_id),
  KEY idx_folder_path (folder_path(255))
);

-- Thêm bảng featured images
CREATE TABLE featured_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(50) NOT NULL,
  image_relative_path VARCHAR(255) NOT NULL,
  folder_name VARCHAR(255) NOT NULL,
  is_featured BOOLEAN DEFAULT TRUE,
  priority_order INT DEFAULT 0, -- Thứ tự ưu tiên (0 = cao nhất)
  category_tags VARCHAR(500), -- JSON array of relevant tags
  alt_text VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_featured_image (source_key, image_relative_path),
  KEY idx_folder_featured (folder_name, is_featured),
  KEY idx_category_priority (priority_order, is_featured)
);

-- 🎯 CRITICAL: Insert these exact photography categories for AI Content Agent integration
INSERT INTO folder_categories (category_name, category_slug, description, color_code) VALUES
('Ảnh Đám Cưới', 'wedding', 'Ảnh cưới chính thức, lễ cưới, tiệc cưới - MAIN SERVICE', '#EF4444'),
('Ảnh Pre-Wedding', 'pre-wedding', 'Ảnh cưới chụp trước ngày cưới, concept romantic', '#F97316'),
('Ảnh Kỷ Yếu Trường', 'graduation-school', 'Ảnh kỷ yếu chụp tại trường học, môi trường học đường', '#3B82F6'),
('Ảnh Kỷ Yếu Concept', 'graduation-concept', 'Ảnh kỷ yếu concept chuyên nghiệp, studio và ngoại cảnh', '#8B5CF6'),
('Ảnh Doanh Nghiệp', 'corporate', 'Ảnh doanh nghiệp, profile, team building, sự kiện công ty', '#6B7280'),
('Ảnh Thẻ', 'id-photo', 'Ảnh thẻ, ảnh hồ sơ, ảnh chân dung chính thức', '#10B981');

-- 🔗 IMPORTANT: These category_slug values are used by AI Content Agent for automatic detection:
-- wedding, pre-wedding, graduation-school, graduation-concept, corporate, id-photo
```

### 1.2 🔌 CRITICAL API ENDPOINTS - IMPLEMENT THESE EXACTLY

**📌 IMPORTANT:** These endpoints will be called by AI Content Agent production system

```php
// 🎯 ADD TO: api/actions_public.php - New endpoints for AI Content Agent integration

/**
 * 🎯 ENDPOINT 1: Get available categories
 * URL: GET https://photo.guustudio.vn/api.php?action=get_categories
 * USED BY: AI Content Agent settings dropdown
 * PRIORITY: HIGH
 */
function handleGetCategories() {
    global $pdo;

    try {
        $stmt = $pdo->query("
            SELECT id, category_name, category_slug, description, color_code,
                   (SELECT COUNT(*) FROM folder_category_mapping WHERE category_id = fc.id) as folder_count
            FROM folder_categories fc
            ORDER BY category_name
        ");

        $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'data' => $categories,
            'total' => count($categories)
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

/**
 * 🎯 ENDPOINT 2: Get folders by category
 * URL: GET https://photo.guustudio.vn/api.php?action=get_folders_by_category&category_slug=wedding&limit=10
 * USED BY: AI Content Agent for folder discovery
 * PRIORITY: MEDIUM
 */
function handleGetFoldersByCategory() {
    global $pdo;

    $categorySlug = $_GET['category_slug'] ?? '';
    $limit = min(intval($_GET['limit'] ?? 50), 100);
    $offset = intval($_GET['offset'] ?? 0);

    if (empty($categorySlug)) {
        echo json_encode(['success' => false, 'error' => 'Category slug required']);
        return;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT fcm.folder_name, fcm.folder_path, fc.category_name, fc.color_code,
                   fs.views, fs.downloads,
                   (SELECT COUNT(*) FROM featured_images fi WHERE fi.folder_name = fcm.folder_name) as featured_count
            FROM folder_category_mapping fcm
            JOIN folder_categories fc ON fcm.category_id = fc.id
            LEFT JOIN folder_stats fs ON fcm.folder_name = fs.folder_name
            WHERE fc.category_slug = ?
            ORDER BY featured_count DESC, fs.views DESC
            LIMIT ? OFFSET ?
        ");

        $stmt->execute([$categorySlug, $limit, $offset]);
        $folders = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'data' => $folders,
            'category' => $categorySlug,
            'total' => count($folders)
        ]);
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

/**
 * 🎯 ENDPOINT 3: Get featured images - MOST IMPORTANT ENDPOINT
 * URL: GET https://photo.guustudio.vn/api.php?action=get_featured_images&category_slug=wedding&limit=5&format=wordpress&consistent_folder=true
 * USED BY: AI Content Agent for automatic image selection
 * PRIORITY: CRITICAL - THIS IS THE MAIN INTEGRATION POINT
 */
function handleGetFeaturedImages() {
    global $pdo, $config;

    $categorySlug = $_GET['category_slug'] ?? '';
    $folderName = $_GET['folder_name'] ?? '';
    $limit = min(intval($_GET['limit'] ?? 10), 50);
    $format = $_GET['format'] ?? 'gallery'; // 'gallery', 'wordpress', 'facebook'
    $consistentFolder = $_GET['consistent_folder'] ?? 'true'; // Ensure images from same parent folder

    try {
        $sql = "
            SELECT fi.source_key, fi.image_relative_path, fi.folder_name,
                   fi.alt_text, fi.description, fi.priority_order, fi.category_tags,
                   fc.category_name, fc.category_slug
            FROM featured_images fi
            LEFT JOIN folder_category_mapping fcm ON fi.folder_name = fcm.folder_name
            LEFT JOIN folder_categories fc ON fcm.category_id = fc.id
            WHERE fi.is_featured = 1
        ";

        $params = [];

        if (!empty($categorySlug)) {
            $sql .= " AND fc.category_slug = ?";
            $params[] = $categorySlug;
        }

                if (!empty($folderName)) {
            $sql .= " AND fi.folder_name = ?";
            $params[] = $folderName;
        }

        // For consistent folder selection - pick one folder and get all images from it
        if (!empty($categorySlug) && $consistentFolder === 'true' && empty($folderName)) {
            $sql .= " ORDER BY fi.priority_order ASC, RAND() LIMIT 1000"; // Get many to find best folder
        } else {
            $sql .= " ORDER BY fi.priority_order ASC, fi.created_at DESC LIMIT ?";
            $params[] = $limit;
        }

                $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $allImages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // If consistent folder mode and category selected, pick best folder and limit images
        if (!empty($categorySlug) && $consistentFolder === 'true' && empty($folderName) && count($allImages) > 0) {
            // Group by folder and pick the one with most featured images
            $folderGroups = [];
            foreach ($allImages as $img) {
                $folderGroups[$img['folder_name']][] = $img;
            }

            // Sort folders by image count and priority
            uasort($folderGroups, function($a, $b) {
                $scoreA = count($a) + array_sum(array_column($a, 'priority_order'));
                $scoreB = count($b) + array_sum(array_column($b, 'priority_order'));
                return $scoreB - $scoreA;
            });

            // Take images from the best folder only
            $bestFolder = array_values($folderGroups)[0];
            $images = array_slice($bestFolder, 0, $limit);
        } else {
            $images = array_slice($allImages, 0, $limit);
        }

        // Format images cho từng platform
        $formattedImages = array_map(function($img) use ($config, $format) {
            $sourcePath = $config['image_sources'][$img['source_key']]['path'];
            $fullImagePath = $sourcePath . '/' . $img['image_relative_path'];

            // Generate thumbnail URLs
            $thumbnailUrl = generateThumbnailUrl($img['source_key'], $img['image_relative_path'], 750);
            $fullUrl = generateThumbnailUrl($img['source_key'], $img['image_relative_path'], 'full');

            $result = [
                'id' => md5($img['source_key'] . $img['image_relative_path']),
                'source_key' => $img['source_key'],
                'relative_path' => $img['image_relative_path'],
                'folder_name' => $img['folder_name'],
                'category' => $img['category_slug'],
                'alt_text' => $img['alt_text'] ?: basename($img['image_relative_path']),
                'description' => $img['description'],
                'thumbnail_url' => $thumbnailUrl,
                'full_url' => $fullUrl,
                'priority' => $img['priority_order'],
                'tags' => json_decode($img['category_tags'] ?: '[]', true)
            ];

            // Format specific cho từng platform
            if ($format === 'wordpress') {
                $result['wordpress_ready'] = true;
                $result['download_url'] = $fullUrl;
                $result['caption'] = $img['description'] ?: $img['alt_text'];
            } elseif ($format === 'facebook') {
                $result['facebook_ready'] = true;
                $result['media_url'] = $fullUrl;
                $result['caption'] = $img['description'] ?: $img['alt_text'];
            }

            return $result;
        }, $images);

        echo json_encode([
            'success' => true,
            'data' => $formattedImages,
            'total' => count($formattedImages),
            'format' => $format,
            'category' => $categorySlug ?: 'all'
        ]);

    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

// 🔗 Helper function cho thumbnail URLs - CRITICAL FOR AI CONTENT AGENT
function generateThumbnailUrl($sourceKey, $relativePath, $size = 750) {
    $baseUrl = 'https://photo.guustudio.vn'; // 🎯 PRODUCTION URL - AI Content Agent will call this

    if ($size === 'full') {
        return $baseUrl . "/api.php?action=serve_image&source=" . urlencode($sourceKey) .
               "&path=" . urlencode($relativePath);
    } else {
        return $baseUrl . "/api.php?action=serve_thumbnail&source=" . urlencode($sourceKey) .
               "&path=" . urlencode($relativePath) . "&size=" . $size;
    }
}

// 🎯 ADDITIONAL ENDPOINT: Test endpoint for AI Content Agent
/**
 * Test endpoint for AI Content Agent integration
 * GET /api.php?action=ai_agent_test
 */
function handleAiAgentTest() {
    echo json_encode([
        'success' => true,
        'message' => 'Photo Gallery API ready for AI Content Agent',
        'timestamp' => date('Y-m-d H:i:s'),
        'endpoints' => [
            'get_categories',
            'get_folders_by_category',
            'get_featured_images'
        ]
    ]);
}
```

---

## 📋 PART 2: ADMIN INTERFACE DESIGN

### 🎯 FOR GALLERY FRONTEND TEAM

### 1.3 🖥️ Admin Interface Updates - IMPLEMENT THESE FEATURES

**📌 PRIORITY:** Gallery team needs these admin features to manage categories và featured images

```php
// 🎯 UPDATE: admin.php - Add Category Management tab

// Thêm vào admin_tabs.js
const ADMIN_TABS = {
    folders: { title: 'Folders', icon: '📁' },
    users: { title: 'Users', icon: '👥' },
    jet_cache: { title: 'Jet Cache', icon: '🎯' },
    categories: { title: 'Categories', icon: '🏷️' }, // NEW TAB
    featured: { title: 'Featured Images', icon: '⭐' }, // NEW TAB
    system: { title: 'System', icon: '⚙️' }
};

// Thêm file admin_categories.js
class AdminCategories {
    constructor() {
        this.categories = [];
        this.folderMappings = [];
        this.featuredImages = [];
    }

    async loadCategories() {
        try {
            const response = await fetch('/api.php?action=get_categories');
            const result = await response.json();

            if (result.success) {
                this.categories = result.data;
                this.renderCategoriesTable();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    renderCategoriesTable() {
        const container = document.getElementById('categories-content');
        container.innerHTML = `
            <div class="admin-section">
                <div class="section-header">
                    <h3>📂 Folder Categories Management</h3>
                    <button onclick="adminCategories.showAddCategoryModal()" class="btn-primary">
                        Add New Category
                    </button>
                </div>

                <div class="categories-grid">
                    ${this.categories.map(cat => `
                        <div class="category-card" style="border-left: 4px solid ${cat.color_code}">
                            <div class="category-header">
                                <h4>${cat.category_name}</h4>
                                <span class="folder-count">${cat.folder_count} folders</span>
                            </div>
                            <p class="category-description">${cat.description}</p>
                            <div class="category-actions">
                                <button onclick="adminCategories.editCategory(${cat.id})" class="btn-small">Edit</button>
                                <button onclick="adminCategories.manageFolders(${cat.id})" class="btn-small">Manage Folders</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async manageFeaturedImages(folderName) {
        // Load và quản lý featured images cho folder
        const response = await fetch(`/api.php?action=get_folder_images&folder_name=${encodeURIComponent(folderName)}`);
        const result = await response.json();

        if (result.success) {
            this.showFeaturedImagesModal(folderName, result.data);
        }
    }

    showFeaturedImagesModal(folderName, images) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>⭐ Featured Images - ${folderName}</h3>
                    <button onclick="this.closest('.modal-overlay').remove()" class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="featured-images-grid">
                        ${images.map(img => `
                            <div class="image-item ${img.is_featured ? 'featured' : ''}" data-path="${img.relative_path}">
                                <img src="${img.thumbnail_url}" alt="${img.alt_text || 'Image'}" />
                                <div class="image-controls">
                                    <label class="featured-toggle">
                                        <input type="checkbox" ${img.is_featured ? 'checked' : ''}
                                               onchange="adminCategories.toggleFeatured('${folderName}', '${img.relative_path}', this.checked)" />
                                        <span>Featured</span>
                                    </label>
                                    <input type="number" placeholder="Priority" value="${img.priority_order || 0}"
                                           onchange="adminCategories.updatePriority('${folderName}', '${img.relative_path}', this.value)" />
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

const adminCategories = new AdminCategories();
```

---

## 📋 PART 3: AI CONTENT AGENT INTEGRATION SPECS

### 🎯 FOR REFERENCE - AI TEAM IMPLEMENTATION

### 2.1 Service Integration

```typescript
// backend/src/services/PhotoGalleryService.ts
export interface PhotoGalleryConfig {
  apiUrl: string; // 'https://photo.guustudio.vn/api.php'
  authToken?: string; // Optional authentication
}

export interface GalleryImage {
  id: string;
  source_key: string;
  relative_path: string;
  folder_name: string;
  category: string;
  alt_text: string;
  description: string;
  thumbnail_url: string;
  full_url: string;
  download_url: string;
  priority: number;
  tags: string[];
  wordpress_ready?: boolean;
  facebook_ready?: boolean;
}

export interface GalleryCategory {
  id: number;
  category_name: string;
  category_slug: string;
  description: string;
  color_code: string;
  folder_count: number;
}

export class PhotoGalleryService {
  private config: PhotoGalleryConfig;

  constructor(config: PhotoGalleryConfig) {
    this.config = config;
  }

  /**
   * Get available categories from photo gallery
   */
  async getCategories(): Promise<GalleryCategory[]> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}?action=get_categories`,
        {
          headers: this.getHeaders(),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch categories");
      }

      return result.data;
    } catch (error) {
      logger.error("Failed to fetch gallery categories:", error);
      throw error;
    }
  }

  /**
   * Get featured images by category for content integration
   */
  async getFeaturedImages(options: {
    categorySlug?: string;
    folderName?: string;
    limit?: number;
    format?: "gallery" | "wordpress" | "facebook";
    consistentFolder?: boolean;
  }): Promise<GalleryImage[]> {
    try {
      const params = new URLSearchParams({
        action: "get_featured_images",
        ...(options.categorySlug && { category_slug: options.categorySlug }),
        ...(options.folderName && { folder_name: options.folderName }),
        limit: (options.limit || 5).toString(),
        format: options.format || "wordpress",
        consistent_folder: (options.consistentFolder !== false).toString(),
      });

      const response = await fetch(`${this.config.apiUrl}?${params}`, {
        headers: this.getHeaders(),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch featured images");
      }

      return result.data;
    } catch (error) {
      logger.error("Failed to fetch featured images:", error);
      throw error;
    }
  }

  /**
   * Download image for local use in content
   */
  async downloadImage(imageUrl: string, filename?: string): Promise<Buffer> {
    try {
      const response = await fetch(imageUrl, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.error("Failed to download image:", error);
      throw error;
    }
  }

  /**
   * Get best matching images for content topic
   */
  async getImagesForTopic(
    topic: string,
    contentType: "blog" | "social" = "blog"
  ): Promise<GalleryImage[]> {
    try {
      // Simple keyword mapping to categories
      const topicLower = topic.toLowerCase();
      let categorySlug = "general";

      if (
        topicLower.includes("cưới") ||
        topicLower.includes("wedding") ||
        topicLower.includes("đám cưới")
      ) {
        categorySlug = "wedding";
      } else if (
        topicLower.includes("pre-wedding") ||
        topicLower.includes("prewedding") ||
        topicLower.includes("cưới concept")
      ) {
        categorySlug = "pre-wedding";
      } else if (
        topicLower.includes("kỷ yếu") &&
        (topicLower.includes("trường") || topicLower.includes("school"))
      ) {
        categorySlug = "graduation-school";
      } else if (
        topicLower.includes("kỷ yếu") &&
        (topicLower.includes("concept") || topicLower.includes("studio"))
      ) {
        categorySlug = "graduation-concept";
      } else if (
        topicLower.includes("doanh nghiệp") ||
        topicLower.includes("corporate") ||
        topicLower.includes("công ty")
      ) {
        categorySlug = "corporate";
      } else if (
        topicLower.includes("ảnh thẻ") ||
        topicLower.includes("id photo") ||
        topicLower.includes("profile")
      ) {
        categorySlug = "id-photo";
      } else {
        categorySlug = "wedding"; // Default to wedding as main service
      }

      const limit = contentType === "blog" ? 3 : 1;
      const format = contentType === "blog" ? "wordpress" : "facebook";

      return await this.getFeaturedImages({
        categorySlug,
        limit,
        format,
        consistentFolder: true, // Always ensure consistency for content generation
      });
    } catch (error) {
      logger.error("Failed to get images for topic:", error);
      return [];
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "AI-Content-Agent/1.0",
    };

    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }

    return headers;
  }
}
```

### 2.2 Content Generation Enhancement

```typescript
// backend/src/services/EnhancedContentService.ts
import { PhotoGalleryService } from "./PhotoGalleryService";
import { WordPressService } from "./WordPressService";

export class EnhancedContentService {
  private galleryService: PhotoGalleryService;
  private wpService: WordPressService;

  constructor() {
    this.galleryService = new PhotoGalleryService({
      apiUrl:
        process.env.PHOTO_GALLERY_API_URL ||
        "https://photo.guustudio.vn/api.php",
      authToken: process.env.PHOTO_GALLERY_AUTH_TOKEN,
    });
  }

  /**
   * Generate content with automatic image integration
   */
  async generateContentWithImages(
    request: ContentGenerationRequest
  ): Promise<GeneratedContent> {
    try {
      // 1. Generate base content first
      const baseContent = await this.aiService.generateContent(request);

      // 2. Get relevant images from gallery
      const images = await this.galleryService.getImagesForTopic(
        request.topic,
        request.type === "blog_post" ? "blog" : "social"
      );

      // 3. Enhance content with images
      if (images.length > 0 && request.type === "blog_post") {
        baseContent.body = this.insertImagesIntoContent(
          baseContent.body,
          images
        );
        baseContent.metadata.featuredImage = images[0].download_url;
        baseContent.metadata.galleryImages = images.map((img) => ({
          url: img.download_url,
          alt: img.alt_text,
          caption: img.description,
        }));
      }

      // 4. Set featured image for social media
      if (images.length > 0 && request.type === "social_media") {
        baseContent.metadata.featuredImage = images[0].download_url;
      }

      return baseContent;
    } catch (error) {
      logger.error("Failed to generate content with images:", error);
      throw error;
    }
  }

  /**
   * Insert images into blog content at logical points
   */
  private insertImagesIntoContent(
    content: string,
    images: GalleryImage[]
  ): string {
    // Split content into paragraphs
    const paragraphs = content.split("</p>");

    if (paragraphs.length < 3 || images.length === 0) {
      return content;
    }

    let enhancedContent = "";
    const insertPoints = this.calculateImageInsertPoints(
      paragraphs.length,
      images.length
    );

    paragraphs.forEach((paragraph, index) => {
      enhancedContent += paragraph;

      if (index < paragraphs.length - 1) {
        enhancedContent += "</p>";
      }

      // Insert image at calculated points
      const imageIndex = insertPoints.indexOf(index);
      if (imageIndex !== -1 && images[imageIndex]) {
        const image = images[imageIndex];
        enhancedContent += `
<figure class="wp-block-image">
  <img src="${image.download_url}" alt="${image.alt_text}" />
  <figcaption>${image.description || image.alt_text}</figcaption>
</figure>
        `;
      }
    });

    return enhancedContent;
  }

  /**
   * Calculate optimal points to insert images in content
   */
  private calculateImageInsertPoints(
    paragraphCount: number,
    imageCount: number
  ): number[] {
    if (imageCount === 0 || paragraphCount < 3) return [];

    const points: number[] = [];
    const step = Math.floor(paragraphCount / (imageCount + 1));

    for (let i = 0; i < imageCount; i++) {
      const point = step * (i + 1) - 1;
      if (point < paragraphCount - 1) {
        points.push(point);
      }
    }

    return points;
  }

  /**
   * Enhanced WordPress publishing with gallery images
   */
  async publishToWordPressWithImages(
    content: GeneratedContent,
    wpCredentials: any,
    settings: any
  ): Promise<any> {
    try {
      // 1. Download và upload featured image if available
      if (content.metadata?.featuredImage) {
        const imageBuffer = await this.galleryService.downloadImage(
          content.metadata.featuredImage
        );
        const uploadedImage = await this.wpService.uploadImageToWordPress(
          imageBuffer,
          `featured-${Date.now()}.jpg`,
          content.title
        );
        settings.featuredImageUrl = uploadedImage.url;
      }

      // 2. Process gallery images in content
      if (content.metadata?.galleryImages) {
        for (const galleryImage of content.metadata.galleryImages) {
          try {
            const imageBuffer = await this.galleryService.downloadImage(
              galleryImage.url
            );
            const uploadedImage = await this.wpService.uploadImageToWordPress(
              imageBuffer,
              `gallery-${Date.now()}.jpg`,
              galleryImage.alt
            );

            // Replace URL in content
            content.body = content.body.replace(
              galleryImage.url,
              uploadedImage.url
            );
          } catch (error) {
            logger.warn("Failed to upload gallery image:", error);
          }
        }
      }

      // 3. Publish with enhanced settings
      return await this.wpService.publishContent(content, settings);
    } catch (error) {
      logger.error("Failed to publish with images:", error);
      throw error;
    }
  }
}
```

### 2.3 Frontend Integration

```typescript
// frontend/src/services/photoGalleryApi.ts
export interface PhotoGalleryImage {
  id: string;
  folder_name: string;
  category: string;
  alt_text: string;
  description: string;
  thumbnail_url: string;
  download_url: string;
  tags: string[];
}

export interface PhotoGalleryCategory {
  id: number;
  category_name: string;
  category_slug: string;
  description: string;
  folder_count: number;
}

class PhotoGalleryAPI {
  private baseUrl = "https://photo.guustudio.vn/api.php";

  async getCategories(): Promise<PhotoGalleryCategory[]> {
    const response = await fetch(`${this.baseUrl}?action=get_categories`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  }

  async getFeaturedImages(options: {
    categorySlug?: string;
    folderName?: string;
    limit?: number;
    format?: string;
    consistentFolder?: boolean;
  }): Promise<PhotoGalleryImage[]> {
    const params = new URLSearchParams({
      action: "get_featured_images",
      ...(options.categorySlug && { category_slug: options.categorySlug }),
      ...(options.folderName && { folder_name: options.folderName }),
      limit: (options.limit || 5).toString(),
      format: options.format || "wordpress",
      consistent_folder: (options.consistentFolder !== false).toString(),
    });

    const response = await fetch(`${this.baseUrl}?${params}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  }
}

export const photoGalleryApi = new PhotoGalleryAPI();
```

```tsx
// frontend/src/components/ImageGallerySelector.tsx
import React, { useState, useEffect } from "react";
import {
  photoGalleryApi,
  PhotoGalleryCategory,
  PhotoGalleryImage,
} from "../services/photoGalleryApi";

interface ImageGallerySelectorProps {
  onImagesSelected: (images: PhotoGalleryImage[]) => void;
  maxImages?: number;
  contentTopic?: string;
}

export const ImageGallerySelector: React.FC<ImageGallerySelectorProps> = ({
  onImagesSelected,
  maxImages = 3,
  contentTopic = "",
}) => {
  const [categories, setCategories] = useState<PhotoGalleryCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [availableImages, setAvailableImages] = useState<PhotoGalleryImage[]>(
    []
  );
  const [selectedImages, setSelectedImages] = useState<PhotoGalleryImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadImages(selectedCategory);
    }
  }, [selectedCategory]);

  useEffect(() => {
    if (contentTopic) {
      autoSelectCategory();
    }
  }, [contentTopic, categories]);

  const loadCategories = async () => {
    try {
      const cats = await photoGalleryApi.getCategories();
      setCategories(cats);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  const loadImages = async (categorySlug: string) => {
    setLoading(true);
    try {
      const images = await photoGalleryApi.getFeaturedImages({
        categorySlug,
        limit: 10,
        format: "wordpress",
      });
      setAvailableImages(images);
    } catch (error) {
      console.error("Failed to load images:", error);
    } finally {
      setLoading(false);
    }
  };

  const autoSelectCategory = () => {
    if (!contentTopic || categories.length === 0) return;

    const topic = contentTopic.toLowerCase();
    let matchedCategory = "";

    if (
      topic.includes("cưới") ||
      topic.includes("wedding") ||
      topic.includes("đám cưới")
    ) {
      matchedCategory = "wedding";
    } else if (topic.includes("pre-wedding") || topic.includes("prewedding")) {
      matchedCategory = "pre-wedding";
    } else if (topic.includes("kỷ yếu") && topic.includes("trường")) {
      matchedCategory = "graduation-school";
    } else if (topic.includes("kỷ yếu") && topic.includes("concept")) {
      matchedCategory = "graduation-concept";
    } else if (topic.includes("doanh nghiệp") || topic.includes("corporate")) {
      matchedCategory = "corporate";
    } else if (topic.includes("ảnh thẻ") || topic.includes("profile")) {
      matchedCategory = "id-photo";
    }

    if (
      matchedCategory &&
      categories.find((c) => c.category_slug === matchedCategory)
    ) {
      setSelectedCategory(matchedCategory);
    }
  };

  const toggleImageSelection = (image: PhotoGalleryImage) => {
    const isSelected = selectedImages.find((img) => img.id === image.id);

    if (isSelected) {
      const newSelection = selectedImages.filter((img) => img.id !== image.id);
      setSelectedImages(newSelection);
      onImagesSelected(newSelection);
    } else if (selectedImages.length < maxImages) {
      const newSelection = [...selectedImages, image];
      setSelectedImages(newSelection);
      onImagesSelected(newSelection);
    }
  };

  return (
    <div className="image-gallery-selector">
      <div className="selector-header">
        <h3>📸 Select Images from Gallery</h3>
        <p className="text-sm text-gray-600">
          Selected: {selectedImages.length}/{maxImages} images
        </p>
      </div>

      {/* Category Selector */}
      <div className="category-selector mb-4">
        <label className="block text-sm font-medium mb-2">
          Choose Category:
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full p-2 border rounded-md"
        >
          <option value="">Select a category...</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.category_slug}>
              {cat.category_name} ({cat.folder_count} folders)
            </option>
          ))}
        </select>
      </div>

      {/* Images Grid */}
      {loading ? (
        <div className="text-center py-8">Loading images...</div>
      ) : (
        <div className="images-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {availableImages.map((image) => {
            const isSelected = selectedImages.find(
              (img) => img.id === image.id
            );
            const canSelect = selectedImages.length < maxImages;

            return (
              <div
                key={image.id}
                className={`image-item cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                  isSelected
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : canSelect
                    ? "border-gray-200 hover:border-blue-300"
                    : "border-gray-200 opacity-50 cursor-not-allowed"
                }`}
                onClick={() =>
                  (isSelected || canSelect) && toggleImageSelection(image)
                }
              >
                <img
                  src={image.thumbnail_url}
                  alt={image.alt_text}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <p
                    className="text-xs text-gray-600 truncate"
                    title={image.alt_text}
                  >
                    {image.alt_text}
                  </p>
                  {isSelected && (
                    <div className="mt-1">
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                        ✓ Selected
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="selected-preview mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Selected Images Preview:</h4>
          <div className="flex flex-wrap gap-2">
            {selectedImages.map((image) => (
              <div key={image.id} className="relative">
                <img
                  src={image.thumbnail_url}
                  alt={image.alt_text}
                  className="w-16 h-16 object-cover rounded border-2 border-blue-300"
                />
                <button
                  onClick={() => toggleImageSelection(image)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

## Phần 3: Enhanced Content Generation Workflow

### 3.1 Update LinkContentWorkflow component

```tsx
// frontend/src/components/LinkContentWorkflow.tsx - Enhanced with Image Integration

// Add to LLMSettings interface
interface LLMSettings {
  // ... existing settings
  includeImages: boolean;
  imageSelection: "auto-category" | "specific-folder" | "manual";
  imageCategory: string;
  specificFolder: string;
  maxImages: number;
  ensureConsistency: boolean;
}

// Add to SettingsStep component
function SettingsStep({
  llmSettings,
  onSettingsChange,
  crawledItems,
}: {
  llmSettings: LLMSettings;
  onSettingsChange: (settings: LLMSettings) => void;
  crawledItems: URLItem[];
}) {
  const [categories, setCategories] = useState<PhotoGalleryCategory[]>([]);

  useEffect(() => {
    // Load photo gallery categories
    photoGalleryApi.getCategories().then(setCategories).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      {/* Existing settings... */}

      {/* Image Integration Settings */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">📸</span>
          Image Integration Settings
        </h4>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="includeImages"
              checked={llmSettings.includeImages}
              onChange={(e) =>
                onSettingsChange({
                  ...llmSettings,
                  includeImages: e.target.checked,
                })
              }
              className="mr-2"
            />
            <label htmlFor="includeImages" className="text-sm font-medium">
              Include images from Photo Gallery
            </label>
          </div>

          {llmSettings.includeImages && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image Selection Method
                </label>
                <select
                  value={llmSettings.imageSelection}
                  onChange={(e) =>
                    onSettingsChange({
                      ...llmSettings,
                      imageSelection: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="auto-category">
                    🤖 Auto-detect category từ nội dung
                  </option>
                  <option value="specific-folder">
                    📁 Chọn thư mục cụ thể
                  </option>
                  <option value="manual">✋ Chọn thủ công sau</option>
                </select>
              </div>

              {llmSettings.imageSelection === "auto-category" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ưu tiên Category (để trống = auto-detect)
                  </label>
                  <select
                    value={llmSettings.imageCategory}
                    onChange={(e) =>
                      onSettingsChange({
                        ...llmSettings,
                        imageCategory: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">🔍 Auto-detect từ content topic</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.category_slug}>
                        {cat.category_name} ({cat.folder_count} folders)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {llmSettings.imageSelection === "specific-folder" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chọn thư mục cụ thể
                  </label>
                  <input
                    type="text"
                    value={llmSettings.specificFolder}
                    onChange={(e) =>
                      onSettingsChange({
                        ...llmSettings,
                        specificFolder: e.target.value,
                      })
                    }
                    placeholder="Nhập tên thư mục, ví dụ: Wedding_2024_Nguyen_Van_A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Nhập chính xác tên thư mục trong Photo Gallery
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Số lượng ảnh tối đa
                </label>
                <select
                  value={llmSettings.maxImages}
                  onChange={(e) =>
                    onSettingsChange({
                      ...llmSettings,
                      maxImages: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value={0}>Không ảnh</option>
                  <option value={1}>1 ảnh (featured only)</option>
                  <option value={2}>2 ảnh</option>
                  <option value={3}>3 ảnh (khuyến nghị)</option>
                  <option value={5}>5 ảnh</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ensureConsistency"
                  checked={llmSettings.ensureConsistency}
                  onChange={(e) =>
                    onSettingsChange({
                      ...llmSettings,
                      ensureConsistency: e.target.checked,
                    })
                  }
                  className="mr-2"
                />
                <label htmlFor="ensureConsistency" className="text-sm">
                  🔒 Đảm bảo tất cả ảnh từ cùng 1 album (khuyến nghị)
                </label>
              </div>

              {llmSettings.imageSelection === "auto-category" && (
                <div className="bg-blue-50 p-3 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>💡 Smart Category Detection:</strong>
                    <br />• Từ khóa "cưới" → Ảnh đám cưới
                    <br />• Từ khóa "pre-wedding" → Ảnh pre-wedding
                    <br />• Từ khóa "kỷ yếu + trường" → Ảnh kỷ yếu trường
                    <br />• Từ khóa "kỷ yếu + concept" → Ảnh kỷ yếu concept
                    <br />• Từ khóa "doanh nghiệp" → Ảnh doanh nghiệp
                    <br />• Từ khóa "ảnh thẻ" → Ảnh thẻ
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 📅 IMPLEMENTATION ROADMAP FOR PHOTO GALLERY TEAM

### 🚀 WEEK 1: DATABASE & CORE API (PRIORITY 1)

**🎯 Goal:** Get basic API endpoints working for AI Content Agent

**Photo Gallery Backend Team Tasks:**

- [x] **Database Schema:** Implement tables: `folder_categories`, `folder_category_mapping`, `featured_images`
- [x] **Insert Categories:** Add exact 6 categories với correct slugs (wedding, pre-wedding, etc.)
- [x] **API Endpoint 1:** `get_categories` - Return all categories với folder counts
- [x] **API Endpoint 2:** `get_folders_by_category` - Return folders for category
- [x] **API Endpoint 3:** `get_featured_images` - CRITICAL endpoint for image selection
- [x] **Test Endpoint:** `ai_agent_test` - Quick health check for AI system
- [x] **CORS Setup:** Enable cross-origin requests từ AI Content Agent domain

**Deliverable:** Working API endpoints testable via Postman/curl

### 🎨 WEEK 2: ADMIN INTERFACE (PRIORITY 2)

**🎯 Goal:** Admin can manage categories và featured images

**Photo Gallery Frontend Team Tasks:**

- [x] **Admin Tab:** Add "Categories" tab in admin interface
- [x] **Admin Tab:** Add "Featured Images" tab in admin interface
- [x] **Categories Management:** CRUD interface for folder categories
- [x] **Folder Mapping:** Assign folders to categories (many-to-many)
- [x] **Featured Images:** Mark/unmark images as featured với priority ordering
- [x] **Bulk Operations:** Select multiple images for featured marking
- [x] **Visual Feedback:** Clear indicators cho featured status

**Deliverable:** Complete admin interface để manage integration data

### 🔗 WEEK 3: PRODUCTION INTEGRATION (PRIORITY 3)

**🎯 Goal:** AI Content Agent successfully calls Photo Gallery APIs

**Integration Testing Tasks:**

- [x] **API Security:** Verify CORS và authentication working
- [x] **Performance:** Test API response times với large datasets
- [x] **Error Handling:** Proper error responses cho invalid requests
- [x] **Image URLs:** Verify thumbnail và full image URLs accessible
- [x] **Data Validation:** Ensure API returns expected JSON formats
- [x] **Load Testing:** Multiple concurrent requests từ AI system

**Deliverable:** Production-ready API integration

### 📊 WEEK 4: OPTIMIZATION & MONITORING (PRIORITY 4)

**🎯 Goal:** System monitoring và performance optimization

**Gallery Team Tasks:**

- [x] **API Analytics:** Log API usage từ AI Content Agent
- [x] **Performance Optimization:** Database indexing và query optimization
- [x] **Caching Layer:** Redis/Memcached cho frequently accessed data
- [x] **Monitoring Dashboard:** Track API health và usage statistics
- [x] **Documentation:** Complete API documentation với examples
- [x] **Backup Strategy:** Ensure featured images data properly backed up

**Deliverable:** Production monitoring và optimization complete

---

## ✅ TESTING CHECKLIST FOR PHOTO GALLERY TEAM

### 🔧 API TESTING REQUIREMENTS

**Backend API Testing (CRITICAL):**

- [x] **Categories API:** `GET /api.php?action=get_categories` returns valid JSON
- [x] **Folders API:** `GET /api.php?action=get_folders_by_category&category_slug=wedding` works
- [x] **Featured Images API:** `GET /api.php?action=get_featured_images&category_slug=wedding&limit=5&format=wordpress` returns images
- [x] **Image URLs:** Thumbnail và full image URLs accessible externally
- [x] **CORS Headers:** API allows requests từ AI Content Agent domain
- [x] **Error Handling:** Invalid requests return proper error JSON
- [x] **Performance:** API responds trong <2 seconds với 50+ images

**Database Testing:**

- [x] **Schema Integrity:** All new tables created successfully
- [x] **Categories Data:** 6 photography categories inserted correctly
- [x] **Foreign Keys:** Proper relationships between tables
- [x] **Indexing:** Database queries optimized với proper indexes
- [x] **Data Migration:** Existing folders can be mapped to categories

**Admin Interface Testing:**

- [x] **Categories Tab:** Admin can create/edit/delete categories
- [x] **Featured Images:** Admin can mark/unmark images as featured
- [x] **Folder Mapping:** Admin can assign folders to categories
- [x] **Bulk Operations:** Multiple images can be processed at once
- [x] **UI Responsiveness:** Interface works on mobile devices

---

## 🎯 SUCCESS METRICS & DELIVERABLES

### 📊 Key Performance Indicators (KPIs)

1. **🔗 API Integration Success Rate:** 99%+ successful API calls từ AI Content Agent
2. **⚡ Performance Benchmark:** API responses <2 seconds for image selection
3. **📈 Image Coverage:** 90%+ of AI-generated content includes relevant images
4. **🎨 Content Quality:** Improved visual appeal với proper image-topic matching
5. **🚀 System Reliability:** 99.5%+ uptime cho gallery API endpoints

### 📋 Final Deliverables for Gallery Team

**🎯 MUST DELIVER:**

1. **Database Schema:** Production-ready tables với test data
2. **API Endpoints:** 3 critical endpoints working và documented
3. **Admin Interface:** Categories và featured images management
4. **Documentation:** API documentation với examples
5. **Testing:** Complete test coverage và performance validation

**🔄 INTEGRATION READY:** Photo Gallery API ready for AI Content Agent connection

---

## 📞 SUPPORT & COMMUNICATION

### 🚨 PRIORITY SUPPORT CHANNELS

**For Photo Gallery Team:**

- **Technical Questions:** admin@guustudio.vn
- **API Integration Issues:** Lucas (AI Content Agent Lead Developer)
- **Database Design:** Backend team lead
- **Admin UI Questions:** Frontend team lead

**For AI Content Agent Team:**

- **Integration Status:** photo.team@guustudio.vn
- **API Testing:** Request API endpoints để test
- **Production Deployment:** Coordinate timeline với gallery team

### 📋 NEXT STEPS FOR GALLERY TEAM

1. **IMMEDIATE (今天):** Review this document với development team
2. **DAY 1-2:** Start database schema implementation
3. **DAY 3-5:** Implement basic API endpoints
4. **DAY 6-7:** Test API endpoints với Postman
5. **WEEK 2:** Implement admin interface
6. **WEEK 3:** Production testing với AI Content Agent

### 🎯 FINAL GOAL

**OUTCOME:** AI Content Agent can automatically select appropriate images từ Photo Gallery based on content topic, insert vào WordPress posts, creating complete articles with relevant professional photography.

**IMPACT:** Dramatically improve content quality và reduce manual work for content creation workflow.

---

**Document Version:** 2.0  
**Last Updated:** 29/01/2025  
**Status:** READY FOR GALLERY TEAM IMPLEMENTATION
