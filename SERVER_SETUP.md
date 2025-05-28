# Server Setup Guide - Photo Gallery

## 🚀 Quick Setup (Recommended)

### Step 1: Prepare Server Environment
```bash
# Ensure PHP >= 7.4 with required extensions
php -v
php -m | grep -E "(pdo_mysql|gd|zip|mbstring|fileinfo)"

# Ensure MySQL is running
mysql --version
```

### Step 2: Clone/Pull Code
```bash
# Clone repository or pull latest changes
git clone <repository-url> /path/to/webroot
# OR
cd /path/to/webroot && git pull origin main
```

### Step 3: Configure Database Connection
```bash
# Copy and edit config file
cp config.example.php config.php
nano config.php
```

**Edit `config.php` with your server details:**
```php
<?php
return [
    // Database Configuration
    'type' => 'mysql',
    'host' => 'localhost',        // Your MySQL host
    'name' => 'photo_gallery',    // Database name
    'user' => 'your_db_user',     // MySQL username
    'pass' => 'your_db_password', // MySQL password
    
    // Admin User (will be auto-created)
    'admin_user' => 'admin',      // Admin username
    'admin_pass' => 'your_secure_password', // Change this!
    
    // Image Sources
    'image_sources' => [
        'main' => [
            'path' => '/path/to/your/images',
            'name' => 'Main Gallery'
        ]
    ],
    
    // Other settings...
];
```

### Step 4: Create Database (if not exists)
```sql
-- Connect to MySQL
mysql -u root -p

-- Create database
CREATE DATABASE photo_gallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user (optional)
CREATE USER 'gallery_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON photo_gallery.* TO 'gallery_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 5: Auto-Setup Database & Admin User
```bash
# Simply access any page - database and admin user will be created automatically
curl http://your-domain.com/index.php
# OR visit in browser: http://your-domain.com
```

**That's it! 🎉**

The system will automatically:
- ✅ Create all required database tables
- ✅ Create admin user with credentials from `config.php`
- ✅ Set up cache directories
- ✅ Log setup details to `logs/setup.log`

---

## 📋 Manual Setup (Alternative)

If you prefer manual setup or need troubleshooting:

### Option 1: Use Setup Script
```bash
# Run the setup script
php setup_database.php
```

### Option 2: Manual SQL
```bash
# Import database schema
mysql -u your_user -p photo_gallery < database/create_tables.sql

# Create admin user manually
mysql -u your_user -p photo_gallery
```

```sql
INSERT INTO users (username, password, role) 
VALUES ('admin', '$2y$10$example_hash_here', 'admin');
```

---

## 🔧 Post-Setup Configuration

### 1. Verify Setup
- **Check logs:** `tail -f logs/setup.log`
- **Test login:** Visit `/login.php` with your admin credentials
- **Check admin panel:** Visit `/admin.php`

### 2. Set Up Workers (Optional)
```bash
# For background processing (thumbnails, ZIP generation)
# Windows:
setup_workers_schedule.bat

# Linux/Mac:
chmod +x setup_workers_schedule.sh
./setup_workers_schedule.sh
```

### 3. Configure Web Server

#### Apache (.htaccess)
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php [QSA,L]

# Security
<Files "config.php">
    Require all denied
</Files>
```

#### Nginx
```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location ~ /config\.php$ {
    deny all;
}
```

---

## 🔐 Security Checklist

- [ ] Change default admin password in `config.php`
- [ ] Set strong database password
- [ ] Ensure `config.php` is not publicly accessible
- [ ] Set proper file permissions (755 for directories, 644 for files)
- [ ] Enable HTTPS in production
- [ ] Configure firewall rules

---

## 📁 Directory Permissions

```bash
# Set correct permissions
chmod 755 /path/to/webroot
chmod 644 /path/to/webroot/*.php
chmod 755 /path/to/webroot/cache
chmod 755 /path/to/webroot/logs
chmod 644 /path/to/webroot/config.php
```

---

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check MySQL service
systemctl status mysql

# Test connection
mysql -h localhost -u your_user -p

# Check PHP PDO extension
php -m | grep pdo_mysql
```

### Permission Issues
```bash
# Check web server user
ps aux | grep apache
# OR
ps aux | grep nginx

# Set ownership
chown -R www-data:www-data /path/to/webroot
```

### Auto-Setup Not Working
```bash
# Check error logs
tail -f /var/log/apache2/error.log
tail -f logs/php_error.log

# Manual database setup
php setup_database.php
```

---

## 📞 Support

If you encounter issues:

1. **Check logs:** `logs/setup.log`, `logs/php_error.log`
2. **Verify config:** Ensure `config.php` has correct database credentials
3. **Test manually:** Run `php setup_database.php`
4. **Check permissions:** Ensure web server can read/write necessary directories

---

## 🔄 Updates

When updating the application:

```bash
# Pull latest changes
git pull origin main

# Database will auto-update on next page load
# OR run manually:
php setup_database.php
```

The system automatically handles database schema updates and migrations. 