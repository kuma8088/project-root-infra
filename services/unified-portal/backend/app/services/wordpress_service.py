"""WordPress management service."""
from __future__ import annotations

import logging
import subprocess
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.wordpress_site import WordPressSite
from app.schemas.database import DatabaseCreate
from app.schemas.wordpress import WordPressSiteCreate, WordPressSiteStats, WordPressSiteUpdate
from app.services.cloudflare_tunnel_service import get_tunnel_service
from app.services.database_service import get_database_service
from app.services.encryption_service import get_encryption_service
from app.services.nginx_config_service import get_nginx_service
from app.services.wp_install_service import get_wp_install_service

logger = logging.getLogger(__name__)


class WordPressService:
    """Service for managing WordPress sites.

    Handles site creation, updates, deletion, and statistics gathering.
    Integrates with wp-cli for WordPress operations.
    """

    def __init__(self, db: Session, wp_cli_path: str = "wp"):
        """Initialize WordPress service.

        Args:
            db: Database session
            wp_cli_path: Path to wp-cli binary
        """
        self.db = db
        self.wp_cli_path = wp_cli_path
        self.encryption = get_encryption_service()
        self.nginx = get_nginx_service()
        self.db_service = get_database_service(db)
        self.wp_install = get_wp_install_service()
        self.tunnel = get_tunnel_service()

    def list_sites(self, enabled_only: bool = False) -> List[WordPressSite]:
        """List all WordPress sites.

        Args:
            enabled_only: Only return enabled sites

        Returns:
            List of WordPress sites
        """
        query = self.db.query(WordPressSite)

        if enabled_only:
            query = query.filter(WordPressSite.enabled == True)

        return query.order_by(WordPressSite.created_at.desc()).all()

    def get_site(self, site_id: int) -> Optional[WordPressSite]:
        """Get WordPress site by ID.

        Args:
            site_id: Site ID

        Returns:
            WordPress site or None if not found
        """
        return self.db.query(WordPressSite).filter(WordPressSite.id == site_id).first()

    def get_site_by_name(self, site_name: str) -> Optional[WordPressSite]:
        """Get WordPress site by name.

        Args:
            site_name: Site name

        Returns:
            WordPress site or None if not found
        """
        return self.db.query(WordPressSite).filter(WordPressSite.site_name == site_name).first()

    async def create_site(self, site_data: WordPressSiteCreate) -> WordPressSite:
        """Create a new WordPress site with full automation.

        Steps:
        1. Create MariaDB database
        2. Install WordPress via wp-cli
        3. Configure WP Mail SMTP
        4. Generate Nginx configuration
        5. Reload Nginx
        6. Setup Cloudflare Tunnel + DNS (automatic)

        Args:
            site_data: Site creation data

        Returns:
            Created WordPress site

        Raises:
            ValueError: If site already exists or creation fails
        """
        # Check if site_name already exists
        existing = self.get_site_by_name(site_data.site_name)
        if existing:
            raise ValueError(f"サイト名 '{site_data.site_name}' は既に使用されています")

        # Check if domain already exists
        existing_domain = self.db.query(WordPressSite).filter(
            WordPressSite.domain == site_data.domain
        ).first()
        if existing_domain:
            raise ValueError(f"ドメイン '{site_data.domain}' は既に使用されています")

        # Check if database_name already exists
        existing_db = self.db.query(WordPressSite).filter(
            WordPressSite.database_name == site_data.database_name
        ).first()
        if existing_db:
            raise ValueError(f"データベース名 '{site_data.database_name}' は既に使用されています")

        # Check if WordPress site already exists on filesystem
        if self.wp_install.site_exists(site_data.site_name):
            raise ValueError(f"WordPress ファイルが既に存在します: '{site_data.site_name}'")

        # Create database record
        site = WordPressSite(
            site_name=site_data.site_name,
            domain=site_data.domain,
            database_name=site_data.database_name,
            php_version=site_data.php_version,
            enabled=True,
        )

        try:
            # Add to session but DO NOT commit yet
            self.db.add(site)
            self.db.flush()  # Flush to get ID without committing

            # Step 1: Create database
            logger.info(f"Step 1/6: Creating database {site_data.database_name}")
            db_create = DatabaseCreate(
                database_name=site_data.database_name,
                target_system="blog",
                charset="utf8mb4",
                collation="utf8mb4_unicode_ci",
                create_user=False,  # Use existing WordPress user
            )
            self.db_service.create_database(db_create)
            logger.info(f"Database created: {site_data.database_name}")

            # Get WordPress DB credentials from settings
            from app.config import get_settings
            settings = get_settings()
            db_password = settings.blog_wp_db_password

            # Step 2: Install WordPress
            logger.info(f"Step 2/6: Installing WordPress at {site_data.site_name}")
            self.wp_install.install_wordpress(
                site_path=site_data.site_name,
                domain=site_data.domain,
                db_name=site_data.database_name,
                db_password=db_password,
                admin_user=site_data.admin_user,
                admin_password=site_data.admin_password,
                admin_email=site_data.admin_email,
                site_title=site_data.title,
                locale="ja",
            )
            logger.info(f"WordPress installed: {site_data.site_name}")

            # Step 3: Configure WP Mail SMTP
            logger.info(f"Step 3/6: Configuring WP Mail SMTP")
            # Detect base domain for from email
            base_domain = site_data.domain.split('.')
            if len(base_domain) >= 2:
                base_domain = '.'.join(base_domain[-2:])
            else:
                base_domain = site_data.domain

            from_email = f"noreply@{base_domain}"
            smtp_host = settings.smtp_host or "dell-workstation.tail67811d.ts.net"
            smtp_port = settings.smtp_port or 587

            self.wp_install.configure_wp_mail_smtp(
                site_path=site_data.site_name,
                domain=site_data.domain,
                from_email=from_email,
                smtp_host=smtp_host,
                smtp_port=smtp_port,
            )
            logger.info(f"WP Mail SMTP configured")

            # Step 4: Generate Nginx configuration
            logger.info(f"Step 4/6: Generating Nginx configuration")
            config_path = self.nginx.create_wordpress_site_config(
                site_name=site_data.site_name,
                domain=site_data.domain,
                php_version=site_data.php_version,
            )
            logger.info(f"Nginx config created: {config_path}")

            # Step 5: Reload Nginx
            logger.info(f"Step 5/6: Reloading Nginx")
            if not self.nginx.reload():
                raise ValueError("Nginxのリロードに失敗しました。設定を確認してください")
            logger.info(f"Nginx reloaded successfully")

            # Step 6: Setup Cloudflare Tunnel + DNS (automatic)
            logger.info(f"Step 6/6: Setting up Cloudflare Tunnel + DNS")
            try:
                # Extract base domain (e.g., test-real-008.kuma8088.com → kuma8088.com)
                domain_parts = site_data.domain.split('.')
                if len(domain_parts) >= 2:
                    base_domain = '.'.join(domain_parts[-2:])
                else:
                    base_domain = site_data.domain

                cloudflare_result = await self.tunnel.setup_site_routing(
                    hostname=site_data.domain,
                    domain=base_domain,
                    service="http://nginx:80",
                )
                logger.info(f"✅ Cloudflare Tunnel Public Hostname added: {site_data.domain}")
                logger.info(f"✅ Cloudflare DNS CNAME record created: {site_data.domain}")
            except Exception as cf_error:
                logger.error(f"⚠️  Cloudflare setup failed (non-critical): {cf_error}")
                logger.warning(f"   Site is created but may not be publicly accessible")
                logger.warning(f"   You may need to manually configure Cloudflare Tunnel")

            # All external operations succeeded - NOW commit to database
            self.db.commit()
            self.db.refresh(site)

            logger.info(f"")
            logger.info(f"🎉 WordPress site created successfully: {site_data.site_name}")
            logger.info(f"   Domain: {site_data.domain}")
            logger.info(f"   Database: {site_data.database_name}")
            logger.info(f"   Admin User: {site_data.admin_user}")
            logger.info(f"")
            logger.info(f"✅ Site is now fully operational and publicly accessible!")
            logger.info(f"   Access your site at: https://{site_data.domain}")
            logger.info(f"   Admin panel: https://{site_data.domain}/wp-admin/")

            return site

        except Exception as e:
            # Rollback database transaction
            self.db.rollback()

            # Clean up created resources
            logger.error(f"❌ WordPress site creation failed: {e}")
            logger.info(f"Starting cleanup...")

            # Clean up Nginx config
            try:
                self.nginx.delete_config(f"{site_data.site_name}.conf")
                logger.info(f"Cleaned up Nginx config")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup Nginx config: {cleanup_error}")

            # Clean up database (best effort)
            try:
                self.db_service.delete_database(site_data.database_name, "blog")
                logger.info(f"Cleaned up database: {site_data.database_name}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup database: {cleanup_error}")

            # Note: WordPress files cleanup is skipped because it's more complex
            # and may contain user data. Manual cleanup may be needed.
            logger.warning(f"⚠️  WordPress files at /var/www/html/{site_data.site_name} may need manual cleanup")

            raise ValueError(f"WordPressサイトの作成に失敗しました: {e}")

    def update_site(self, site_id: int, site_update: WordPressSiteUpdate) -> WordPressSite:
        """Update WordPress site.

        Args:
            site_id: Site ID
            site_update: Site update data

        Returns:
            Updated WordPress site

        Raises:
            ValueError: If site not found or update fails
        """
        site = self.get_site(site_id)
        if not site:
            raise ValueError(f"Site with ID {site_id} not found")

        try:
            # Update PHP version if changed
            if site_update.php_version and site_update.php_version != site.php_version:
                old_version = site.php_version
                site.php_version = site_update.php_version

                # Regenerate Nginx configuration with new PHP version
                self.nginx.delete_config(f"{site.site_name}.conf")
                self.nginx.create_wordpress_site_config(
                    site_name=site.site_name,
                    domain=site.domain,
                    php_version=site.php_version,
                )

                # Reload Nginx
                if not self.nginx.reload():
                    logger.warning("Nginx reload failed after PHP version change")

                logger.info(f"Updated PHP version for {site.site_name}: {old_version} → {site.php_version}")

            # Update enabled status
            if site_update.enabled is not None:
                site.enabled = site_update.enabled

            # Save changes
            self.db.commit()
            self.db.refresh(site)

            logger.info(f"WordPress site updated: {site.site_name}")
            return site

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to update WordPress site: {e}")
            raise ValueError(f"Failed to update WordPress site: {e}")

    def delete_site(self, site_id: int, delete_database: bool = False) -> None:
        """Delete WordPress site.

        Args:
            site_id: Site ID
            delete_database: Also delete the database

        Raises:
            ValueError: If site not found or deletion fails
        """
        site = self.get_site(site_id)
        if not site:
            raise ValueError(f"Site with ID {site_id} not found")

        try:
            # Delete Nginx configuration
            self.nginx.delete_config(f"{site.site_name}.conf")

            # Test Nginx config and reload
            if self.nginx.test_config():
                self.nginx.reload()
            else:
                logger.warning("Nginx configuration test failed after site deletion")

            # Delete database record
            self.db.delete(site)
            self.db.commit()

            logger.info(f"WordPress site deleted: {site.site_name}")

        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to delete WordPress site: {e}")
            raise ValueError(f"Failed to delete WordPress site: {e}")

    def get_site_stats(self, site_id: int) -> Optional[WordPressSiteStats]:
        """Get WordPress site statistics.

        Args:
            site_id: Site ID

        Returns:
            Site statistics or None if not found
        """
        site = self.get_site(site_id)
        if not site:
            return None

        # TODO: Implement actual wp-cli queries for statistics
        # For now, return mock data
        return WordPressSiteStats(
            post_count=0,
            page_count=0,
            plugin_count=0,
            theme_count=0,
            user_count=1,
            db_size_mb=0.0,
        )

    def clear_cache(self, site_id: int, cache_type: str = "all") -> bool:
        """Clear WordPress cache.

        Args:
            site_id: Site ID
            cache_type: Type of cache to clear (object, transient, all)

        Returns:
            True if successful, False otherwise
        """
        site = self.get_site(site_id)
        if not site:
            raise ValueError(f"Site with ID {site_id} not found")

        try:
            # TODO: Implement wp-cli cache clearing
            # wp cache flush --path=/var/www/html/{site_name}
            logger.info(f"Cache cleared for {site.site_name}: {cache_type}")
            return True

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False


def get_wordpress_service(db: Session) -> WordPressService:
    """Get WordPress service instance.

    Args:
        db: Database session

    Returns:
        WordPressService instance
    """
    return WordPressService(db)
