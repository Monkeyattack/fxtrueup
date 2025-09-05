module.exports = {
  "apps": [
    {
      "name": "fxtrueup-pool",
      "namespace": "FXTrueUp",
      "script": "./src/services/connectionPool/api.js",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "500M",
      "env": {
        "NODE_ENV": "production",
        "POOL_PORT": "8087"
      },
      "error_file": "./logs/connection-pool-error.log",
      "out_file": "./logs/connection-pool-out.log",
      "log_file": "./logs/connection-pool-combined.log",
      "time": true
    }
  ]
}