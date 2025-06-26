# API Documentation for AI Content Agent

**Phiên bản:** 1.0  
**Ngày cập nhật:** 29/01/2025  
**Base URL:** `https://your-domain.com/api.php`

## 📋 Tổng quan

API này cung cấp endpoint chuyên dụng cho AI Content Agent để lấy featured images theo category từ hệ thống thư viện ảnh. API hỗ trợ filtering theo nhiều tiêu chí và trả về metadata chi tiết của ảnh.

## 🔑 Authentication

API hiện tại **KHÔNG yêu cầu authentication** cho các endpoint AI. Tuy nhiên, đảm bảo server có thể access được các file ảnh trong source paths.

## 📖 Available Endpoints

### 1. Get Featured Images by Category

**Endpoint:** `GET /api.php?action=ai_get_featured_images`

Lấy danh sách ảnh featured theo category với khả năng filter linh hoạt.

#### Parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `category` | string | No | null | Category slug để filter (e.g., 'wedding', 'pre-wedding') |
| `type` | string | No | null | Featured type: 'featured' hoặc 'portrait' |
| `source` | string | No | null | Source key để filter theo nguồn ảnh cụ thể |
| `limit` | integer | No | 20 | Số lượng ảnh tối đa (1-100) |
| `priority` | string | No | 'asc' | Sắp xếp theo priority: 'asc' hoặc 'desc' |
| `metadata` | boolean | No | false | Có include metadata chi tiết không |

#### Example Requests:

```bash
# Lấy 10 ảnh featured loại 'portrait' trong category 'wedding'
GET /api.php?action=ai_get_featured_images&category=wedding&type=portrait&limit=10

# Lấy tất cả ảnh featured với metadata chi tiết
GET /api.php?action=ai_get_featured_images&metadata=true&limit=50

# Lấy ảnh featured từ source cụ thể, sắp xếp theo priority cao nhất
GET /api.php?action=ai_get_featured_images&source=guu_2025&priority=desc&limit=15
```

#### Response Format:

```json
{
  "success": true,
  "images": [
    {
      "id": 1,
      "source_key": "guu_2025",
      "image_path": "2025_Wedding_Nguyen_Van_A/Ceremony/DSC_001.jpg",
      "folder_path": "2025_Wedding_Nguyen_Van_A/Ceremony",
      "featured_type": "featured",
      "priority_order": 1,
      "thumbnail_url": "/api.php?action=get_thumbnail&path=guu_2025%2F2025_Wedding_Nguyen_Van_A%2FCeremony%2FDSC_001.jpg&size=750",
      "full_image_url": "/api.php?action=get_image&path=guu_2025%2F2025_Wedding_Nguyen_Van_A%2FCeremony%2FDSC_001.jpg",
      "category": {
        "name": "Đám Cưới",
        "slug": "wedding",
        "color": "#EF4444",
        "icon": "fas fa-heart"
      },
      "metadata": {  // Chỉ có khi metadata=true
        "filename": "DSC_001.jpg",
        "filesize": 2048576,
        "modified_date": "2025-01-15 14:30:25",
        "alt_text": "Beautiful wedding ceremony moment",
        "description": "Bride and groom exchanging vows",
        "created_at": "2025-01-29 10:15:30",
        "width": 3840,
        "height": 2560,
        "aspect_ratio": 1.5
      }
    }
  ],
  "total_found": 15,
  "query_params": {
    "category": "wedding",
    "type": "portrait",
    "source": null,
    "limit": 10,
    "priority_order": "asc",
    "include_metadata": false
  },
  "available_categories": [
    {
      "category_name": "Đám Cưới",
      "category_slug": "wedding",
      "color_code": "#EF4444",
      "icon_class": "fas fa-heart",
      "description": "Cưới chính thức, lễ cưới, tiệc cưới"
    }
  ],
  "available_sources": [
    {
      "key": "guu_2025",
      "name": "SSD Guu 2025"
    }
  ],
  "api_version": "1.0",
  "timestamp": "2025-01-29 10:15:30"
}
```

### 2. Get Categories and Statistics

**Endpoint:** `GET /api.php?action=ai_get_categories`

Lấy danh sách tất cả categories có sẵn với option statistics.

#### Parameters:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `stats` | boolean | No | false | Có include thống kê không |

#### Example Request:

```bash
# Lấy categories với thống kê chi tiết
GET /api.php?action=ai_get_categories&stats=true
```

#### Response Format:

```json
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "category_name": "Đám Cưới",
      "category_slug": "wedding",
      "description": "Cưới chính thức, lễ cưới, tiệc cưới",
      "color_code": "#EF4444",
      "icon_class": "fas fa-heart",
      "sort_order": 1,
      "created_at": "2025-01-29 09:00:00",
      "folder_count": 25,  // Chỉ có khi stats=true
      "featured_images": {  // Chỉ có khi stats=true
        "total": 45,
        "featured": 30,
        "portrait": 15
      }
    }
  ],
  "total_categories": 5,
  "includes_stats": true,
  "api_version": "1.0",
  "timestamp": "2025-01-29 10:15:30"
}
```

## 💡 Use Cases cho AI Content Agent

### 1. Smart Content Selection for Wedding Category

```bash
# Lấy ảnh portrait priority cao cho wedding content
GET /api.php?action=ai_get_featured_images&category=wedding&type=portrait&priority=desc&limit=5&metadata=true
```

**AI Agent có thể:**
- Chọn ảnh portrait chất lượng cao cho social media
- Ưu tiên ảnh có priority cao (được chọn cẩn thận)
- Sử dụng metadata để tối ưu hóa content

### 2. Diverse Portfolio Creation

```bash
# Lấy ảnh featured từ multiple categories
GET /api.php?action=ai_get_featured_images&limit=20&priority=desc&metadata=true
```

**AI Agent có thể:**
- Tạo portfolio đa dạng từ nhiều loại chụp ảnh
- Phân tích aspect ratio để layout phù hợp
- Sử dụng category colors cho UI theming

### 3. Category-Specific Marketing Content

```bash
# Lấy statistics để hiểu portfolio
GET /api.php?action=ai_get_categories&stats=true

# Sau đó lấy ảnh từ category có nhiều featured images nhất
GET /api.php?action=ai_get_featured_images&category=wedding&limit=10&metadata=true
```

## 🔧 Error Handling

### Error Response Format:

```json
{
  "success": false,
  "error": "Error message",
  "code": 500
}
```

### Common Error Codes:

- `400`: Invalid parameters
- `404`: Category không tồn tại
- `500`: Server error

## 📊 Performance Notes

- **Database Indexing:** Query được tối ưu với indexes trên `featured_images` và `folder_category_mapping`
- **File Validation:** API tự động kiểm tra file existence trước khi trả về
- **Caching:** Thumbnail URLs sử dụng existing cache system
- **Limit Recommendation:** Sử dụng limit ≤ 50 cho performance tốt nhất

## 🚀 Integration Examples

### Python Example:

```python
import requests

# Lấy ảnh featured cho AI content generation
def get_wedding_portraits(limit=10):
    url = "https://your-domain.com/api.php"
    params = {
        'action': 'ai_get_featured_images',
        'category': 'wedding',
        'type': 'portrait',
        'limit': limit,
        'metadata': 'true',
        'priority': 'desc'
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    if data['success']:
        return data['images']
    else:
        raise Exception(f"API Error: {data['error']}")

# Usage
wedding_images = get_wedding_portraits(5)
for img in wedding_images:
    print(f"Image: {img['metadata']['filename']}")
    print(f"Size: {img['metadata']['width']}x{img['metadata']['height']}")
    print(f"URL: {img['thumbnail_url']}")
```

### JavaScript Example:

```javascript
// Lấy categories và featured images
async function getContentForAI() {
    const baseUrl = 'https://your-domain.com/api.php';
    
    // Get available categories
    const categoriesResponse = await fetch(`${baseUrl}?action=ai_get_categories&stats=true`);
    const categoriesData = await categoriesResponse.json();
    
    // Get featured images from most popular category
    const topCategory = categoriesData.categories
        .sort((a, b) => b.featured_images.total - a.featured_images.total)[0];
    
    const imagesResponse = await fetch(
        `${baseUrl}?action=ai_get_featured_images&category=${topCategory.category_slug}&limit=10&metadata=true`
    );
    const imagesData = await imagesResponse.json();
    
    return {
        category: topCategory,
        images: imagesData.images
    };
}
```

## 📝 Notes

1. **Image URLs:** Thumbnail và full image URLs được tự động generate và sẵn sàng sử dụng
2. **Category Inheritance:** Hệ thống tự động detect category inheritance từ parent folders
3. **File Validation:** API chỉ trả về ảnh exist và accessible
4. **Performance:** Sử dụng SQL optimization và file caching để đảm bảo response time nhanh

---

**🎯 Ready for Production:** API đã sẵn sàng cho AI Content Agent integration với full error handling và performance optimization. 