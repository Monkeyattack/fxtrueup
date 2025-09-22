module.exports = {
  "apps": [
    {
      "name": "gold-to-grid-copy",
      "script": "./setup-gold-to-grid-copy.js",
      "instances": 1,
      "autorestart": true,
      "watch": false,
      "max_memory_restart": "500M",
      "env": {
        "NODE_ENV": "production",
        "POOL_API_URL": "http://localhost:8087"
      },
      "error_file": "./logs/gold-to-grid-error.log",
      "out_file": "./logs/gold-to-grid-out.log",
      "log_file": "./logs/gold-to-grid-combined.log",
      "time": true
    }
  ]
}