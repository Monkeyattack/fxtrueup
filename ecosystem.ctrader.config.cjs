module.exports = {
  apps: [{
    name: 'ctrader-pool',
    script: 'python3',
    args: 'ctrader_pool_api.py',
    cwd: './src/services/ctrader',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      CTRADER_POOL_PORT: 8088,
      PYTHONUNBUFFERED: 1,
      NODE_ENV: 'production'
    },
    error_file: 'logs/ctrader-pool-error.log',
    out_file: 'logs/ctrader-pool-out.log',
    log_file: 'logs/ctrader-pool-combined.log',
    time: true
  }]
};