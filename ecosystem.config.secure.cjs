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
