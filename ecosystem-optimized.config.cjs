module.exports = {
  apps: [
    {
      name: 'fxtrueup-optimized',
      script: 'server-optimized.cjs',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        WORKERS: 2
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
        WORKERS: 2
      },
      error_file: '/var/log/pm2/fxtrueup-optimized-error.log',
      out_file: '/var/log/pm2/fxtrueup-optimized-out.log',
      log_file: '/var/log/pm2/fxtrueup-optimized-combined.log',
      time: true,
      watch: false,
      max_memory_restart: '800M',
      restart_delay: 3000,
      max_restarts: 15,
      min_uptime: '10s',
      kill_timeout: 5000,
      listen_timeout: 8000,
      autorestart: true,
      node_args: '--max-old-space-size=1024',
      mergeLogs: true,
      vizion: false
    }
  ]
};