# ブログシステム構築手順書

**プロジェクト名**: Xserverブログ移植プロジェクト
**対象環境**: Dell WorkStation (Rocky Linux 9.6) + Docker Compose
**作成日**: 2025-11-08
**バージョン**: 1.0

---

## 📋 目次

1. [構築フロー全体像](#1-構築フロー全体像)
2. [Phase A: 事前準備](#2-phase-a-事前準備)
3. [Phase B: Dell環境構築](#3-phase-b-dell環境構築)
4. [Phase C: Cloudflare Tunnel設定](#4-phase-c-cloudflare-tunnel設定)
5. [Phase D: WordPress初期セットアップ](#5-phase-d-wordpress初期セットアップ)
6. [Phase E: バックアップシステム設定](#6-phase-e-バックアップシステム設定)
7. [Phase F: Admin Panel構築](#7-phase-f-admin-panel構築)
8. [トラブルシューティング](#8-トラブルシューティング)

---

## 1. 構築フロー全体像

### 1.1 推定所要時間

| Phase | 内容 | 所要時間 |
|-------|------|----------|
| **Phase A** | 事前準備（Xserver調査、環境確認） | 2-3時間 |
| **Phase B** | Dell環境構築（Docker Compose） | 1-2時間 |
| **Phase C** | Cloudflare Tunnel設定 | 1時間 |
| **Phase D** | WordPress初期セットアップ | 30分 |
| **Phase E** | バックアップシステム設定 | 30分 |
| **Phase F** | Admin Panel構築 | 1-2時間 |
| **合計** | - | **6-9時間** |

### 1.2 前提条件

**システム要件**:
- ✅ Rocky Linux 9.6稼働中
- ✅ Docker 24.0.x + Docker Compose 2.x インストール済み
- ✅ Mailserver稼働中（リソース確認のため）
- ✅ インターネット接続（Docker Image pull、Cloudflare接続用）
- ✅ root権限またはsudo権限を持つユーザー

**外部アカウント**:
- ✅ Cloudflareアカウント（Free プラン可）
- ✅ 移行対象ドメインのDNS管理権限

**作業ディレクトリ**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog
```

### 1.3 ロールバック戦略

**各Phase終了後の復旧ポイント**:
- Phase B完了: `docker compose down -v` でクリーンアップ
- Phase C完了: Cloudflare Tunnel削除で元の状態へ
- Phase D完了: データベースdrop、Volumeクリアで初期化

**緊急停止コマンド**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog
docker compose down
```

---

## 2. Phase A: 事前準備

### Phase A-0: Xserver サイト情報調査

**目的**: 移行対象サイトの詳細情報を収集し、BLOG_SITESを最終確定

#### ステップ A-0-1: Xserverサーバーパネルへログイン

**実行アクション**:
1. Xserverサーバーパネルへログイン: https://www.xserver.ne.jp/login_server.php
2. 「WordPress簡単インストール」→「インストール済みWordPress一覧」を開く

#### ステップ A-0-2: 各サイト情報の記録

**記録すべき情報** (7サイト全て):

| 項目 | 説明 | 記録先 |
|------|------|--------|
| **サイトURL** | 完全なURL (http/https) | `claudedocs/xserver-sites.md` |
| **インストールディレクトリ** | Xserver上のパス | 同上 |
| **WordPressバージョン** | 現在のバージョン | 同上 |
| **データベース名** | MySQL DB名 | 同上 |
| **管理者ユーザー名** | WordPressログインID | 同上 |
| **プラグイン一覧** | 有効化されているプラグイン | 同上 |
| **テーマ名** | 使用中のテーマ | 同上 |
| **ディスク使用量** | サイト全体のサイズ | 同上 |

**実行コマンド** (記録用テンプレート作成):
```bash
cat > /opt/onprem-infra-system/project-root-infra/claudedocs/xserver-sites.md << 'EOF'
# Xserver サイト調査結果

## 調査日
2025-11-XX

## サイト一覧

### 1. kuma8088.com
- URL: https://kuma8088.com
- Xserverパス: /home/xxxxx/kuma8088.com/public_html/
- WordPressバージョン: x.x.x
- データベース名: xxxxx_wp1
- 管理者ユーザー: admin
- プラグイン: [調査後記入]
- テーマ: [調査後記入]
- ディスク使用量: XXX MB

### 2. courses.kuma8088.com
- URL: https://courses.kuma8088.com
- [以下同様に記録]

### 3. fx-trader-life.com
- [同様に記録]

### 4. courses.fx-trader-life.com
- [同様に記録]

### 5. toyota-phv.jp (検討中)
- 移行判断: [ ] 移行する / [ ] 移行しない
- 理由: [記入]
- [移行する場合は詳細記録]

### 6. webmakeprofit.org (検討中)
- 移行判断: [ ] 移行する / [ ] 移行しない
- 理由: [記入]

### 7. webmakesprofit.com (検討中)
- 移行判断: [ ] 移行する / [ ] 移行しない
- 理由: [記入]

## 最終確定 BLOG_SITES
```bash
# 移行確定サイトのみ記載（スペース区切り）
BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life"
```

## 特記事項
- [特殊な設定、プラグイン依存関係等を記録]
EOF
```

#### ステップ A-0-3: 検討中3サイトの移行判断

**判断基準**:
- ✅ アクセス数: 直近3ヶ月のアクセス実績
- ✅ 更新頻度: 最終更新日、今後の更新予定
- ✅ ビジネス価値: 収益性、SEO価値
- ✅ 保守コスト: プラグイン依存度、カスタマイズ複雑度

**実行アクション**:
1. Xserverアクセス解析で各サイトのアクセス数を確認
2. WordPress管理画面で最終更新日を確認
3. 移行判断を `claudedocs/xserver-sites.md` に記録
4. `.env` の `BLOG_SITES` 変数を最終確定

#### 検証項目

- **アクション**: `cat claudedocs/xserver-sites.md` で全7サイトの情報が記録されているか確認
- **期待結果**: 移行対象サイトが明確化され、BLOG_SITES値が確定している
- **失敗時**: Xserverサーバーパネルで再度情報確認

---

### Phase A-1: Dell環境リソース確認

**目的**: 既存Mailserverと共存可能か、リソース・ポート・ストレージを確認

#### ステップ A-1-1: メモリ使用量確認

**実行コマンド**:
```bash
# 現在のメモリ使用状況
free -h

# Dockerコンテナ別メモリ使用量
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}"
```

**期待される出力例**:
```
              total        used        free      shared  buff/cache   available
Mem:           31Gi        11Gi        18Gi       100Mi        2.0Gi        19Gi
Swap:            0B          0B          0B

CONTAINER           MEM USAGE / LIMIT
mailserver-postfix  256MiB / 1GiB
mailserver-dovecot  512MiB / 2GiB
...
```

**検証項目**:
- **アクション**: `available` メモリが 5GB 以上あるか確認
- **期待結果**: Blog用に 4GB 割り当て可能（合計15GB使用、16GB以上の空きメモリ）
- **失敗時**: 不要なプロセス停止、メモリ増設検討

#### ステップ A-1-2: ポート競合確認

**実行コマンド**:
```bash
# 使用中ポート確認
sudo ss -tlnp | grep -E ':(80|443|3306|3307|5001|5002|8080)'

# Mailserver Dockerコンテナのポートマッピング確認
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep mailserver
```

**期待される出力例**:
```
LISTEN  0  128  0.0.0.0:80     0.0.0.0:*  users:(("nginx",pid=12345))
LISTEN  0  128  0.0.0.0:443    0.0.0.0:*  users:(("nginx",pid=12345))
LISTEN  0  128  0.0.0.0:3306   0.0.0.0:*  users:(("docker-proxy"))
LISTEN  0  128  0.0.0.0:5001   0.0.0.0:*  users:(("docker-proxy"))

mailserver-nginx    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
mailserver-mariadb  0.0.0.0:3306->3306/tcp
mailserver-usermgmt 0.0.0.0:5001->5001/tcp
```

**検証項目**:
- **アクション**: Blog用ポート（8080, 3307, 5002）が空いているか確認
- **期待結果**: 上記3ポートが `ss -tlnp` の出力に含まれていない
- **失敗時**: ポート番号を変更（docker-compose.yml修正）

#### ステップ A-1-3: ストレージ容量確認

**実行コマンド**:
```bash
# SSD容量確認（Docker Volumes用）
df -h /var/lib/docker

# HDD容量確認（WordPress files、backups用）
df -h /mnt/backup-hdd

# 既存Mailserverデータサイズ確認
du -sh /mnt/backup-hdd/mailserver
```

**期待される出力例**:
```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2       390G   50G  340G  13% /var/lib/docker

Filesystem      Size  Used Avail Use% Mounted on
/dev/sdb1       3.6T  434M  3.6T   1% /mnt/backup-hdd

434M    /mnt/backup-hdd/mailserver
```

**検証項目**:
- **アクション**: SSD 20GB以上、HDD 50GB以上の空き容量があるか確認
- **期待結果**: SSD 340GB空き、HDD 3.6TB空き（十分な余裕）
- **失敗時**: 不要ファイル削除、古いバックアップ削除

#### ステップ A-1-4: Docker Network競合確認

**実行コマンド**:
```bash
# 既存Dockerネットワーク確認
docker network ls

# Mailserver Networkの詳細確認
docker network inspect mailserver_mailserver_network | grep -A 5 "IPAM"
```

**期待される出力例**:
```
NETWORK ID     NAME                              DRIVER    SCOPE
abcd1234efgh   mailserver_mailserver_network     bridge    local
ijkl5678mnop   staging_mailserver_network        bridge    local

"IPAM": {
    "Config": [
        {
            "Subnet": "172.20.0.0/24",
            "Gateway": "172.20.0.1"
        }
    ]
}
```

**検証項目**:
- **アクション**: Mailserver Network が `172.20.0.0/24` を使用しているか確認
- **期待結果**: Blog用 `172.21.0.0/24` と競合しない
- **失敗時**: docker-compose.yml のネットワーク設定を調整

---

### Phase A-2: Cloudflareアカウント準備

**目的**: Cloudflare Zero Trust + Tunnel設定に必要なアカウント準備

#### ステップ A-2-1: Cloudflareアカウント作成（未登録の場合）

**実行アクション**:
1. https://dash.cloudflare.com/sign-up にアクセス
2. メールアドレスとパスワードを入力してアカウント作成
3. メール認証を完了

**検証項目**:
- **アクション**: https://dash.cloudflare.com/ へログインできるか確認
- **期待結果**: Cloudflareダッシュボードが表示される

#### ステップ A-2-2: ドメイン追加とDNS移管

**実行アクション** (移行対象全ドメインで実施):

1. Cloudflareダッシュボードで **Add a Site** をクリック
2. ドメイン名を入力（例: `kuma8088.com`）
3. Free プランを選択
4. 既存DNS設定をCloudflareが自動スキャン（確認して次へ）
5. **ネームサーバー変更指示が表示される**:
   ```
   Change your nameservers to:
   - xxx.ns.cloudflare.com
   - yyy.ns.cloudflare.com
   ```
6. 現在のドメイン管理サイト（お名前.com等）でネームサーバーを変更
7. Cloudflareダッシュボードで「Done, check nameservers」をクリック
8. DNS設定が反映されるまで待機（最大48時間、通常は数時間）

**検証項目**:
- **アクション**: `nslookup kuma8088.com` を実行
- **期待結果**: Cloudflareのネームサーバーが返される
- **失敗時**: ドメイン管理サイトでネームサーバー設定を再確認

#### ステップ A-2-3: Zero Trust アカウント設定

**実行アクション**:

1. Cloudflareダッシュボード左メニューから **Zero Trust** を選択
2. 初回利用時: 組織名を入力（例: "Personal" or "kuma8088"）
3. プランを選択: **Free プラン** を選択
4. Zero Trust ダッシュボードへアクセス可能になる

**検証項目**:
- **アクション**: https://one.dash.cloudflare.com/ へアクセス
- **期待結果**: Zero Trust ダッシュボードが表示される

---

## 3. Phase B: Dell環境構築

### Phase B-1: ディレクトリ構造作成

**目的**: 02_design.md に基づくディレクトリ構造を作成

#### ステップ B-1-1: プロジェクトディレクトリ作成

**実行コマンド**:
```bash
# プロジェクトルート作成
sudo mkdir -p /opt/onprem-infra-system/project-root-infra/services/blog

# 所有権変更（現在のユーザーに）
sudo chown -R $USER:$USER /opt/onprem-infra-system/project-root-infra/services/blog

# 作業ディレクトリへ移動
cd /opt/onprem-infra-system/project-root-infra/services/blog
```

#### ステップ B-1-2: サブディレクトリ作成

**実行コマンド**:
```bash
# 設定ファイルディレクトリ
mkdir -p config/nginx/conf.d
mkdir -p config/php
mkdir -p config/mariadb/init
mkdir -p config/cloudflared

# スクリプトディレクトリ
mkdir -p scripts

# Admin Panel（後のPhaseで使用）
mkdir -p admin-panel

# HDD上のデータディレクトリ作成
sudo mkdir -p /mnt/backup-hdd/blog/sites
sudo mkdir -p /mnt/backup-hdd/blog/backups/daily
sudo mkdir -p /mnt/backup-hdd/blog/backups/weekly
sudo chown -R $USER:$USER /mnt/backup-hdd/blog
```

**検証項目**:
- **アクション**: `tree -L 3 .` を実行（tree未インストールなら `find . -type d`）
- **期待結果**: 上記すべてのディレクトリが存在する
- **失敗時**: mkdir コマンドを再実行

---

### Phase B-2: 設定ファイル配置

#### ステップ B-2-1: docker-compose.yml 作成

**実行コマンド**:
```bash
cat > docker-compose.yml << 'EOF'
# Blog system Docker Compose configuration
# Version: 1.0
# Updated: 2025-11-08

networks:
  blog_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/24
          gateway: 172.21.0.1

volumes:
  blog_db_data:
    driver: local
  blog_logs:
    driver: local
  blog_wordpress_sites:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/backup-hdd/blog/sites

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
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3

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
      - "8080:80"
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
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3

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
    healthcheck:
      test: ["CMD-SHELL", "php-fpm -t"]
      interval: 30s
      timeout: 10s
      retries: 3

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
      - "3307:3306"
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
    cpus: 2.0
    mem_limit: 3G
    mem_reservation: 2G
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 30s
      timeout: 10s
      retries: 3

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
      - "5002:5002"
    environment:
      - FLASK_ENV=production
      - SECRET_KEY=${ADMIN_SECRET_KEY}
      - DB_HOST=mariadb
      - DB_PORT=3306
      - DB_USER=${MYSQL_USER}
      - DB_PASSWORD=${MYSQL_PASSWORD}
      - USERMGMT_URL=http://172.20.0.90:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./admin-panel:/app
      - blog_logs:/var/log/admin-panel
    depends_on:
      - mariadb
    cpus: 0.5
    mem_limit: 512M
    mem_reservation: 256M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF
```

**検証項目**:
- **アクション**: `docker compose config` を実行
- **期待結果**: YAML構文エラーがなく、設定が表示される
- **失敗時**: YAMLインデント、構文を確認

#### ステップ B-2-2: Nginx設定ファイル作成

**nginx.conf (メイン設定)**:
```bash
cat > config/nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
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
    client_max_body_size 64M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               application/rss+xml font/truetype font/opentype
               application/vnd.ms-fontobject image/svg+xml;

    # Virtual hosts
    include /etc/nginx/conf.d/*.conf;
}
EOF
```

**仮想ホスト設定（1サイト目のみ、他は移行時に追加）**:
```bash
cat > config/nginx/conf.d/kuma8088.conf << 'EOF'
# Virtual host: kuma8088.com
server {
    listen 80;
    server_name kuma8088.com www.kuma8088.com;

    root /var/www/html/kuma8088;
    index index.php index.html;

    access_log /var/log/nginx/kuma8088-access.log;
    error_log /var/log/nginx/kuma8088-error.log;

    location / {
        try_files $uri $uri/ /index.php?$args;
    }

    location ~ \.php$ {
        fastcgi_pass wordpress:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;

        fastcgi_buffers 16 16k;
        fastcgi_buffer_size 32k;
        fastcgi_read_timeout 300;
    }

    location ~ /\.ht {
        deny all;
    }

    location = /favicon.ico {
        log_not_found off;
        access_log off;
    }

    location = /robots.txt {
        allow all;
        log_not_found off;
        access_log off;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires max;
        log_not_found off;
    }
}
EOF
```

**検証項目**:
- **アクション**: `nginx -t -c config/nginx/nginx.conf` を実行（ホスト側にnginxがある場合）
- **期待結果**: "syntax is ok" または設定ファイルが存在する
- **失敗時**: 構文エラー箇所を修正

#### ステップ B-2-3: PHP設定ファイル作成

**実行コマンド**:
```bash
cat > config/php/php.ini << 'EOF'
; WordPress optimized PHP settings

[PHP]
; Memory and execution
memory_limit = 256M
max_execution_time = 300
max_input_time = 300
max_input_vars = 3000

; File uploads
upload_max_filesize = 64M
post_max_size = 64M

; Error reporting (production)
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log

; Session
session.save_handler = files
session.save_path = "/tmp"

; Timezone
date.timezone = Asia/Tokyo

; Security
expose_php = Off
allow_url_fopen = On
allow_url_include = Off
EOF
```

#### ステップ B-2-4: MariaDB設定ファイル作成

**my.cnf (カスタム設定)**:
```bash
cat > config/mariadb/my.cnf << 'EOF'
[mysqld]
# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# Performance
max_connections = 200
innodb_buffer_pool_size = 2G
innodb_log_file_size = 512M
innodb_flush_log_at_trx_commit = 2

# Binary logging (for backup/recovery)
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 100M

# Slow query log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

[client]
default-character-set = utf8mb4
EOF
```

**データベース初期化SQL**:
```bash
cat > config/mariadb/init/01-create-databases.sql << 'EOF'
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

-- Database for toyota-phv.jp (conditional)
CREATE DATABASE IF NOT EXISTS blog_db_toyota_phv
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for webmakeprofit.org (conditional)
CREATE DATABASE IF NOT EXISTS blog_db_webmakeprofit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Database for webmakesprofit.com (conditional)
CREATE DATABASE IF NOT EXISTS blog_db_webmakesprofit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

EOF
```

**重要な仕様**:
- MariaDB公式イメージは、`.env`で`MYSQL_DATABASE`と`MYSQL_USER`の両方が設定されている場合、自動的に:
  1. `MYSQL_DATABASE`で指定されたデータベース（`blog_system`）を作成
  2. `MYSQL_USER`で指定されたユーザー（`blog_user`）を作成し、`MYSQL_PASSWORD`でパスワード設定
  3. `blog_system`データベースへの全権限を付与

- 各WordPress用データベース（`blog_db_*`）への権限付与は、**Phase B-4-4** で手動実行します（init SQLでは環境変数展開がサポートされないため）

---

### Phase B-3: 環境変数設定

#### ステップ B-3-1: .env.example 作成

**実行コマンド**:
```bash
cat > .env.example << 'EOF'
# Blog System Environment Variables Template
# Copy to .env and customize values

# Timezone
TZ=Asia/Tokyo

# MariaDB Configuration
MYSQL_ROOT_PASSWORD=<CHANGE_ME_STRONG_ROOT_PASSWORD>
MYSQL_DATABASE=blog_system
MYSQL_USER=blog_user
MYSQL_PASSWORD=<CHANGE_ME_STRONG_USER_PASSWORD>

# Cloudflare Tunnel
# Obtain from: https://one.dash.cloudflare.com/ → Access → Tunnels
CLOUDFLARE_TUNNEL_TOKEN=<YOUR_TUNNEL_TOKEN>

# Admin Panel
# Generate with: openssl rand -hex 32
ADMIN_SECRET_KEY=<CHANGE_ME_RANDOM_SECRET_KEY>

# Blog Sites (for backup/restore scripts)
# Space-separated list of site directory names
# Update after Phase A-0 investigation
BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life"
EOF
```

#### ステップ B-3-2: .env 作成と設定

**実行コマンド**:
```bash
# .env.exampleをコピー
cp .env.example .env

# ランダムパスワード生成
echo "MYSQL_ROOT_PASSWORD=$(openssl rand -base64 32)"
echo "MYSQL_PASSWORD=$(openssl rand -base64 32)"
echo "ADMIN_SECRET_KEY=$(openssl rand -hex 32)"

# viで.envを編集
vi .env
```

**編集内容** (以下をコピーして貼り付け):
```bash
TZ=Asia/Tokyo

# 上記で生成したパスワードを貼り付け
MYSQL_ROOT_PASSWORD=<生成したパスワード>
MYSQL_DATABASE=blog_system
MYSQL_USER=blog_user
MYSQL_PASSWORD=<生成したパスワード>

# Cloudflare Tunnel Token (Phase C で設定)
CLOUDFLARE_TUNNEL_TOKEN=<Phase_C_で_設定>

# Admin Secret Key
ADMIN_SECRET_KEY=<生成したシークレット>

# Blog Sites (Phase A-0 の調査結果を反映)
BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life"
```

**重要**: `MYSQL_DATABASE=blog_system` を設定することで、MariaDB公式イメージが自動的に:
- `blog_system` データベースを作成
- `blog_user` ユーザーを作成し、`MYSQL_PASSWORD` でパスワード設定
- `blog_system` への権限付与

を実行します。各WordPress用データベース（`blog_db_*`）への権限は Phase B-4 で別途付与します。

**検証項目**:
- **アクション**: `cat .env | grep -E 'PASSWORD|SECRET'` を実行
- **期待結果**: 全ての秘密情報が `<CHANGE_ME_...>` から実際の値に変更されている（CLOUDFLARE_TUNNEL_TOKEN除く）
- **失敗時**: vi .env で再編集

#### ステップ B-3-3: .gitignore 設定

**実行コマンド**:
```bash
cat > .gitignore << 'EOF'
# Environment variables (contains secrets)
.env

# Admin Panel dependencies (if Node.js)
admin-panel/node_modules/
admin-panel/__pycache__/
admin-panel/*.pyc

# Logs
*.log

# Temporary files
*.tmp
*.swp
.DS_Store
EOF
```

---

### Phase B-4: Docker Compose起動

#### ステップ B-4-1: イメージpull

**実行コマンド**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog

# イメージを事前pull（起動時間短縮）
docker compose pull
```

**期待される出力**:
```
[+] Pulling 23/23
 ✔ cloudflared Pulled
 ✔ nginx Pulled
 ✔ wordpress Pulled
 ✔ mariadb Pulled
```

#### ステップ B-4-2: コンテナ起動（admin-panel以外）

**実行コマンド** (admin-panelはPhase Fで構築):
```bash
# admin-panel以外を起動
docker compose up -d cloudflared nginx wordpress mariadb
```

**期待される出力**:
```
[+] Running 5/5
 ✔ Network blog_blog_network  Created
 ✔ Container blog-mariadb     Started
 ✔ Container blog-cloudflared Started
 ✔ Container blog-wordpress   Started
 ✔ Container blog-nginx       Started
```

**検証項目**:
- **アクション**: `docker compose ps` を実行
- **期待結果**: 4コンテナすべてが "healthy" または "running" 状態
- **失敗時**: `docker compose logs <service>` でエラー確認

#### ステップ B-4-3: ネットワーク接続確認

**実行コマンド**:
```bash
# Nginx → WordPress 疎通確認
docker compose exec nginx ping -c 3 wordpress

# WordPress → MariaDB 疎通確認
docker compose exec wordpress ping -c 3 mariadb
```

**期待される出力**:
```
PING wordpress (172.21.0.30): 56 data bytes
64 bytes from 172.21.0.30: seq=0 ttl=64 time=0.123 ms
...
3 packets transmitted, 3 packets received, 0% packet loss

PING mariadb (172.21.0.50): 56 data bytes
64 bytes from 172.21.0.50: seq=0 ttl=64 time=0.089 ms
...
3 packets transmitted, 3 packets received, 0% packet loss
```

#### ステップ B-4-4: blog_user への権限付与

**目的**: `blog_user` に各WordPress用データベース（`blog_db_*`）への権限を付与

**実行コマンド**:
```bash
# .envを読み込んで実行
source .env

# blog_userに全blog_db_*への権限を付与
docker compose exec mariadb mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<'EOF'
GRANT ALL PRIVILEGES ON blog_db_kuma8088.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_courses_kuma8088.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_fx_trader_life.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_courses_fx_trader_life.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_toyota_phv.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_webmakeprofit.* TO 'blog_user'@'%';
GRANT ALL PRIVILEGES ON blog_db_webmakesprofit.* TO 'blog_user'@'%';
FLUSH PRIVILEGES;
EOF
```

**期待される出力**:
```
(何も表示されずに正常終了)
```

**検証項目**:
- **アクション**: 以下のコマンドで権限確認
  ```bash
  docker compose exec mariadb mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
    -e "SHOW GRANTS FOR 'blog_user'@'%';"
  ```
- **期待結果**: `blog_db_*` への `GRANT ALL PRIVILEGES` が表示される
- **失敗時**: GRANT文を再実行

---

### Phase B-5: 初期動作確認

#### ステップ B-5-1: MariaDB接続確認

**実行コマンド**:
```bash
# MariaDBコンテナ内でmysqlクライアント実行
docker compose exec mariadb mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "SHOW DATABASES;"
```

**期待される出力** (Phase A-0の確定サイト数により変動):
```
+------------------------------+
| Database                     |
+------------------------------+
| blog_db_kuma8088             |
| blog_db_courses_kuma8088     |
| blog_db_fx_trader_life       |
| blog_db_courses_fx_trader_life|
| blog_db_toyota_phv           |
| blog_db_webmakeprofit        |
| blog_db_webmakesprofit       |
| information_schema           |
| mysql                        |
| performance_schema           |
+------------------------------+
```

**検証項目**:
- **アクション**: blog_db_* データベースがPhase A-0で確定したサイト数分存在するか確認
- **期待結果**: 移行対象サイト分のデータベースが作成されている
- **失敗時**: `config/mariadb/init/01-create-databases.sql` を確認、コンテナ再作成

#### ステップ B-5-2: WordPress PHP-FPM動作確認

**実行コマンド**:
```bash
# PHP-FPMプロセス確認
docker compose exec wordpress ps aux | grep php-fpm

# PHPバージョン確認
docker compose exec wordpress php -v
```

**期待される出力**:
```
PID   USER     TIME  COMMAND
1     www-data 0:00  php-fpm: master process
...

PHP 8.2.x (cli) (built: ...)
```

#### ステップ B-5-3: Nginx設定確認

**実行コマンド**:
```bash
# Nginx設定テスト
docker compose exec nginx nginx -t

# ログ確認
docker compose logs nginx | tail -20
```

**期待される出力**:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

#### ステップ B-5-4: WP-CLI準備

**目的**: WordPress管理用のWP-CLIイメージをpullし、Phase Dで使用できるようにする

**背景**: `wordpress:php8.2-fpm-alpine` イメージにはWP-CLIが含まれていないため、公式の `wordpress:cli` イメージを使用します。

**実行コマンド**:
```bash
# WP-CLI公式イメージをpull
docker pull wordpress:cli

# イメージ確認
docker images | grep wordpress
```

**期待される出力**:
```
REPOSITORY          TAG                 IMAGE ID       CREATED        SIZE
wordpress           cli                 xxxxxxxxxxxx   X days ago     XXX MB
wordpress           php8.2-fpm-alpine   xxxxxxxxxxxx   X days ago     XXX MB
```

**検証項目**:
- **アクション**: `docker run --rm wordpress:cli wp --version` を実行
- **期待結果**: `WP-CLI x.x.x` のようにバージョンが表示される
- **失敗時**: `docker pull wordpress:cli` を再実行

**Phase Dでの使用方法**:
```bash
# 基本形式（Phase Dで使用）
docker run --rm \
  --volumes-from blog-wordpress \
  --network blog_blog_network \
  -e WORDPRESS_DB_HOST=mariadb \
  -e WORDPRESS_DB_USER=blog_user \
  -e WORDPRESS_DB_PASSWORD="${MYSQL_PASSWORD}" \
  wordpress:cli wp <コマンド>
```

---

## 4. Phase C: Cloudflare Tunnel設定

### Phase C-1: Cloudflare Zero Trust Tunnel作成

**目的**: Dell WorkStationへの安全なインバウンド接続を確立

#### ステップ C-1-1: Tunnelの作成

**実行アクション**:

1. https://one.dash.cloudflare.com/ へログイン
2. 左メニュー: **Networks** → **Tunnels** を選択
3. **Create a tunnel** をクリック
4. Tunnel名を入力: `blog-dell-workstation`
5. **Save tunnel** をクリック
6. **Install connector** 画面で **Docker** タブを選択
7. 表示されるトークンをコピー:
   ```
   TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxx...
   ```

#### ステップ C-1-2: トークンを.envに設定

**実行コマンド**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog

# .envを編集
vi .env
```

**編集内容**:
```bash
# 以下の行を実際のトークンに置き換え
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxx...
```

#### ステップ C-1-3: cloudflaredコンテナ再起動

**実行コマンド**:
```bash
# cloudflaredコンテナを再起動してトークンを反映
docker compose up -d cloudflared

# 起動確認
docker compose logs cloudflared | tail -20
```

**期待される出力**:
```
INF Connection established to Cloudflare Edge
INF Registered tunnel connection
INF Tunnel is now active
```

**検証項目**:
- **アクション**: Cloudflare Zero Trust ダッシュボードでTunnel状態を確認
- **期待結果**: `blog-dell-workstation` が "HEALTHY" 状態
- **失敗時**: `docker compose logs cloudflared` でエラー確認、トークン再取得

---

### Phase C-2: Public Hostname設定

**目的**: ドメインごとにTunnelルーティングを設定

#### ステップ C-2-1: 1サイト目（kuma8088.com）のルーティング設定

**実行アクション** (Cloudflare Zero Trust ダッシュボード):

1. **Tunnels** → `blog-dell-workstation` を選択
2. **Public Hostname** タブを開く
3. **Add a public hostname** をクリック
4. 以下を入力:
   - **Subdomain**: (空欄)
   - **Domain**: `kuma8088.com` を選択
   - **Path**: (空欄)
   - **Service Type**: `HTTP`
   - **Service URL**: `blog-nginx:80`
5. **Save hostname** をクリック
6. 同じ手順で `www.kuma8088.com` も追加（Subdomain: `www`）

#### ステップ C-2-2: 他サイトのルーティング設定（移行時に追加）

**参考**: 後のPhaseで各サイト移行時に同様に追加

| サイト | Subdomain | Domain | Service URL |
|--------|-----------|--------|-------------|
| courses.kuma8088.com | courses | kuma8088.com | http://blog-nginx:80 |
| fx-trader-life.com | (空欄) | fx-trader-life.com | http://blog-nginx:80 |
| courses.fx-trader-life.com | courses | fx-trader-life.com | http://blog-nginx:80 |

**検証項目**:
- **アクション**: ブラウザで https://kuma8088.com へアクセス
- **期待結果**: Nginxのデフォルトページ、または404エラー（WordPress未設定のため）
- **失敗時**: Public Hostname設定を再確認、Tunnel状態確認

---

### Phase C-3: DNS設定確認

**目的**: CloudflareがDNS権限を持ち、Tunnelへルーティングされているか確認

#### ステップ C-3-1: DNS設定確認

**実行アクション** (Cloudflare ダッシュボード):

1. **Websites** → `kuma8088.com` を選択
2. **DNS** → **Records** を確認
3. 以下のレコードが自動作成されているか確認:
   - `kuma8088.com` → Type: `CNAME`, Target: `<tunnel-id>.cfargotunnel.com`, Proxied: ✅
   - `www.kuma8088.com` → Type: `CNAME`, Target: `<tunnel-id>.cfargotunnel.com`, Proxied: ✅

**検証項目**:
- **アクション**: `nslookup kuma8088.com` を実行
- **期待結果**: CloudflareのIPアドレスが返される（104.x.x.x等）
- **失敗時**: DNS設定を手動で追加、TTL短縮後に再確認

#### ステップ C-3-2: HTTPS接続確認

**実行コマンド** (ホストから):
```bash
curl -I https://kuma8088.com
```

**期待される出力**:
```
HTTP/2 404
server: cloudflare
...
```

**404エラーが返る理由**: WordPressがまだセットアップされていないため。Cloudflare → Tunnel → Nginx の接続は成功している証拠。

---

## 5. Phase D: WordPress初期セットアップ

### Phase D-1: WordPress初期インストール（1サイト目）

**目的**: kuma8088.com の WordPress環境を新規セットアップ（移行前の動作確認用）

#### ステップ D-1-1: WordPressディレクトリ作成

**実行コマンド**:
```bash
# HDD上にWordPressサイトディレクトリ作成
sudo mkdir -p /mnt/backup-hdd/blog/sites/kuma8088
sudo chown -R 33:33 /mnt/backup-hdd/blog/sites/kuma8088  # www-data UID:GID
```

**検証項目**:
- **アクション**: `ls -ld /mnt/backup-hdd/blog/sites/kuma8088`
- **期待結果**: `drwxr-xr-x 2 33 33 ... kuma8088/`

#### ステップ D-1-2: WordPressコアファイルのダウンロード

**実行コマンド**:
```bash
# .envを読み込み（MYSQL_PASSWORD取得のため）
source .env

# wordpress:cliイメージでWordPressダウンロード
docker run --rm \
  --volumes-from blog-wordpress \
  --network blog_blog_network \
  --user 33:33 \
  wordpress:cli wp core download \
    --path=/var/www/html/kuma8088 \
    --locale=ja
```

**期待される出力**:
```
Downloading WordPress 6.x.x (ja)...
Success: WordPress downloaded.
```

**検証項目**:
- **アクション**: `docker compose exec wordpress ls /var/www/html/kuma8088/`
- **期待結果**: `index.php`, `wp-config-sample.php` 等が存在

#### ステップ D-1-3: wp-config.php作成

**実行コマンド**:
```bash
# wordpress:cliでwp-config.php生成
docker run --rm \
  --volumes-from blog-wordpress \
  --network blog_blog_network \
  --user 33:33 \
  wordpress:cli wp config create \
    --path=/var/www/html/kuma8088 \
    --dbname=blog_db_kuma8088 \
    --dbuser=blog_user \
    --dbpass="${MYSQL_PASSWORD}" \
    --dbhost=mariadb:3306 \
    --locale=ja \
    --extra-php <<'PHP'
define('WP_DEBUG', false);
define('WP_DEBUG_LOG', false);
define('WP_DEBUG_DISPLAY', false);
define('DISALLOW_FILE_EDIT', true);
PHP
```

**検証項目**:
- **アクション**: `docker compose exec wordpress cat /var/www/html/kuma8088/wp-config.php | grep DB_NAME`
- **期待結果**: `define('DB_NAME', 'blog_db_kuma8088');`

#### ステップ D-1-4: WordPress初期インストール

**実行コマンド**:
```bash
# 管理者パスワード生成（推奨）
WP_ADMIN_PASS=$(openssl rand -base64 16)
echo "WordPress管理者パスワード: ${WP_ADMIN_PASS}"
echo "このパスワードを安全な場所に保存してください"

# wordpress:cliでWordPress初期セットアップ
docker run --rm \
  --volumes-from blog-wordpress \
  --network blog_blog_network \
  --user 33:33 \
  wordpress:cli wp core install \
    --path=/var/www/html/kuma8088 \
    --url='https://kuma8088.com' \
    --title='kuma8088 Blog' \
    --admin_user='admin' \
    --admin_password="${WP_ADMIN_PASS}" \
    --admin_email='your-email@example.com'
```

**⚠️ 注意**:
- `your-email@example.com`: 実際のメールアドレスに変更
- 生成されたパスワードは必ず記録してください（再表示されません）

**期待される出力**:
```
Success: WordPress installed successfully.
```

**検証項目**:
- **アクション**: ブラウザで https://kuma8088.com へアクセス
- **期待結果**: WordPressのデフォルトテーマが表示される
- **失敗時**: `docker compose logs nginx wordpress` でエラー確認

---

### Phase D-2: 動作確認とテスト

#### ステップ D-2-1: フロントエンド表示確認

**実行アクション**:
1. ブラウザで https://kuma8088.com へアクセス
2. "Hello world!" 投稿が表示されることを確認

#### ステップ D-2-2: WordPress管理画面ログイン

**実行アクション**:
1. ブラウザで https://kuma8088.com/wp-admin/ へアクセス
2. ステップD-1-4で設定した `admin` ユーザーとパスワードでログイン
3. ダッシュボードが表示されることを確認

#### ステップ D-2-3: データベース接続確認

**実行コマンド**:
```bash
# wp_posts テーブル確認
docker compose exec mariadb mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" \
  -e "USE blog_db_kuma8088; SELECT ID, post_title FROM wp_posts WHERE post_status='publish';"
```

**期待される出力**:
```
+----+-------------+
| ID | post_title  |
+----+-------------+
|  1 | Hello world!|
+----+-------------+
```

#### ステップ D-2-4: パーミッション確認

**実行コマンド**:
```bash
# WordPressディレクトリのパーミッション確認
docker compose exec wordpress ls -la /var/www/html/kuma8088/ | head -10

# アップロードディレクトリ作成テスト
docker compose exec wordpress mkdir -p /var/www/html/kuma8088/wp-content/uploads/2025/11
docker compose exec wordpress ls -ld /var/www/html/kuma8088/wp-content/uploads/2025/11
```

**期待される出力**:
```
drwxr-xr-x ... www-data www-data ... wp-content/
drwxr-xr-x ... www-data www-data ... uploads/2025/11/
```

---

## 6. Phase E: バックアップシステム設定

### Phase E-1: バックアップスクリプト配置

#### ステップ E-1-1: backup.sh作成

**実行コマンド**:
```bash
cat > scripts/backup.sh << 'SCRIPT_EOF'
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
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_BASE="/mnt/backup-hdd/blog/backups/${BACKUP_TYPE}/${TIMESTAMP}"
LOG_FILE="$HOME/.blog-backup.log"

# Site list from environment variable
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

log "Starting ${BACKUP_TYPE} backup (${#SITES[@]} sites)"

# Backup each site
for site in "${SITES[@]}"; do
    log "Backing up site: $site"

    # Database backup
    DB_NAME="blog_db_${site//-/_}"
    log "  → Database: $DB_NAME"
    docker exec "$DB_CONTAINER" mysqldump -u"$DB_USER" -p"$DB_PASS" \
        --single-transaction \
        --quick \
        --lock-tables=false \
        "$DB_NAME" | gzip > "$BACKUP_BASE/${site}-db.sql.gz"

    # Files backup
    log "  → Files: $site"
    tar -czf "$BACKUP_BASE/${site}-files.tar.gz" \
        -C /mnt/backup-hdd/blog/sites \
        "$site"

    log "  ✓ Completed: $site"
done

# Backup configuration files
log "Backing up configuration files"
tar -czf "$BACKUP_BASE/config.tar.gz" \
    -C /opt/onprem-infra-system/project-root-infra/services/blog \
    config/ docker-compose.yml

# Retention policy
log "Applying retention policy"
if [ "$BACKUP_TYPE" = "daily" ]; then
    # Keep last 7 daily backups
    ls -dt /mnt/backup-hdd/blog/backups/daily/*/ | tail -n +8 | xargs -r rm -rf
elif [ "$BACKUP_TYPE" = "weekly" ]; then
    # Keep last 4 weekly backups
    ls -dt /mnt/backup-hdd/blog/backups/weekly/*/ | tail -n +5 | xargs -r rm -rf
fi

log "Backup completed successfully"
SCRIPT_EOF

# 実行権限付与
chmod +x scripts/backup.sh
```

#### ステップ E-1-2: restore.sh作成

**実行コマンド**:
```bash
cat > scripts/restore.sh << 'SCRIPT_EOF'
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
    log "ERROR: Database backup not found: ${SITE}-db.sql.gz"
    exit 1
fi

if [ ! -f "$BACKUP_DIR/${SITE}-files.tar.gz" ]; then
    log "ERROR: Files backup not found: ${SITE}-files.tar.gz"
    exit 1
fi

# Confirmation
echo "⚠️  WARNING: This will OVERWRITE existing data for site: $SITE"
echo "Database: $DB_NAME"
echo "Files: /mnt/backup-hdd/blog/sites/$SITE"
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

log "Starting restore for site: $SITE"

# Restore database
log "Restoring database: $DB_NAME"
gunzip < "$BACKUP_DIR/${SITE}-db.sql.gz" | \
docker exec -i "$DB_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME"

# Restore files
log "Restoring files: $SITE"
rm -rf "/mnt/backup-hdd/blog/sites/$SITE"
tar -xzf "$BACKUP_DIR/${SITE}-files.tar.gz" \
    -C /mnt/backup-hdd/blog/sites/

# Fix permissions
sudo chown -R 33:33 "/mnt/backup-hdd/blog/sites/$SITE"

log "Restore completed successfully"
SCRIPT_EOF

# 実行権限付与
chmod +x scripts/restore.sh
```

**検証項目**:
- **アクション**: `ls -lh scripts/`
- **期待結果**: `backup.sh`, `restore.sh` が実行権限付き（-rwxr-xr-x）で存在

---

### Phase E-2: cron設定

#### ステップ E-2-1: crontab編集

**実行コマンド**:
```bash
# 現在のcrontab確認
crontab -l

# crontab編集
crontab -e
```

**追加内容**:
```cron
# Blog system automated backups
# Daily backup at 3:30 AM
30 3 * * * /opt/onprem-infra-system/project-root-infra/services/blog/scripts/backup.sh daily

# Weekly backup at 2:30 AM on Sunday
30 2 * * 0 /opt/onprem-infra-system/project-root-infra/services/blog/scripts/backup.sh weekly
```

**検証項目**:
- **アクション**: `crontab -l | grep blog`
- **期待結果**: 上記2行が表示される

#### ステップ E-2-2: 手動バックアップテスト

**実行コマンド**:
```bash
# 手動でバックアップ実行
cd /opt/onprem-infra-system/project-root-infra/services/blog
./scripts/backup.sh daily
```

**期待される出力**:
```
[2025-11-08 XX:XX:XX] Starting daily backup (4 sites)
[2025-11-08 XX:XX:XX] Backing up site: kuma8088
[2025-11-08 XX:XX:XX]   → Database: blog_db_kuma8088
[2025-11-08 XX:XX:XX]   → Files: kuma8088
[2025-11-08 XX:XX:XX]   ✓ Completed: kuma8088
...
[2025-11-08 XX:XX:XX] Backup completed successfully
```

**検証項目**:
- **アクション**: `ls /mnt/backup-hdd/blog/backups/daily/`
- **期待結果**: 日付ディレクトリが作成され、中に `*-db.sql.gz`, `*-files.tar.gz` が存在
- **失敗時**: `cat ~/.blog-backup.log` でエラー確認

#### ステップ E-2-3: リストアテスト

**実行コマンド**:
```bash
# バックアップ日付確認
ls /mnt/backup-hdd/blog/backups/daily/

# リストア実行（例: 2025-11-08_03-30-00）
./scripts/restore.sh kuma8088 2025-11-08_03-30-00
```

**期待される出力**:
```
⚠️  WARNING: This will OVERWRITE existing data for site: kuma8088
Database: blog_db_kuma8088
Files: /mnt/backup-hdd/blog/sites/kuma8088
Continue? (yes/no): yes

[2025-11-08 XX:XX:XX] Starting restore for site: kuma8088
[2025-11-08 XX:XX:XX] Restoring database: blog_db_kuma8088
[2025-11-08 XX:XX:XX] Restoring files: kuma8088
[2025-11-08 XX:XX:XX] Restore completed successfully
```

**検証項目**:
- **アクション**: https://kuma8088.com へアクセス
- **期待結果**: リストア前と同じ内容が表示される

---

## 7. Phase F: Admin Panel構築

### Phase F-1: Flask基盤セットアップ

**目的**: Docker管理とDB管理のWeb UIを提供

#### ステップ F-1-1: admin-panelディレクトリ構造作成

**実行コマンド**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog/admin-panel

# ディレクトリ構造
mkdir -p templates static/css static/js
```

#### ステップ F-1-2: requirements.txt作成

**実行コマンド**:
```bash
cat > requirements.txt << 'EOF'
Flask==3.0.0
docker==7.0.0
PyMySQL==1.1.0
python-dotenv==1.0.0
EOF
```

#### ステップ F-1-3: Dockerfile作成

**実行コマンド**:
```bash
cat > Dockerfile << 'EOF'
FROM python:3.11-alpine

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:5002/health')"

# Run Flask
CMD ["python", "app.py"]
EOF
```

#### ステップ F-1-4: app.py（最小構成）作成

**実行コマンド**:
```bash
cat > app.py << 'EOF'
from flask import Flask, render_template, jsonify
import docker
import pymysql
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

# Docker client
docker_client = docker.from_env()

# Database config
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'mariadb'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'blog_user'),
    'password': os.getenv('DB_PASSWORD', ''),
}

@app.route('/')
def index():
    """Dashboard"""
    return render_template('index.html')

@app.route('/health')
def health():
    """Healthcheck endpoint"""
    return jsonify({'status': 'ok'}), 200

@app.route('/containers')
def containers():
    """List all blog containers"""
    try:
        containers = docker_client.containers.list(
            filters={'name': 'blog-'}
        )
        container_data = []
        for c in containers:
            container_data.append({
                'name': c.name,
                'status': c.status,
                'image': c.image.tags[0] if c.image.tags else 'unknown',
            })
        return jsonify(container_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/databases')
def databases():
    """List all blog databases"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES LIKE 'blog_db_%'")
        databases = [row[0] for row in cursor.fetchall()]
        conn.close()
        return jsonify(databases)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=False)
EOF
```

#### ステップ F-1-5: templates/index.html作成

**実行コマンド**:
```bash
cat > templates/index.html << 'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog Admin Panel</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        #output { background: #f5f5f5; padding: 10px; border-radius: 5px; min-height: 100px; }
    </style>
</head>
<body>
    <h1>Blog Admin Panel</h1>

    <div class="section">
        <h2>Docker Containers</h2>
        <button onclick="loadContainers()">Refresh</button>
        <div id="containers"></div>
    </div>

    <div class="section">
        <h2>Databases</h2>
        <button onclick="loadDatabases()">Refresh</button>
        <div id="databases"></div>
    </div>

    <div class="section">
        <h2>Output</h2>
        <div id="output"></div>
    </div>

    <script>
        function loadContainers() {
            fetch('/containers')
                .then(res => res.json())
                .then(data => {
                    document.getElementById('containers').innerHTML =
                        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                })
                .catch(err => {
                    document.getElementById('output').innerHTML = 'Error: ' + err;
                });
        }

        function loadDatabases() {
            fetch('/databases')
                .then(res => res.json())
                .then(data => {
                    document.getElementById('databases').innerHTML =
                        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                })
                .catch(err => {
                    document.getElementById('output').innerHTML = 'Error: ' + err;
                });
        }

        // Auto-load on page load
        window.onload = function() {
            loadContainers();
            loadDatabases();
        };
    </script>
</body>
</html>
EOF
```

---

### Phase F-2: Admin Panel起動

#### ステップ F-2-1: Dockerイメージビルド

**実行コマンド**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog

# admin-panelイメージビルド
docker compose build admin-panel
```

**期待される出力**:
```
[+] Building 15.2s (10/10) FINISHED
 => [internal] load build definition from Dockerfile
 => [internal] load .dockerignore
 => [internal] load metadata for docker.io/library/python:3.11-alpine
 => [1/5] FROM docker.io/library/python:3.11-alpine
 ...
 => => naming to docker.io/library/blog-admin-panel
```

#### ステップ F-2-2: コンテナ起動

**実行コマンド**:
```bash
# admin-panelコンテナ起動
docker compose up -d admin-panel

# 起動確認
docker compose ps
```

**期待される出力**:
```
NAME              IMAGE                  COMMAND                  STATUS
blog-admin        blog-admin-panel       "python app.py"          Up (healthy)
blog-cloudflared  cloudflare/cloudflared "tunnel run"             Up (healthy)
blog-mariadb      mariadb:10.11          "docker-entrypoint..."   Up (healthy)
blog-nginx        nginx:1.24-alpine      "nginx -g 'daemon ..."   Up (healthy)
blog-wordpress    wordpress:php8.2-fpm   "docker-entrypoint..."   Up (healthy)
```

**検証項目**:
- **アクション**: `curl http://localhost:5002/health`
- **期待結果**: `{"status":"ok"}`
- **失敗時**: `docker compose logs admin-panel` でエラー確認

#### ステップ F-2-3: Web UI動作確認

**実行アクション**:
1. ブラウザで http://<Dell WorkStation IP>:5002/ へアクセス
2. "Blog Admin Panel" ページが表示される
3. "Docker Containers" セクションに全5コンテナが表示される
4. "Databases" セクションに `blog_db_*` データベース一覧が表示される

**検証項目**:
- **アクション**: ブラウザのDevToolsでコンソールエラーがないか確認
- **期待結果**: エラーなし、JSON形式でコンテナ・DB情報が表示される

---

## 8. トラブルシューティング

### 問題 1: Docker Composeが起動しない

**症状**:
```bash
docker compose up -d
ERROR: yaml.parser.ParserError: ...
```

**原因**: docker-compose.yml の構文エラー

**対処**:
```bash
# 構文チェック
docker compose config

# エラー箇所を修正
vi docker-compose.yml
```

---

### 問題 2: MariaDBコンテナがUnhealthy

**症状**:
```bash
docker compose ps
blog-mariadb   Up (unhealthy)
```

**原因**: データベース初期化失敗、パスワード不一致

**対処**:
```bash
# ログ確認
docker compose logs mariadb | tail -50

# 環境変数確認
docker compose exec mariadb env | grep MYSQL

# 再起動
docker compose restart mariadb
```

---

### 問題 3: Cloudflare Tunnelが接続できない

**症状**:
```bash
docker compose logs cloudflared
ERR Unauthorized: invalid credentials
```

**原因**: CLOUDFLARE_TUNNEL_TOKEN が間違っている

**対処**:
```bash
# .env確認
grep CLOUDFLARE_TUNNEL_TOKEN .env

# Cloudflare Zero Trustでトークン再取得
# .envを更新後、再起動
docker compose restart cloudflared
```

---

### 問題 4: WordPress管理画面にアクセスできない

**症状**: https://kuma8088.com/wp-admin/ で404エラー

**原因**: Nginxのrewriteルール不足、WordPressファイル不足

**対処**:
```bash
# Nginxログ確認
docker compose logs nginx | grep kuma8088

# WordPressファイル確認
docker compose exec wordpress ls /var/www/html/kuma8088/

# パーミッション確認
docker compose exec wordpress ls -la /var/www/html/kuma8088/ | head -10
```

---

### 問題 5: バックアップスクリプトが失敗

**症状**:
```bash
./scripts/backup.sh daily
ERROR: BLOG_SITES not set in .env
```

**原因**: .envの BLOG_SITES が空または未定義

**対処**:
```bash
# .env確認
grep BLOG_SITES .env

# 修正（Phase A-0の結果を反映）
vi .env
# BLOG_SITES="kuma8088 courses-kuma8088 fx-trader-life courses-fx-trader-life"

# 再実行
./scripts/backup.sh daily
```

---

## 9. 次のステップ

### Phase Gへの移行準備

**構築完了後に実施**:
1. ✅ 1サイト目（kuma8088.com）が正常動作している
2. ✅ バックアップ・リストアが機能している
3. ✅ Admin Panelで管理できる

**次のドキュメント**:
- **04_migration.md**: Xserverから実際のデータを移行する手順書
- **05_testing.md**: 移行後のテスト計画書

---

**作成日**: 2025-11-08
**バージョン**: 1.0
**作成者**: Claude

**次のステップ**: [04_migration.md](04_migration.md) - Xserver移行手順書作成
