"""WordPress installation service using wp-cli."""
from __future__ import annotations

import json
import logging
import subprocess
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class WordPressInstallService:
    """Service for installing WordPress sites using wp-cli.

    Handles WordPress core installation, plugin installation, and configuration.
    Uses docker exec to run wp-cli commands in WordPress container.
    """

    # Docker container name for blog WordPress
    CONTAINER_NAME = "blog-wordpress"

    def __init__(
        self,
        wp_container: str = "blog-wordpress",
        wp_user: str = "wordpress",
    ):
        """Initialize WordPress install service.

        Args:
            wp_container: WordPress container name (actual Docker container name)
            wp_user: WordPress database user
        """
        self.wp_container = wp_container
        self.wp_user = wp_user

    def _run_wp_cli(self, args: list[str], site_path: str) -> subprocess.CompletedProcess:
        """Run wp-cli command in WordPress container.

        Args:
            args: wp-cli arguments
            site_path: Path to WordPress installation

        Returns:
            Completed process result
        """
        cmd = [
            "docker", "exec", self.wp_container,
            "wp", *args,
            f"--path=/var/www/html/{site_path}",
            "--allow-root"
        ]

        logger.debug(f"Running wp-cli command: {' '.join(cmd)}")

        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )

    def install_wordpress(
        self,
        site_path: str,
        domain: str,
        db_name: str,
        db_password: str,
        admin_user: str,
        admin_password: str,
        admin_email: str,
        site_title: Optional[str] = None,
        locale: str = "ja",
    ) -> bool:
        """Install WordPress site.

        Steps:
        1. Create WordPress directory
        2. Download WordPress core
        3. Create wp-config.php
        4. Install WordPress
        5. Set permissions

        Args:
            site_path: WordPress installation path (relative to /var/www/html)
            domain: Site domain
            db_name: Database name
            db_password: Database password
            admin_user: WordPress admin username
            admin_password: WordPress admin password
            admin_email: WordPress admin email
            site_title: Site title (defaults to domain)
            locale: WordPress locale

        Returns:
            True if successful

        Raises:
            ValueError: If installation fails
        """
        try:
            site_url = f"https://{domain}"
            if not site_title:
                site_title = domain

            # Step 1: Create WordPress directory
            logger.info(f"Creating WordPress directory: {site_path}")
            result = subprocess.run(
                [
                    "docker", "exec", self.wp_container,
                    "mkdir", "-p", f"/var/www/html/{site_path}"
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode != 0:
                logger.error(f"Failed to create directory: {result.stderr}")
                raise ValueError(f"Failed to create directory: {result.stderr}")

            # Step 2: Download WordPress core
            logger.info("Downloading WordPress core files...")
            result = self._run_wp_cli(
                ["core", "download", f"--locale={locale}"],
                site_path
            )

            if result.returncode != 0:
                logger.error(f"Failed to download WordPress: {result.stderr}")
                raise ValueError(f"Failed to download WordPress: {result.stderr}")

            logger.info("WordPress core downloaded successfully")

            # Step 3: Create wp-config.php
            logger.info("Creating wp-config.php...")
            result = self._run_wp_cli(
                [
                    "config", "create",
                    f"--dbname={db_name}",
                    f"--dbuser={self.wp_user}",
                    f"--dbpass={db_password}",
                    "--dbhost=mariadb",
                    f"--dbprefix={db_name}_",
                ],
                site_path
            )

            if result.returncode != 0:
                logger.error(f"Failed to create wp-config.php: {result.stderr}")
                raise ValueError(f"Failed to create wp-config.php: {result.stderr}")

            logger.info("wp-config.php created successfully")

            # Step 4: Install WordPress
            logger.info("Installing WordPress...")
            result = self._run_wp_cli(
                [
                    "core", "install",
                    f"--url={site_url}",
                    f"--title={site_title}",
                    f"--admin_user={admin_user}",
                    f"--admin_password={admin_password}",
                    f"--admin_email={admin_email}",
                ],
                site_path
            )

            if result.returncode != 0:
                logger.error(f"Failed to install WordPress: {result.stderr}")
                raise ValueError(f"Failed to install WordPress: {result.stderr}")

            logger.info("WordPress installed successfully")

            # Step 5: Set correct permissions (www-data:www-data for plugin updates)
            logger.info("Setting correct permissions...")
            result = subprocess.run(
                [
                    "docker", "exec", self.wp_container,
                    "chown", "-R", "www-data:www-data", f"/var/www/html/{site_path}"
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode != 0:
                logger.warning(f"Failed to set permissions: {result.stderr}")
            else:
                logger.info(f"Permissions set to www-data:www-data for {site_path}")

            logger.info(f"WordPress installation complete: {site_path}")
            return True

        except Exception as e:
            logger.error(f"Error installing WordPress: {e}")
            raise ValueError(f"WordPress installation failed: {e}")

    def configure_wp_mail_smtp(
        self,
        site_path: str,
        domain: str,
        from_email: str,
        smtp_host: str,
        smtp_port: int = 587,
        from_name: str = "WordPress Notification",
    ) -> bool:
        """Configure WP Mail SMTP plugin.

        Args:
            site_path: WordPress installation path
            domain: Site domain
            from_email: From email address
            smtp_host: SMTP host
            smtp_port: SMTP port
            from_name: From name

        Returns:
            True if successful

        Raises:
            ValueError: If configuration fails
        """
        try:
            site_url = f"https://{domain}"

            # Step 1: Install WP Mail SMTP plugin
            logger.info("Installing WP Mail SMTP plugin...")
            result = self._run_wp_cli(
                ["plugin", "install", "wp-mail-smtp", "--activate", f"--url={site_url}"],
                site_path
            )

            if result.returncode != 0:
                logger.warning(f"Plugin installation failed: {result.stderr}")
                # Try to activate if already installed
                result = self._run_wp_cli(
                    ["plugin", "activate", "wp-mail-smtp", f"--url={site_url}"],
                    site_path
                )

            logger.info("WP Mail SMTP plugin installed/activated")

            # Step 2: Configure SMTP settings
            logger.info("Configuring SMTP settings...")

            smtp_config = {
                "mail": {
                    "from_email": from_email,
                    "from_name": from_name,
                    "mailer": "smtp",
                    "return_path": True
                },
                "smtp": {
                    "host": smtp_host,
                    "port": smtp_port,
                    "encryption": "tls",
                    "autotls": True,
                    "auth": False
                }
            }

            smtp_config_json = json.dumps(smtp_config)

            result = self._run_wp_cli(
                [
                    "option", "update", "wp_mail_smtp",
                    smtp_config_json,
                    "--format=json",
                    f"--url={site_url}"
                ],
                site_path
            )

            if result.returncode != 0:
                logger.error(f"Failed to configure SMTP: {result.stderr}")
                raise ValueError(f"Failed to configure SMTP: {result.stderr}")

            logger.info("SMTP configuration complete")

            # Fix permissions after plugin installation (upgrade directory created by wp-cli)
            logger.info("Fixing permissions after plugin installation...")
            result = subprocess.run(
                [
                    "docker", "exec", self.wp_container,
                    "chown", "-R", "www-data:www-data", f"/var/www/html/{site_path}"
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            if result.returncode != 0:
                logger.warning(f"Failed to fix permissions: {result.stderr}")
            else:
                logger.info(f"Permissions fixed for {site_path}")

            return True

        except Exception as e:
            logger.error(f"Error configuring WP Mail SMTP: {e}")
            raise ValueError(f"WP Mail SMTP configuration failed: {e}")

    def site_exists(self, site_path: str) -> bool:
        """Check if WordPress site exists.

        Args:
            site_path: WordPress installation path

        Returns:
            True if site exists
        """
        try:
            result = subprocess.run(
                [
                    "docker", "exec", self.wp_container,
                    "test", "-d", f"/var/www/html/{site_path}"
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            return result.returncode == 0

        except Exception as e:
            logger.error(f"Error checking site existence: {e}")
            return False


def get_wp_install_service() -> WordPressInstallService:
    """Get WordPress install service instance.

    Returns:
        WordPressInstallService instance
    """
    from app.config import get_settings
    settings = get_settings()

    return WordPressInstallService(
        wp_container=WordPressInstallService.CONTAINER_NAME,
        wp_user=settings.blog_wp_db_user
    )
