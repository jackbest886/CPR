# 部署指南：Cloud Studio + pm2 稳定常驻方案

适用：本应用是 Express + SQLite + React 全栈，需在能跑 Node 的工作区中以服务方式常驻运行。
Cloud Studio 免费版工作区自带外网出口，可访问 NMPA / FDA / EMA。

## 一、工作区创建

1. 打开 [Cloud Studio](https://cloudstudio.net)，新建工作区。
2. 模板选 **Node.js** 或 **Ubuntu**（确认有外网出口、Node 18+）。
3. 把代码放进工作区：
   - 方式 A：`git clone <你的仓库地址>`
   - 方式 B：把项目文件夹上传到工作区

## 二、安装与构建

```bash
# 安装依赖（含 pm2、@types/node-cron 等 devDependencies）
npm install

# 构建前端（产物输出到 client/dist）
npm run build

# 写入 9 条精选法规样例（首次部署必跑，幂等可重复）
npm run seed
```

## 三、配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，关键字段：

```ini
HOST=0.0.0.0
PORT=3000
TZ=Asia/Shanghai

# ★ 部署时设为 true，开启自动采集
COLLECTION_ENABLED=true
CRON_ENABLED=true
COLLECT_CRON=0 8 * * *     # 每日 08:00

# 近期窗口（只采集近 90 天发布的条目，防历史回灌）
COLLECT_RECENT_DAYS=90

# 自 ping 保活（防 Cloud Studio 休眠，默认开启）
KEEPALIVE_ENABLED=true
KEEPALIVE_INTERVAL_MS=300000   # 5 分钟

# LLM 分类器（通义千问 qwen-plus — 每月 100 万 token 免费、数据不出境）
LLM_PROVIDER=qwen
LLM_MODEL=qwen-plus
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=<阿里云百炼 / 通义开放平台领取的免费 Key>
```

> **无 Key 也可部署**：不填 `LLM_API_KEY` → 走规则分类器（关键词/正则映射），系统完整可运行。
> Key 到位后填入 `.env` 并重启（`npx pm2 restart reggov-tracker`）即自动切换到 qwen-plus。

## 四、pm2 启动（推荐）

```bash
# 用 pm2 启动（读取 ecosystem.config.cjs）
npx pm2 start ecosystem.config.cjs

# 查看进程状态
npx pm2 list

# 查看实时日志（采集 + keepalive）
npx pm2 logs reggov-tracker

# 停止 / 重启 / 删除
npx pm2 stop reggov-tracker
npx pm2 restart reggov-tracker
npx pm2 delete reggov-tracker
```

pm2 配置（`ecosystem.config.cjs`）：
- `autorestart: true` — 进程崩溃自动重启
- `max_restarts: 10` — 最多重启 10 次
- `restart_delay: 5000` — 重启间隔 5 秒
- `min_uptime: '10s'` — 最小存活 10 秒才算稳定

## 五、自 ping 保活机制

Cloud Studio 免费版空闲可能休眠导致服务不可达。系统内置自 ping 保活：

- **服务层**：`server/keepalive.ts` 每隔 `KEEPALIVE_INTERVAL_MS`（默认 5 分钟）fetch 自身 `/api/health`
- **进程层**：pm2 守护，进程崩溃自动重启
- **双保险**：setInterval 自 ping 防休眠 + pm2 防崩溃

日志中可见：
```
[keepalive] 自 ping 保活已启动：每 300s 请求 http://localhost:3000/api/health
[keepalive] self-ping ok
```

## 六、端口预览公网

在工作区里对端口 3000 点「访问 / 预览」拿到公网 URL，即可访问看板。

## 七、数据安全

- SQLite 库在 `./data/reggov.db`，存于工作区磁盘、随工作区保留。
- 9 条精选中文法规（FDA/EMA/NMPA 各 3 条）在去重 exact 命中时跳过入库，不会被覆盖。
- 建议定期备份：`cp data/reggov.db data/reggov.db.bak.$(date +%Y%m%d)`

## 八、无 Key 部署说明

1. 不填 `LLM_API_KEY`，系统走规则分类器（关键词映射 + 抽取式摘要），完全可运行。
2. 英文条目（FDA / NMPA 英文镜像）通过 `RuleClassifier.translateEnTitle()` 做简易英→中关键词映射兜底。
3. Key 到位后：填入 `.env` → `npx pm2 restart reggov-tracker` → 自动切换 qwen-plus LLM 增强。

## 九、故障排查

| 症状 | 可能原因 | 排查方法 |
|------|---------|---------|
| NMPA 采集 0 条 | 英文镜像网络异常 | `pm2 logs` 看 `[nmpa]` 降级日志 |
| NMPA 降级中文栏目后仍 0 条 | WAF 拦截 | 正常现象，英文镜像为主路径 |
| FDA 采集 0 条 | Federal Register API 限流 | 自动回退 FDA Guidance RSS |
| `publish_date IS NULL` | 栏目页垃圾混入 | 已由 Pipeline 层 `validateAndFilter` 拦截 |
| 服务无响应 | Cloud Studio 休眠 | 确认 `KEEPALIVE_ENABLED=true` |
| 进程反复重启 | 端口冲突 / 依赖缺失 | `pm2 logs` 查看错误堆栈 |

## 十、常用命令速查

```bash
# 开发
npm run dev              # tsx watch 热重载
npm run build            # 构建前端
npm run typecheck        # TypeScript 类型检查
npm test                 # 运行测试

# 生产（pm2）
npx pm2 start ecosystem.config.cjs
npx pm2 list
npx pm2 logs reggov-tracker
npx pm2 monit            # 实时 CPU/内存监控
npx pm2 restart reggov-tracker
npx pm2 delete reggov-tracker

# 手动触发采集（无需等定时）
curl -X POST http://localhost:3000/api/collect/run
curl http://localhost:3000/api/collect/status
curl http://localhost:3000/api/health
```
