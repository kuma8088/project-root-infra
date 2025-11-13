"""Tests for Backup management API endpoints."""

import pytest


class TestBackupList:
    """Tests for backup listing endpoints."""

    def test_list_mailserver_backups(self, client):
        """Test listing mailserver backups."""
        response = client.get("/api/v1/backup/mailserver/list")

        assert response.status_code == 200
        data = response.json()
        assert "daily" in data
        assert "weekly" in data
        assert isinstance(data["daily"], list)
        assert isinstance(data["weekly"], list)

    def test_list_blog_backups(self, client):
        """Test listing blog backups."""
        response = client.get("/api/v1/backup/blog/list")

        assert response.status_code == 200
        data = response.json()
        assert "backups" in data
        assert isinstance(data["backups"], list)


class TestBackupStats:
    """Tests for backup statistics endpoints."""

    def test_get_backup_stats(self, client):
        """Test backup system statistics."""
        response = client.get("/api/v1/backup/stats")

        assert response.status_code == 200
        data = response.json()
        assert "total_backups" in data
        assert "total_size_gb" in data
        assert "last_backup_time" in data


class TestBackupSchedule:
    """Tests for backup schedule information."""

    def test_get_backup_schedule(self, client):
        """Test backup schedule retrieval."""
        response = client.get("/api/v1/backup/schedule")

        assert response.status_code == 200
        data = response.json()
        assert "mailserver_daily" in data
        assert "mailserver_weekly" in data
        assert "s3_replication" in data
