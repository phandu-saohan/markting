-- ================================================================
-- Chạy script này trong Supabase Studio → SQL Editor
-- Sau khi Supabase đã deploy thành công
-- ================================================================

-- 1. Tạo database và user cho Marketing App
CREATE DATABASE marketing_db;
CREATE USER marketing_user WITH PASSWORD 'change_this_strong_password';
GRANT ALL PRIVILEGES ON DATABASE marketing_db TO marketing_user;

-- 2. Kết nối vào marketing_db
\connect marketing_db

-- 3. Grant quyền cho user
GRANT CREATE ON SCHEMA public TO marketing_user;

-- 4. Chạy toàn bộ schema (copy từ infrastructure/postgres/init.sql)
-- Hoặc paste trực tiếp nội dung init.sql vào đây

-- Verify
SELECT current_database(), current_user;
