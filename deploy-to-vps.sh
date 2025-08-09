#!/bin/bash
# VPS Deployment Script - Creates deployment scripts on VPS
# This script sets up the VPS with proper deployment automation

VPS_HOST="172.93.51.42"
VPS_USER="root"
SSH_KEY="~/.ssh/tao_alpha_dca_key"
VPS_PROJECT_PATH="/var/www/fxtrueup"
SERVICE_NAME="fxtrueup"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}Setting up VPS deployment automation...${NC}"

# Test VPS connection
echo -e "${YELLOW}Testing VPS connection...${NC}"
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'Connected successfully'" 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot connect to VPS${NC}"
    echo "Please check:"
    echo "1. SSH key exists at $SSH_KEY"
    echo "2. VPS is accessible at $VPS_HOST"
    echo "3. Network connectivity"
    exit 1
fi

echo -e "${GREEN}VPS connection successful!${NC}"

# Create deployment script on VPS
echo -e "${YELLOW}Creating deployment script on VPS...${NC}"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cat > $VPS_PROJECT_PATH/deploy.sh << 'EOF'
#!/bin/bash
# VPS Deployment Script for FXTrueUp
# This script runs on the VPS to handle deployments

PROJECT_PATH=\"$VPS_PROJECT_PATH\"
SERVICE_NAME=\"$SERVICE_NAME\"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e \"\${GREEN}FXTrueUp VPS Deployment Started\${NC}\"
echo \"=====================================\"
echo \"Project Path: \$PROJECT_PATH\"
echo \"Service Name: \$SERVICE_NAME\"
echo \"\"

cd \"\$PROJECT_PATH\" || {
    echo -e \"\${RED}ERROR: Cannot access project directory\${NC}\"
    exit 1
}

# Backup current state
echo -e \"\${YELLOW}Creating backup...\${NC}\"
cp -r . \"../fxtrueup-backup-\$(date +%Y%m%d-%H%M%S)\" 2>/dev/null || true

# Pull latest changes
echo -e \"\${YELLOW}Pulling latest changes from GitHub...\${NC}\"
git fetch origin master
git reset --hard origin/master

if [ \$? -ne 0 ]; then
    echo -e \"\${RED}ERROR: Git pull failed\${NC}\"
    exit 1
fi

echo -e \"\${GREEN}Git pull successful\${NC}\"

# Install/update dependencies
echo -e \"\${YELLOW}Installing/updating dependencies...\${NC}\"
npm install --production

if [ \$? -ne 0 ]; then
    echo -e \"\${RED}WARNING: npm install had issues\${NC}\"
    # Don't exit - the service might still work
fi

# Check if PM2 is managing our service
echo -e \"\${YELLOW}Checking PM2 status...\${NC}\"
if pm2 list | grep -q \"\$SERVICE_NAME\"; then
    echo -e \"\${YELLOW}Restarting PM2 service...\${NC}\"
    pm2 restart \"\$SERVICE_NAME\"
    pm2 save
else
    echo -e \"\${RED}WARNING: PM2 service \$SERVICE_NAME not found\${NC}\"
    echo \"Available PM2 processes:\"
    pm2 list
fi

echo -e \"\${GREEN}Deployment completed!\${NC}\"
echo \"\"
echo \"Next steps:\"
echo \"- Check logs: pm2 logs \$SERVICE_NAME\"
echo \"- Check status: pm2 status\"
echo \"- Monitor: pm2 monit\"
EOF"

# Make the deployment script executable
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "chmod +x $VPS_PROJECT_PATH/deploy.sh"

# Create a service restart script
echo -e "${YELLOW}Creating service restart script on VPS...${NC}"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cat > $VPS_PROJECT_PATH/restart.sh << 'EOF'
#!/bin/bash
# Service Restart Script for FXTrueUp

SERVICE_NAME=\"$SERVICE_NAME\"
PROJECT_PATH=\"$VPS_PROJECT_PATH\"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd \"\$PROJECT_PATH\"

echo -e \"\${GREEN}Restarting FXTrueUp Service\${NC}\"
echo \"===========================\"

if pm2 list | grep -q \"\$SERVICE_NAME\"; then
    echo -e \"\${YELLOW}Restarting \$SERVICE_NAME...\${NC}\"
    pm2 restart \"\$SERVICE_NAME\"
    pm2 save
    echo -e \"\${GREEN}Service restarted successfully!\${NC}\"
    
    echo \"\"
    echo \"Service status:\"
    pm2 status \"\$SERVICE_NAME\"
else
    echo -e \"\${RED}ERROR: Service \$SERVICE_NAME not found in PM2\${NC}\"
    echo \"\"
    echo \"Available services:\"
    pm2 list
    exit 1
fi
EOF"

ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "chmod +x $VPS_PROJECT_PATH/restart.sh"

# Create a logs viewing script
echo -e "${YELLOW}Creating logs script on VPS...${NC}"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cat > $VPS_PROJECT_PATH/logs.sh << 'EOF'
#!/bin/bash
# Logs Viewing Script for FXTrueUp

SERVICE_NAME=\"$SERVICE_NAME\"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

LINES=\${1:-50}

echo -e \"\${GREEN}FXTrueUp Service Logs (last \$LINES lines)\${NC}\"
echo \"===========================================\"

if pm2 list | grep -q \"\$SERVICE_NAME\"; then
    pm2 logs \"\$SERVICE_NAME\" --lines \"\$LINES\" --nostream
else
    echo -e \"\${RED}ERROR: Service \$SERVICE_NAME not found\${NC}\"
    exit 1
fi
EOF"

ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "chmod +x $VPS_PROJECT_PATH/logs.sh"

# Create status check script
echo -e "${YELLOW}Creating status check script on VPS...${NC}"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cat > $VPS_PROJECT_PATH/status.sh << 'EOF'
#!/bin/bash
# Status Check Script for FXTrueUp

SERVICE_NAME=\"$SERVICE_NAME\"
PROJECT_PATH=\"$VPS_PROJECT_PATH\"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

cd \"\$PROJECT_PATH\"

echo -e \"\${GREEN}FXTrueUp System Status\${NC}\"
echo \"=====================\"

echo -e \"\${CYAN}Git Status:\${NC}\"
git log --oneline -5
echo \"\"

echo -e \"\${CYAN}Current Branch & Commit:\${NC}\"
echo \"Branch: \$(git branch --show-current)\"
echo \"Commit: \$(git rev-parse --short HEAD)\"
echo \"\"

echo -e \"\${CYAN}PM2 Service Status:\${NC}\"
pm2 status \"\$SERVICE_NAME\"
echo \"\"

echo -e \"\${CYAN}Disk Usage:\${NC}\"
df -h .
echo \"\"

echo -e \"\${CYAN}Memory Usage:\${NC}\"
free -h
EOF"

ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "chmod +x $VPS_PROJECT_PATH/status.sh"

# Test the deployment
echo -e "${YELLOW}Testing deployment scripts...${NC}"
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "$VPS_PROJECT_PATH/status.sh"

echo ""
echo -e "${GREEN}VPS deployment automation setup complete!${NC}"
echo ""
echo -e "${CYAN}VPS Scripts Created:${NC}"
echo "- $VPS_PROJECT_PATH/deploy.sh  - Full deployment from GitHub"
echo "- $VPS_PROJECT_PATH/restart.sh - Restart PM2 service"
echo "- $VPS_PROJECT_PATH/logs.sh    - View service logs"
echo "- $VPS_PROJECT_PATH/status.sh  - Check system status"
echo ""
echo -e "${YELLOW}Local Commands Available:${NC}"
echo "- ./dev.sh status  - Check both local and VPS status"
echo "- ./dev.sh commit  - Commit and push to GitHub"
echo "- ./dev.sh deploy  - Deploy to VPS"
echo "- ./dev.sh restart - Restart VPS service"
echo "- ./dev.sh logs    - View VPS logs"
echo "- ./dev.sh check   - Check sync status"
echo "- ./dev.sh quick   - Commit, deploy, and restart in one command"