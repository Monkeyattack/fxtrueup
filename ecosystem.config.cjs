module.exports = {
  apps: [
    {
      name: 'fxtrueup',
      script: 'src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: '/var/log/pm2/fxtrueup-error.log',
      out_file: '/var/log/pm2/fxtrueup-out.log',
      log_file: '/var/log/pm2/fxtrueup-combined.log',
      time: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};