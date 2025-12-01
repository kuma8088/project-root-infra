"""Cloudflare Tunnel service for managing Public Hostnames."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CloudflareTunnelService:
    """Service for managing Cloudflare Tunnel Public Hostnames.

    Handles automatic addition/removal of Public Hostnames (ingress rules)
    and DNS CNAME records for WordPress sites.
    """

    def __init__(
        self,
        account_id: str | None = None,
        tunnel_id: str | None = None,
        api_token: str | None = None,
    ):
        """Initialize Cloudflare Tunnel service.

        Args:
            account_id: Cloudflare Account ID (defaults to settings)
            tunnel_id: Cloudflare Tunnel ID (defaults to settings)
            api_token: Cloudflare API Token (defaults to settings)
        """
        self.account_id = account_id or settings.cloudflare_account_id
        self.tunnel_id = tunnel_id or settings.cloudflare_tunnel_id
        self.api_token = api_token or settings.cloudflare_api_token
        self.base_url = "https://api.cloudflare.com/client/v4"

    async def get_tunnel_config(self) -> dict[str, Any]:
        """Get current Cloudflare Tunnel configuration.

        Returns:
            Current tunnel configuration with ingress rules

        Raises:
            httpx.HTTPError: If API request fails
        """
        url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{self.tunnel_id}/configurations"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            logger.info(f"Retrieved tunnel configuration: {len(data['result']['config']['ingress'])} ingress rules")
            return data["result"]

    async def add_public_hostname(
        self,
        hostname: str,
        service: str = "http://nginx:80",
        http_host_header: str | None = None,
    ) -> dict[str, Any]:
        """Add a Public Hostname to Cloudflare Tunnel.

        Args:
            hostname: Public hostname (e.g., test-real-008.kuma8088.com)
            service: Backend service URL (default: http://nginx:80)
            http_host_header: HTTP Host header for origin requests (default: same as hostname)

        Returns:
            Updated tunnel configuration

        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If configuration is invalid
        """
        # Get current configuration
        current_config = await self.get_tunnel_config()
        ingress_rules = current_config["config"]["ingress"]

        # Check if hostname already exists
        for rule in ingress_rules[:-1]:  # Exclude catch-all rule
            if rule.get("hostname") == hostname:
                logger.warning(f"Hostname {hostname} already exists in tunnel configuration")
                return current_config

        # Create new ingress rule
        new_rule = {
            "hostname": hostname,
            "service": service,
        }

        # Add HTTP Host header if specified
        if http_host_header or hostname:
            new_rule["originRequest"] = {
                "httpHostHeader": http_host_header or hostname,
            }

        # Insert new rule before catch-all rule (last rule)
        catch_all = ingress_rules.pop()  # Remove catch-all
        ingress_rules.append(new_rule)   # Add new rule
        ingress_rules.append(catch_all)  # Re-add catch-all

        # Update configuration
        updated_config = {
            "config": {
                "ingress": ingress_rules,
            }
        }

        url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{self.tunnel_id}/configurations"

        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                json=updated_config,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            logger.info(f"Added Public Hostname: {hostname} → {service}")
            return data["result"]

    async def remove_public_hostname(self, hostname: str) -> dict[str, Any]:
        """Remove a Public Hostname from Cloudflare Tunnel.

        Args:
            hostname: Public hostname to remove

        Returns:
            Updated tunnel configuration

        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If hostname not found
        """
        # Get current configuration
        current_config = await self.get_tunnel_config()
        ingress_rules = current_config["config"]["ingress"]

        # Find and remove the hostname
        catch_all = ingress_rules.pop()  # Remove catch-all

        found = False
        new_rules = []
        for rule in ingress_rules:
            if rule.get("hostname") == hostname:
                found = True
                logger.info(f"Removing hostname: {hostname}")
            else:
                new_rules.append(rule)

        if not found:
            logger.warning(f"Hostname {hostname} not found in tunnel configuration")
            ingress_rules.append(catch_all)  # Re-add catch-all
            return current_config

        new_rules.append(catch_all)  # Re-add catch-all

        # Update configuration
        updated_config = {
            "config": {
                "ingress": new_rules,
            }
        }

        url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{self.tunnel_id}/configurations"

        async with httpx.AsyncClient() as client:
            response = await client.put(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                json=updated_config,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            logger.info(f"Removed Public Hostname: {hostname}")
            return data["result"]

    async def get_zone_id(self, domain: str) -> str:
        """Get Cloudflare Zone ID for a domain.

        Args:
            domain: Domain name (e.g., kuma8088.com)

        Returns:
            Zone ID

        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If zone not found
        """
        url = f"{self.base_url}/zones?name={domain}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            zones = data.get("result", [])
            if not zones:
                raise ValueError(f"Zone not found: {domain}")

            zone_id = zones[0]["id"]
            logger.info(f"Retrieved Zone ID for {domain}: {zone_id}")
            return zone_id

    async def create_dns_record(
        self,
        zone_id: str,
        hostname: str,
        proxied: bool = True,
    ) -> dict[str, Any]:
        """Create DNS CNAME record pointing to Cloudflare Tunnel.

        Args:
            zone_id: Cloudflare Zone ID
            hostname: Full hostname (e.g., test-real-008.kuma8088.com)
            proxied: Enable Cloudflare proxy (orange cloud) - default True

        Returns:
            Created DNS record

        Raises:
            httpx.HTTPError: If API request fails
        """
        tunnel_cname = f"{self.tunnel_id}.cfargotunnel.com"

        # Extract subdomain from full hostname
        # e.g., test-real-008.kuma8088.com → test-real-008
        name = hostname.split(".")[0] if "." in hostname else hostname

        dns_record = {
            "type": "CNAME",
            "name": name,
            "content": tunnel_cname,
            "proxied": proxied,
            "ttl": 1,  # Auto (when proxied=True)
        }

        url = f"{self.base_url}/zones/{zone_id}/dns_records"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                json=dns_record,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            logger.info(f"Created DNS CNAME record: {hostname} → {tunnel_cname}")
            return data["result"]

    async def find_dns_record(self, zone_id: str, hostname: str) -> dict[str, Any] | None:
        """Find DNS record by hostname.

        Args:
            zone_id: Cloudflare Zone ID
            hostname: Full hostname (e.g., e2etest.kuma8088.com)

        Returns:
            DNS record dict or None if not found

        Raises:
            httpx.HTTPError: If API request fails
        """
        url = f"{self.base_url}/zones/{zone_id}/dns_records?name={hostname}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            records = data.get("result", [])
            if records:
                logger.info(f"Found DNS record for {hostname}: {records[0]['id']}")
                return records[0]

            logger.info(f"No DNS record found for {hostname}")
            return None

    async def delete_dns_record(self, zone_id: str, record_id: str) -> bool:
        """Delete DNS record.

        Args:
            zone_id: Cloudflare Zone ID
            record_id: DNS record ID

        Returns:
            True if deletion successful

        Raises:
            httpx.HTTPError: If API request fails
        """
        url = f"{self.base_url}/zones/{zone_id}/dns_records/{record_id}"

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                errors = data.get("errors", [])
                raise ValueError(f"Cloudflare API error: {errors}")

            logger.info(f"Deleted DNS record: {record_id}")
            return True

    async def setup_site_routing(
        self,
        hostname: str,
        domain: str = "kuma8088.com",
        service: str = "http://nginx:80",
    ) -> dict[str, Any]:
        """Complete setup for WordPress site routing (Public Hostname + DNS).

        Args:
            hostname: Full hostname (e.g., test-real-008.kuma8088.com)
            domain: Base domain (default: kuma8088.com)
            service: Backend service URL (default: http://nginx:80)

        Returns:
            Dictionary with tunnel_config and dns_record

        Raises:
            httpx.HTTPError: If API request fails
        """
        try:
            # 1. Add Public Hostname to Tunnel
            tunnel_config = await self.add_public_hostname(
                hostname=hostname,
                service=service,
                http_host_header=hostname,
            )

            # 2. Get Zone ID
            zone_id = await self.get_zone_id(domain)

            # 3. Create DNS CNAME record
            dns_record = await self.create_dns_record(
                zone_id=zone_id,
                hostname=hostname,
                proxied=True,
            )

            logger.info(f"✅ Site routing setup complete for {hostname}")

            return {
                "tunnel_config": tunnel_config,
                "dns_record": dns_record,
            }

        except Exception as e:
            logger.error(f"Failed to setup site routing for {hostname}: {e}")
            raise

    async def teardown_site_routing(
        self,
        hostname: str,
        domain: str = "kuma8088.com",
    ) -> dict[str, Any]:
        """Complete teardown for WordPress site routing (Remove Public Hostname + DNS).

        Args:
            hostname: Full hostname (e.g., e2etest.kuma8088.com)
            domain: Base domain (default: kuma8088.com)

        Returns:
            Dictionary with removal results

        Raises:
            httpx.HTTPError: If API request fails
        """
        results = {
            "tunnel_removed": False,
            "dns_removed": False,
            "errors": [],
        }

        try:
            # 1. Remove Public Hostname from Tunnel
            try:
                await self.remove_public_hostname(hostname)
                results["tunnel_removed"] = True
                logger.info(f"✅ Removed Public Hostname: {hostname}")
            except Exception as e:
                error_msg = f"Failed to remove tunnel hostname: {e}"
                logger.warning(error_msg)
                results["errors"].append(error_msg)

            # 2. Get Zone ID and find DNS record
            try:
                zone_id = await self.get_zone_id(domain)
                dns_record = await self.find_dns_record(zone_id, hostname)

                if dns_record:
                    # 3. Delete DNS CNAME record
                    await self.delete_dns_record(zone_id, dns_record["id"])
                    results["dns_removed"] = True
                    logger.info(f"✅ Deleted DNS record: {hostname}")
                else:
                    logger.info(f"No DNS record to delete for {hostname}")
                    results["dns_removed"] = True  # Nothing to delete = success
            except Exception as e:
                error_msg = f"Failed to delete DNS record: {e}"
                logger.warning(error_msg)
                results["errors"].append(error_msg)

            if results["tunnel_removed"] and results["dns_removed"]:
                logger.info(f"✅ Site routing teardown complete for {hostname}")
            else:
                logger.warning(f"⚠️ Site routing teardown partial for {hostname}: {results['errors']}")

            return results

        except Exception as e:
            logger.error(f"Failed to teardown site routing for {hostname}: {e}")
            raise


# Singleton instance
_tunnel_service: CloudflareTunnelService | None = None


def get_tunnel_service() -> CloudflareTunnelService:
    """Get Cloudflare Tunnel service singleton.

    Returns:
        CloudflareTunnelService instance
    """
    global _tunnel_service
    if _tunnel_service is None:
        _tunnel_service = CloudflareTunnelService()
    return _tunnel_service
