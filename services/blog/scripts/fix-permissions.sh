#!/bin/bash
# WordPress Permissions Fix Script
# Purpose: Fix file ownership for all WordPress sites to enable plugin/theme updates
# Created: 2025-11-28
# Usage: ./scripts/fix-permissions.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== WordPress Permissions Fix Script ==="
echo "Project: Blog System"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Change to project directory
cd "$PROJECT_ROOT"

# Check if Docker containers are running
if ! docker compose ps wordpress | grep -q "Up"; then
    echo "❌ Error: WordPress container is not running"
    echo "   Please start containers first: docker compose up -d"
    exit 1
fi

echo "✅ WordPress container is running"
echo ""

# Fix permissions for all sites
echo "🔧 Fixing file ownership for all WordPress sites..."
echo ""

docker compose exec wordpress bash -c '
for dir in /var/www/html/*/; do
    sitename=$(basename "$dir")
    if [ -d "$dir/wp-content" ]; then
        echo "  → Fixing: $sitename"
        chown -R www-data:www-data "$dir/wp-content"
    fi
done
'

echo ""
echo "✅ Permissions fix completed!"
echo ""

# Verify the fix
echo "🔍 Verifying permissions..."
echo ""

docker compose exec wordpress bash -c '
for dir in /var/www/html/*/; do
    sitename=$(basename "$dir")
    if [ -d "$dir/wp-content" ]; then
        wrongfiles=$(find "$dir/wp-content" -type f -not -user www-data 2>/dev/null | wc -l)
        if [ "$wrongfiles" -eq 0 ]; then
            echo "  ✅ $sitename: OK"
        else
            echo "  ❌ $sitename: $wrongfiles files still have wrong ownership"
        fi
    fi
done
'

echo ""
echo "=== Script completed ==="
echo ""
echo "💡 Tips:"
echo "  - Run this script after copying files from host to container"
echo "  - Run this script after restoring from backup"
echo "  - Run this script if WordPress plugin/theme updates fail"
echo ""
