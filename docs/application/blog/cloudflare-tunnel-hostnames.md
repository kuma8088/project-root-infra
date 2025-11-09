# Cloudflare Tunnel Public Hostname設定

## 📍 Zero Trust Dashboard
https://one.dash.cloudflare.com/

## 🔧 設定箇所
Networks → Tunnels → blog-tunnel → Public Hostnames

## ✅ 追加するホスト名（14サイト）

### Phase 1: Root domain sites (4)
1. blog.fx-trader-life.com
   - Service: http://nginx:80
   - HTTP Host Header: blog.fx-trader-life.com

2. blog.webmakeprofit.org
   - Service: http://nginx:80
   - HTTP Host Header: blog.webmakeprofit.org

3. blog.webmakesprofit.com
   - Service: http://nginx:80
   - HTTP Host Header: blog.webmakesprofit.com

4. blog.toyota-phv.jp
   - Service: http://nginx:80
   - HTTP Host Header: blog.toyota-phv.jp

### Phase 2: Subdirectory sites (5)
5. blog.fx-trader-life.com/MFKC
   - Service: http://nginx:80
   - HTTP Host Header: blog.fx-trader-life.com
   - Path: /MFKC

6. blog.fx-trader-life.com/4-line-trade
   - Service: http://nginx:80
   - HTTP Host Header: blog.fx-trader-life.com
   - Path: /4-line-trade

7. blog.fx-trader-life.com/lp
   - Service: http://nginx:80
   - HTTP Host Header: blog.fx-trader-life.com
   - Path: /lp

8. blog.webmakeprofit.org/coconala
   - Service: http://nginx:80
   - HTTP Host Header: blog.webmakeprofit.org
   - Path: /coconala

9. blog.kuma8088.com/cameramanual
   - Service: http://nginx:80
   - HTTP Host Header: blog.kuma8088.com
   - Path: /cameramanual

### kuma8088 test sites (5)
10. blog.kuma8088.com/elementordemo1
    - Service: http://nginx:80
    - HTTP Host Header: blog.kuma8088.com
    - Path: /elementordemo1

11. blog.kuma8088.com/elementordemo02
    - Service: http://nginx:80
    - HTTP Host Header: blog.kuma8088.com
    - Path: /elementordemo02

12. blog.kuma8088.com/elementor-demo-03
    - Service: http://nginx:80
    - HTTP Host Header: blog.kuma8088.com
    - Path: /elementor-demo-03

13. blog.kuma8088.com/elementor-demo-04
    - Service: http://nginx:80
    - HTTP Host Header: blog.kuma8088.com
    - Path: /elementor-demo-04

14. blog.kuma8088.com/ec02test
    - Service: http://nginx:80
    - HTTP Host Header: blog.kuma8088.com
    - Path: /ec02test

## 🔍 注意事項

1. **Path設定**: サブディレクトリサイトは必ずPathを指定
2. **重複回避**: 同じホスト名+パスの組み合わせは1つのみ
3. **DNS**: blog.*サブドメインのDNSレコードは自動作成される（Cloudflare Tunnelがプロキシ）

## ✅ 設定後の確認

各サイトにアクセスして動作確認：
- http://blog.fx-trader-life.com
- http://blog.webmakeprofit.org
- http://blog.webmakesprofit.com
- http://blog.toyota-phv.jp
- http://blog.kuma8088.com/cameramanual
- http://blog.fx-trader-life.com/MFKC
- http://blog.fx-trader-life.com/4-line-trade
- http://blog.fx-trader-life.com/lp
- http://blog.webmakeprofit.org/coconala
- http://blog.kuma8088.com/elementordemo1
- http://blog.kuma8088.com/elementordemo02
- http://blog.kuma8088.com/elementor-demo-03
- http://blog.kuma8088.com/elementor-demo-04
- http://blog.kuma8088.com/ec02test
