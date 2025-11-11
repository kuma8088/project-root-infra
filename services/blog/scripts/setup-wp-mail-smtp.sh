#!/bin/bash
#
# WP Mail SMTP Setup Script for All WordPress Sites
# Purpose: Install and configure WP Mail SMTP plugin for all 16 WordPress sites
# Configuration: Use ssmtp relay to Dell Postfix (port 587) → SendGrid
#
# Usage: ./setup-wp-mail-smtp.sh
#

set -o pipefail  # Continue on errors to process all sites

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# WordPress sites configuration
declare -A SITES=(
    ["fx-trader-life"]="wp_fx_trader_life"
    ["fx-trader-life-4line"]="wp_fx_trader_life_4line"
    ["fx-trader-life-lp"]="wp_fx_trader_life_lp"
    ["fx-trader-life-mfkc"]="wp_fx_trader_life_mfkc"
    ["kuma8088"]="wp_kuma8088"
    ["kuma8088-cameramanual"]="wp_kuma8088_cameramanual"
    ["kuma8088-ec02test"]="wp_kuma8088_ec02test"
    ["kuma8088-elementordemo02"]="wp_kuma8088_elementordemo02"
    ["kuma8088-elementor-demo-03"]="wp_kuma8088_elementor_demo_03"
    ["kuma8088-elementor-demo-04"]="wp_kuma8088_elementor_demo_04"
    ["kuma8088-elementordemo1"]="wp_kuma8088_elementordemo1"
    ["kuma8088-test"]="wp_kuma8088_test"
    ["toyota-phv"]="wp_toyota_phv"
    ["webmakeprofit"]="wp_webmakeprofit"
    ["webmakeprofit-coconala"]="wp_webmakeprofit_coconala"
    ["webmakesprofit"]="wp_webmakesprofit"
)

# SMTP Configuration
SMTP_HOST="dell-workstation.tail67811d.ts.net"
SMTP_PORT="587"
SMTP_ENCRYPTION="tls"
SMTP_FROM_EMAIL="noreply@fx-trader-life.com"
SMTP_FROM_NAME="WordPress Notification"

echo -e "${GREEN}=== WP Mail SMTP Setup Script ===${NC}"
echo "Total sites: ${#SITES[@]}"
echo ""

# Function: Install WP Mail SMTP plugin
install_plugin() {
    local site_path=$1
    local site_name=$2

    echo -e "${YELLOW}[${site_name}] Installing WP Mail SMTP plugin...${NC}"

    if docker compose exec wordpress wp plugin is-installed wp-mail-smtp \
        --path="/var/www/html/${site_path}" --allow-root 2>/dev/null; then
        echo -e "${GREEN}[${site_name}] Plugin already installed${NC}"
    else
        docker compose exec wordpress wp plugin install wp-mail-smtp \
            --activate \
            --path="/var/www/html/${site_path}" \
            --allow-root
        echo -e "${GREEN}[${site_name}] Plugin installed and activated${NC}"
    fi
}

# Function: Configure WP Mail SMTP
configure_smtp() {
    local site_path=$1
    local site_name=$2
    local db_prefix=$3

    echo -e "${YELLOW}[${site_name}] Configuring SMTP settings...${NC}"

    # Configure via wp-cli option commands
    docker compose exec wordpress wp option update wp_mail_smtp \
        '{"mail":{"from_email":"'${SMTP_FROM_EMAIL}'","from_name":"'${SMTP_FROM_NAME}'","mailer":"smtp","return_path":"true"},"smtp":{"host":"'${SMTP_HOST}'","port":'${SMTP_PORT}',"encryption":"'${SMTP_ENCRYPTION}'","autotls":"true","auth":"false"}}' \
        --format=json \
        --path="/var/www/html/${site_path}" \
        --allow-root 2>/dev/null || {
            echo -e "${YELLOW}[${site_name}] Option update method failed, trying alternative...${NC}"

            # Alternative: Direct database update
            docker compose exec mariadb mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "
                INSERT INTO ${db_prefix}.wp_options (option_name, option_value, autoload)
                VALUES ('wp_mail_smtp',
                        '{\"mail\":{\"from_email\":\"${SMTP_FROM_EMAIL}\",\"from_name\":\"${SMTP_FROM_NAME}\",\"mailer\":\"smtp\",\"return_path\":true},\"smtp\":{\"host\":\"${SMTP_HOST}\",\"port\":${SMTP_PORT},\"encryption\":\"${SMTP_ENCRYPTION}\",\"autotls\":true,\"auth\":false}}',
                        'yes')
                ON DUPLICATE KEY UPDATE
                    option_value = '{\"mail\":{\"from_email\":\"${SMTP_FROM_EMAIL}\",\"from_name\":\"${SMTP_FROM_NAME}\",\"mailer\":\"smtp\",\"return_path\":true},\"smtp\":{\"host\":\"${SMTP_HOST}\",\"port\":${SMTP_PORT},\"encryption\":\"${SMTP_ENCRYPTION}\",\"autotls\":true,\"auth\":false}}';" 2>/dev/null || {
                echo -e "${RED}[${site_name}] Failed to configure SMTP${NC}"
                return 1
            }
        }

    echo -e "${GREEN}[${site_name}] SMTP configured${NC}"
}

# Function: Send test email
send_test_email() {
    local site_path=$1
    local site_name=$2

    echo -e "${YELLOW}[${site_name}] Sending test email...${NC}"

    # Get admin email from database
    local admin_email=$(docker compose exec wordpress wp option get admin_email \
        --path="/var/www/html/${site_path}" \
        --allow-root 2>/dev/null || echo "admin@example.com")

    docker compose exec wordpress wp eval \
        "wp_mail('${admin_email}', 'WP Mail SMTP Test - ${site_name}', 'This is a test email from WP Mail SMTP configuration.');" \
        --path="/var/www/html/${site_path}" \
        --allow-root 2>/dev/null && {
        echo -e "${GREEN}[${site_name}] Test email sent to ${admin_email}${NC}"
    } || {
        echo -e "${YELLOW}[${site_name}] Test email failed (check Postfix logs)${NC}"
    }
}

# Main execution
main() {
    # Check if running from correct directory
    if [[ ! -f "docker-compose.yml" ]]; then
        echo -e "${RED}Error: Must run from /opt/onprem-infra-system/project-root-infra/services/blog${NC}"
        exit 1
    fi

    # Load environment variables
    if [[ -f ".env" ]]; then
        source .env
    else
        echo -e "${RED}Error: .env file not found${NC}"
        exit 1
    fi

    echo "Starting setup for all sites..."
    echo ""

    local success_count=0
    local total_count=${#SITES[@]}

    for site_path in "${!SITES[@]}"; do
        db_prefix="${SITES[$site_path]}"

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo -e "${GREEN}Processing: ${site_path}${NC}"
        echo "Database prefix: ${db_prefix}"
        echo ""

        # Install plugin
        install_plugin "${site_path}" "${site_path}" && {
            # Configure SMTP
            configure_smtp "${site_path}" "${site_path}" "${db_prefix}" && {
                # Send test email (optional - can be skipped)
                # send_test_email "${site_path}" "${site_path}"
                ((success_count++))
            } || echo -e "${RED}[${site_path}] SMTP configuration failed${NC}"
        } || echo -e "${RED}[${site_path}] Plugin installation failed${NC}"

        echo ""
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}=== Setup Complete ===${NC}"
    echo "Successful: ${success_count}/${total_count} sites"
    echo ""
    echo "Next steps:"
    echo "1. Verify SMTP configuration: WordPress Admin → WP Mail SMTP → Settings"
    echo "2. Send test email: WordPress Admin → WP Mail SMTP → Email Test"
    echo "3. Monitor Postfix logs: docker compose logs -f postfix"
    echo ""
    echo "Note: Emails are relayed through Dell Postfix (${SMTP_HOST}:${SMTP_PORT}) → SendGrid"
}

# Execute main function
main "$@"
