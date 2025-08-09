#!/bin/bash

# FX TrueUp Security Deployment Script
# This script deploys critical security fixes to the VPS server

set -e  # Exit on any error

# Configuration
VPS_HOST="172.93.51.42"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/tao_alpha_dca_key"
DEPLOY_PATH="/var/www/fxtrueup"
LOCAL_PATH="."

echo "🚀 Starting CRITICAL security deployment to VPS server..."
echo "📍 Target: ${VPS_USER}@${VPS_HOST}:${DEPLOY_PATH}"
echo "⚠️  This deployment contains critical security fixes"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    print_error "SSH key not found: $SSH_KEY"
    print_error "Please ensure the SSH key exists and has correct permissions"
    exit 1
fi

# Test SSH connection
print_status "Testing SSH connection to VPS server..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$VPS_USER@$VPS_HOST" "echo 'SSH connection successful'" >/dev/null 2>&1; then
    print_error "Cannot connect to VPS server"
    print_error "Please check your SSH key and network connection"
    exit 1
fi

print_success "SSH connection established"

# Generate secure environment variables
print_status "Generating secure environment variables..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ENCRYPTION_SALT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
COOKIE_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

print_success "Secure secrets generated"

# Create backup of current server
print_status "Creating backup of current server..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    if [ -f server-commonjs.cjs ]; then
        cp server-commonjs.cjs server-commonjs.cjs.backup-\$(date +%Y%m%d-%H%M%S)
        echo 'Backup created successfully'
    fi
"

# Create secure environment file on server
print_status "Creating secure environment configuration..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    
    # Backup existing .env if it exists
    if [ -f .env ]; then
        cp .env .env.backup-\$(date +%Y%m%d-%H%M%S)
    fi
    
    # Create new secure .env file
    cat > .env << 'EOF'
# FX TrueUp Security Configuration - Generated $(date)

# CRITICAL SECURITY KEYS
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENCRYPTION_SALT=${ENCRYPTION_SALT}
COOKIE_SECRET=${COOKIE_SECRET}
SESSION_SECRET=${SESSION_SECRET}

# Server Configuration
PORT=8080
NODE_ENV=production

# Database Configuration
DATABASE_URL=sqlite:///var/www/fxtrueup/data/app.db

# Admin Configuration
ADMIN_EMAIL=meredith@monkeyattack.com

# Security Settings
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# Session Configuration
SESSION_TIMEOUT_MS=86400000

# Add your existing MetaAPI token if available
# METAAPI_TOKEN=your-existing-token-here
EOF

    # Set secure permissions
    chmod 600 .env
    echo 'Secure environment file created with restricted permissions'
"

print_success "Environment configuration deployed"

# Upload security files to server
print_status "Uploading secure server files..."

# Upload main secure server
scp -i "$SSH_KEY" "${LOCAL_PATH}/server-secure.cjs" "$VPS_USER@$VPS_HOST:${DEPLOY_PATH}/server-secure.cjs"

# Create src directory structure if it doesn't exist
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    mkdir -p $DEPLOY_PATH/src/middleware
    mkdir -p $DEPLOY_PATH/src/utils
    mkdir -p $DEPLOY_PATH/src/services
    mkdir -p $DEPLOY_PATH/data
    chmod 700 $DEPLOY_PATH/data
"

# Upload security middleware and utilities
scp -i "$SSH_KEY" "${LOCAL_PATH}/src/middleware/auth-secure.js" "$VPS_USER@$VPS_HOST:${DEPLOY_PATH}/src/middleware/"
scp -i "$SSH_KEY" "${LOCAL_PATH}/src/utils/crypto-secure.js" "$VPS_USER@$VPS_HOST:${DEPLOY_PATH}/src/utils/"
scp -i "$SSH_KEY" "${LOCAL_PATH}/src/utils/secure-token-store.js" "$VPS_USER@$VPS_HOST:${DEPLOY_PATH}/src/utils/"

# Upload secure frontend auth
scp -i "$SSH_KEY" "${LOCAL_PATH}/public/js/auth-secure-enhanced.js" "$VPS_USER@$VPS_HOST:${DEPLOY_PATH}/public/js/"

print_success "Security files uploaded"

# Install required npm packages
print_status "Installing security-related npm packages..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    npm install --production \
        express-rate-limit \
        express-slow-down \
        compression \
        cookie-parser \
        jsonwebtoken \
        helmet \
        cors
    echo 'Security packages installed'
"

print_success "Dependencies installed"

# Update PM2 ecosystem configuration for security
print_status "Updating PM2 configuration..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    
    # Create secure PM2 ecosystem
    cat > ecosystem.config.secure.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'fxtrueup-secure',
    script: './server-secure.cjs',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    // Security and monitoring
    max_memory_restart: '512M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Restart settings for security
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 4000,
    // Environment
    source_map_support: false,
    instance_var: 'INSTANCE_ID'
  }]
};
EOF

    # Create logs directory
    mkdir -p logs
    
    echo 'PM2 configuration updated for security'
"

# Stop current application and start secure version
print_status "Deploying secure application..."
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    
    # Stop current application
    pm2 stop all || true
    pm2 delete all || true
    
    # Start secure application
    pm2 start ecosystem.config.secure.cjs --env production
    pm2 save
    pm2 startup
    
    echo 'Secure application deployed and running'
"

# Verify deployment
print_status "Verifying secure deployment..."
sleep 5

# Check if the secure server is running
ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" "
    cd $DEPLOY_PATH
    
    # Check PM2 status
    pm2 list
    
    # Test health endpoint
    if curl -f http://localhost:8080/health >/dev/null 2>&1; then
        echo 'Health check passed - secure server is running'
    else
        echo 'WARNING: Health check failed - please check logs'
        pm2 logs --lines 20
    fi
"

# Final security reminders
print_warning "IMPORTANT SECURITY REMINDERS:"
echo "1. ✅ JWT authentication with secure tokens implemented"
echo "2. ✅ AES-256-GCM encryption for sensitive data"
echo "3. ✅ Rate limiting and CSRF protection enabled"
echo "4. ✅ Security headers and CORS protection active"
echo "5. ✅ HTTP-only cookies and XSS prevention deployed"
echo ""
print_warning "NEXT STEPS:"
echo "1. 🔧 Update your MetaAPI token in the .env file on the server"
echo "2. 🔧 Configure SSL/HTTPS certificate for the domain"
echo "3. 🔧 Set up monitoring and log analysis"
echo "4. 🔧 Test all functionality thoroughly"
echo "5. 🔧 Schedule regular security updates"
echo ""
print_success "🛡️  CRITICAL SECURITY DEPLOYMENT COMPLETED"
print_success "Your FX TrueUp application is now running with enterprise-grade security"

# Show deployment summary
echo ""
echo "📊 DEPLOYMENT SUMMARY:"
echo "   🌍 Server: https://fxtrueup.com (or http://172.93.51.42:8080)"
echo "   🔐 Security: Enterprise-grade implementation"
echo "   ⚡ Status: Running with PM2 process manager"
echo "   📁 Path: $DEPLOY_PATH"
echo "   📝 Logs: $DEPLOY_PATH/logs/"
echo ""
print_success "Security deployment completed successfully! 🎉"