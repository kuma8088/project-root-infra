# デプロイメント戦略

**作成者**: kuma8088（AWS認定ソリューションアーキテクト、ITストラテジスト）
**技術スタック**: Docker Compose, Terraform, Cloudflare

---

## 1. デプロイメント方針

### 1.1 Infrastructure as Code（IaC）

| レイヤー | ツール | 管理対象 |
|---------|-------|---------|
| クラウドリソース | Terraform | S3, IAM, CloudWatch, SNS |
| コンテナ定義 | Docker Compose | 全サービスコンテナ |
| 設定管理 | Git + 環境変数 | 設定ファイル、.env |

**原則**:
- すべてのインフラ変更はコードとしてバージョン管理
- 手動変更は禁止（緊急時を除く）
- 変更は必ずレビュー後に適用

### 1.2 環境分離

```
environments/
├── production/     # 本番環境（デフォルト）
│   ├── .env
│   └── docker-compose.yml
└── staging/        # ステージング環境
    ├── .env.staging
    └── docker-compose.staging.yml
```

**使い分け**:
- **Production**: 日常運用、実データ
- **Staging**: 設定変更のテスト、アップデート検証

---

## 2. Docker Compose 戦略

### 2.1 サービス構成

#### Mailserver Stack（9コンテナ）

| サービス | イメージ | 役割 | リソース制限 |
|---------|---------|------|-------------|
| postfix | boky/postfix:latest | SMTP送信 | CPU: 1.0, MEM: 512M |
| dovecot | dovecot/dovecot:2.3.21 | IMAP/LMTP | CPU: 1.0, MEM: 1G |
| mariadb | mariadb:10.11.7 | データベース | CPU: 1.0, MEM: 1G |
| rspamd | rspamd/rspamd:3.8 | スパムフィルタ | CPU: 1.0, MEM: 1G |
| clamav | clamav/clamav:1.3 | ウイルススキャン | CPU: 1.0, MEM: 2G |
| roundcube | roundcube/roundcubemail:1.6.7 | Webメール | CPU: 0.5, MEM: 512M |
| mailserver-api | カスタムビルド | メール受信API | CPU: 0.5, MEM: 256M |
| usermgmt | カスタムビルド | ユーザー管理 | CPU: 0.5, MEM: 512M |
| nginx | nginx:1.26-alpine | リバースプロキシ | CPU: 0.5, MEM: 256M |

#### Blog Stack（5コンテナ）

| サービス | イメージ | 役割 | リソース制限 |
|---------|---------|------|-------------|
| nginx | nginx:1.26-alpine | リバースプロキシ | CPU: 0.5, MEM: 512M |
| wordpress | カスタムビルド | WordPress + PHP-FPM | CPU: 2.0, MEM: 2G |
| mariadb | mariadb:10.11 | データベース | CPU: 1.5, MEM: 2G |
| redis | redis:7-alpine | Object Cache | CPU: 0.5, MEM: 512M |
| cloudflared | cloudflare/cloudflared | Tunnel接続 | CPU: 0.25, MEM: 256M |

### 2.2 ボリューム戦略

```yaml
volumes:
  # パフォーマンス重視: SSD
  db_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/to/ssd/db

  # 容量重視: HDD
  mail_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/backup-hdd/mail
```

**設計意図**:
- **SSD**: データベース、頻繁なI/O
- **HDD**: メールデータ、WordPress、バックアップ（大容量）

### 2.3 ネットワーク戦略

```yaml
networks:
  mailserver_network:
    driver: bridge
    # プライベートサブネットを割り当て

  blog_network:
    driver: bridge
    # プライベートサブネットを割り当て
```

**設計意図**:
- サービス間のネットワーク分離
- 障害影響範囲の限定
- デバッグ・トラブルシューティング容易化

### 2.4 ヘルスチェック設計

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s      # 30秒ごとにチェック
  timeout: 10s       # 10秒でタイムアウト
  retries: 3         # 3回失敗で unhealthy
  start_period: 40s  # 起動後40秒は猶予
```

**サービス別ヘルスチェック**:

| サービス | チェック方法 | 理由 |
|---------|------------|------|
| Postfix | SMTP接続確認 | ポート応答確認 |
| Dovecot | サービスステータス確認 | プロセス状態確認 |
| MariaDB | `mysqladmin ping` | DB接続確認 |
| Nginx | HTTP応答確認 | Web応答確認 |
| ClamAV | スキャン実行テスト | スキャン機能確認 |

---

## 3. Terraform 戦略

### 3.1 モジュール構成

```
terraform/
├── s3-backup/           # S3バックアップインフラ
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars
└── modules/
    ├── s3-bucket/       # S3バケット（再利用可能）
    ├── iam-role/        # IAMロール（再利用可能）
    └── cloudwatch/      # 監視設定（再利用可能）
```

### 3.2 State管理

```hcl
terraform {
  backend "s3" {
    bucket         = "terraform-state-bucket"
    key            = "infra/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}
```

**原則**:
- リモートState（S3 + DynamoDB）
- State暗号化必須
- ロック機構で同時変更防止

### 3.3 タグ戦略

```hcl
locals {
  common_tags = {
    Project     = "onprem-infra"
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = "kuma8088"
  }
}
```

---

## 4. デプロイメントワークフロー

### 4.1 通常デプロイ

```bash
# 1. 変更確認
git pull origin main
docker compose config  # 設定検証

# 2. イメージ更新
docker compose pull

# 3. ローリングアップデート
docker compose up -d --remove-orphans

# 4. ヘルスチェック
docker compose ps
docker compose logs --tail=50
```

### 4.2 設定変更デプロイ

```bash
# 1. ステージングでテスト
docker compose -f docker-compose.staging.yml up -d

# 2. 検証
# ... 機能テスト実施 ...

# 3. 本番適用
docker compose up -d

# 4. ロールバック準備
# 問題発生時: git revert && docker compose up -d
```

### 4.3 Terraformデプロイ

```bash
# 1. 計画確認
terraform plan -out=tfplan

# 2. レビュー
# ... 変更内容確認 ...

# 3. 適用
terraform apply tfplan

# 4. 出力確認
terraform output
```

### 4.4 Cloudflare Tunnel デプロイ

```bash
# 1. Tunnelトークン更新時
# Cloudflare Zero Trust Dashboard でトークン再生成
# .env の CLOUDFLARE_TUNNEL_TOKEN を更新

# 2. 新規ホスト追加時
# Dashboard → Tunnels → Public Hostname → Add
# または cloudflared config.yml を更新

# 3. 適用
docker compose restart cloudflared
docker compose logs -f cloudflared
```

### 4.5 WordPress 新規サイト追加

```bash
# 自動化スクリプトによるセットアップ
cd services/blog

# 1. 対話式ウィザードで新規サイト作成
./scripts/create-new-wp-site.sh

# 2. Nginx設定生成（サブディレクトリの場合）
./scripts/generate-nginx-subdirectories.sh > config/nginx/conf.d/subdirs-generated.inc

# 3. 設定反映
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload

# 4. WP Mail SMTP設定
./scripts/setup-wp-mail-smtp.sh --site <site-name> <domain> <from-email>
```

### 4.6 デプロイ前チェックリスト

```
□ 設定ファイルの構文チェック（docker compose config）
□ 環境変数の確認（.env の必須項目）
□ ディスク空き容量の確認
□ 現在のサービス状態の記録（docker compose ps）
□ バックアップの確認（直近のバックアップが成功しているか）
□ ロールバック手順の確認
```

---

## 5. イメージ管理

### 5.1 バージョン固定

```yaml
# Good: バージョン固定
image: mariadb:10.11.7
image: nginx:1.26-alpine

# Bad: latest（本番では避ける）
image: nginx:latest
```

**理由**:
- 再現性確保
- 予期しないアップデート防止
- ロールバック容易化

### 5.2 カスタムイメージ

| イメージ | ベース | カスタマイズ内容 |
|---------|--------|-----------------|
| wordpress | wordpress:php8.2-fpm | OPcache、Redis拡張、WP-CLI |
| mailserver-api | python:3.11-slim | FastAPI、メール受信API |
| usermgmt | python:3.11-slim | Flask、ユーザー管理UI |

**ビルドポリシー**:
- ベースイメージは公式を使用
- カスタマイズは最小限
- セキュリティパッチ適用のため定期リビルド（月次）
- マルチステージビルドで最終イメージを軽量化

### 5.3 コンテナ起動順序

**Mailserver Stack**:
```
MariaDB → Dovecot → Postfix → Rspamd → ClamAV → Roundcube → mailserver-api → usermgmt → Nginx
```

**Blog Stack**:
```
MariaDB → Redis → WordPress → Nginx → cloudflared
```

**依存関係管理**:
- `depends_on` + `healthcheck` で起動順序を制御
- DBが ready になるまでアプリケーション起動を待機

---

## 6. 秘密情報管理

### 6.1 環境変数

```bash
# .env（本番）- Git管理外
MYSQL_ROOT_PASSWORD=<secure-password>
SENDGRID_API_KEY=<api-key>
CLOUDFLARE_TUNNEL_TOKEN=<token>
```

### 6.2 .gitignore

```
.env
.env.*
!.env.example
*.key
*.pem
secrets/
```

### 6.3 シークレットローテーション

| シークレット | ローテーション頻度 | 方法 |
|-------------|------------------|------|
| DBパスワード | 90日 | 手動更新 |
| APIキー | 365日 | サービス側で再生成 |
| TLS証明書 | 自動 | Let's Encrypt / Cloudflare |

---

## 7. ロールバック戦略

### 7.1 Dockerロールバック

```bash
# 直前のイメージに戻す
docker compose down
git checkout HEAD~1 -- docker-compose.yml
docker compose up -d
```

### 7.2 Terraformロールバック

```bash
# 直前のStateに戻す
terraform plan -target=<resource> -destroy
terraform apply

# または
git revert <commit>
terraform apply
```

### 7.3 データロールバック

```bash
# バックアップからリストア
./scripts/restore-mailserver.sh \
  --from /mnt/backup-hdd/mailserver/daily/YYYY-MM-DD \
  --component all
```

---

## 8. 継続的改善

### 8.1 イメージ更新チェック

```bash
# 月次: セキュリティアップデート確認
docker images --format "{{.Repository}}:{{.Tag}}" | while read img; do
  docker pull $img
done
```

### 8.2 依存関係監査

- **Dockerfile**: ベースイメージの脆弱性スキャン
- **Terraform**: プロバイダーバージョン確認
- **設定ファイル**: ベストプラクティス準拠確認
