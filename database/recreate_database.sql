-- Drop existing database if exists
DROP DATABASE IF EXISTS photo_gallery;

-- Create new database
CREATE DATABASE photo_gallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE photo_gallery;

-- Create files table
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    type TEXT NOT NULL,
    format TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Create culling table
CREATE TABLE culling (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    file_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    designer_id INTEGER NOT NULL,
    admin_reviewed BOOLEAN DEFAULT 0,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id)
) ENGINE=InnoDB;

-- Create users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB;

-- Create cache_jobs table
CREATE TABLE cache_jobs (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    file_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    result TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id)
) ENGINE=InnoDB;

-- Create zip_jobs table
CREATE TABLE zip_jobs (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    folder_path TEXT NOT NULL,
    status TEXT NOT NULL,
    total_files INTEGER,
    processed_files INTEGER,
    current_file TEXT,
    started_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    result TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Add initial admin user
INSERT INTO users (username, password_hash, role) 
SELECT 'admin', '$2y$10$.lWLpmOjLY6pun9c62z9iOo9/in5RA/UQKTMd513rR2QhlB34Vvu2', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
