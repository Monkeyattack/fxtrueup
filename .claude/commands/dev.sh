#!/bin/bash
# FXTrueUp Development Workflow Commands (Bash version)
# Prevents SSH editing mistakes and enforces proper Git workflow

VPS_HOST="172.93.51.42"
VPS_USER="root"
SSH_KEY="~/.ssh/tao_alpha_dca_key"
VPS_PROJECT_PATH="/var/www/fxtrueup"
SERVICE_NAME="fxtrueup"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

show_help() {
    echo -e "${CYAN}FXTrueUp Development Workflow${NC}"
    echo -e "${CYAN}=============================${NC}"
    echo ""
    echo -e "${RED}NEVER EDIT FILES DIRECTLY ON VPS! Use this workflow instead:${NC}"
    echo ""
    echo -e "${GREEN}Development Commands:${NC}"
    echo "  ./dev.sh status       - Show current Git status and VPS service status"
    echo "  ./dev.sh commit       - Commit and push changes to GitHub"
    echo "  ./dev.sh deploy       - Deploy changes to VPS (pulls from GitHub)"
    echo "  ./dev.sh restart      - Restart VPS service"
    echo "  ./dev.sh logs         - View VPS service logs"
    echo "  ./dev.sh check        - Check if local/remote are in sync"
    echo ""
    echo -e "${YELLOW}Quick Deployment:${NC}"
    echo "  ./dev.sh quick 'message' - Commit, push, and deploy in one command"
    echo ""
    echo -e "${CYAN}Example workflow:${NC}"
    echo "  1. Make changes locally"
    echo "  2. ./dev.sh commit 'Fixed login bug'"
    echo "  3. ./dev.sh deploy"
    echo "  4. ./dev.sh restart"
    echo ""
    echo "Or use quick deployment:"
    echo "  ./dev.sh quick 'Fixed login bug'"
}

test_vps_connection() {
    ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'connected'" 2>/dev/null | grep -q "connected"
    return $?
}

get_git_status() {
    echo -e "${GREEN}Local Git Status:${NC}"
    git status --short
    echo ""
    
    echo -e "${GREEN}Branch Information:${NC}"
    git branch -vv
    echo ""
    
    local ahead=$(git rev-list --count origin/master..HEAD 2>/dev/null || echo "0")
    local behind=$(git rev-list --count HEAD..origin/master 2>/dev/null || echo "0")
    
    if [ "$ahead" -gt 0 ]; then
        echo -e "${YELLOW}Local commits ahead of remote: $ahead${NC}"
    fi
    if [ "$behind" -gt 0 ]; then
        echo -e "${RED}Local commits behind remote: $behind${NC}"
    fi
}

get_vps_status() {
    echo -e "${GREEN}VPS Service Status:${NC}"
    if test_vps_connection; then
        ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && pm2 status $SERVICE_NAME"
        echo ""
        echo -e "${GREEN}VPS Git Status:${NC}"
        ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && git log --oneline -5"
    else
        echo -e "${RED}Cannot connect to VPS${NC}"
    fi
}

invoke_commit() {
    local message="$1"
    if [ -z "$message" ]; then
        echo -e "${RED}Error: Commit message required${NC}"
        echo "Usage: ./dev.sh commit 'Your commit message'"
        return 1
    fi
    
    echo -e "${YELLOW}Staging all changes...${NC}"
    git add .
    
    echo -e "${YELLOW}Committing changes...${NC}"
    git commit -m "$message"
    
    echo -e "${YELLOW}Pushing to GitHub...${NC}"
    git push origin master
    
    echo -e "${GREEN}Changes committed and pushed successfully!${NC}"
}

invoke_deploy() {
    if ! test_vps_connection; then
        echo -e "${RED}Error: Cannot connect to VPS${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Deploying to VPS...${NC}"
    
    # Pull latest changes from GitHub
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && git pull origin master"
    
    # Install/update dependencies if package.json changed
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && npm install --production"
    
    echo -e "${GREEN}Deployment complete!${NC}"
    echo -e "${YELLOW}Use './dev.sh restart' to restart the service${NC}"
}

invoke_restart() {
    if ! test_vps_connection; then
        echo -e "${RED}Error: Cannot connect to VPS${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Restarting VPS service...${NC}"
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && pm2 restart $SERVICE_NAME"
    
    echo -e "${GREEN}Service restarted!${NC}"
}

get_vps_logs() {
    if ! test_vps_connection; then
        echo -e "${RED}Error: Cannot connect to VPS${NC}"
        return 1
    fi
    
    echo -e "${GREEN}VPS Service Logs (last 50 lines):${NC}"
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && pm2 logs $SERVICE_NAME --lines 50 --nostream"
}

test_sync() {
    echo -e "${YELLOW}Checking sync status...${NC}"
    
    # Get local commit hash
    local local_hash=$(git rev-parse HEAD)
    echo -e "${CYAN}Local commit: $local_hash${NC}"
    
    # Get remote commit hash
    git fetch origin master
    local remote_hash=$(git rev-parse origin/master)
    echo -e "${CYAN}GitHub commit: $remote_hash${NC}"
    
    if test_vps_connection; then
        # Get VPS commit hash
        local vps_hash=$(ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "cd $VPS_PROJECT_PATH && git rev-parse HEAD")
        echo -e "${CYAN}VPS commit: $vps_hash${NC}"
        
        if [ "$local_hash" = "$remote_hash" ] && [ "$remote_hash" = "$vps_hash" ]; then
            echo -e "${GREEN}All repositories are in sync!${NC}"
        else
            echo -e "${RED}Repositories are out of sync!${NC}"
            if [ "$local_hash" != "$remote_hash" ]; then
                echo -e "${YELLOW}Local and GitHub are different${NC}"
            fi
            if [ "$remote_hash" != "$vps_hash" ]; then
                echo -e "${YELLOW}GitHub and VPS are different${NC}"
            fi
        fi
    else
        echo -e "${RED}Cannot check VPS sync - connection failed${NC}"
    fi
}

invoke_quick_deploy() {
    local message="$1"
    if [ -z "$message" ]; then
        echo -e "${RED}Error: Commit message required for quick deploy${NC}"
        echo "Usage: ./dev.sh quick 'Your commit message'"
        return 1
    fi
    
    echo -e "${CYAN}Starting quick deployment...${NC}"
    
    # Commit and push
    invoke_commit "$message"
    if [ $? -ne 0 ]; then
        echo -e "${RED}Commit failed, aborting deployment${NC}"
        return 1
    fi
    
    # Deploy
    invoke_deploy
    if [ $? -ne 0 ]; then
        echo -e "${RED}Deployment failed${NC}"
        return 1
    fi
    
    # Restart service
    invoke_restart
    
    echo -e "${GREEN}Quick deployment complete!${NC}"
}

# Main command dispatcher
case "${1:-help}" in
    "help")
        show_help
        ;;
    "status")
        get_git_status
        get_vps_status
        ;;
    "commit")
        invoke_commit "$2"
        ;;
    "deploy")
        invoke_deploy
        ;;
    "restart")
        invoke_restart
        ;;
    "logs")
        get_vps_logs
        ;;
    "check")
        test_sync
        ;;
    "quick")
        invoke_quick_deploy "$2"
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        ;;
esac