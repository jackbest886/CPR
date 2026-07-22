/**
 * 服务入口：装配 Express、CORS、静态托管、路由、调度器。
 *
 * 构建顺序：
 *   createDb → runMigrations → Repository → Classifier → Deduplicator
 *   → Collectors → Pipeline → Scheduler → Express(app)
 *
 * 生产：client/dist 由本服务在 / 托管；开发：Vite(5173) 代理 /api 到此。
 */
import express, { type Express } from 'express';
import cors from 'cors';
import * as nodePath from 'path';
import { config } from './config';
import { createDb } from './db/connection';
import { runMigrations } from './db/migrations';
import { RegulationRepository } from './db/repository';
import { FdaCollector } from './collectors/fda';
import { EmaCollector } from './collectors/ema';
import { NmpaCollector } from './collectors/nmpa';
import { createClassifier } from './classifiers';
import { Deduplicator } from './deduplicator';
import { Pipeline } from './pipeline';
import { Scheduler } from './scheduler';
import { createRouter, type RouterDeps } from './routes';
import { startKeepalive } from './keepalive';

/** 构建 Express 应用（便于测试注入依赖） */
export function buildApp(deps: RouterDeps): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', createRouter(deps));

  // 托管前端构建产物
  const distDir = nodePath.resolve(process.cwd(), 'client', 'dist');
  app.use(express.static(distDir));

  // SPA 回退：非 /api 请求返回 index.html
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(nodePath.join(distDir, 'index.html'), (err) => {
      if (err) res.status(404).send('Frontend not built. Run `npm run build`.');
    });
  });

  return app;
}

/** 程序入口 */
async function main(): Promise<void> {
  const db = await createDb(config);
  runMigrations(db);

  const repo = new RegulationRepository(db);
  const classifier = createClassifier(config);
  const deduplicator = new Deduplicator(repo);

  const collectors = [
    new FdaCollector(config),
    new EmaCollector(config),
    new NmpaCollector(config),
  ];
  const pipeline = new Pipeline(
    collectors,
    classifier,
    deduplicator,
    repo,
    config.collectRecentDays,
  );
  const scheduler = new Scheduler(
    pipeline,
    repo,
    config.cronEnabled,
    config.collectionEnabled,
    config.collectCron,
    config.tz,
  );

  scheduler.start();
  if (config.runOnStart) {
    pipeline
      .runOnce()
      .then((r) => console.log('[startup] 初始采集完成:', r.status))
      .catch((e) => console.error('[startup] 初始采集失败:', e));
  }

  const app = buildApp({ repo, pipeline, scheduler, config });
  app.listen(config.port, () => {
    console.log(`法规情报追踪系统已启动: http://localhost:${config.port}`);
    console.log(`  DB=${config.dbType} CRON=${config.cronEnabled ? config.collectCron : 'disabled'}`);
    console.log(`  collectRecentDays=${config.collectRecentDays}`);

    // 启动自 ping 保活（防 Cloud Studio 休眠）
    if (config.keepaliveEnabled) {
      startKeepalive(config.port, config.keepaliveIntervalMs);
    } else {
      console.log('[keepalive] 自 ping 保活已禁用（KEEPALIVE_ENABLED=false）');
    }
  });
}

// 仅在作为入口直接运行时启动服务（被测试导入时不自动监听端口）
import { pathToFileURL } from 'url';
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((e) => {
    console.error('启动失败:', e);
    process.exit(1);
  });
}
