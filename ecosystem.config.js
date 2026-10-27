module.exports = {
  apps: [
    {
      name: 'email-sender-backend',
      script: './backend/src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
    },
  ],
};
