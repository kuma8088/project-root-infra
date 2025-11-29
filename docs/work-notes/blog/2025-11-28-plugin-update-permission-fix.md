# WordPressプラグインアップデート問題の調査と解決

## 日付
2025-11-28

## 問題の概要
webmakeprofit.orgを含む全WordPressサイトで、管理画面からプラグインアップデートができない問題が発生。

## 調査プロセス

### 1. 初期調査
- **影響範囲**: webmakeprofit.orgで確認、後に全16サイトで同様の問題を発見
- **症状**: 「更新に失敗しました」等のエラー表示
- **Dockerコンテナ状態**: 全コンテナ稼働中（一部unhealthy）

### 2. 根本原因の特定

#### パーミッション問題の発見
```bash
# PHP-FPMプロセス: www-data (UID 82) で実行
$ docker compose exec wordpress id www-data
uid=82(www-data) gid=82(www-data) groups=82(www-data),82(www-data)

# wp-content/plugins: 1000:1000 (system-admin) が所有
$ docker compose exec wordpress stat -c "%u:%g" /var/www/html/webmakeprofit/wp-content/plugins
1000:1000
```

**問題**: www-dataユーザー (UID 82) が、1000:1000所有のディレクトリに書き込めない

#### 全サイトの状況確認
```bash
# 全16サイトで同様の問題を発見
$ docker compose exec wordpress bash -c 'for dir in /var/www/html/*/; do ...'

fx-trader-life-4line: 9111 files
fx-trader-life-lp: 2731 files
fx-trader-life-mfkc: 11867 files
fx-trader-life: 11954 files
kuma8088-cameramanual-gwpbk492: 1622 files
kuma8088-cameramanual: 1752 files
kuma8088-ec02test: 19660 files
kuma8088-elementor-demo-03: 5731 files
kuma8088-elementor-demo-04: 4211 files
kuma8088-elementordemo02: 5792 files
kuma8088-elementordemo1: 7630 files
kuma8088-test: 2134 files
toyota-phv: 5773 files
webmakeprofit-coconala: 15899 files
webmakeprofit: 44135 files (修正前)
webmakesprofit: 33572 files

合計: 約148,000ファイル
```

#### wp-config.php設定確認
```bash
$ docker compose exec wordpress cat /var/www/html/webmakeprofit/wp-config.php | grep FS_METHOD
define('FS_METHOD', 'direct');
```

`FS_METHOD = 'direct'` が設定されているため、WordPressはファイルシステムに直接書き込もうとするが、パーミッションがないため失敗。

## 解決策

### 実施した修正

#### 1. 全サイトのパーミッション修正
```bash
docker compose exec wordpress bash -c '
for dir in /var/www/html/*/; do
    sitename=$(basename "$dir")
    if [ -d "$dir/wp-content" ]; then
        echo "Fixing: $sitename"
        chown -R www-data:www-data "$dir/wp-content"
    fi
done
'
```

#### 2. 修正後の確認
```bash
# 全サイトで "0 files" → 全て修正完了
fx-trader-life-4line: 0 files
fx-trader-life-lp: 0 files
...
webmakesprofit: 0 files
```

### テスト結果

#### webmakeprofit.org
✅ 成功したアップデート:
- akismet: 5.5 → 5.6
- cartflows: 2.1.16 → 2.1.17
- code-snippets: 3.8.2 → 3.9.2
- elementor: 3.33.0 → 3.33.2
- essential-addons-for-elementor-lite: 6.4.0 → 6.5.3

残り13個のプラグインがアップデート可能

#### fx-trader-life
✅ 成功したアップデート:
- akismet: 5.5 → 5.6
- pochipp: 1.17.1 → 1.17.3

残り5個のプラグインがアップデート可能

## 予防策

### 自動化スクリプト作成
`services/blog/scripts/fix-permissions.sh` を作成

**使用方法**:
```bash
cd /opt/onprem-infra-system/project-root-infra/services/blog
./scripts/fix-permissions.sh
```

**実行タイミング**:
1. ホストからコンテナへファイルをコピーした後
2. バックアップからリストアした後
3. WordPress管理画面からプラグイン/テーマアップデートが失敗した時

### ベストプラクティス

#### ファイル操作時の注意点
```bash
# ❌ 悪い例: ホストからコンテナへコピー（所有者が1000:1000になる）
docker cp /source/path blog-wordpress:/var/www/html/newsite

# ✅ 良い例: コピー後に所有者を修正
docker cp /source/path blog-wordpress:/var/www/html/newsite
docker compose exec wordpress chown -R www-data:www-data /var/www/html/newsite/wp-content
```

#### 新規サイト作成時
`create-new-wp-site.sh` スクリプトを拡張し、自動的にパーミッション設定を含める

## 関連ドキュメント
- [Blog System README](../../../docs/application/blog/README.md)
- [CLAUDE.md](../../../CLAUDE.md) - よくある落とし穴セクション

## 学んだこと
1. XserverからDell環境への移行時、ファイル所有者が保持されない
2. Docker環境では、ホストのUID/GIDとコンテナのUID/GIDが異なる場合がある
3. `FS_METHOD = 'direct'` 設定時は、適切なファイル所有者設定が必須
4. 1サイトで問題が発生した場合、他のサイトでも同様の問題がある可能性が高い

## 次のアクション
- [x] 全サイトのパーミッション修正完了
- [x] 予防策スクリプト作成
- [ ] CLAUDE.mdの「よくある落とし穴」セクションに追記
- [ ] create-new-wp-site.shにパーミッション設定を追加
- [ ] バックアップ/リストアスクリプトにパーミッション修正を組み込み

## 参考コマンド

### パーミッション診断
```bash
# 特定サイトの問題確認
docker compose exec wordpress find /var/www/html/webmakeprofit/wp-content \
  -type f -not -user www-data 2>/dev/null | wc -l

# 全サイトの問題確認
docker compose exec wordpress bash -c \
'for dir in /var/www/html/*/; do
  sitename=$(basename "$dir");
  wrongfiles=$(find "$dir/wp-content" -type f -not -user www-data 2>/dev/null | wc -l);
  if [ "$wrongfiles" -gt 0 ]; then
    echo "$sitename: $wrongfiles files";
  fi;
done'
```

### プラグイン管理
```bash
# アップデート可能なプラグイン一覧
docker compose exec wordpress wp --allow-root --path=/var/www/html/SITENAME \
  plugin list --update=available

# 全プラグインアップデート（dry-run）
docker compose exec wordpress wp --allow-root --path=/var/www/html/SITENAME \
  plugin update --all --dry-run

# 特定プラグインのアップデート
docker compose exec wordpress wp --allow-root --path=/var/www/html/SITENAME \
  plugin update PLUGIN_NAME
```
