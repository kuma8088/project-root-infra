# システムアーキテクチャ

**作成者**: kuma8088（AWS認定ソリューションアーキテクト、ITストラテジスト）
**構成**: ハイブリッドクラウド（オンプレミス + Cloudflare + AWS + SaaS）

---

## 1. 全体アーキテクチャ

### 1.1 システム構成図

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Internet                                    │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
                ▼                                     ▼
┌───────────────────────────────┐     ┌───────────────────────────────────┐
│      Cloudflare (CDN/WAF)     │     │         SendGrid (SMTP)           │
│  ┌─────────────────────────┐  │     │  ┌─────────────────────────────┐  │
│  │  Email Routing          │  │     │  │  SMTP Relay Service         │  │
│  │  ・MXレコード受信       │  │     │  │  ・SPF/DKIM/DMARC管理       │  │
│  │  ・Email Worker転送     │  │     │  │  ・送信ドメイン認証         │  │
│  └─────────────────────────┘  │     │  └─────────────────────────────┘  │
│  ┌─────────────────────────┐  │     └───────────────────────────────────┘
│  │  Tunnel                 │  │
│  │  ・Blog公開             │  │
│  │  ・Mail API公開         │  │
│  └─────────────────────────┘  │
└───────────────┬───────────────┘
                │ Cloudflare Tunnel
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    On-Premises (Dell WorkStation)                        │
│                    Rocky Linux 9.6 + Docker Compose                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      Docker Network (Bridge)                        │ │
│  │                                                                     │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                   Mailserver Stack (9 containers)            │  │ │
│  │  │                                                              │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │ │
│  │  │  │ Postfix  │ │ Dovecot  │ │ Rspamd   │ │ ClamAV   │       │  │ │
│  │  │  │ (SMTP)   │ │ (IMAP)   │ │ (Spam)   │ │ (Virus)  │       │  │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │ │
│  │  │  │Roundcube │ │ MariaDB  │ │ Nginx    │ │ usermgmt │       │  │ │
│  │  │  │ (Webmail)│ │ (DB)     │ │ (Proxy)  │ │ (Flask)  │       │  │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │  │ │
│  │  │  ┌──────────┐                                               │  │ │
│  │  │  │mail-api  │ ← Cloudflare Email Worker からの受信          │  │ │
│  │  │  │(FastAPI) │                                               │  │ │
│  │  │  └──────────┘                                               │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                   Blog Stack (5 containers)                  │  │ │
│  │  │                                                              │  │ │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  │ │
│  │  │  │ Nginx    │ │WordPress │ │ MariaDB  │ │  Redis   │       │  │ │
│  │  │  │ (Proxy)  │ │ (PHP-FPM)│ │ (DB)     │ │ (Cache)  │       │  │ │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │  │ │
│  │  │  ┌──────────┐                                               │  │ │
│  │  │  │cloudflared│ ← Cloudflare Tunnel 接続                     │  │ │
│  │  │  └──────────┘                                               │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                         Storage Layer                                ││
│  │  SSD: OS, Docker, DB    │    HDD: Mail data, WordPress, Backups    ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                │
                ▼ S3 Sync (Daily)
┌─────────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  S3 Bucket (Object Lock COMPLIANCE)                                 ││
│  │  ・オフサイトバックアップ                                           ││
│  │  ・ランサムウェア対策（削除不可期間設定）                           ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  CloudWatch + SNS                                                   ││
│  │  ・コストアラート                                                   ││
│  │  ・異常検知通知                                                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. データフロー

### 2.1 メール受信フロー

```
外部メールサーバー
    │
    │ SMTP
    ▼
Cloudflare Email Routing
    │
    │ HTTP POST (Email Worker)
    ▼
Cloudflare Tunnel
    │
    ▼
mailserver-api (FastAPI)
    │
    │ LMTP
    ▼
Dovecot
    │
    │ Maildir format
    ▼
メールボックス保存
```

### 2.2 メール送信フロー

```
Mail Client / Roundcube
    │
    │ SMTP Submission（VPN経由）
    ▼
Postfix
    │
    │ SMTP over TLS
    ▼
SendGrid Relay
    │
    │ SPF/DKIM署名付与
    ▼
外部メールサーバー
```

### 2.3 Blog アクセスフロー

```
ユーザーブラウザ
    │
    │ HTTPS
    ▼
Cloudflare (CDN/WAF)
    │
    │ Tunnel
    ▼
cloudflared container
    │
    │ HTTP
    ▼
Nginx (Blog)
    │
    │ FastCGI
    ▼
WordPress (PHP-FPM)
    │
    │ MySQL Protocol
    ▼
MariaDB (Blog)
```

### 2.4 メールクライアントアクセスフロー（Tailscale VPN）

```
メールクライアント（Thunderbird, iPhone等）
    │
    │ Tailscale VPN接続（WireGuard暗号化）
    ▼
Tailscale Network
    │
    │ NAT トラバーサル（DERP リレー経由）
    ▼
┌─────────────────────────────────────────────┐
│ 自宅ワークステーション                        │
│                                             │
│  Dovecot (IMAP/POP3) ← Tailscale経由のみ    │
│  Postfix (SMTP)      ← Tailscale経由のみ    │
└─────────────────────────────────────────────┘

✅ 公開インターネットからはIMAP/SMTP到達不可
✅ Tailscale登録デバイスのみ接続可能
```

### 2.5 バックアップフロー

```
┌─────────────────────────────────────────────────────────┐
│ 自宅ワークステーション                                    │
│                                                         │
│  本番データ                                              │
│  ├─ SSD: OS, Docker, DB                                │
│  └─ HDD: Mail data, WordPress, Logs                    │
│           │                                            │
│           │ 日次/週次 cron (AM 3:00 / 日曜 AM 2:00)      │
│           ▼                                            │
│  ローカルバックアップ (/mnt/backup-hdd/)                 │
│  ├─ daily/YYYY-MM-DD/   (7日分保持)                     │
│  └─ weekly/YYYY-MM-DD/  (4週分保持)                     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ S3同期 (AM 4:00)
                        ▼
┌─────────────────────────────────────────────────────────┐
│ AWS S3                                                  │
│                                                         │
│  Object Lock (COMPLIANCE)                               │
│  ├─ 30日間削除不可（管理者含む）                          │
│  ├─ バージョニング有効                                   │
│  └─ Server-Side Encryption (AES-256)                   │
│                                                         │
│  CloudWatch + SNS                                       │
│  └─ コストアラート（$10超過で通知）                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. ネットワーク設計

### 3.1 ネットワーク分離

| ネットワーク | 用途 |
|-------------|------|
| mailserver_network | Mailserver Stack専用（Docker Bridge） |
| blog_network | Blog Stack専用（Docker Bridge） |
| host network | ホストOS |

**設計意図**: サービス間の分離によるセキュリティ強化、障害影響範囲の限定

### 3.2 ポート設計

| サービス | 外部公開 | 公開方法 |
|---------|---------|---------|
| SMTP/IMAP | VPN経由のみ | Tailscale |
| Webmail | 公開 | Cloudflare Tunnel |
| Blog | 公開 | Cloudflare Tunnel |
| Mail API | 公開 | Cloudflare Tunnel |

**設計意図**:
- Cloudflare Tunnel により直接ポート公開を回避、WAF/DDoS保護を活用
- メールプロトコルはVPN経由に限定し、攻撃対象を最小化

### 3.3 Cloudflare 構成

| 機能 | 役割 | 本システムでの活用 |
|------|------|-------------------|
| **Tunnel** | セキュア公開 | WordPress 17サイト + Webmail + Mail API公開（ポート開放不要） |
| **Email Routing** | MX受信 | Port 25なしでメール受信、Workerへ転送 |
| **Email Worker** | メール処理 | JavaScriptでメール解析、LMTP中継 |
| **CDN** | 高速配信 | 静的コンテンツキャッシュ、画像最適化 |
| **SSL/TLS** | 証明書管理 | 自動発行・更新（Let's Encrypt不要） |
| **WAF** | 攻撃防御 | OWASPルール、SQLi/XSS対策 |
| **DDoS Protection** | 大規模攻撃対策 | L3/L4/L7全レイヤー防御 |
| **API** | プログラム制御 | 管理ポータルからDNSレコード操作 |

### 3.4 Tailscale 構成

| 項目 | 内容 |
|------|------|
| **暗号化** | WireGuard（ChaCha20-Poly1305） |
| **認証** | デバイス証明書 + アカウント認証 |
| **NAT トラバーサル** | DERP リレー経由 |
| **ゼロトラスト** | ネットワーク境界に依存しない、登録デバイスのみ |

---

## 4. 管理ポータル設計

### 4.1 アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ 管理ポータル                                             │
│                                                         │
│  ブラウザ（管理者）                                       │
│       │                                                 │
│       ▼                                                 │
│  Frontend (React + TypeScript + Tailwind CSS)           │
│       │                                                 │
│       ▼                                                 │
│  Backend (FastAPI)                                      │
│       │                                                 │
│       ├──▶ Cloudflare API (DNS管理)                     │
│       ├──▶ Docker API (コンテナ管理)                     │
│       ├──▶ MariaDB (データベース操作)                    │
│       └──▶ WordPress CLI (サイト管理)                    │
└─────────────────────────────────────────────────────────┘
```

### 4.2 機能一覧

| 機能 | 説明 |
|------|------|
| DNS管理 | Cloudflare DNSレコードのCRUD、プロキシ設定 |
| Dockerコンテナ管理 | 一覧、起動・停止・再起動、ログ表示 |
| データベース管理 | DB・テーブル一覧、クエリ実行 |
| WordPress管理 | サイト一覧、プラグイン・テーマ管理 |
| バックアップ | 履歴表示、手動実行、S3同期状況 |

---

## 5. セキュリティ設計

### 5.1 多層防御（Defense in Depth）

```
Layer 1: Cloudflare (WAF, DDoS Protection, Bot Management)
    ↓
Layer 2: Cloudflare Tunnel (No exposed ports)
    ↓
Layer 3: Host Firewall (firewalld)
    ↓
Layer 4: Docker Network Isolation
    ↓
Layer 5: Container Security (non-root, read-only where possible)
    ↓
Layer 6: Application Security (authentication, input validation)
```

### 5.2 認証・認可

| コンポーネント | 認証方式 | 備考 |
|--------------|---------|------|
| SSH | 公開鍵認証のみ | パスワード認証無効、root禁止 |
| Mail Client | IMAP/SMTP認証 | Tailscale VPN経由、TLS必須 |
| Webmail | ユーザー/パスワード | Cloudflare Tunnel経由、HTTPS必須 |
| Mail API | API Key | Cloudflare Worker経由 |
| 管理ポータル | ローカル/VPN | 内部ネットワークのみ |

### 5.3 暗号化

| 対象 | 方式 | 備考 |
|-----|------|------|
| 転送中データ | TLS 1.3 | Cloudflare終端 |
| VPN通信 | WireGuard | ChaCha20-Poly1305 |
| 保存データ | ファイルシステムレベル | 将来的にLUKS検討 |
| バックアップ | S3 Server-Side Encryption | AES-256 |

### 5.4 メール認証（SPF/DKIM/DMARC）

```
送信メールの認証フロー:

Postfix → SendGrid (DKIM署名付与) → 受信サーバー
                                       │
                                       ├─ SPF検証: SendGrid IPが許可済みか
                                       ├─ DKIM検証: 署名が有効か
                                       └─ DMARC検証: ポリシーに準拠しているか
```

| 技術 | 設定内容 |
|------|----------|
| SPF | SendGrid IPを許可リストに登録 |
| DKIM | 2048bit RSA鍵でメール署名 |
| DMARC | `p=quarantine`（認証失敗は隔離） |

### 5.5 マルウェア対策

```
受信メール → Rspamd (スパムスコアリング)
                │
                ▼
         ClamAV (ウイルススキャン)
                │
                ▼
         Dovecot (メールボックス保存)

定期スキャン:
├─ ClamAV: 日次フルスキャン (AM 5:00)
├─ rkhunter: ルートキット検出 (週次)
└─ 定義ファイル: 自動更新 (4時間毎)
```

---

## 6. 可用性設計

### 6.1 単一障害点（SPOF）分析

| コンポーネント | SPOF? | 対策 |
|--------------|-------|------|
| Dell WorkStation | Yes | バックアップ、復旧手順整備 |
| SSD/HDD | Yes | SMART監視、S3バックアップ |
| インターネット回線 | Yes | Cloudflareでの一時保持 |
| Cloudflare | No | 複数PoP、高可用性 |
| SendGrid | No | 高可用性SaaS |

### 6.2 復旧戦略

| 障害レベル | RTO | RPO | 復旧方法 |
|-----------|-----|-----|---------|
| コンテナ障害 | 5分 | 0 | 自動再起動（Docker restart policy） |
| データ破損 | 4時間 | 24時間 | ローカルバックアップから復旧 |
| ハードウェア障害 | 24時間 | 24時間 | S3からのフルリストア |

---

## 7. アーキテクチャ決定記録（ADR）

### ADR-001: Cloudflare Tunnel採用

- **決定**: Cloudflare Tunnelでサービス公開
- **理由**: ポート開放不要、WAF/DDoS保護、無料
- **代替案**: VPN、ポートフォワーディング
- **トレードオフ**: Cloudflare依存

### ADR-002: EC2廃止・Cloudflare Email Routing採用

- **決定**: EC2 MXゲートウェイを廃止、Cloudflare Email Routingに移行
- **理由**: コスト削減（$3/月→$0）、運用簡素化
- **代替案**: EC2継続、AWS SES
- **トレードオフ**: Cloudflare依存度増加

### ADR-003: SendGrid SMTP Relay採用

- **決定**: メール送信にSendGrid Relayを使用
- **理由**: 到達率向上、SPF/DKIM管理の容易さ、無料枠
- **代替案**: 直接送信、AWS SES
- **トレードオフ**: 外部サービス依存

### ADR-004: S3 Object Lock（COMPLIANCE）採用

- **決定**: バックアップにS3 Object Lock COMPLIANCEモードを使用
- **理由**: ランサムウェア対策、削除不可保証
- **代替案**: 通常S3、ローカルのみ
- **トレードオフ**: コスト増、柔軟性低下

### ADR-005: Tailscale VPN採用

- **決定**: IMAP/POP3/SMTPアクセスをTailscale VPN経由に限定
- **理由**: ゼロトラストモデル、ポート公開不要、NAT越え対応
- **代替案**: 直接ポート公開、OpenVPN、WireGuard自前構築
- **トレードオフ**: Tailscaleサービス依存、登録デバイス管理必要
