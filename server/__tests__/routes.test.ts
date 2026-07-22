import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDb } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { RegulationRepository } from '../db/repository';
import { buildApp } from '../index';
import type { Regulation } from '../../shared/types';

const fakeReport = {
  startedAt: 't',
  finishedAt: 't',
  status: 'success' as const,
  perSource: {},
  total: 0,
};

async function setup() {
  const db = await createDb({ dbType: 'sqlite', dbPath: ':memory:' } as any);
  runMigrations(db);
  const repo = new RegulationRepository(db);
  const pipeline = { runOnce: async () => fakeReport } as any;
  const scheduler = { runNow: async () => fakeReport, start() {}, stop() {} } as any;
  const config = {
    dbType: 'sqlite',
    port: 3000,
    tz: 'Asia/Shanghai',
    cronEnabled: false,
  } as any;
  return { app: buildApp({ repo, pipeline, scheduler, config }), repo };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

describe('REST API', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup();
  });

  it('GET /api/health', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.ok).toBe(true);
  });

  it('GET /api/meta/tags', async () => {
    const res = await request(ctx.app).get('/api/meta/tags');
    expect(res.body.code).toBe(0);
    expect(res.body.data.sources).toContain('NMPA');
    expect(res.body.data.formTags.length).toBeGreaterThan(0);
  });

  it('POST /api/collect/run', async () => {
    const res = await request(ctx.app).post('/api/collect/run');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('success');
  });

  it('GET /api/regulations + 详情 + PATCH', async () => {
    const reg: Regulation = {
      id: 'r1',
      title: 'T',
      source: 'FDA',
      type: '指南',
      originalLanguage: 'en',
      originalUrl: 'https://a.com/r1',
      content: 'c',
      fetchedAt: new Date().toISOString(),
      tags: [],
      watch: false,
      publishDate: '2026-07-01',
    };
    await ctx.repo.save(reg);

    const list = await request(ctx.app).get('/api/regulations');
    expect(list.body.data.total).toBe(1);

    const detail = await request(ctx.app).get('/api/regulations/r1');
    expect(detail.body.data.title).toBe('T');

    const patch = await request(ctx.app)
      .patch('/api/regulations/r1')
      .send({ watch: true });
    expect(patch.body.data.watch).toBe(true);

    const missing = await request(ctx.app)
      .patch('/api/regulations/nope')
      .send({ watch: true });
    expect(missing.status).toBe(404);
  });

  it('PATCH 非法 body → 400', async () => {
    const res = await request(ctx.app)
      .patch('/api/regulations/r1')
      .send({ watch: 'yes' });
    expect(res.status).toBe(400);
  });

  it('GET /api/regulations 筛选组合', async () => {
    const filtered = await request(ctx.app).get('/api/regulations?source=EMA');
    expect(filtered.body.data.total).toBe(0);
  });
});
