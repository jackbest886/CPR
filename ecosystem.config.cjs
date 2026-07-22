/**
 * pm2 进程守护配置 — reggov-tracker
 *
 * 用法：
 *   npx pm2 start ecosystem.config.cjs   # 启动
 *   npx pm2 list                          # 查看进程
 *   npx pm2 logs reggov-tracker           # 查看日志
 *   npx pm2 restart reggov-tracker        # 重启
 *   npx pm2 delete reggov-tracker         # 删除
 *
 * 配合 server/keepalive.ts 的自 ping 保活形成双保险：
 *   pm2 防进程崩溃 → autorestart + max_restarts
 *   keepalive 防 Cloud Studio 休眠 → setInterval 自 ping /api/health
 *
 * 注意：使用 exec_mode: 'fork'（非 cluster），因为 tsx CLI 为 ESM 模块。
 *       script 直接指向 tsx 的 cli.mjs，避免 .bin/tsx shell wrapper 在
 *       Windows 下的兼容问题。
 */
module.exports = {
  apps: [
    {
      name: 'reggov-tracker',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
