/**
 * 自 ping 保活服务：防止 Cloud Studio 免费版空闲休眠。
 *
 * 原理：服务启动后，每隔 intervalMs 毫秒 fetch 自身的 /api/health 端点，
 * 保持进程活跃 + DB 连接热。配合 pm2 守护形成双保险。
 *
 * 日志约定：
 *   成功 → console.log('[keepalive] self-ping ok')
 *   失败 → console.warn('[keepalive] self-ping failed')
 */

/** 保活定时器引用（stopKeepalive 用） */
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动自 ping 保活。
 * @param port 服务监听端口
 * @param intervalMs ping 间隔毫秒（默认 300000 = 5 分钟）
 */
export function startKeepalive(port: number, intervalMs: number = 300000): void {
  if (keepaliveTimer !== null) {
    console.warn('[keepalive] 保活已在运行，跳过重复启动');
    return;
  }

  const healthUrl = `http://localhost:${port}/api/health`;
  console.log(
    `[keepalive] 自 ping 保活已启动：每 ${Math.round(intervalMs / 1000)}s 请求 ${healthUrl}`,
  );

  keepaliveTimer = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        console.log('[keepalive] self-ping ok');
      } else {
        console.warn(`[keepalive] self-ping failed: HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn('[keepalive] self-ping failed:', (e as Error).message);
    }
  }, intervalMs);
}

/** 停止自 ping 保活（测试用） */
export function stopKeepalive(): void {
  if (keepaliveTimer !== null) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
    console.log('[keepalive] 自 ping 保活已停止');
  }
}
