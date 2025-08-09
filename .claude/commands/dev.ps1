# FXTrueUp Development Workflow Commands
# Prevents SSH editing mistakes and enforces proper Git workflow

param(
    [Parameter(Position=0)]
    [string]$Action = "help",
    [Parameter(Position=1)]
    [string]$Message = ""
)

$VPS_HOST = "172.93.51.42"
$VPS_USER = "root"
$SSH_KEY = "~/.ssh/tao_alpha_dca_key"
$VPS_PROJECT_PATH = "/var/www/fxtrueup"
$SERVICE_NAME = "fxtrueup"

function Show-Help {
    Write-Host "FXTrueUp Development Workflow" -ForegroundColor Cyan
    Write-Host "=============================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "NEVER EDIT FILES DIRECTLY ON VPS! Use this workflow instead:" -ForegroundColor Red
    Write-Host ""
    Write-Host "Development Commands:" -ForegroundColor Green
    Write-Host "  dev status       - Show current Git status and VPS service status"
    Write-Host "  dev commit       - Commit and push changes to GitHub"
    Write-Host "  dev deploy       - Deploy changes to VPS (pulls from GitHub)"
    Write-Host "  dev restart      - Restart VPS service"
    Write-Host "  dev logs         - View VPS service logs"
    Write-Host "  dev check        - Check if local/remote are in sync"
    Write-Host ""
    Write-Host "Quick Deployment:" -ForegroundColor Yellow  
    Write-Host "  dev quick 'message' - Commit, push, and deploy in one command"
    Write-Host ""
    Write-Host "Example workflow:" -ForegroundColor Cyan
    Write-Host "  1. Make changes locally"
    Write-Host "  2. dev commit 'Fixed login bug'"
    Write-Host "  3. dev deploy"
    Write-Host "  4. dev restart"
    Write-Host ""
    Write-Host "Or use quick deployment:"
    Write-Host "  dev quick 'Fixed login bug'"
}

function Test-GitClean {
    $status = git status --porcelain
    return [string]::IsNullOrEmpty($status)
}

function Test-VPSConnection {
    try {
        $result = ssh -i $SSH_KEY -o ConnectTimeout=5 $VPS_USER@$VPS_HOST "echo 'connected'" 2>$null
        return $result -eq "connected"
    }
    catch {
        return $false
    }
}

function Get-GitStatus {
    Write-Host "Local Git Status:" -ForegroundColor Green
    git status --short
    Write-Host ""
    
    Write-Host "Branch Information:" -ForegroundColor Green
    git branch -vv
    Write-Host ""
    
    $ahead = git rev-list --count origin/master..HEAD 2>$null
    $behind = git rev-list --count HEAD..origin/master 2>$null
    
    if ($ahead -gt 0) {
        Write-Host "Local commits ahead of remote: $ahead" -ForegroundColor Yellow
    }
    if ($behind -gt 0) {
        Write-Host "Local commits behind remote: $behind" -ForegroundColor Red
    }
}

function Get-VPSStatus {
    Write-Host "VPS Service Status:" -ForegroundColor Green
    if (Test-VPSConnection) {
        ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && pm2 status $SERVICE_NAME"
        Write-Host ""
        Write-Host "VPS Git Status:" -ForegroundColor Green
        ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && git log --oneline -5"
    } else {
        Write-Host "Cannot connect to VPS" -ForegroundColor Red
    }
}

function Invoke-Commit {
    if ([string]::IsNullOrEmpty($Message)) {
        Write-Host "Error: Commit message required" -ForegroundColor Red
        Write-Host "Usage: dev commit 'Your commit message'"
        return
    }
    
    Write-Host "Staging all changes..." -ForegroundColor Yellow
    git add .
    
    Write-Host "Committing changes..." -ForegroundColor Yellow
    git commit -m $Message
    
    Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
    git push origin master
    
    Write-Host "Changes committed and pushed successfully!" -ForegroundColor Green
}

function Invoke-Deploy {
    if (-not (Test-VPSConnection)) {
        Write-Host "Error: Cannot connect to VPS" -ForegroundColor Red
        return
    }
    
    Write-Host "Deploying to VPS..." -ForegroundColor Yellow
    
    # Pull latest changes from GitHub
    ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && git pull origin master"
    
    # Install/update dependencies if package.json changed
    ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && npm install --production"
    
    Write-Host "Deployment complete!" -ForegroundColor Green
    Write-Host "Use 'dev restart' to restart the service" -ForegroundColor Yellow
}

function Invoke-Restart {
    if (-not (Test-VPSConnection)) {
        Write-Host "Error: Cannot connect to VPS" -ForegroundColor Red
        return
    }
    
    Write-Host "Restarting VPS service..." -ForegroundColor Yellow
    ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && pm2 restart $SERVICE_NAME"
    
    Write-Host "Service restarted!" -ForegroundColor Green
}

function Get-VPSLogs {
    if (-not (Test-VPSConnection)) {
        Write-Host "Error: Cannot connect to VPS" -ForegroundColor Red
        return
    }
    
    Write-Host "VPS Service Logs (last 50 lines):" -ForegroundColor Green
    ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && pm2 logs $SERVICE_NAME --lines 50 --nostream"
}

function Test-Sync {
    Write-Host "Checking sync status..." -ForegroundColor Yellow
    
    # Get local commit hash
    $localHash = git rev-parse HEAD
    Write-Host "Local commit: $localHash" -ForegroundColor Cyan
    
    # Get remote commit hash
    git fetch origin master
    $remoteHash = git rev-parse origin/master
    Write-Host "GitHub commit: $remoteHash" -ForegroundColor Cyan
    
    if (Test-VPSConnection) {
        # Get VPS commit hash
        $vpsHash = ssh -i $SSH_KEY $VPS_USER@$VPS_HOST "cd $VPS_PROJECT_PATH && git rev-parse HEAD"
        Write-Host "VPS commit: $vpsHash" -ForegroundColor Cyan
        
        if ($localHash -eq $remoteHash -and $remoteHash -eq $vpsHash) {
            Write-Host "All repositories are in sync!" -ForegroundColor Green
        } else {
            Write-Host "Repositories are out of sync!" -ForegroundColor Red
            if ($localHash -ne $remoteHash) {
                Write-Host "Local and GitHub are different" -ForegroundColor Yellow
            }
            if ($remoteHash -ne $vpsHash) {
                Write-Host "GitHub and VPS are different" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "Cannot check VPS sync - connection failed" -ForegroundColor Red
    }
}

function Invoke-QuickDeploy {
    if ([string]::IsNullOrEmpty($Message)) {
        Write-Host "Error: Commit message required for quick deploy" -ForegroundColor Red
        Write-Host "Usage: dev quick 'Your commit message'"
        return
    }
    
    Write-Host "Starting quick deployment..." -ForegroundColor Cyan
    
    # Commit and push
    Invoke-Commit
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit failed, aborting deployment" -ForegroundColor Red
        return
    }
    
    # Deploy
    Invoke-Deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Deployment failed" -ForegroundColor Red
        return
    }
    
    # Restart service
    Invoke-Restart
    
    Write-Host "Quick deployment complete!" -ForegroundColor Green
}

# Main command dispatcher
switch ($Action.ToLower()) {
    "help" { Show-Help }
    "status" { Get-GitStatus; Get-VPSStatus }
    "commit" { Invoke-Commit }
    "deploy" { Invoke-Deploy }
    "restart" { Invoke-Restart }
    "logs" { Get-VPSLogs }
    "check" { Test-Sync }
    "quick" { Invoke-QuickDeploy }
    default { 
        Write-Host "Unknown command: $Action" -ForegroundColor Red
        Show-Help 
    }
}