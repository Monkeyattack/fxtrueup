module.exports = {
  apps: [
    {
      name: 'fxtrueup-router',
      namespace: 'FXTrueUp',
      script: './src/services/routerService.cli.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: '9W_n8pNROA_ZXOZt6KoKqL8V7FAvuAySw-kCmHSKBrA',
        REDIS_DB: 0,
        // cTrader OAuth2 credentials (loaded from environment or Vault)
        CTRADER_CLIENT_ID: process.env.CTRADER_CLIENT_ID || '',
        CTRADER_CLIENT_SECRET: process.env.CTRADER_CLIENT_SECRET || '',
        CTRADER_REDIRECT_URI: process.env.CTRADER_REDIRECT_URI || 'http://localhost:8080/api/ctrader/callback',
        // cTrader Pool Service URL
        CTRADER_POOL_URL: process.env.CTRADER_POOL_URL || 'http://localhost:8088'
      },
      error_file: './logs/router-error.log',
      out_file: './logs/router-out.log',
      log_file: './logs/router-combined.log',
      time: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 5000
    }
  ]
}