-- Blog system database initialization
-- Updated: 2025-11-09
-- Total: 18 databases (all Xserver sites)

-- ========================================
-- Phase 1: Root domain sites (4 DBs)
-- ========================================
CREATE DATABASE IF NOT EXISTS `wp_fx_trader_life` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_webmakeprofit` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_webmakesprofit` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_toyota_phv` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ========================================
-- Phase 2: Subdirectory sites (5 DBs)
-- ========================================
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_cameramanual` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_fx_trader_life_mfkc` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_fx_trader_life_4line` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_fx_trader_life_lp` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_webmakeprofit_coconala` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ========================================
-- Unknown sites (3 DBs) - URL investigation needed
-- ========================================
CREATE DATABASE IF NOT EXISTS `wp_unknown_p3ca6` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_unknown_wp5` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_unknown_wt2` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ========================================
-- kuma8088 sites (6 DBs) - gwpbk492.xsrv.jp
-- ========================================
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_elementordemo1` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_elementordemo02` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_elementordemo03` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_elementordemo04` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_ec02` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `wp_kuma8088_cameramanual` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ========================================
-- Grant privileges
-- ========================================
-- Note: WordPress user is automatically created by MariaDB Docker image
-- using MYSQL_USER and MYSQL_PASSWORD environment variables.

-- Phase 1 databases
GRANT ALL PRIVILEGES ON `wp_fx_trader_life`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_webmakeprofit`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_webmakesprofit`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_toyota_phv`.* TO 'wpuser'@'%';

-- Phase 2 databases
GRANT ALL PRIVILEGES ON `wp_kuma8088_cameramanual`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_fx_trader_life_mfkc`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_fx_trader_life_4line`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_fx_trader_life_lp`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_webmakeprofit_coconala`.* TO 'wpuser'@'%';

-- Unknown databases
GRANT ALL PRIVILEGES ON `wp_unknown_p3ca6`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_unknown_wp5`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_unknown_wt2`.* TO 'wpuser'@'%';

-- kuma8088 databases
GRANT ALL PRIVILEGES ON `wp_kuma8088_elementordemo1`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_kuma8088_elementordemo02`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_kuma8088_elementordemo03`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_kuma8088_elementordemo04`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_kuma8088_ec02`.* TO 'wpuser'@'%';
GRANT ALL PRIVILEGES ON `wp_kuma8088_cameramanual`.* TO 'wpuser'@'%';

-- Flush privileges
FLUSH PRIVILEGES;
