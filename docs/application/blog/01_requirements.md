# ブログシステム要件定義書

**プロジェクト名**: Xserverブログ移植プロジェクト
**対象環境**: Dell WorkStation (Rocky Linux 9.6) + Docker Compose
**作成日**: 2025-11-08
**最終更新**: 2025-11-08
**バージョン**: 1.8

---

## 📋 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [現状分析](#2-現状分析)
3. [目的と背景](#3-目的と背景)
4. [機能要件](#4-機能要件)
5. [非機能要件](#5-非機能要件)
6. [技術要件](#6-技術要件)
7. [インフラ制約](#7-インフラ制約)
8. [ネットワーク・セキュリティ要件](#8-ネットワークセキュリティ要件)
9. [移行要件](#9-移行要件)
10. [運用要件](#10-運用要件)
11. [リスク管理](#11-リスク管理)
12. [成功基準](#12-成功基準)

---

## 1. プロジェクト概要

### 1.1 プロジェクト目的

**主目的**: XserverでホスティングされているブログをDell WorkStation内のDocker環境へ移植し、Cloudflare Tunnelを利用して動的IPでも安定公開できる環境を構築する。

**副次目的**:
- ホスティングコスト削減（Xserver月額費用の削減）
- 自社インフラ内でのデータ主権確保
- 既存Mailserverインフラとの統合管理
- 将来的なAWS移行の準備

### 1.2 スコープ

**対象範囲**:
- ✅ Xserverから**厳選したブログ**のコンテンツ・データベース移行（**計7サイトを想定**）
- ✅ Dell WorkStation内Docker Compose環境構築
- ✅ **複数独立WordPress構成**（1コンテナで複数の独立したWordPressを管理）
- ✅ Cloudflare Tunnel導入（動的IP対応）
- ✅ SSL/TLS証明書自動管理（全ドメイン対応）
- ✅ 既存Mailserverインフラとの共存
- ✅ **Web管理画面**構築（コンテナ管理、WP管理、メール管理統合）

**対象外**:
- ❌ **全18個のWordPress環境の移行**（厳選した7サイトのみ移行予定）
- ❌ **WordPressマルチサイト機能**の使用（各サイト完全独立で運用）
- ❌ ブログテーマ・デザインの大幅変更
- ❌ 新機能追加（移植完了後に検討）
- ❌ Xserver契約解約手続き（動作確認後に実施）
- ❌ AWS移行（Phase 12以降で検討）

**⚠️ リソース設計の考え方**:
- **移行予定**: 厳選した7サイト（確定4サイト + 検討中3サイト）
- **リソース設計**: 全18個のWP環境を移行できる容量を確保（最悪ケース対応）
- **理由**: 段階的移行で追加サイト移行の可能性があるため、余裕を持たせる

### 1.3 Xserver環境の現状と移行対象選定方針

**Xserver調査結果**:

Xserverには合計18個のWordPress環境が稼働していますが、**全移行は行わず厳選して移行**します：

| ドメイン | WP数 | 容量 | 移行方針 |
|---------|------|------|---------|
| kuma8088.com | 1個 | 0.8 MB | ✅ メインサイト不存在、/cameramanualのみ（Phase 2任意移行） |
| courses.kuma8088.com | 0個 | - | ✅ サブドメイン不存在（移行対象外） |
| fx-trader-life.com | 4個 | 39.7 MB (4サイト) | ✅ メインサイト（29.6 MB）**Phase 1確定**、サブディレクトリ3個Phase 2任意 |
| courses.fx-trader-life.com | 0個 | - | ✅ サブドメイン不存在（移行対象外） |
| toyota-phv.jp | 1個 | 3.5 MB | ✅ **Phase 1確定** |
| webmakeprofit.org | 2個 | 303.6 MB + 14.6 MB | ✅ メインサイト（303.6 MB）**Phase 1確定**、/coconala Phase 2任意 |
| webmakesprofit.com | 1個 | 193.7 MB | ✅ **Phase 1確定** |
| **移行予定合計** | **Phase 1: 4サイト確定<br>Phase 2: 5サイト任意** | **Phase 1: 530 MB<br>Phase 2: 25.5 MB** | **✅ 確定完了（2025-11-08）** |

**注**: `gwpbk492.xsrv.jp` は `kuma8088.com` のXserverデフォルトドメイン（Dell移行後は `kuma8088.com` に統一）

**⚠️ 移行サイト選定方針**（2025-11-08 実際のDB調査結果）:
- **Phase 1 確定移行サイト（DB情報判明）**:
  - ✅ **fx-trader-life.com** (gwpbk492_wp3, 29.6 MB) - DB情報完全、最優先移行
  - ❌ **kuma8088.com** (DB情報不明) - メインサイトだが調査必要
  - ❌ **courses.kuma8088.com** (DB情報不明) - 存在確認待ち

- **Phase 1 確定移行サイト（パスワード要確認）**:
  - ⚠️ **webmakeprofit.org** (gwpbk492_wt1, 303.6 MB) - 容量最大、パスワード確認待ち
  - ⚠️ **webmakesprofit.com** (gwpbk492_wt4, 193.7 MB) - パスワード確認待ち
  - ⚠️ **toyota-phv.jp** (gwpbk492_wt5, 3.5 MB) - パスワード確認待ち

- **Phase 2 任意移行サイト（サブディレクトリ）**:
  - 🟡 fx-trader-life.com/MFKC (gwpbk492_62q47, 2.9 MB)
  - 🟡 fx-trader-life.com/lp (gwpbk492_x9a11, 6.2 MB)
  - 🟡 webmakeprofit.org/coconala (gwpbk492_bxb90, 14.6 MB)

- **移行対象外（テストサイト）**: gwpbk492.xsrv.jp配下の6サイト（Elementor/ECテスト環境、合計59.1 MB）

**⚠️ 各ドメイン内の複数WordPress構成調査（必須ToDo）**:

| 調査項目 | 期限 | 担当 | 調査方法 |
|---------|------|------|---------|
| **kuma8088.com 8個の構成** | Phase A-0 | 管理者 | Xserverデータダウンロード後、各WPのURL構造・DB名・wp-config.php確認 |
| **fx-trader-life.com 6個の構成** | Phase A-0 | 管理者 | 同上 |
| **webmakesprofit.com 2個の構成** | Phase A-0 | 管理者 | 同上 |
| **移行優先度決定** | Phase A-0 | 管理者 | アクセス数、記事数、重要度を評価し各ドメインから1-2個を選定 |

**調査で確認すべき内容**:
- [ ] 各WPのURL構造（サブディレクトリ `example.com/blog/` か、サブドメイン `blog.example.com` か）
- [ ] 各WPのDB名・テーブルプレフィックス
- [ ] 各WPのアクセス数（Google Analytics、サーバーログ）
- [ ] 各WPの記事数・メディアファイル数
- [ ] 各WPの最終更新日
- [ ] 各WPの運用状況（更新中 or 放置）

**⚠️ リソース設計の前提**:
- **移行予定**: 厳選した7サイト
- **リソース見積もり**: 全18個のWP環境を移行できる容量を確保（最悪ケース対応、将来的な追加移行の余地）
- **理由**: 段階的移行後にリソース余裕があれば追加サイト移行の可能性があるため

### 1.4 複数独立WordPress構成

**技術方針**:
- **1つのnginxコンテナ**で仮想ホスト設定（ドメイン別ルーティング）
- **1つのPHP-FPMコンテナ**で複数の独立したWordPressを処理
- **1つのMariaDBコンテナ**で複数の独立したデータベースを管理
- **WordPressマルチサイト機能は使用しない**（各サイト完全独立）

**アーキテクチャ**:
```
1コンテナ構成:
├── nginx: 仮想ホスト設定でドメインごとにルーティング
├── PHP-FPM: 複数のWordPressディレクトリを処理
└── MariaDB: 複数の独立データベース

/var/www/html/
├── kuma8088/          (独立WordPressインストール)
│   ├── wp-config.php  → DB: blog_db_kuma8088
│   └── wp-content/
├── fx-trader-life/    (独立WordPressインストール)
│   ├── wp-config.php  → DB: blog_db_fx_trader_life
│   └── wp-content/
└── toyota-phv/        (独立WordPressインストール)
    ├── wp-config.php  → DB: blog_db_toyota_phv
    └── wp-content/
```

**メリット**:
- ✅ コンテナリソース削減（18コンテナ不要）
- ✅ サイト間完全独立（プラグイン競合なし）
- ✅ 通常のWordPress運用知識で管理可能
- ✅ 各サイト個別に更新・バックアップ可能
- ✅ 1サイト障害が他サイトに影響しない

**デメリットと対策**:
- ⚠️ PHP-FPM/DB共有によるリソース競合 → CPU/RAM割当増（6GB推奨）
- ⚠️ バックアップがサイト数分必要 → スクリプト自動化

---

## 2. 現状分析

### 2.1 Xserver現状（2025-11-08調査結果）

| 項目 | 現状 | 備考 |
|------|------|------|
| **ホスティング** | Xserver共有サーバー | 月額1,100円（12月から1,320円） |
| **ブログエンジン** | WordPress（多数） | **合計18個のWP環境** |
| **データベース** | MariaDB 10.5 | **22個のDB** |
| **PHP** | PHP 8.3.21 | **全サイト8.3.21に更新済み** ✅ |
| **ドメイン** | 5個 + サブドメイン2個 | DNS移行必要 |
| **SSL証明書** | Xserver提供 | Cloudflare移行 |
| **アクセス数** | デイリー100PV程度 | 低〜中負荷 |
| **使用ディスク容量** | **10.649GB** | **全環境移行前提で設計** |
| **総ファイル数** | **358,646ファイル** | **全環境移行前提で設計** |

**ドメイン別内訳**:
```
主要ドメイン（5個）:
├── kuma8088.com (WP: 8個) - gwpbk492.xsrv.jpから移行
├── fx-trader-life.com (WP: 6個)
├── toyota-phv.jp (WP: 1個)
├── webmakeprofit.org (WP: 1個)
└── webmakesprofit.com (WP: 2個)

サブドメイン（2個）:
├── courses.kuma8088.com
└── courses.fx-trader-life.com

注: gwpbk492.xsrv.jpはXserverデフォルトドメイン（kuma8088.comと同一サイト）
```

**データダウンロード後に詳細分析が必要な項目**:
- [ ] 各WordPressのバージョン
- [ ] 使用中のプラグイン一覧（互換性確認）
- [ ] 使用中のテーマ情報
- [ ] パーマリンク設定（URL構造維持）
- [ ] ドメイン別アクセス数（優先順位決定）

### 2.2 Dell WorkStation現状

| 項目 | 現状 | 利用可能性 |
|------|------|-----------|
| **OS** | Rocky Linux 9.6 | ✅ |
| **CPU** | 6コア/12スレッド | ✅ 十分 |
| **RAM** | 32GB | ✅ 十分 |
| **Storage (SSD)** | 390GB (Docker用) | ✅ ブログ用に利用可 |
| **Storage (HDD)** | 3.6TB (データ用) | ✅ メディアファイル保存可 |
| **Docker** | 導入済み | ✅ |
| **既存サービス** | Mailserver 8コンテナ | ✅ 共存可能 |
| **ネットワーク** | 動的IP | ⚠️ Cloudflare Tunnel必須 |

### 2.3 既存インフラ統合ポイント

**Mailserverインフラとの共存**:
- Docker Compose別プロジェクトとして構築
- ネットワーク: 独立ブリッジネットワーク作成
- ストレージ: `/data/docker/blog/` (HDD) + `/var/lib/docker` (SSD)
- Nginx: 既存Mailserver nginxとポート衝突回避（内部8080使用）
- バックアップ: 既存バックアップシステムへの統合

---

## 3. 目的と背景

### 3.1 ビジネス目的

**コスト削減**:
- Xserver月額費用削減
  - 現行: 月額1,100円（2025年12月から1,320円）
  - 年間削減額: **13,200円/年** → **15,840円/年**（12月以降）
  - 移行後: 電気代のみ（Dell WorkStation稼働中のため追加コストなし）
  - **5年間累計削減額**: 約79,200円
- 長期的なホスティングコスト削減とインフラ自主管理

**自社管理強化**:
- データ主権確保（自社サーバー内管理）
- カスタマイズ自由度向上
- バックアップ管理の一元化

**技術的成長**:
- インフラ運用スキル向上
- 既存Mailserverノウハウの横展開

### 3.2 技術的背景

**既存インフラ活用**:
- Dell WorkStation: 現在リソース余剰あり（CPU/RAM利用率低）
- Docker環境: Mailserverで実績あり
- バックアップシステム: Phase 10/11-Bで確立済み

**動的IP問題解決**:
- Cloudflare Tunnel: 動的IPでも固定URL提供
- 追加費用なし（Cloudflare Free planで利用可）

---

## 4. 機能要件

### 4.1 ブログ機能（WordPress標準）

| カテゴリ | 機能 | 優先度 | 備考 |
|---------|------|--------|------|
| **コンテンツ管理** | 記事作成・編集・削除 | 🔴 必須 | WordPress標準 |
| | カテゴリ・タグ管理 | 🔴 必須 | WordPress標準 |
| | メディアライブラリ | 🔴 必須 | 画像・動画管理 |
| | 下書き・予約投稿 | 🟡 推奨 | WordPress標準 |
| **ユーザー管理** | 管理者アカウント | 🔴 必須 | 最低1名 |
| | 複数ユーザー対応 | 🟢 任意 | 将来的に追加可 |
| **SEO対策** | パーマリンク設定 | 🔴 必須 | URL構造維持 |
| | サイトマップ生成 | 🟡 推奨 | プラグイン導入 |
| | メタタグ管理 | 🟡 推奨 | Yoast SEO等 |
| **パフォーマンス** | キャッシュ機能 | 🟡 推奨 | WP Super Cache等 |
| | 画像最適化 | 🟢 任意 | 将来的に検討 |

### 4.2 Cloudflare Tunnel機能

| 機能 | 説明 | 必須度 |
|------|------|--------|
| **トンネル接続** | cloudflared daemon常駐 | 🔴 必須 |
| **複数ドメインルーティング** | 5ドメイン + 2サブドメイン対応（厳選移行） | 🔴 必須 |
| **DNS管理** | Cloudflare DNS設定（全ドメイン） | 🔴 必須 |
| **SSL/TLS** | Cloudflare提供証明書（全ドメイン） | 🔴 必須 |
| **ドメインベースルーティング** | ホスト名ごとに独立WPへトラフィック振分 | 🔴 必須 |
| **アクセスログ** | Cloudflare Analytics | 🟡 推奨 |
| **DDoS保護** | Cloudflare標準機能 | 🟡 推奨 |

**複数ドメイン対応の技術要件**:
```
Cloudflare Tunnel → Nginx (リバースプロキシ) → 各独立WordPress
                          ↓
                    ドメインベースルーティング（移行対象例）:
                    - kuma8088.com → /var/www/html/kuma8088/
                    - courses.kuma8088.com → /var/www/html/courses-kuma8088/
                    - fx-trader-life.com → /var/www/html/fx-trader-life/
                    - courses.fx-trader-life.com → /var/www/html/courses-fx-trader/
                    - toyota-phv.jp → /var/www/html/toyota-phv/
                    (+ その他厳選サイト)
```

### 4.3 管理機能

| 機能 | 説明 | 必須度 |
|------|------|--------|
| **バックアップ** | 日次自動バックアップ | 🔴 必須 |
| **リストア** | コマンド一発復旧 | 🔴 必須 |
| **ログ管理** | アクセスログ・エラーログ | 🔴 必須 |
| **監視** | サービス稼働監視 | 🟡 推奨 |
| **更新管理** | WordPress/プラグイン更新 | 🔴 必須 |

### 4.4 Web管理画面機能（新規追加） 🆕

**統合管理UI要件**:

| カテゴリ | 機能 | 優先度 | 備考 |
|---------|------|--------|------|
| **コンテナ管理** | Docker Compose状態監視 | 🔴 必須 | 起動/停止/再起動 |
| | リソース使用率表示 | 🔴 必須 | CPU/RAM/Disk |
| | ログ表示 | 🔴 必須 | コンテナ別ログ閲覧 |
| **WordPress管理** | マルチサイト一覧表示 | 🔴 必須 | 全サイト状態確認 |
| | **管理画面シングルサインオン** 🆕 | 🔴 必須 | **各WP管理画面への自動ログイン、ダッシュボード表示** |
| | サイト別アクセス統計 | 🟡 推奨 | PV/UU表示 |
| | プラグイン/テーマ管理 | 🟡 推奨 | 一括更新 |
| **データベース管理** | DB接続状態監視 | 🔴 必須 | MariaDB稼働確認 |
| | テーブルサイズ表示 | 🟡 推奨 | サイト別容量 |
| | バックアップ/リストア | 🔴 必須 | GUI操作 |
| **PHP管理** | PHPバージョン表示 | 🟡 推奨 | 8.3系（Xserver互換） |
| | php.ini設定変更 | 🟢 任意 | メモリ上限等 |
| **ドメイン管理** | ドメイン一覧表示 | 🔴 必須 | Cloudflare連携 |
| | SSL証明書状態 | 🟡 推奨 | 有効期限表示 |
| | DNS設定確認 | 🟢 任意 | - |
| **高速化管理** | キャッシュ管理 | 🟡 推奨 | クリア/プリロード |
| | CDN設定 | 🟢 任意 | Cloudflare連携 |
| | 画像最適化 | 🟢 任意 | - |
| **セキュリティ管理** | WordPress更新通知 | 🔴 必須 | 脆弱性アラート |
| | ログイン試行監視 | 🟡 推奨 | 不正アクセス検知 |
| | ファイアウォール設定 | 🟢 任意 | - |
| **メール管理統合** | Mailserver状態表示 | 🟡 推奨 | Docker API経由で状態取得 |
| | 統合ダッシュボード | 🟡 推奨 | Blog+Mail統合表示 |
| | Mailserver管理画面リンク | 🟡 推奨 | usermgmt (ポート5001) へ遷移 |

**技術要件**:
- フレームワーク: Flask (Python) または Express.js (Node.js)
- UI: Bootstrap 5 または Tailwind CSS
- 認証: ベーシック認証またはJWT
- API: Docker API、WordPress REST API、MariaDB接続
- ポート: 5002（内部）、Cloudflare Tunnel経由でHTTPSアクセス

**WordPress自動ログイン実装要件** 🆕:

| 実装方式 | 技術 | セキュリティ | 実装難易度 | 推奨度 |
|---------|------|------------|----------|--------|
| **Application Passwords** | WordPress 5.6+ 標準機能 | 🟢 高（トークンベース） | 🟡 中 | ✅ 推奨 |
| **JWT認証** | プラグイン（JWT Authentication） | 🟢 高（トークン有効期限） | 🟡 中 | 🟡 代替案 |
| **Cookie共有** | セッション共有 | 🔴 低（CSRF/XSS脆弱性） | 🟢 低 | ❌ 非推奨 |

**推奨実装: Application Passwords方式**

```
管理画面ポータル → WordPress REST API → 自動ログイン
         ↓
    Application Password（サイト別）
         ↓
    WordPress管理画面ダッシュボード（iframe埋め込み or リダイレクト）
```

**実装詳細**:
1. 各WordPressサイトでApplication Passwordを生成（ユーザー管理画面）
2. 管理画面ポータルの`.env`ファイルに各サイトのトークン保存
3. ポータルからWordPress REST APIで認証
4. 認証成功後、WordPressの`wp-admin`へ自動ログインセッション生成
5. ダッシュボードをiframe埋め込みまたは新規タブで表示

**セキュリティ要件**:
- ✅ Application Passwordsはユーザー別・サイト別に発行
- ✅ トークンは`.env`ファイルで管理（Git管理外）
- ✅ HTTPS通信のみ（Cloudflare Tunnel）
- ✅ トークン定期的なローテーション（6ヶ月推奨）

**メール管理統合の実装方式** ⚠️:

**Option A: リンク統合 + 統合ダッシュボード（推奨実装）**

```
┌─────────────────────────────────────────┐
│  Blog Admin Panel (ポート5002)          │
├─────────────────────────────────────────┤
│  ナビゲーション                          │
│  - ダッシュボード                        │
│  - WordPress管理                         │
│  - コンテナ管理                          │
│  - データベース管理                      │
│  - メール管理 → 🔗 Mailserver usermgmt  │  ← 既存usermgmt (5001) へリンク
├─────────────────────────────────────────┤
│  統合ダッシュボード:                     │
│  ┌──────────────┬──────────────┐        │
│  │ Blog Status  │ Mail Status  │        │  ← Docker API経由で両方の状態取得
│  │ - nginx: ✅  │ - postfix: ✅│        │
│  │ - wordpress  │ - dovecot: ✅│        │
│  │ - mariadb    │ - nginx: ✅  │        │
│  └──────────────┴──────────────┘        │
└─────────────────────────────────────────┘
```

**実装内容**:
1. **統合ダッシュボード**:
   - Docker API経由で両プロジェクト（blog/mailserver）のコンテナ状態を取得
   - Blog: nginx, wordpress, mariadb, cloudflared, admin-panel
   - Mail: postfix, dovecot, nginx, mariadb, usermgmt, roundcube, cloudflared
   - 各コンテナの稼働状態（✅/❌）、CPU/RAM使用率を一覧表示

2. **ナビゲーションリンク**:
   - 「メール管理」メニュー → 既存Mailserver usermgmt (ポート5001) へ遷移
   - 別タブまたは同一タブで遷移（ユーザー選択可）
   - 両サービスともCloudflare Tunnel経由でHTTPSアクセス

3. **技術実装**:
   - `docker` Python SDK または `dockerode` (Node.js) でDocker API接続
   - 両プロジェクトのコンテナ状態を定期的にポーリング（10秒間隔）
   - 既存usermgmtの改修不要（完全独立動作）

**メリット**:
- ✅ 開発工数最小（リンク追加のみ）
- ✅ 既存usermgmtの改修不要（独立保守可能）
- ✅ 統合ダッシュボードでBlog/Mail全体の稼働状況を一元確認
- ✅ 詳細操作は既存usermgmtへ遷移（機能重複なし）

**デメリット**:
- ⚠️ メール管理詳細操作時に画面遷移が発生（別ページ/別タブ）
- ⚠️ UI統一感は低い（ダッシュボードとusermgmtで異なるデザイン）

---

## 5. 非機能要件

### 5.1 性能要件

| 項目 | 目標値 | 測定方法 |
|------|--------|---------|
| **ページ表示速度** | < 3秒 | Google PageSpeed Insights |
| **同時接続数** | 10-50ユーザー | 初期想定 |
| **データベース応答** | < 100ms | WordPress Debug Log |
| **稼働率** | > 99% (月間) | Uptime監視 |

### 5.2 可用性要件

| 項目 | 要件 | 対策 |
|------|------|------|
| **計画停止** | 月1回以内（深夜） | メンテナンス通知 |
| **障害復旧** | RTO: 4時間以内 | バックアップからのリストア |
| **データ保護** | RPO: 24時間以内 | 日次バックアップ |

### 5.3 拡張性要件

| 項目 | 初期値 | 拡張目標 |
|------|--------|---------|
| **記事数** | 現行記事数 | 1,000記事 |
| **メディアファイル** | 現行容量 | 50GB |
| **PV数** | 現行PV数 | 10,000 PV/月 |

### 5.4 保守性要件

| 項目 | 要件 | 実装方法 |
|------|------|---------|
| **ログ保存期間** | 90日間 | logrotate設定 |
| **バックアップ保存** | 30日間 | 自動削除スクリプト |
| **ドキュメント** | 手順書完備 | Markdown形式 |
| **復旧手順** | 初級者実行可能 | ステップバイステップ手順 |

---

## 6. 技術要件

### 6.1 技術スタック

| レイヤー | 技術 | バージョン | 備考 |
|---------|------|-----------|------|
| **OS** | Rocky Linux | 9.6 | 既存環境 |
| **コンテナ** | Docker | 24.0.x+ | 既存環境 |
| **オーケストレーション** | Docker Compose | 2.x+ | 既存環境 |
| **Webサーバー** | Nginx | 1.24+ | リバースプロキシ |
| **アプリケーション** | WordPress | 6.4+ | 最新安定版 |
| **PHP** | PHP-FPM | 8.3.21 | Xserver: 8.3.21（更新済み）→ Dell: 8.3系を維持 |
| **データベース** | MariaDB | 10.11+ | Xserver: 10.5 → Dell: 10.11+（互換性あり） |
| **トンネル** | cloudflared | latest | Cloudflare公式 |
| **SSL/TLS** | Cloudflare証明書 | - | Tunnel経由自動 |

### 6.2 Dockerコンテナ構成（複数独立WordPress）

| コンテナ名 | 役割 | ベースイメージ | ポート | 備考 |
|-----------|------|---------------|--------|------|
| **wordpress** | PHP-FPM | wordpress:6.4-php8.3-fpm | 9000 (内部) | 複数独立WP処理（PHP 8.3.21） |
| **nginx** | Webサーバー | nginx:1.24-alpine | 8080 (内部) | 仮想ホスト設定 |
| **mariadb** | データベース | mariadb:10.11 | 3307 (内部) | 複数独立DB管理 |
| **cloudflared** | Cloudflare Tunnel | cloudflare/cloudflared:latest | - | 複数ドメイン対応 |
| **admin-panel** | Web管理画面 | custom (Flask/Node.js) | 5002 (内部) | 統合管理UI |

**ネットワーク構成**:
```
blog_network (bridge)
├── nginx (仮想ホスト) - ドメイン別ルーティング
│   ├── kuma8088.com → /var/www/html/kuma8088/
│   ├── courses.kuma8088.com → /var/www/html/courses-kuma8088/
│   ├── fx-trader-life.com → /var/www/html/fx-trader-life/
│   ├── courses.fx-trader-life.com → /var/www/html/courses-fx-trader/
│   └── toyota-phv.jp → /var/www/html/toyota-phv/
├── wordpress (PHP-FPM) - 複数独立WordPress処理
├── mariadb (DB) - 複数独立DB
├── cloudflared (Tunnel) - 複数ドメイン対応
└── admin-panel - 統合管理UI
```

**MariaDB構成（複数独立データベース）**:
```
MariaDB (1コンテナ)
├── blog_db_kuma8088          (kuma8088.com専用DB)
│   ├── wp_posts
│   ├── wp_postmeta
│   └── ... (WordPress標準テーブル)
├── blog_db_courses_kuma8088  (courses.kuma8088.com専用DB)
│   ├── wp_posts
│   └── ...
├── blog_db_fx_trader_life    (fx-trader-life.com専用DB)
│   ├── wp_posts
│   └── ...
├── blog_db_courses_fx_trader (courses.fx-trader-life.com専用DB)
│   ├── wp_posts
│   └── ...
└── blog_db_toyota_phv        (toyota-phv.jp専用DB)
    ├── wp_posts
    └── ...
```

**WordPress独立性の保証**:
- 各サイトは独立した `wp-config.php`（DB接続情報が異なる）
- 各サイトは独立した `wp-content/plugins/`（プラグイン競合なし）
- 各サイトは独立した `wp-content/themes/`（テーマ個別管理）
- 各サイトは独立したDB（データ完全分離）

### 6.3 ディレクトリ構成

**プロジェクトディレクトリ**:
```
/opt/onprem-infra-system/project-root-infra/services/blog/
├── docker-compose.yml        # Docker Compose定義
├── .env                       # 環境変数（Git管理外）
├── config/
│   ├── nginx/
│   │   ├── nginx.conf        # Nginx基本設定
│   │   └── sites/            # 仮想ホスト設定（サイト別）
│   │       ├── kuma8088.conf
│   │       ├── courses-kuma8088.conf
│   │       ├── fx-trader-life.conf
│   │       ├── courses-fx-trader.conf
│   │       └── toyota-phv.conf
│   ├── php/
│   │   └── php.ini           # PHP設定
│   ├── cloudflared/
│   │   └── config.yml        # Cloudflare Tunnel設定
│   └── admin-panel/
│       └── config.py         # 管理画面設定
├── admin-panel/              # Web管理画面ソースコード
│   ├── app.py                # Flask/Node.js アプリ
│   ├── templates/            # UIテンプレート
│   └── static/               # CSS/JS
├── scripts/
│   ├── backup.sh             # バックアップスクリプト（全サイト対応）
│   ├── restore.sh            # リストアスクリプト（サイト別対応）
│   ├── migrate-from-xserver.sh  # Xserver移行スクリプト
│   ├── add-site.sh           # 新規サイト追加スクリプト
│   └── create-db.sh          # DB作成スクリプト
└── README.md                 # 構築手順
```

**ホスト側ストレージ構成（複数独立WordPress）** ⚠️:

```
/mnt/backup-hdd/blog/
├── sites/                    # 各WordPress実体（HDD）
│   ├── kuma8088/
│   │   ├── wp-config.php
│   │   ├── wp-content/
│   │   ├── wp-admin/
│   │   └── wp-includes/
│   ├── courses-kuma8088/
│   │   ├── wp-config.php
│   │   └── wp-content/
│   ├── fx-trader-life/
│   │   ├── wp-config.php
│   │   └── wp-content/
│   ├── courses-fx-trader/
│   │   └── ...
│   └── toyota-phv/
│       └── ...
└── backups/                  # バックアップ保存先（HDD）
    ├── daily/
    └── weekly/
```

**ストレージマッピング**:

| ホストパス（実体） | Docker Volume名 | コンテナ内パス | デバイス | 用途 |
|----------------|----------------|--------------|---------|------|
| `/mnt/backup-hdd/blog/sites/` | `blog_sites_data` | `/var/www/html/` | HDD | 複数独立WordPress |
| `/var/lib/docker/volumes/blog_mysql_data/` | `blog_mysql_data` | `/var/lib/mysql/` | SSD | MariaDB（複数DB） |
| `/var/lib/docker/volumes/blog_logs/` | `blog_logs` | `/var/log/nginx/` | SSD | Nginxログ |
| `/mnt/backup-hdd/blog/backups/` | - | - | HDD | バックアップ保存先 |

**docker-compose.yml volumesセクション**:
```yaml
volumes:
  blog_sites_data:
    driver: local
    driver_opts:
      type: none
      device: /mnt/backup-hdd/blog/sites
      o: bind
  blog_mysql_data:
    # SSD (Dockerデフォルトボリューム)
  blog_logs:
    # SSD (Dockerデフォルトボリューム)
```

**コンテナ内から見た構造**:
```
/var/www/html/ (コンテナ内)
├── kuma8088/          → ホスト: /mnt/backup-hdd/blog/sites/kuma8088/
├── courses-kuma8088/  → ホスト: /mnt/backup-hdd/blog/sites/courses-kuma8088/
├── fx-trader-life/    → ホスト: /mnt/backup-hdd/blog/sites/fx-trader-life/
├── courses-fx-trader/ → ホスト: /mnt/backup-hdd/blog/sites/courses-fx-trader/
└── toyota-phv/        → ホスト: /mnt/backup-hdd/blog/sites/toyota-phv/
```

---

## 7. インフラ制約

### 7.1 ハードウェア制約

| 項目 | 制約 | 対応策 |
|------|------|--------|
| **CPU** | 6コア/12スレッド | Mailserver + Blog共存可能（現在CPU利用率低） |
| **RAM** | 32GB | Blog用に6-8GB割当（**全18個のWP環境前提**）<br>Mailserver: 11GB使用中、残余: 19GB利用可能 |
| **SSD** | 390GB (Docker用) | DB・ログ配置（容量監視必須）<br>Blog用に40-50GB確保推奨（**全18個DB前提**） |
| **HDD** | 3.6TB (データ用) | WordPressファイル・メディア配置<br>**現在434MB使用、3.4TB空き** → Blog用に50-80GB確保（**全18個WP前提**） |

**ストレージ要件詳細（全18個WP環境移行前提）**:
- **Xserver使用量**: 10.649GB（358,646ファイル）
- **Dell HDD割当**: 50GB（安全率5倍、将来的な拡張考慮）
- **Dell SSD割当**: 40GB（DB + ログ用、全18個のDB前提）
- **合計必要容量**: 90GB（HDD: 50GB + SSD: 40GB）
- **inode数**: 358,646ファイル → ext4/xfsで問題なし（数百万inode対応可）

**⚠️ 注**: 実際には段階的移行で厳選する予定だが、リソース設計は**全18個のWP環境を移行する前提**で余裕を持たせる

### 7.2 ネットワーク制約

| 項目 | 制約 | 対応策 |
|------|------|--------|
| **IPアドレス** | 動的IP | Cloudflare Tunnel使用 |
| **ポート開放** | 不要 | Cloudflare Tunnel（outbound接続のみ） |
| **帯域** | 家庭用回線 | Cloudflare CDN活用 |

### 7.3 既存インフラとの共存

| 項目 | 制約 | 対応策 |
|------|------|--------|
| **Mailserver nginx** | Port 443使用中 | Blog nginxは内部8080使用 |
| **MariaDB** | Port 3306使用中 | Blog MariaDBは内部3307使用 |
| **Docker Network** | mailserver_network存在 | blog_network新規作成 |
| **バックアップ** | 既存システムあり | スクリプト統合 |

---

## 8. ネットワーク・セキュリティ要件

### 8.1 Cloudflare Tunnel構成

**アーキテクチャ**:
```
[ユーザー] → [Cloudflare Edge] → [Tunnel] → [Dell nginx:8080] → [WordPress]
     ↓              ↓                ↓
  HTTPS        DDoS保護        outbound接続のみ
               CDN              (ポート開放不要)
```

**Tunnel設定要件**:
- Cloudflareアカウント作成（無料プラン可）
- ドメインDNS管理をCloudflareへ移管
- cloudflaredデーモンのDocker化
- Tunnel認証情報の安全管理（`.env`でGit管理外）

### 8.2 セキュリティ要件

| カテゴリ | 要件 | 実装方法 |
|---------|------|---------|
| **通信暗号化** | HTTPS必須 | Cloudflare証明書 |
| **WordPress管理画面** | IP制限またはベーシック認証 | Nginx設定 |
| **データベース** | 外部アクセス禁止 | Docker内部ネットワークのみ |
| **ファイルパーミッション** | 最小権限 | Dockerfile設定 |
| **WordPress更新** | 定期更新（月1回） | 手動実施 |
| **プラグイン管理** | 必要最小限 | セキュリティ脆弱性チェック |
| **バックアップ暗号化** | 将来的に検討 | Phase 11-B統合時 |

### 8.3 アクセス制御

| 対象 | アクセス制御 | 実装 |
|------|------------|------|
| **WordPress管理画面** | `/wp-admin/` IP制限 | Nginx設定 |
| **phpMyAdmin** | 非公開（必要時のみ起動） | Docker Composeコメントアウト |
| **SSH** | 非標準ポート + 鍵認証 | 既存設定維持 |
| **Docker管理** | root/sudo権限のみ | OS設定 |

---

## 9. 移行要件

### 9.1 移行対象データ

**⚠️ 重要**: 実際には**厳選した7サイトのみ移行**するが、リソース設計は全18個対応可能な容量を確保。

| データ種別 | 移行元 | 移行方法 | 移行予定数量（実測）| リソース設計容量 | 優先度 |
|-----------|--------|---------|-------------------|---------------|--------|
| **WordPress DB** | MariaDB 10.5 | mysqldump → MariaDB 10.11+ | **Phase 1: 6個のDB（530-600 MB）**<br>**Phase 2: 3個のDB（23.7 MB）** | **最大22個対応可能** | 🔴 必須 |
| **WordPress files** | Xserver FTP | rsync/FTP → Docker Volume | **Phase 1: 約600 MB想定**<br>（6サイト分） | **50GB確保（余裕あり）** | 🔴 必須 |
| **メディアファイル** | wp-content/uploads/ | FTP → Docker Volume | **容量に含まれる**<br>（サイト別容量確認済み） | **40万ファイル対応可能** | 🔴 必須 |
| **プラグイン** | wp-content/plugins/ | FTP → Docker Volume | **9サイト分（Phase 1+2）** | **18サイト分対応可能** | 🔴 必須 |
| **テーマ** | wp-content/themes/ | FTP → Docker Volume | **9サイト分（Phase 1+2）** | **18サイト分対応可能** | 🔴 必須 |
| **設定情報** | wp-config.php | 手動移行（環境変数化） | **9サイト分（Phase 1+2）** | **18サイト分対応可能** | 🔴 必須 |

**バージョン互換性**:
- **MariaDB**: 10.5 (Xserver) → 10.11+ (Dell) ✅ 互換性あり（マイナーバージョンアップ）
- **PHP**: **8.3.21 (Xserver更新済み) → 8.3系 (Dell)** ✅ 完全互換（同一バージョン）
- **WordPress**: 各環境のバージョン確認必要 → 最新版へ更新推奨

### 9.2 移行手順概要

**⚠️ 段階的移行方針**: 構成調査 → 移行サイト確定 → 1サイト試行 → 問題点抽出・修正 → 残り6サイト移行

**Phase A-0: Xserver環境調査（必須）** 🆕
1. **Xserverデータダウンロード**:
   - 全WordPressファイル一括ダウンロード（FTP/rsync）
   - 全データベースバックアップ（phpMyAdmin/mysqldump）
2. **各ドメイン内のWordPress構成調査**:
   - kuma8088.com 8個の構成確認（URL構造、DB名、アクセス数）
   - fx-trader-life.com 6個の構成確認（同上）
   - webmakesprofit.com 2個の構成確認（同上）
3. **移行サイト確定**:
   - 各ドメインから1-2個を優先度順に選定（計7サイト）
   - 選定基準: アクセス数、記事数、最終更新日、運用状況
4. **移行対象サイトの詳細記録**:
   - プラグイン一覧・テーマ情報
   - URL構造・パーマリンク設定
   - DB名・テーブルプレフィックス
   - メディアファイル容量

**Phase A: 準備（Xserver側作業）**
1. Phase A-0で確定した7サイトのデータを整理
2. 移行対象外の11サイトを除外
3. 移行手順書作成（サイト別）

**Phase B: Dell環境構築**
1. Docker Compose環境構築（5コンテナ）
2. Cloudflare Tunnel設定（複数ドメイン対応準備）
3. Nginx仮想ホスト設定（全ドメイン分用意）
4. Admin panel構築

**Phase C-1: 試行移行（1ドメイン）** 🆕
1. **試行ドメイン選定**: kuma8088.com（優先度高・問題検知しやすい）
2. DB・ファイルインポート（1サイトのみ）
3. wp-config.php調整（DB接続情報、URL変更）
4. ローカル動作確認（Tunnel経由）
5. 表示崩れ・リンク切れチェック
6. 管理画面動作確認
7. パフォーマンステスト

**Phase C-2: 問題点抽出・修正** 🆕
1. **問題点リスト作成**:
   - プラグイン互換性問題
   - パーマリンク設定不備
   - 画像パス問題
   - パフォーマンス問題
   - セキュリティ設定不備
2. **修正実装**: 問題点を解決
3. **再検証**: 修正後の動作確認
4. **移行手順書更新**: 発見した問題の対処法を文書化

**Phase C-3: 残り6サイト移行** 🆕
1. **2サイト目**: courses.kuma8088.com（サブドメイン）
2. **3サイト目**: fx-trader-life.com（メインドメイン）
3. **4サイト目**: courses.fx-trader-life.com（サブドメイン）
4. **5サイト目**: toyota-phv.jp（検討中サイト、Phase A-0で最終確定）
5. **6サイト目**: webmakeprofit.org（検討中サイト、Phase A-0で最終確定）
6. **7サイト目**: webmakesprofit.com（検討中サイト1個、Phase A-0で最終確定）
7. 各サイトで Phase C-1 の手順を繰り返し
8. 問題発生時は Phase C-2 へ戻る

**⚠️ 注**: 検討中3サイト（5-7）はPhase A-0調査結果で移行可否を最終確定

**Phase D: DNS切替（ドメイン別段階的切替）**
1. **1サイト目DNS切替**:
   - Cloudflare DNS設定（kuma8088.com）
   - TTL短縮（切替前24時間）
   - DNS切替実施
   - 24時間監視
2. **問題なければ2-7サイト目のドメインを順次切替**:
   - courses.kuma8088.com
   - fx-trader-life.com
   - courses.fx-trader-life.com
   - toyota-phv.jp（Phase A-0で確定時）
   - webmakeprofit.org（Phase A-0で確定時）
   - webmakesprofit.com（Phase A-0で確定時）
3. 各ドメイン切替後24時間の監視期間

**Phase E: Xserver停止**
1. 全ドメイン移行後2週間並行運用（問題検知期間）
2. Xserver側メンテナンスモード
3. 契約解約手続き

**段階的移行のメリット**:
- ✅ 小規模試行で問題を早期発見
- ✅ 影響範囲を限定（1サイト障害が全体に波及しない）
- ✅ 修正実装後に残りサイトへ展開（同じ問題の再発防止）
- ✅ DNS切替失敗時のロールバックが容易

### 9.3 移行リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| **URL変更によるSEO影響** | 高 | リダイレクト設定（Xserver → Dell） |
| **画像パス変更** | 中 | Search & Replace DB修正 |
| **プラグイン互換性** | 中 | 事前動作確認、代替プラグイン調査 |
| **DNS切替ダウンタイム** | 低 | TTL短縮、並行運用期間確保 |
| **データ損失** | 高 | 移行前フルバックアップ、2週間並行運用 |

---

## 10. 運用要件

### 10.1 日常運用タスク

| 頻度 | タスク | 担当 | 所要時間 |
|------|--------|------|---------|
| **日次** | サービス稼働確認 | 管理者 | 5分 |
| | バックアップ成功確認 | 自動 | - |
| **週次** | ログ確認（エラー・アクセス） | 管理者 | 15分 |
| | ディスク容量確認 | 管理者 | 5分 |
| **月次** | WordPress/プラグイン更新 | 管理者 | 30分 |
| | バックアップリストアテスト | 管理者 | 60分 |
| | セキュリティ脆弱性チェック | 管理者 | 30分 |

### 10.2 バックアップ要件

**バックアップ対象（複数独立WordPress）**:

| 対象 | ホスト側パス | バックアップ方法 | 単位 |
|------|------------|---------------|------|
| **WordPress DB** | `blog_mysql_data` volume | mysqldump（DB別） | サイト別 |
| **WordPress files** | `/mnt/backup-hdd/blog/sites/*/` | tar.gz（サイト別） | サイト別 |
| **Nginx設定** | `services/blog/config/nginx/` | rsync | 全体 |
| **Docker Compose** | `services/blog/docker-compose.yml` | copy | 全体 |
| **管理画面** | `services/blog/admin-panel/` | rsync | 全体 |

**バックアップコマンド例**:
```bash
# サイト別DBバックアップ
mysqldump -u root -p blog_db_kuma8088 > kuma8088.sql
mysqldump -u root -p blog_db_fx_trader_life > fx-trader-life.sql

# サイト別ファイルバックアップ
tar -czf kuma8088-YYYYMMDD.tar.gz /mnt/backup-hdd/blog/sites/kuma8088/
tar -czf fx-trader-life-YYYYMMDD.tar.gz /mnt/backup-hdd/blog/sites/fx-trader-life/
```

**バックアップスケジュール**:
- 日次: AM 3:30（Mailserver AM 3:00の後）
  - 全サイトのDB + Filesをバックアップ
- 週次: 日曜 AM 2:30（Mailserver AM 2:00の後）
  - 全サイトの完全バックアップ
- S3同期: AM 4:30（Phase 11-B統合時）

**バックアップ保存先**:
- ローカル: `/mnt/backup-hdd/blog/backups/`
  - 日次: `daily/kuma8088-YYYYMMDD.tar.gz`（7世代 × サイト数）
  - 週次: `weekly/all-sites-YYYYMMDD.tar.gz`（4世代）
- S3: `s3://[bucket-name]/blog/[site-name]/`（30日間Object Lock）

**リストア手順**:
- 完全復旧（全サイト）: RTO 2時間、RPO 24時間
- 個別サイト復旧: RTO 30分、RPO 24時間
- DB/Files個別復旧: RTO 15分、RPO 24時間

### 10.3 監視要件

| 監視項目 | 閾値 | アラート方法 |
|---------|------|------------|
| **サービス稼働** | Down検知 | メール通知（将来） |
| **ディスク容量** | SSD > 80%, HDD > 90% | ログ記録 |
| **メモリ使用率** | > 85% | ログ記録 |
| **CPU使用率** | > 80% (5分平均) | ログ記録 |
| **バックアップ失敗** | 失敗検知 | ログ記録 |

---

## 11. リスク管理

### 11.1 技術リスク

| リスク | 確率 | 影響 | 対策 | 優先度 |
|--------|------|------|------|--------|
| **Docker障害** | 低 | 高 | 既存Mailserverで実績あり | 🟢 |
| **Cloudflare Tunnel障害** | 低 | 高 | Cloudflare SLA信頼、代替DNS準備 | 🟡 |
| **WordPress脆弱性** | 中 | 高 | 定期更新、セキュリティプラグイン | 🟡 |
| **ディスク容量不足** | 中 | 中 | 監視・アラート、容量計画 | 🟡 |
| **データ損失** | 低 | 高 | 日次バックアップ、S3レプリケーション | 🟢 |

### 11.2 運用リスク

| リスク | 確率 | 影響 | 対策 | 優先度 |
|--------|------|------|------|--------|
| **管理者不在時障害** | 中 | 中 | 復旧手順書整備、自動復旧スクリプト | 🟡 |
| **誤操作によるデータ削除** | 低 | 高 | バックアップ、権限管理 | 🟢 |
| **メンテナンス作業ミス** | 低 | 中 | 手順書チェックリスト、ロールバック手順 | 🟢 |

### 11.3 移行リスク

| リスク | 確率 | 影響 | 対策 | 優先度 |
|--------|------|------|------|--------|
| **複数WP一括移行の失敗** | 高 | 高 | 段階的移行、優先度順実施 | 🔴 |
| **7サイト環境管理複雑化** | 中 | 中 | Docker Compose統合、管理スクリプト整備、admin-panel統合管理 | 🟡 |
| **SEO順位低下** | 中 | 高 | リダイレクト設定、並行運用期間 | 🔴 |
| **DNS切替失敗（複数ドメイン）** | 中 | 高 | TTL短縮、ドメイン別段階的切替 | 🔴 |
| **移行データ不整合** | 中 | 中 | 事前検証、Search & Replace | 🟡 |
| **PHP互換性問題** | 低 | 低 | ✅ PHP 8.3.21で統一済み、プラグイン互換性は要確認 | 🟢 |
| **Xserver契約早期解約** | 低 | 高 | 2週間並行運用、問題発生時切戻し | 🔴 |

**⚠️ 複数WordPress環境移行の特殊リスク**:
- **リスク1**: 7サイトを一度に移行すると、1つでも問題が発生した際の影響範囲が大きい
- **対策1**: 段階的移行（Phase C-1: 1サイト試行 → Phase C-2: 問題修正 → Phase C-3: 残り6サイト移行）を実施
- **リスク2**: 複数ドメイン（5-7ドメイン）のDNS切替失敗時、全サイトがダウンする可能性
- **対策2**: ドメイン単位で段階的にDNS切替（Phase D）、切戻し手順の事前確認

---

## 12. 成功基準

### 12.1 移行成功基準

**⚠️ 段階的移行を前提とした期間設定**:

| フェーズ | 期間 | 作業内容 | 成功基準 |
|---------|------|---------|---------|
| **Phase 1: 環境構築** | 1-2週間 | Docker環境構築、管理画面開発 | コンテナ起動成功 |
| **Phase 2: テスト移行** | 1週間 | 1-2サイトで移行テスト | データ完全性100% |
| **Phase 3: 本番移行** | 2-4週間 | 厳選サイト段階的移行 | ダウンタイム < 1h/サイト |
| **Phase 4: 安定化** | 2週間 | 監視・最適化 | 稼働率 > 99% |
| **合計** | **6-9週間** | **全体移行完了** | **SEO順位変動 < 10%** |

**個別サイト移行基準**:
| 基準 | 目標値 | 測定方法 |
|------|--------|---------|
| **データ完全性** | 100% | 記事数・メディアファイル数比較 |
| **ダウンタイム** | < 1時間/サイト | DNS切替時間測定 |
| **SEO影響** | 検索順位変動 < 10% | Google Search Console |
| **ページ表示速度** | < 3秒 | PageSpeed Insights |

### 12.2 運用安定化基準

| 基準 | 目標値 | 評価期間 |
|------|--------|---------|
| **稼働率** | > 99% | 移行後1ヶ月 |
| **バックアップ成功率** | 100% | 移行後1ヶ月 |
| **障害ゼロ** | 重大障害0件 | 移行後1ヶ月 |
| **復旧成功** | リストアテスト成功 | 移行後1ヶ月以内 |

### 12.3 コスト削減達成基準

| 項目 | 現状 | 目標 | 達成時期 |
|------|------|------|---------|
| **月額コスト** | 1,100円（12月から1,320円） | 電気代のみ（追加コストなし） | Xserver解約後 |
| **年間削減額** | - | 13,200円/年（12月以降15,840円/年） | 移行完了後 |
| **5年累計削減** | - | 約79,200円 | 5年間運用後 |

---

## 付録A: 参考情報

### A.1 関連ドキュメント

- [インフラドキュメント](../../infra/README.md)
- [Mailserver構築ドキュメント](../mailserver/README.md)
- [Docker環境構築手順](../../infra/procedures/3-docker/3.1-docker-environment-setup.md)
- [バックアップシステム実装](../mailserver/backup/03_implementation.md)
- [S3バックアップ実装](../mailserver/backup/07_s3backup_implementation.md)

### A.2 技術参考リンク

**WordPress公式**:
- [WordPress Requirements](https://wordpress.org/about/requirements/)
- [Installing WordPress](https://wordpress.org/support/article/how-to-install-wordpress/)

**Docker公式**:
- [Docker Hub - WordPress](https://hub.docker.com/_/wordpress)
- [Docker Hub - MariaDB](https://hub.docker.com/_/mariadb)
- [Docker Compose](https://docs.docker.com/compose/)

**Cloudflare Tunnel公式**:
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)

**Nginx公式**:
- [Nginx WordPress Configuration](https://www.nginx.com/resources/wiki/start/topics/recipes/wordpress/)

### A.3 用語集

| 用語 | 説明 |
|------|------|
| **Cloudflare Tunnel** | 動的IPでもHTTPS公開可能にするトンネリングサービス（旧Argo Tunnel） |
| **cloudflared** | Cloudflare Tunnelのデーモンプロセス |
| **RTO** | Recovery Time Objective（目標復旧時間） |
| **RPO** | Recovery Point Objective（目標復旧時点） |
| **Docker Compose** | 複数コンテナのオーケストレーションツール |
| **PHP-FPM** | PHP FastCGI Process Manager |
| **SEO** | Search Engine Optimization（検索エンジン最適化） |

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-11-08 | 初版作成 | Claude |
| 1.1 | 2025-11-08 | Xserver調査結果反映<br>- 複数WordPress環境（18個）の存在を明記<br>- 複数ドメイン（6個+2サブドメイン）対応追加<br>- 具体的な数値（10.649GB、358,646ファイル、22DB）反映<br>- MariaDB 10.5、PHP 7.4/8.1の情報追加<br>- コスト削減額明確化（年間13,200円〜15,840円）<br>- 段階的移行の推奨を追加<br>- リスク管理セクション強化 | Claude |
| 1.2 | 2025-11-08 | 技術方針の重大修正（指摘事項対応）<br>- WordPressマルチサイト構成を明記（1コンテナで複数サイト管理）<br>- ドメイン情報修正（gwpbk492.xsrv.jp = kuma8088.com）<br>- サブドメイン明記（courses.fx-trader-life.com, courses.kuma8088.com）<br>- Web管理画面要件を追加（統合管理UI）<br>- ホスト側ストレージマッピング明確化<br>- バックアップパス修正（ホストパスとコンテナパス統一）<br>- 移行期間を段階的移行に合わせて修正（6-9週間）<br>- admin-panelコンテナ追加 | Claude |
| 1.3 | 2025-11-08 | **アーキテクチャ根本変更**（ユーザー質問による方針転換）<br>- **WordPressマルチサイト機能を不使用に変更**<br>- **1コンテナで複数独立WordPress方式に変更**<br>- 各サイト完全独立（独立DB、独立wp-config.php、独立プラグイン/テーマ）<br>- Nginx仮想ホスト設定でドメイン別ルーティング<br>- MariaDB: 複数独立DB構成（blog_db_kuma8088等）<br>- ディレクトリ構成: `/mnt/backup-hdd/blog/sites/[site-name]/`<br>- バックアップ: サイト別対応に変更<br>- メリット: プラグイン競合なし、障害影響範囲限定、通常WP運用知識で管理可能 | Claude |
| 1.4 | 2025-11-08 | **メール管理統合の実装方式を具体化**<br>- **Option A: リンク統合 + 統合ダッシュボード方式を採用**<br>- 既存usermgmt (ポート5001) へのリンク統合を明記<br>- Docker API経由で両プロジェクト（blog/mailserver）のコンテナ状態を統合表示<br>- 統合ダッシュボード: Blog Status + Mail Status を一元確認<br>- メリット: 開発工数最小、既存usermgmt改修不要、独立保守可能<br>- デメリット: 画面遷移発生、UI統一感は低い<br>- 技術実装: docker Python SDK/dockerode でDocker API接続 | Claude |
| 1.5 | 2025-11-08 | **用語統一と矛盾修正**（残課題3件の指摘対応）<br>- **High修正**: 「WordPressマルチサイト構成」→「複数独立WordPress構成」に統一<br>- 対象外に「WordPressマルチサイト機能の使用」を明記<br>- **Medium修正1**: ドメイン情報を5個+サブドメイン2個に統一<br>- gwpbk492.xsrv.jp → kuma8088.com移行を全体で明確化<br>- Cloudflareルーティング図を移行対象ドメインに限定<br>- **Medium修正2**: 移行対象データ表を厳選移行に更新<br>- 「22個のDB」「18個のWP分」→「5-10個想定（厳選サイト分）」<br>- 移行サイト数決定方針を追加（Phase 1: 4サイト確定、Phase 2: 3サイト検討中） | Claude |
| 1.6 | 2025-11-08 | **用語統一最終修正と段階的移行方針追加**（指摘事項2件対応）<br>- **Medium修正**: Section 4.2「6ドメイン + 2サブドメイン」→「5ドメイン + 2サブドメイン（厳選移行）」に統一<br>- **Low修正**: 「パスベースルーティング」→「ドメインベースルーティング」に用語統一<br>- **段階的移行方針を追加**（Section 9.2）:<br>  - Phase C-1: 試行移行（kuma8088.com 1ドメインのみ）<br>  - Phase C-2: 問題点抽出・修正（問題リスト作成→修正実装→再検証→手順書更新）<br>  - Phase C-3: 残りドメイン移行（courses.kuma8088.com → fx-trader-life.com → courses.fx-trader-life.com）<br>  - Phase D: DNS切替をドメイン別段階的切替に変更（各ドメイン24時間監視）<br>- 段階的移行のメリットを明記（早期問題発見、影響範囲限定、再発防止、ロールバック容易） | Claude |
| 1.7 | 2025-11-08 | **リソース設計を全18個WP環境前提に変更**（指摘事項2件対応）<br>- **Medium修正1**: 移行対象合計「2-18個程度」→「最大18個（段階的に厳選）」に統一<br>- **リソース設計方針を明確化**: 実際には厳選移行するが、リソース見積もりは全18個前提<br>- **Medium修正2**: 各ドメイン内の複数WP構成を明文化:<br>  - kuma8088.com 8個、fx-trader-life.com 6個の構成は未調査（Xserverデータダウンロード後に調査）<br>  - サブディレクトリ構成なのか、別サブドメインなのか、別サイトなのかは未確定<br>  - Dell側で独立WordPressとして展開予定<br>- **リソース見積もりを全18個前提に更新**:<br>  - RAM: 4-6GB → 6-8GB（全18個WP環境前提）<br>  - SSD: 30-40GB → 40-50GB（全18個DB前提）<br>  - HDD: 30-50GB → 50-80GB（全18個WP前提）<br>  - 移行対象データ表: 「5-10個想定」→「最大22個のDB（全18個のWP環境前提）」<br>- **段階的移行を4 Phaseに拡張**: Phase 4として残りのWP環境（計13個）を追加 | Claude |

---

**次のドキュメント**: [02_design.md](02_design.md) - システム設計書
**関連ドキュメント**: [03_installation.md](03_installation.md) - 構築手順書
