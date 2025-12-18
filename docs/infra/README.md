# Infrastructure Documentation

**作成者**: kuma8088（AWS認定ソリューションアーキテクト、ITストラテジスト）

ハイブリッドクラウド（オンプレミス + Cloudflare + AWS）によるメールサーバー・ブログシステムの構築・運用ドキュメント

---

## 🎯 プロジェクト背景

- **Xserver固定費削減**: レンタルサーバー月額費用からの脱却
- **個人プロジェクト運用**: 複数ドメイン・複数サイトを自前で管理
- **Webサーバ・メールサーバ構築**: Xserver相当の機能を自営
- **Linux基盤でのサービス構築**: Rocky Linux + Docker によるコンテナ運用
- **技術スタック検証**: 自己ホスティングに必要な技術要素の確認と実装

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| **OS** | Rocky Linux 9.6 |
| **コンテナ** | Docker, Docker Compose |
| **IaC** | Terraform |
| **クラウド** | AWS (S3, CloudWatch, SNS), Cloudflare (Tunnel, Email Routing, Workers) |
| **VPN** | Tailscale |
| **メール** | Postfix, Dovecot, Rspamd, ClamAV, Roundcube, SendGrid |
| **Web** | Nginx, WordPress, PHP-FPM |
| **DB/Cache** | MariaDB, Redis |
| **Backend** | Python (Flask, FastAPI) |

技術スタックの要件定義・設計・実装・運用については、以下のドキュメントを参照してください。

## 📋 ドキュメント構成

| ドキュメント | 内容 |
|------------|------|
| [requirements.md](requirements.md) | 要件定義・トレードオフ分析 |
| [architecture.md](architecture.md) | システム設計・アーキテクチャ図 |
| [deployment.md](deployment.md) | デプロイ戦略・Docker/Terraform |
| [operations.md](operations.md) | 運用設計・監視・バックアップ |

---

## 🌩️ 今後の展望

- **現状**: オンプレミス環境で本番運用中
- **AWS活用拡大**: EC2/ECSによるステージング環境、Multi-AZ構成での冗長化
- **監視強化**: Prometheus/Grafana によるメトリクス可視化・アラート
- **CI/CD**: GitHub Actions による自動デプロイパイプライン
