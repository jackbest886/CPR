/**
 * REST API 路由。
 * 统一响应信封：{ code, data, message }（code=0 成功）。
 *
 * 端点：
 *  GET  /api/regulations      组合筛选 + 分页
 *  GET  /api/regulations/:id  详情（含 statusHistory）
 *  PATCH /api/regulations/:id  校正 watch / status（追加 history）
 *  GET  /api/meta/tags        筛选器元数据
 *  GET  /api/stats            看板计数
 *  GET  /api/health           存活 + DB 连通
 *  POST /api/collect/run       手动立即采集
 *  GET  /api/collect/status   采集健康
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type {
  MetaResponse,
  RegFilter,
  RegStatus,
  RegType,
  Source,
} from '../shared/types';
import {
  DIM_TAGS,
  FORM_TAGS,
  REG_STATUSES,
  REG_TYPES,
  SOURCES,
} from '../shared/constants';
import type { RegulationRepository, RegPatch } from './db/repository';
import type { Pipeline } from './pipeline';
import type { Scheduler } from './scheduler';
import type { AppConfig } from './config';

/** 路由依赖（由入口注入） */
export interface RouterDeps {
  repo: RegulationRepository;
  pipeline: Pipeline;
  scheduler: Scheduler;
  config: AppConfig;
}

/** 解析 query -> RegFilter */
function parseFilter(q: Record<string, unknown>): RegFilter {
  const f: RegFilter = {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) =>
    str(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (q.source) f.source = list(q.source) as Source[];
  if (q.type) f.type = list(q.type) as RegType[];
  if (q.status) f.status = list(q.status) as RegStatus[];
  if (q.tags) f.tags = list(q.tags);
  if (q.q) f.q = str(q.q);
  if (q.from) f.from = str(q.from);
  if (q.to) f.to = str(q.to);
  if (q.watch === 'true' || q.watch === '1') f.watch = true;
  if (q.watch === 'false' || q.watch === '0') f.watch = false;
  if (q.sort === 'list' || q.sort === 'timeline') f.sort = q.sort;
  if (q.page) f.page = Number(q.page);
  if (q.pageSize) f.pageSize = Number(q.pageSize);
  return f;
}

const patchSchema = z.object({
  watch: z.boolean().optional(),
  status: z.enum(REG_STATUSES as [string, ...string[]]).optional(),
  by: z.string().optional(),
});

/** 创建路由 */
export function createRouter(deps: RouterDeps): Router {
  const router = Router();
  const { repo, pipeline, config } = deps;

  // 组合筛选 + 分页
  router.get('/regulations', async (req: Request, res: Response) => {
    try {
      const filter = parseFilter(req.query as Record<string, unknown>);
      const result = await repo.search(filter);
      res.json({ code: 0, data: result, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  // 详情
  router.get('/regulations/:id', async (req: Request, res: Response) => {
    try {
      const reg = await repo.getById(req.params.id);
      if (!reg) {
        res
          .status(404)
          .json({ code: 404, data: null, message: 'regulation not found' });
        return;
      }
      res.json({ code: 0, data: reg, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  // 人工校正
  router.patch('/regulations/:id', async (req: Request, res: Response) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 400, data: null, message: 'invalid body' });
      return;
    }
    try {
      const updated = await repo.update(req.params.id, parsed.data as RegPatch);
      if (!updated) {
        res
          .status(404)
          .json({ code: 404, data: null, message: 'regulation not found' });
        return;
      }
      res.json({ code: 0, data: updated, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  // 元数据
  router.get('/meta/tags', (_req: Request, res: Response) => {
    const data: MetaResponse = {
      sources: SOURCES,
      types: REG_TYPES,
      statuses: REG_STATUSES,
      formTags: FORM_TAGS,
      dimTags: DIM_TAGS,
    };
    res.json({ code: 0, data, message: 'ok' });
  });

  // 统计
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const data = await repo.stats();
      res.json({ code: 0, data, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  // 存活
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      await repo.getLatestCollectRun();
      res.json({
        code: 0,
        data: {
          ok: true,
          db: config.dbType,
          keepalive: config.keepaliveEnabled,
          time: new Date().toISOString(),
        },
        message: 'ok',
      });
    } catch (e) {
      res.status(500).json({
        code: 500,
        data: { ok: false, db: config.dbType, keepalive: config.keepaliveEnabled },
        message: (e as Error).message,
      });
    }
  });

  // 手动采集
  router.post('/collect/run', async (_req: Request, res: Response) => {
    try {
      const report = await pipeline.runOnce();
      res.json({ code: 0, data: report, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  // 采集健康
  router.get('/collect/status', async (_req: Request, res: Response) => {
    try {
      const data = await repo.getLatestCollectRun();
      res.json({ code: 0, data, message: 'ok' });
    } catch (e) {
      res
        .status(500)
        .json({ code: 500, data: null, message: (e as Error).message });
    }
  });

  return router;
}
