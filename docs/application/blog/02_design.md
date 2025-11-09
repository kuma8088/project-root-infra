# ブログシステム設計書

**プロジェクト名**: Xserverブログ移植プロジェクト
**対象環境**: Dell WorkStation (Rocky Linux 9.6) + Docker Compose
**作成日**: 2025-11-08
**バージョン**: 1.0

---

## 📋 目次

1. [システムアーキテクチャ](#1-システムアーキテクチャ)
2. [Docker Compose設計](#2-docker-compose設計)
3. [Nginx設計](#3-nginx設計)
4. [WordPress設計](#4-wordpress設計)
5. [MariaDB設計](#5-mariadb設計)
6. [Cloudflare Tunnel設計](#6-cloudflare-tunnel設計)
7. [Admin Panel設計](#7-admin-panel設計)
8. [ストレージ設計](#8-ストレージ設計)
9. [バックアップ設計](#9-バックアップ設計)
10. [セキュリティ設計](#10-セキュリティ設計)
11. [監視・ログ設計](#11-監視ログ設計)
12. [パフォーマンス設計](#12-パフォーマンス設計)

---

## 1. システムアーキテクチャ

### 1.1 全体構成図

```
[インターネット]
       ↓
[Cloudflare Edge (DDoS保護/CDN)]
       ↓
[Cloudflare Tunnel (認証済み暗号化接続)]
       ↓
┌─────────────────────────────────────────────────────────┐
│ Dell WorkStation (Rocky Linux 9.6)                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Docker Network: blog_network (172.21.0.0/24)       │ │
│  │                                                     │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │ │
│  │  │ cloudflared │→│    nginx     │→│wordpress │  │ │
│  │  │ 172.21.0.10 │  │ 172.21.0.20  │  │172.21.0.30│ │
│  │  └─────────────┘  └──────────────┘  └─────┬────┘  │ │
│  │                                            ↓       │ │
│  │                    ┌──────────────┐  ┌──────────┐  │ │
│  │                    │ admin-panel  │  │ mariadb  │  │ │
│  │                    │ 172.21.0.40  │  │172.21.0.50│ │
│  │                    └──────────────┘  └──────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Storage:                                                │
│  - /var/lib/docker/volumes/ (SSD): DB, logs              │
│  - /mnt/backup-hdd/blog/    (HDD): WordPress files       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 通信フロー

**外部アクセス**:
```
User → Cloudflare Edge → Tunnel → nginx:80 → wordpress:9000 (PHP-FPM)
                                              ↓
                                         mariadb:3306
```

**内部管理**:
```
User → admin-panel:5002 → Docker API (コンテナ管理)
                        → MariaDB:3306 (DB管理)
                        → Link to usermgmt:5001 (メール管理)
```

### 1.3 コンテナ構成

| コンテナ名 | イメージ | 役割 | ポート | IPアドレス |
|-----------|---------|------|--------|-----------|
| blog-cloudflared | cloudflare/cloudflared:latest | Cloudflare Tunnel | - | 172.21.0.10 |
| blog-nginx | nginx:1.24-alpine | リバースプロキシ/仮想ホスト | 8080:80 | 172.21.0.20 |
| blog-wordpress | wordpress:php8.3-fpm-alpine | PHP-FPM (8.3.21) | 9000:9000 | 172.21.0.30 |
| blog-admin | (Flask/Node.js) | 管理画面 | 5002:5002 | 172.21.0.40 |
| blog-mariadb | mariadb:10.11 | データベース | 3307:3306 | 172.21.0.50 |

**ポート設計の理由**:
- nginx: 8080 (Mailserverとの競合回避、内部のみアクセス)
- mariadb: 3307 (Mailserver: 3306との競合回避)
- admin-panel: 5002 (Mailserver usermgmt: 5001との競合回避)

### 1.4 複数WordPress収容アーキテクチャ

**ディレクトリ構造** (`/var/www/html/`):
```
/var/www/html/
├── kuma8088/                    # 独立WordPress #1
│   ├── index.php
│   ├── wp-config.php            → DB: blog_db_kuma8088
│   ├── wp-content/
│   │   ├── uploads/             # メディアファイル
│   │   ├── plugins/
│   │   └── themes/
│   └── ...
├── courses-kuma8088/            # 独立WordPress #2
│   ├── wp-config.php            → DB: blog_db_courses_kuma8088
│   └── ...
├── fx-trader-life/              # 独立WordPress #3
│   ├── wp-config.php            → DB: blog_db_fx_trader_life
│   └── ...
├── courses-fx-trader-life/      # 独立WordPress #4
│   ├── wp-config.php            → DB: blog_db_courses_fx_trader_life
│   └── ...
├── toyota-phv/                  # 独立WordPress #5（検討中）
│   ├── wp-config.php            → DB: blog_db_toyota_phv
│   └── ...
├── webmakeprofit/               # 独立WordPress #6（検討中）
│   ├── wp-config.php            → DB: blog_db_webmakeprofit
│   └── ...
└── webmakesprofit/              # 独立WordPress #7（検討中）
    ├── wp-config.php            → DB: blog_db_webmakesprofit
    └── ...
```

**特徴**:
- ✅ 各サイト完全独立（プラグイン・テーマ競合なし）
- ✅ 専用データベース（サイト障害時の影響範囲限定）
- ✅ サイト別バックアップ/リストア可能
- ✅ WordPressマルチサイト機能は使用しない

---

## 2. Docker Compose設計

### 2.1 docker-compose.yml

**ファイルパス**: `/opt/onprem-infra-system/project-root-infra/services/blog/docker-compose.yml`

```yaml
# Blog system stack for migrated Xserver sites
# Environment variables from services/blog/.env

networks:
  blog_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/24

volumes:
  # SSD volumes (performance)
  blog_db_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/db
  blog_logs:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/logs

  # HDD volumes (capacity)
  blog_wordpress_sites:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/backup-hdd/blog/sites
  blog_backups:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/backup-hdd/blog/backups

services:
  # Cloudflare Tunnel
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: blog-cloudflared
    hostname: cloudflared
    restart: always
    networks:
      blog_network:
        ipv4_address: 172.21.0.10
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - nginx

  # Nginx (reverse proxy + virtual hosts)
  nginx:
    image: nginx:1.24-alpine
    container_name: blog-nginx
    hostname: nginx
    restart: always
    networks:
      blog_network:
        ipv4_address: 172.21.0.20
    ports:
      - "8080:80"  # Internal access only
    volumes:
      - ./config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./config/nginx/conf.d:/etc/nginx/conf.d:ro
      - blog_wordpress_sites:/var/www/html:ro
      - blog_logs:/var/log/nginx
    depends_on:
      - wordpress
    cpus: 1.0
    mem_limit: 512M
    mem_reservation: 256M

  # WordPress (PHP-FPM)
  wordpress:
    image: wordpress:php8.2-fpm-alpine
    container_name: blog-wordpress
    hostname: wordpress
    restart: always
    networks:
      blog_network:
        ipv4_address: 172.21.0.30
    environment:
      - TZ=${TZ}
      # DB credentials (shared connection, multiple databases)
      - WORDPRESS_DB_HOST=mariadb:3306
      - WORDPRESS_DB_USER=${MYSQL_USER}
      - WORDPRESS_DB_PASSWORD=${MYSQL_PASSWORD}
    volumes:
      - blog_wordpress_sites:/var/www/html
      - ./config/php/php.ini:/usr/local/etc/php/conf.d/custom.ini:ro
      - blog_logs:/var/log/php
    depends_on:
      - mariadb
    cpus: 3.0
    mem_limit: 4G
    mem_reservation: 2G

  # MariaDB (multiple independent databases)
  mariadb:
    image: mariadb:10.11
    container_name: blog-mariadb
    hostname: mariadb
    restart: always
    networks:
      blog_network:
        ipv4_address: 172.21.0.50
    ports:
      - "3307:3306"  # Avoid conflict with Mailserver (3306)
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
      - TZ=${TZ}
    volumes:
      - blog_db_data:/var/lib/mysql
      - ./config/mariadb/init:/docker-entrypoint-initdb.d:ro
      - ./config/mariadb/my.cnf:/etc/mysql/conf.d/custom.cnf:ro
      - blog_logs:/var/log/mysql
    command: >
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --max_connections=200
      --innodb_buffer_pool_size=2G
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 30s
      timeout: 10s
      retries: 3
    cpus: 2.0
    mem_limit: 3G
    mem_reservation: 2G

  # Admin Panel (Flask-based web management)
  admin-panel:
    build:
      context: ./admin-panel
      dockerfile: Dockerfile
    container_name: blog-admin
    hostname: admin-panel
    restart: always
    networks:
      blog_network:
        ipv4_address: 172.21.0.40
    ports:
      - "5002:5002"  # Avoid conflict with usermgmt (5001)
    environment:
      - FLASK_ENV=production
      - SECRET_KEY=${ADMIN_SECRET_KEY}
      - DB_HOST=mariadb
      - DB_PORT=3306
      - DB_USER=${MYSQL_USER}
      - DB_PASSWORD=${MYSQL_PASSWORD}
      - USERMGMT_URL=http://172.20.0.70:5001  # Link to Mailserver usermgmt
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Docker API access (rw for start/stop/restart)
      - ./admin-panel:/app
      - blog_logs:/var/log/admin-panel
    depends_on:
      - mariadb
    cpus: 0.5
    mem_limit: 512M
    mem_reservation: 256M
```

### 2.2 環境変数 (.env)

**ファイルパス**: `/opt/onprem-infra-system/project-root-infra/services/blog/.env`

```bash
# Timezone
TZ=Asia/Tokyo

# MariaDB
MYSQL_ROOT_PASSWORD=<strong-password>
MYSQL_USER=blog_user
MYSQL_PASSWORD=<strong-password>

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>

# Admin Panel
ADMIN_SECRET_KEY=<flask-secret-key>

# Blog Sites (for backup/restore scripts)
# Space-separated list of site directory names
# Update after Phase A-0 investigation based on confirmed migration sites
BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life toyota-phv webmakeprofit webmakesprofit"
```

### 2.3 環境変数テンプレート (.env.example)

**ファイルパス**: `/opt/onprem-infra-system/project-root-infra/services/blog/.env.example`

```bash
# Timezone
TZ=Asia/Tokyo

# MariaDB
MYSQL_ROOT_PASSWORD=CHANGE_ME_STRONG_PASSWORD
MYSQL_USER=blog_user
MYSQL_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=CHANGE_ME_TUNNEL_TOKEN

# Admin Panel
ADMIN_SECRET_KEY=CHANGE_ME_FLASK_SECRET_KEY

# Blog Sites (for backup/restore scripts)
# Space-separated list of site directory names
# Update after Phase A-0 investigation based on confirmed migration sites
# Example: "kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life"
BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life toyota-phv webmakeprofit webmakesprofit"
```

---

## 3. Nginx設計

### 3.1 nginx.conf (メイン設定)

**ファイルパス**: `services/blog/config/nginx/nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;

    # File upload limits
    client_max_body_size 64M;
    client_body_buffer_size 128k;

    # Timeouts
    client_body_timeout 12;
    client_header_timeout 12;
    send_timeout 10;

    # Buffer sizes
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;

    # Virtual host configurations
    include /etc/nginx/conf.d/*.conf;
}
```

### 3.2 仮想ホスト設定 (kuma8088.com)

**ファイルパス**: `services/blog/config/nginx/conf.d/kuma8088.com.conf`

```nginx
server {
    listen 80;
    server_name kuma8088.com www.kuma8088.com;

    root /var/www/html/kuma8088;
    index index.php index.html;

    access_log /var/log/nginx/kuma8088-access.log;
    error_log /var/log/nginx/kuma8088-error.log;

    # WordPress permalinks
    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    # PHP-FPM
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass wordpress:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_buffer_size 128k;
        fastcgi_buffers 4 256k;
        fastcgi_busy_buffers_size 256k;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }

    # Deny access to wp-config.php
    location ~* wp-config.php {
        deny all;
    }
}
```

### 3.3 仮想ホスト設定 (courses.kuma8088.com)

**ファイルパス**: `services/blog/config/nginx/conf.d/courses.kuma8088.com.conf`

```nginx
server {
    listen 80;
    server_name courses.kuma8088.com;

    root /var/www/html/courses-kuma8088;
    index index.php index.html;

    access_log /var/log/nginx/courses-kuma8088-access.log;
    error_log /var/log/nginx/courses-kuma8088-error.log;

    # WordPress permalinks
    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    # PHP-FPM
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass wordpress:9000;
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_buffer_size 128k;
        fastcgi_buffers 4 256k;
        fastcgi_busy_buffers_size 256k;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Static file caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }

    # Deny access to wp-config.php
    location ~* wp-config.php {
        deny all;
    }
}
```

**注**: 残り5サイト（fx-trader-life.com, courses.fx-trader-life.com, toyota-phv.jp, webmakeprofit.org, webmakesprofit.com）も同様のパターンで設定ファイルを作成

---

## 4. WordPress設計

### 4.1 PHP設定 (php.ini)

**ファイルパス**: `services/blog/config/php/php.ini`

```ini
; PHP custom settings for WordPress

; Memory
memory_limit = 256M
max_execution_time = 300
max_input_time = 300

; File uploads
upload_max_filesize = 64M
post_max_size = 64M

; Error reporting
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; Timezone
date.timezone = Asia/Tokyo

; Session
session.cookie_httponly = 1
session.cookie_secure = 1
session.use_strict_mode = 1

; Performance
opcache.enable = 1
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 8
opcache.max_accelerated_files = 10000
opcache.revalidate_freq = 2
opcache.fast_shutdown = 1
```

### 4.2 wp-config.php テンプレート

各サイト用の `wp-config.php` は移行時に生成。テンプレート例:

```php
<?php
/**
 * WordPress設定 - kuma8088.com
 *
 * @package WordPress
 */

// ** Database settings ** //
define( 'DB_NAME', 'blog_db_kuma8088' );
define( 'DB_USER', getenv('WORDPRESS_DB_USER') );
define( 'DB_PASSWORD', getenv('WORDPRESS_DB_PASSWORD') );
define( 'DB_HOST', getenv('WORDPRESS_DB_HOST') );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', 'utf8mb4_unicode_ci' );

// ** Authentication Keys ** //
// 各サイト固有のキーを設定（https://api.wordpress.org/secret-key/1.1/salt/）
define('AUTH_KEY',         'put your unique phrase here');
define('SECURE_AUTH_KEY',  'put your unique phrase here');
define('LOGGED_IN_KEY',    'put your unique phrase here');
define('NONCE_KEY',        'put your unique phrase here');
define('AUTH_SALT',        'put your unique phrase here');
define('SECURE_AUTH_SALT', 'put your unique phrase here');
define('LOGGED_IN_SALT',   'put your unique phrase here');
define('NONCE_SALT',       'put your unique phrase here');

// ** Table prefix ** //
$table_prefix = 'wp_';

// ** URL settings ** //
define( 'WP_HOME', 'https://kuma8088.com' );
define( 'WP_SITEURL', 'https://kuma8088.com' );

// ** Security ** //
define( 'DISALLOW_FILE_EDIT', true );
define( 'FORCE_SSL_ADMIN', true );

// ** Performance ** //
define( 'WP_MEMORY_LIMIT', '256M' );
define( 'WP_MAX_MEMORY_LIMIT', '512M' );

// ** Debugging ** //
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_LOG', false );
define( 'WP_DEBUG_DISPLAY', false );

// ** That's all, stop editing! ** //
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
```

---

## 5. MariaDB設計

### 5.1 初期化スクリプト

**ファイルパス**: `services/blog/config/mariadb/init/01-create-databases.sql`

```sql
-- Blog system database initialization
-- Creates independent databases for each WordPress site

-- Database for kuma8088.com
CREATE DATABASE IF NOT EXISTS blog_db_kuma8088
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for courses.kuma8088.com
CREATE DATABASE IF NOT EXISTS blog_db_courses_kuma8088
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for fx-trader-life.com
CREATE DATABASE IF NOT EXISTS blog_db_fx_trader_life
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for courses.fx-trader-life.com
CREATE DATABASE IF NOT EXISTS blog_db_courses_fx_trader_life
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for toyota-phv.jp (if migrated)
CREATE DATABASE IF NOT EXISTS blog_db_toyota_phv
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for webmakeprofit.org (if migrated)
CREATE DATABASE IF NOT EXISTS blog_db_webmakeprofit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for webmakesprofit.com (if migrated)
CREATE DATABASE IF NOT EXISTS blog_db_webmakesprofit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant privileges
GRANT ALL PRIVILEGES ON blog_db_kuma8088.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_courses_kuma8088.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_fx_trader_life.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_courses_fx_trader_life.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_toyota_phv.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_webmakeprofit.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_webmakesprofit.* TO 'blog_user'@'%';

FLUSH PRIVILEGES;
```

### 5.2 MariaDB設定 (my.cnf)

**ファイルパス**: `services/blog/config/mariadb/my.cnf`

```ini
[mysqld]
# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# Performance
max_connections = 200
innodb_buffer_pool_size = 2G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# Query cache (disabled for WordPress)
query_cache_type = 0
query_cache_size = 0

# Temp tables
tmp_table_size = 64M
max_heap_table_size = 64M

# Logging
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Binlog (disabled for single-instance)
skip-log-bin

[client]
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4
```

### 5.3 データベース命名規則

| サイト | データベース名 | テーブルプレフィックス |
|--------|--------------|-------------------|
| kuma8088.com | blog_db_kuma8088 | wp_ |
| courses.kuma8088.com | blog_db_courses_kuma8088 | wp_ |
| fx-trader-life.com | blog_db_fx_trader_life | wp_ |
| courses.fx-trader-life.com | blog_db_courses_fx_trader_life | wp_ |
| toyota-phv.jp | blog_db_toyota_phv | wp_ |
| webmakeprofit.org | blog_db_webmakeprofit | wp_ |
| webmakesprofit.com | blog_db_webmakesprofit | wp_ |

---

## 6. Cloudflare Tunnel設計

### 6.1 Tunnel設定

**セットアップ手順**:
1. Cloudflare Zero Trustでトンネル作成
2. トンネルトークン取得
3. 各ドメインをトンネルにルーティング

**ルーティング設定** (Cloudflare Dashboard):
```
kuma8088.com → http://172.21.0.20:80
courses.kuma8088.com → http://172.21.0.20:80
fx-trader-life.com → http://172.21.0.20:80
courses.fx-trader-life.com → http://172.21.0.20:80
toyota-phv.jp → http://172.21.0.20:80
webmakeprofit.org → http://172.21.0.20:80
webmakesprofit.com → http://172.21.0.20:80
```

### 6.2 DNS設定 (Cloudflare)

各ドメインのDNS設定:
```
Type: CNAME
Name: @ (or subdomain)
Target: <tunnel-id>.cfargotunnel.com
Proxy: Enabled (orange cloud)
TTL: Auto
```

### 6.3 SSL/TLS設定

**Cloudflare SSL/TLS Mode**: Full (strict)推奨

**理由**:
- Cloudflare Edge → Tunnel間: 自動暗号化
- Tunnel → nginx間: 内部ネットワーク（Docker bridge）
- 証明書管理不要（Cloudflareが自動管理）

---

## 7. Admin Panel設計

### 7.1 機能要件

**主要機能**:
1. ✅ **コンテナ管理**: Docker API経由で起動/停止/再起動
2. ✅ **WordPress管理**: サイト一覧、ヘルスチェック、リソース使用状況
3. ✅ **データベース管理**: DB一覧、容量確認、バックアップ実行
4. ✅ **ログ閲覧**: nginx/PHP/MariaDBログの表示・検索
5. ✅ **メール管理統合**: 既存usermgmt (port 5001) へのリンク
6. ✅ **統合ダッシュボード**: Blog + Mailserverのステータス一覧

### 7.2 技術スタック

**フレームワーク**: Flask (Python 3.11+)

**理由**:
- 既存usermgmt (Flask) との統合容易
- Docker API連携が簡単 (docker-py)
- 軽量・高速
- MySQL/MariaDB操作が容易 (mysql-connector-python)

### 7.3 ディレクトリ構造

```
services/blog/admin-panel/
├── Dockerfile
├── requirements.txt
├── app.py                  # Flask application
├── config.py               # Configuration
├── templates/
│   ├── base.html
│   ├── dashboard.html      # 統合ダッシュボード
│   ├── containers.html     # コンテナ管理
│   ├── wordpress.html      # WordPress管理
│   ├── database.html       # DB管理
│   └── logs.html           # ログ閲覧
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
└── utils/
    ├── docker_manager.py   # Docker API wrapper
    ├── db_manager.py       # MariaDB operations
    └── log_parser.py       # Log parsing utilities
```

### 7.4 Dockerfile

**ファイルパス**: `services/blog/admin-panel/Dockerfile`

```dockerfile
FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache gcc musl-dev linux-headers

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create log directory
RUN mkdir -p /var/log/admin-panel

# Expose port
EXPOSE 5002

# Run application
CMD ["python", "app.py"]
```

### 7.5 requirements.txt

```
Flask==3.0.0
docker==7.0.0
mysql-connector-python==8.2.0
gunicorn==21.2.0
```

### 7.6 主要機能の実装方針

**Docker API操作** (`utils/docker_manager.py`):
```python
import docker

class DockerManager:
    def __init__(self):
        self.client = docker.from_env()

    def list_containers(self, project='blog'):
        return self.client.containers.list(
            filters={'label': f'com.docker.compose.project={project}'}
        )

    def restart_container(self, container_name):
        container = self.client.containers.get(container_name)
        container.restart()

    def get_container_stats(self, container_name):
        container = self.client.containers.get(container_name)
        return container.stats(stream=False)
```

**MariaDB操作** (`utils/db_manager.py`):
```python
import mysql.connector

class DBManager:
    def __init__(self, host, port, user, password):
        self.config = {
            'host': host,
            'port': port,
            'user': user,
            'password': password
        }

    def list_databases(self):
        conn = mysql.connector.connect(**self.config)
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES LIKE 'blog_db_%'")
        databases = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return databases

    def get_database_size(self, db_name):
        conn = mysql.connector.connect(**self.config)
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT
                SUM(data_length + index_length) / 1024 / 1024 AS size_mb
            FROM information_schema.TABLES
            WHERE table_schema = '{db_name}'
        """)
        size = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        return size
```

### 7.7 WordPress管理画面シングルサインオン設計 🆕

**目的**: 管理画面ポータルから各WordPressサイトの管理画面へシームレスにアクセス

#### 7.7.1 実装方式の選定

| 方式 | 技術 | セキュリティ | 実装難易度 | 推奨度 |
|------|------|------------|----------|--------|
| **Application Passwords** | WordPress 5.6+ 標準機能 | 🟢 高 | 🟡 中 | ✅ 推奨 |
| **JWT認証** | プラグイン (JWT Authentication) | 🟢 高 | 🟡 中 | 🟡 代替案 |
| **Cookie共有** | セッション共有 | 🔴 低 | 🟢 低 | ❌ 非推奨 |

**採用方式**: Application Passwords

#### 7.7.2 アーキテクチャ

```
[管理画面ポータル (Flask)]
         ↓
   Application Password認証
         ↓
[WordPress REST API] → 認証セッション生成
         ↓
[WordPress wp-admin] → ダッシュボード表示
```

**通信フロー**:
```
1. ユーザーがポータルで「kuma8088.com 管理画面」をクリック
2. Flask: POST /api/wordpress/login/kuma8088
3. Flask → WordPress REST API: Basic認証 (username + Application Password)
4. WordPress: 認証成功 → セッションCookie発行
5. Flask: WordPressダッシュボードURLへリダイレクト (Cookieを保持)
6. WordPress: ダッシュボード表示
```

#### 7.7.3 実装詳細

**Application Password設定** (`utils/wordpress_auth.py`):
```python
import requests
from base64 import b64encode

class WordPressAuth:
    def __init__(self, site_config):
        """
        site_config = {
            'url': 'https://kuma8088.com',
            'username': 'admin',
            'app_password': 'xxxx yyyy zzzz aaaa bbbb cccc'
        }
        """
        self.url = site_config['url']
        self.username = site_config['username']
        self.app_password = site_config['app_password']

    def get_auth_headers(self):
        """Basic認証ヘッダー生成"""
        credentials = f"{self.username}:{self.app_password}"
        token = b64encode(credentials.encode()).decode()
        return {'Authorization': f'Basic {token}'}

    def authenticate(self):
        """WordPress REST APIで認証"""
        headers = self.get_auth_headers()
        response = requests.get(
            f"{self.url}/wp-json/wp/v2/users/me",
            headers=headers
        )
        return response.status_code == 200

    def get_admin_url(self):
        """WordPress管理画面URLを取得"""
        return f"{self.url}/wp-admin/"
```

**Flask エンドポイント** (`app.py`):
```python
from flask import Flask, redirect, session, render_template
from utils.wordpress_auth import WordPressAuth
import os

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY')

# 各サイトの設定（環境変数から読み込み）
WORDPRESS_SITES = {
    'kuma8088': {
        'url': 'https://kuma8088.com',
        'username': os.getenv('WP_KUMA8088_USERNAME'),
        'app_password': os.getenv('WP_KUMA8088_APP_PASSWORD')
    },
    'fx-trader-life': {
        'url': 'https://fx-trader-life.com',
        'username': os.getenv('WP_FX_USERNAME'),
        'app_password': os.getenv('WP_FX_APP_PASSWORD')
    },
    # 他のサイトも同様に設定
}

@app.route('/wordpress/<site_id>/admin')
def wordpress_admin(site_id):
    """WordPress管理画面へのシングルサインオン"""
    if site_id not in WORDPRESS_SITES:
        return "Site not found", 404

    config = WORDPRESS_SITES[site_id]
    wp_auth = WordPressAuth(config)

    # 認証確認
    if not wp_auth.authenticate():
        return "Authentication failed", 401

    # WordPress管理画面へリダイレクト
    # 注: ブラウザで新規タブ/iframe表示
    admin_url = wp_auth.get_admin_url()
    return render_template('wordpress_redirect.html', admin_url=admin_url)
```

**リダイレクトテンプレート** (`templates/wordpress_redirect.html`):
```html
<!DOCTYPE html>
<html>
<head>
    <title>WordPress Admin</title>
</head>
<body>
    <!-- オプション1: 新規タブで開く -->
    <script>
        window.open('{{ admin_url }}', '_blank');
        window.location.href = '/dashboard';
    </script>

    <!-- オプション2: iframe埋め込み -->
    <!-- <iframe src="{{ admin_url }}" width="100%" height="800px"></iframe> -->

    <!-- オプション3: 同一タブでリダイレクト -->
    <!-- <script>window.location.href = '{{ admin_url }}';</script> -->
</body>
</html>
```

#### 7.7.4 環境変数設定

**ファイルパス**: `services/blog/admin-panel/.env` (Git管理外)

```bash
# Flask設定
FLASK_SECRET_KEY=<ランダム生成>

# WordPress Application Passwords
WP_KUMA8088_USERNAME=admin
WP_KUMA8088_APP_PASSWORD=xxxx yyyy zzzz aaaa bbbb cccc

WP_FX_USERNAME=admin
WP_FX_APP_PASSWORD=yyyy zzzz aaaa bbbb cccc dddd

WP_TOYOTA_USERNAME=admin
WP_TOYOTA_APP_PASSWORD=zzzz aaaa bbbb cccc dddd eeee

# 以下、各サイト分追加
```

#### 7.7.5 Application Password生成手順

**各WordPressサイトで実施**:

1. WordPress管理画面へログイン
2. `ユーザー` → `プロフィール` → `アプリケーションパスワード`
3. 新しいアプリケーションパスワード名: `Blog Admin Panel`
4. `新しいアプリケーションパスワードを追加` をクリック
5. 生成されたパスワード（24文字、スペース区切り）をコピー
6. `.env` ファイルに `WP_<SITE>_APP_PASSWORD` として保存

**注意事項**:
- Application Passwordは一度しか表示されないため、即座にコピー
- ユーザー名は通常 `admin` だが、各サイトで確認
- パスワードは通常ログインパスワードとは異なる専用トークン

#### 7.7.6 セキュリティ対策

| 対策 | 実装 | 理由 |
|------|------|------|
| **HTTPS通信のみ** | Cloudflare Tunnel | 暗号化通信でトークン保護 |
| **Application Password** | WordPress標準機能 | 通常パスワードと分離、取り消し可能 |
| **環境変数管理** | `.env` (Git管理外) | 平文保存回避 |
| **トークンローテーション** | 6ヶ月ごと | 漏洩リスク低減 |
| **IP制限** | Nginx設定（任意） | 管理画面アクセスを特定IPのみに制限 |

#### 7.7.7 運用手順

**定期トークンローテーション**（6ヶ月ごと）:
```bash
# 1. 各WordPressで新しいApplication Passwordを生成
# 2. .envファイル更新
vi services/blog/admin-panel/.env

# 3. Admin Panelコンテナ再起動
docker compose restart blog-admin

# 4. 動作確認
curl -I http://localhost:5002/wordpress/kuma8088/admin

# 5. 古いApplication Passwordを削除（WordPress管理画面）
```

**トラブルシューティング**:
```bash
# 認証失敗時の確認
docker compose logs blog-admin | grep -i "auth"

# WordPress REST API動作確認
curl -u "admin:xxxx yyyy zzzz" https://kuma8088.com/wp-json/wp/v2/users/me

# Application Password確認（WordPress管理画面）
# ユーザー → プロフィール → アプリケーションパスワード
```

#### 7.7.8 UI設計

**WordPress管理セクション** (`templates/wordpress.html`):
```html
<div class="wordpress-sites">
    <h2>WordPress サイト管理</h2>

    <table class="table">
        <thead>
            <tr>
                <th>サイト</th>
                <th>URL</th>
                <th>ステータス</th>
                <th>アクション</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>kuma8088.com</td>
                <td>https://kuma8088.com</td>
                <td><span class="badge bg-success">稼働中</span></td>
                <td>
                    <a href="/wordpress/kuma8088/admin" target="_blank"
                       class="btn btn-primary btn-sm">
                        <i class="bi bi-box-arrow-up-right"></i> 管理画面
                    </a>
                </td>
            </tr>
            <!-- 他のサイトも同様 -->
        </tbody>
    </table>
</div>
```

---

## 8. ストレージ設計

### 8.1 ストレージ配置

| データ種別 | ホストパス | コンテナパス | デバイス | サイズ | 理由 |
|-----------|----------|------------|---------|--------|------|
| **MariaDB data** | `./data/db` | `/var/lib/mysql` | SSD | 40GB | 高速DB性能 |
| **Nginx logs** | `./data/logs/nginx` | `/var/log/nginx` | SSD | 5GB | 高速ログ書込 |
| **PHP logs** | `./data/logs/php` | `/var/log/php` | SSD | 2GB | 高速ログ書込 |
| **MariaDB logs** | `./data/logs/mysql` | `/var/log/mysql` | SSD | 3GB | 高速ログ書込 |
| **WordPress sites** | `/mnt/backup-hdd/blog/sites` | `/var/www/html` | HDD | 50GB | 大容量メディア |
| **Backups** | `/mnt/backup-hdd/blog/backups` | - | HDD | 100GB | 長期保存 |

### 8.2 ディレクトリ構造 (ホスト側)

```
/opt/onprem-infra-system/project-root-infra/services/blog/
├── docker-compose.yml
├── .env
├── .env.example
├── config/
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── conf.d/
│   │       ├── kuma8088.com.conf
│   │       ├── courses.kuma8088.com.conf
│   │       ├── fx-trader-life.com.conf
│   │       ├── courses.fx-trader-life.com.conf
│   │       ├── toyota-phv.jp.conf
│   │       ├── webmakeprofit.org.conf
│   │       └── webmakesprofit.com.conf
│   ├── php/
│   │   └── php.ini
│   └── mariadb/
│       ├── my.cnf
│       └── init/
│           └── 01-create-databases.sql
├── admin-panel/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py
│   └── ...
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   ├── migrate-from-xserver.sh
│   └── healthcheck.sh
└── data/                         # SSD
    ├── db/                       # MariaDB data
    └── logs/                     # All logs
        ├── nginx/
        ├── php/
        ├── mysql/
        └── admin-panel/

/mnt/backup-hdd/blog/             # HDD
├── sites/                        # WordPress files
│   ├── kuma8088/
│   ├── courses-kuma8088/
│   ├── fx-trader-life/
│   ├── courses-fx-trader-life/
│   ├── toyota-phv/
│   ├── webmakeprofit/
│   └── webmakesprofit/
└── backups/                      # Backups
    ├── daily/
    │   ├── 2025-11-08/
    │   │   ├── kuma8088-db.sql.gz
    │   │   ├── kuma8088-files.tar.gz
    │   │   └── ...
    │   └── ...
    └── weekly/
        └── ...
```

### 8.3 パーミッション設計

**WordPress files** (HDD):
```bash
chown -R 33:33 /mnt/backup-hdd/blog/sites/  # www-data (UID:GID 33:33)
chmod -R 755 /mnt/backup-hdd/blog/sites/
```

**MariaDB data** (SSD):
```bash
chown -R 999:999 ./data/db  # mysql user in container
chmod -R 700 ./data/db
```

**Logs** (SSD):
```bash
chmod -R 755 ./data/logs/
```

---

## 9. バックアップ設計

### 9.1 バックアップスクリプト

**ファイルパス**: `services/blog/scripts/backup.sh`

```bash
#!/bin/bash
# Blog system backup script
# Usage: ./backup.sh [daily|weekly]

set -euo pipefail

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

# Source .env file
set -a
source "$ENV_FILE"
set +a

BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y-%m-%d)
BACKUP_BASE="/mnt/backup-hdd/blog/backups/${BACKUP_TYPE}/${TIMESTAMP}"
LOG_FILE="$HOME/.blog-backup.log"

# Site list from environment variable
# Update BLOG_SITES in .env after Phase A-0 investigation
if [ -z "${BLOG_SITES:-}" ]; then
    echo "ERROR: BLOG_SITES not set in .env"
    exit 1
fi
read -ra SITES <<< "$BLOG_SITES"

# Database credentials
DB_CONTAINER="blog-mariadb"
DB_USER="root"
DB_PASS="${MYSQL_ROOT_PASSWORD}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Create backup directory
mkdir -p "$BACKUP_BASE"

# Backup each site
for site in "${SITES[@]}"; do
    log "Starting backup for $site"

    # Database backup
    DB_NAME="blog_db_${site//-/_}"
    log "Backing up database: $DB_NAME"
    docker exec "$DB_CONTAINER" mysqldump -u"$DB_USER" -p"$DB_PASS" \
        --single-transaction \
        --quick \
        --lock-tables=false \
        "$DB_NAME" | gzip > "$BACKUP_BASE/${site}-db.sql.gz"

    # Files backup
    log "Backing up files: $site"
    tar -czf "$BACKUP_BASE/${site}-files.tar.gz" \
        -C /mnt/backup-hdd/blog/sites \
        "$site"

    log "Completed backup for $site"
done

# Backup configurations
log "Backing up configurations"
tar -czf "$BACKUP_BASE/config.tar.gz" \
    -C /opt/onprem-infra-system/project-root-infra/services/blog \
    config docker-compose.yml

# Retention (daily: 7, weekly: 4)
if [ "$BACKUP_TYPE" = "daily" ]; then
    RETENTION=7
else
    RETENTION=4
fi

log "Applying retention policy: keep last $RETENTION backups"
find "/mnt/backup-hdd/blog/backups/${BACKUP_TYPE}" -maxdepth 1 -type d \
    | sort -r | tail -n +$((RETENTION + 1)) | xargs rm -rf

log "Backup completed successfully"
```

### 9.2 リストアスクリプト

**ファイルパス**: `services/blog/scripts/restore.sh`

```bash
#!/bin/bash
# Blog system restore script
# Usage: ./restore.sh <site> <backup-date>

set -euo pipefail

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

# Source .env file
set -a
source "$ENV_FILE"
set +a

SITE="$1"
BACKUP_DATE="$2"
BACKUP_DIR="/mnt/backup-hdd/blog/backups/daily/${BACKUP_DATE}"
LOG_FILE="$HOME/.blog-restore.log"

# Database credentials
DB_CONTAINER="blog-mariadb"
DB_USER="root"
DB_PASS="${MYSQL_ROOT_PASSWORD}"
DB_NAME="blog_db_${SITE//-/_}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Validate site name
if [ -z "${BLOG_SITES:-}" ]; then
    log "ERROR: BLOG_SITES not set in .env"
    exit 1
fi
read -ra VALID_SITES <<< "$BLOG_SITES"
if [[ ! " ${VALID_SITES[*]} " =~ " ${SITE} " ]]; then
    log "ERROR: Invalid site name: $SITE"
    log "Valid sites: ${BLOG_SITES}"
    exit 1
fi

# Validation
if [ ! -d "$BACKUP_DIR" ]; then
    log "ERROR: Backup directory not found: $BACKUP_DIR"
    exit 1
fi

if [ ! -f "$BACKUP_DIR/${SITE}-db.sql.gz" ]; then
    log "ERROR: Database backup not found"
    exit 1
fi

if [ ! -f "$BACKUP_DIR/${SITE}-files.tar.gz" ]; then
    log "ERROR: Files backup not found"
    exit 1
fi

# Confirm restore
read -p "Restore $SITE from $BACKUP_DATE? This will overwrite current data. (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log "Restore cancelled"
    exit 0
fi

# Restore database
log "Restoring database: $DB_NAME"
gunzip < "$BACKUP_DIR/${SITE}-db.sql.gz" | \
    docker exec -i "$DB_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME"

# Restore files
log "Restoring files: $SITE"
rm -rf "/mnt/backup-hdd/blog/sites/${SITE}"
tar -xzf "$BACKUP_DIR/${SITE}-files.tar.gz" \
    -C /mnt/backup-hdd/blog/sites

# Fix permissions
chown -R 33:33 "/mnt/backup-hdd/blog/sites/${SITE}"
chmod -R 755 "/mnt/backup-hdd/blog/sites/${SITE}"

log "Restore completed successfully"
```

### 9.3 バックアップスケジュール (cron)

```bash
# Blog system backups
30 3 * * * /opt/onprem-infra-system/project-root-infra/services/blog/scripts/backup.sh daily
30 2 * * 0 /opt/onprem-infra-system/project-root-infra/services/blog/scripts/backup.sh weekly
```

---

## 10. セキュリティ設計

### 10.1 WordPress管理画面保護

**IP制限** (nginx追加設定):
```nginx
# Admin area IP restriction
location ~ ^/wp-(admin|login\.php) {
    allow 172.21.0.0/24;  # Docker network
    allow <admin-ip-address>;  # Admin home IP
    deny all;

    # PHP-FPM
    fastcgi_pass wordpress:9000;
    include fastcgi_params;
}
```

**または Basic認証**:
```bash
# Create .htpasswd
docker exec blog-nginx htpasswd -c /etc/nginx/.htpasswd admin
```

```nginx
# Basic auth for wp-admin
location ~ ^/wp-(admin|login\.php) {
    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;

    fastcgi_pass wordpress:9000;
    include fastcgi_params;
}
```

### 10.2 ファイアウォール設計

**開放ポート** (ホスト側):
- なし（Cloudflare Tunnel使用のため外部ポート開放不要）

**内部アクセス**:
- 8080: nginx (ローカルホストのみ)
- 3307: MariaDB (ローカルホストのみ)
- 5002: admin-panel (ローカルホストのみ)

### 10.3 WordPress セキュリティプラグイン

**推奨プラグイン**:
1. **Wordfence Security** - ファイアウォール、マルウェアスキャン
2. **iThemes Security** - ブルートフォース対策
3. **UpdraftPlus** - バックアップ（補助）
4. **WP Cerber Security** - ログイン保護

### 10.4 定期更新ポリシー

| 対象 | 頻度 | 実施内容 |
|------|------|---------|
| **WordPress Core** | 月次 | マイナーバージョン自動更新 |
| **プラグイン** | 月次 | 手動更新（テスト環境確認後） |
| **テーマ** | 月次 | 手動更新（デザイン確認後） |
| **Docker イメージ** | 月次 | Latest tag pull & rebuild |

---

## 11. 監視・ログ設計

### 11.1 ヘルスチェックスクリプト

**ファイルパス**: `services/blog/scripts/healthcheck.sh`

```bash
#!/bin/bash
# Blog system health check

set -euo pipefail

LOG_FILE="$HOME/.blog-healthcheck.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Check container status
log "Checking container status..."
docker compose -f /opt/onprem-infra-system/project-root-infra/services/blog/docker-compose.yml ps

# Check disk usage
log "Checking disk usage..."
df -h /var/lib/docker/volumes | grep blog
df -h /mnt/backup-hdd/blog

# Check MariaDB
log "Checking MariaDB..."
docker exec blog-mariadb mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD"

# Check WordPress sites
SITES=("kuma8088.com" "courses.kuma8088.com" "fx-trader-life.com" "courses.fx-trader-life.com")
for site in "${SITES[@]}"; do
    log "Checking $site..."
    curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080" -H "Host: $site" || true
done

log "Health check completed"
```

### 11.2 ログローテーション

**ファイルパス**: `/etc/logrotate.d/blog`

```
/opt/onprem-infra-system/project-root-infra/services/blog/data/logs/*/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    sharedscripts
    postrotate
        docker exec blog-nginx nginx -s reload > /dev/null 2>&1 || true
    endscript
}
```

### 11.3 監視メトリクス

| メトリクス | 閾値 | アクション |
|----------|------|-----------|
| **CPU使用率** | > 80% | アラート |
| **メモリ使用率** | > 85% | アラート |
| **ディスク使用率 (SSD)** | > 80% | アラート |
| **ディスク使用率 (HDD)** | > 90% | アラート |
| **応答時間** | > 3秒 | 調査 |
| **エラー率** | > 1% | 調査 |

---

## 12. パフォーマンス設計

### 12.1 リソース割当

| コンテナ | CPU (cores) | Memory | 理由 |
|---------|------------|--------|------|
| **cloudflared** | 0.25 | 128M | 軽量プロキシ |
| **nginx** | 0.5-1.0 | 256-512M | 静的ファイル配信 |
| **wordpress** | 1.0-3.0 | 2-4G | PHP処理（複数サイト） |
| **mariadb** | 1.0-2.0 | 2-3G | DB処理（複数DB） |
| **admin-panel** | 0.25-0.5 | 256-512M | 管理画面 |
| **合計** | 3-7 cores | 5-8G | - |

### 12.2 キャッシュ戦略

**Cloudflare Edge Cache**:
- 静的ファイル: 1年
- HTML: キャッシュしない（動的コンテンツ）
- CSS/JS: 1年（バージョニング前提）

**WordPress Object Cache** (推奨):
- Redis または Memcached導入（Phase 2）
- 現状: OPcacheのみ使用

### 12.3 最適化設定

**Nginx**:
- Gzip圧縮有効
- 静的ファイルキャッシュ
- Keepalive有効

**PHP**:
- OPcache有効
- JIT無効（WordPress互換性考慮）

**MariaDB**:
- InnoDB buffer pool: 2G
- Query cache無効（WordPress非推奨）

---

**次のステップ**: [03_installation.md](03_installation.md) - 構築手順書作成
