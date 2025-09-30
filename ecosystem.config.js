module.exports = {
  apps: [
    {
      name: 'area51-bot-modular',
      script: 'src/index-modular-simple.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        MIGRATION_ENABLED: 'false',
        MIGRATION_TEST_MODE: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        MIGRATION_ENABLED: 'true',
        MIGRATION_TEST_MODE: 'false'
      },
      // Monitoring and restart settings
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 4000,
      
      // Logging
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced settings
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      
      // Health monitoring
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // Environment-specific settings
      node_args: '--max-old-space-size=512',
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Auto restart conditions
      autorestart: true,
      watch_delay: 1000,
      
      // Cluster settings (if needed in future)
      instance_var: 'INSTANCE_ID'
    },
    {
      name: 'area51-bot-legacy',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false, // Disabled by default, only for emergency rollback
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      // Same monitoring settings as modular
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 4000,
      
      // Separate log files
      log_file: 'logs/legacy-combined.log',
      out_file: 'logs/legacy-out.log',
      error_file: 'logs/legacy-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/area51-bot.git',
      path: '/var/www/area51-bot',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    staging: {
      user: 'deploy',
      host: 'your-staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-repo/area51-bot.git',
      path: '/var/www/area51-bot-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};