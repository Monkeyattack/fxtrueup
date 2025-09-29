#!/bin/bash
# Deploy cTrader Pool Service
# This script helps deploy and manage the cTrader Python pool service

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 cTrader Pool Service Deployment Script"
echo "========================================"

# Function to check if Python dependencies are installed
check_dependencies() {
    echo -e "${YELLOW}Checking Python dependencies...${NC}"

    # Check for fastapi
    if python3 -c "import fastapi" 2>/dev/null; then
        echo -e "${GREEN}✅ FastAPI is installed${NC}"
    else
        echo -e "${RED}❌ FastAPI is not installed${NC}"
        echo "Please install: sudo pip3 install fastapi uvicorn pydantic"
        exit 1
    fi
}

# Function to start the service
start_service() {
    echo -e "${YELLOW}Starting cTrader pool service...${NC}"

    # Check if already running
    if pm2 show ctrader-pool > /dev/null 2>&1; then
        echo -e "${YELLOW}Service already exists in PM2${NC}"
        pm2 restart ctrader-pool
    else
        pm2 start ecosystem.ctrader.config.cjs
    fi

    echo -e "${GREEN}✅ cTrader pool service started${NC}"
    pm2 save
}

# Function to check service status
check_status() {
    echo -e "${YELLOW}Checking service status...${NC}"
    pm2 show ctrader-pool
}

# Function to view logs
view_logs() {
    echo -e "${YELLOW}Viewing cTrader pool logs...${NC}"
    pm2 logs ctrader-pool --lines 50
}

# Function to stop service
stop_service() {
    echo -e "${YELLOW}Stopping cTrader pool service...${NC}"
    pm2 stop ctrader-pool
    echo -e "${GREEN}✅ Service stopped${NC}"
}

# Function to test the service
test_service() {
    echo -e "${YELLOW}Testing cTrader pool service...${NC}"
    sleep 3  # Give service time to start

    # Test health endpoint
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/health | grep -q "200"; then
        echo -e "${GREEN}✅ Health check passed${NC}"
        curl -s http://localhost:8088/health | jq .
    else
        echo -e "${RED}❌ Health check failed${NC}"
        echo "Service might not be running. Check logs with: pm2 logs ctrader-pool"
    fi
}

# Function to setup Vault (example)
setup_vault_example() {
    echo -e "${YELLOW}Example Vault commands for cTrader:${NC}"
    echo
    echo "# 1. Store OAuth2 credentials:"
    echo "vault kv put secret/ctrader/oauth \\"
    echo "    client_id=\"your_client_id\" \\"
    echo "    client_secret=\"your_client_secret\" \\"
    echo "    redirect_uri=\"http://localhost:8080/api/ctrader/callback\""
    echo
    echo "# 2. Store account tokens (after OAuth flow):"
    echo "vault kv put secret/ctrader/accounts/12345 \\"
    echo "    access_token=\"jwt_token_here\" \\"
    echo "    refresh_token=\"refresh_token_here\" \\"
    echo "    expires_at=\"2024-12-31T23:59:59Z\""
    echo
}

# Main menu
case "${1}" in
    start)
        check_dependencies
        start_service
        test_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        stop_service
        start_service
        test_service
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs
        ;;
    test)
        test_service
        ;;
    vault)
        setup_vault_example
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|test|vault}"
        echo
        echo "Commands:"
        echo "  start    - Start the cTrader pool service"
        echo "  stop     - Stop the cTrader pool service"
        echo "  restart  - Restart the cTrader pool service"
        echo "  status   - Show service status"
        echo "  logs     - View service logs"
        echo "  test     - Test if service is running"
        echo "  vault    - Show example Vault commands"
        exit 1
        ;;
esac