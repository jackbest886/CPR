import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { RegulationRepository } from '../db/repository';
import type { Regulation } from '../../shared/types';

async function makeRepo() {
  const db = await createDb({ dbType: 'sqlite', dbPath: ':memory:' } as any);
  runMigrations(db);
  return new RegulationRepository(db);
}

function sample(id: string, over: Partial<Regulation> = {}): Regulation {
  const base: Regulation = {
    id,
    title: `T-${id}`,
    source: 'FDA',
    type: '指南',
    originalLanguage: 'en',
    originalUrl: `https://a.com/${id}`,
    content: 'c',
    fetchedAt: new Date().toISOString(),
    tags: ['预充式注射器'],
    publishDate: '2026-07-10',
    status: '已生效',
    watch: false,
  };
  return { ...base, ...over };
}

describe('RegulationRepository', () => {
  let repo: RegulationRepository;

  beforeEach(async () => {
    repo = await makeRepo();
  });

  it('save + getById', async () => {
    await repo.save(sample('1'));
    const got = await repo.getById('1');
    expect(got).not.toBeNull();
    expect(got!.title).toBe('T-1');
    expect(got!.tags).toContain('预充式注射器');
  });

  it('search by source + 分页', async () => {
    await repo.save(sample('1', { source: 'FDA' }));
    await repo.save(sample('2', { source: 'EMA' }));
    const f = await repo.search({ source: ['FDA'], page: 1, pageSize: 10 });
    expect(f.items.length).toBe(1);
    expect(f.total).toBe(1);
  });

  it('search 默认排除重复记录', async () => {
    await repo.save(sample('1'));
    await repo.save(sample('2', { isDuplicateOf: '1' }));
    const all = await repo.search({});
    expect(all.total).toBe(1);
    const dup = await repo.getById('2');
    expect(dup!.isDuplicateOf).toBe('1');
  });

  it('update status 追加 history', async () => {
    await repo.save(sample('1'));
    const updated = await repo.update('1', { status: '已更新', by: 'user' });
    expect(updated!.status).toBe('已更新');
    expect(updated!.statusHistory!.length).toBe(1);
    expect(updated!.statusHistory![0].by).toBe('user');
  });

  it('update watch', async () => {
    await repo.save(sample('1'));
    const u = await repo.update('1', { watch: true });
    expect(u!.watch).toBe(true);
  });

  it('update 缺失返回 null', async () => {
    expect(await repo.update('nope', { watch: true })).toBeNull();
  });

  it('stats 计数', async () => {
    await repo.save(
      sample('1', { source: 'FDA', publishDate: new Date().toISOString().slice(0, 10) }),
    );
    const s = await repo.stats();
    expect(s.bySource['FDA']).toBe(1);
    expect(s.recent).toBeGreaterThanOrEqual(1);
  });
});
