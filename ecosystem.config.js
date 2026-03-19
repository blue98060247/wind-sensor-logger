module.exports = {
  apps: [
    {
      name: 'wind-sensor',
      script: 'src/index.js',
      // 自動重啟：崩潰後等待 5 秒再重啟
      restart_delay: 5000,
      max_restarts: 10,
      // 記憶體超過 200MB 自動重啟
      max_memory_restart: '200M',
      // 環境變數
      env: {
        NODE_ENV: 'production',
        CONFIG_PATH: './config.json',
      },
      // 記錄設定
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
