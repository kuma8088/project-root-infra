"""Tests for Security management API endpoints."""

import pytest
import os


class TestSSLCertificates:
    """Tests for SSL certificate management endpoints."""

    def test_list_ssl_certificates(self, client):
        """Test listing SSL certificates."""
        response = client.get("/api/v1/security/ssl/certificates")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have certificates for blog domains


class TestCloudflareSSL:
    """Tests for Cloudflare SSL status endpoints."""

    @pytest.mark.skipif(
        os.getenv("CLOUDFLARE_API_TOKEN", "your-cloudflare-api-token") == "your-cloudflare-api-token",
        reason="CLOUDFLARE_API_TOKEN not configured"
    )
    def test_get_cloudflare_ssl_status(self, client):
        """Test Cloudflare SSL status retrieval."""
        response = client.get("/api/v1/security/cloudflare/ssl")

        assert response.status_code == 200
        data = response.json()
        assert "zones" in data
        assert isinstance(data["zones"], list)


class TestSecurityHeaders:
    """Tests for security headers configuration."""

    def test_get_security_headers(self, client):
        """Test security headers configuration retrieval."""
        response = client.get("/api/v1/security/headers")

        assert response.status_code == 200
        data = response.json()
        assert "nginx_config" in data
        assert "headers" in data


class TestSecurityStats:
    """Tests for security statistics endpoints."""

    def test_get_security_summary(self, client):
        """Test security system summary."""
        response = client.get("/api/v1/security/stats")

        assert response.status_code == 200
        data = response.json()
        assert "ssl_enabled" in data
        assert "https_enforced" in data
        assert "cloudflare_protection" in data
