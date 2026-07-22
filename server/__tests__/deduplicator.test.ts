import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { RegulationRepository } from '../db/repository';
import { Deduplicator, normalizeUrl, similarity } from '../deduplicator';
import type { Regulation } from '../../shared/types';

async function makeRepo() {
  const db = await createDb({ dbType: 'sqlite', dbPath: ':memory:' } as any);
  runMigrations(db);
  return new RegulationRepository(db);
}

function reg(id: string, over: Partial<Regulation> = {}): Regulation {
  return {
    id,
    title: `T-${id}`,
    source: 'FDA',
    type: '指南',
    originalLanguage: 'en',
    originalUrl: `https://a.com/${id}`,
    content: 'body',
    fetchedAt: new Date().toISOString(),
    tags: [],
    watch: false,
    ...over,
  };
}

describe('Deduplicator', () => {
  let repo: RegulationRepository;
  let dedup: Deduplicator;

  beforeEach(async () => {
    repo = await makeRepo();
    dedup = new Deduplicator(repo);
  });

  it('normalizeUrl 去查询参数/锚点/尾部斜杠', () => {
    expect(normalizeUrl('https://a.com/x?y=1#frag')).toBe('https://a.com/x');
    expect(normalizeUrl('https://A.com/x/')).toBe('https://a.com/x');
  });

  it('归一化 URL 精确命中（exact）', async () => {
    await repo.save(reg('1', { originalUrl: 'https://a.com/x?a=1' }));
    const hit = await dedup.isDuplicate({
      title: 'T-1',
      originalUrl: 'https://a.com/x#frag',
      content: 'body',
    });
    expect(hit).not.toBeNull();
    expect(hit!.exact).toBe(true);
  });

  it('标题相似度命中（fuzzy）', async () => {
    await repo.save(
      reg('2', {
        title: 'FDA 发布预充式注射器组合产品指南',
        originalUrl: 'https://a.com/2',
      }),
    );
    const hit = await dedup.isDuplicate({
      title: 'FDA发布预充式注射器组合产品指南更新',
      originalUrl: 'https://other.com/3',
      content: 'different',
    });
    expect(hit).not.toBeNull();
    expect(hit!.exact).toBe(false);
  });

  it('正文 sha256 命中（fuzzy）', async () => {
    await repo.save(
      reg('3', { title: 'Title A', originalUrl: 'https://a.com/3', content: 'SAME BODY TEXT' }),
    );
    const hit = await dedup.isDuplicate({
      title: 'Completely Different Title B',
      originalUrl: 'https://x.com/9',
      content: 'SAME BODY TEXT',
    });
    expect(hit).not.toBeNull();
    expect(hit!.exact).toBe(false);
  });

  it('不同条目返回 null', async () => {
    await repo.save(
      reg('4', { title: 'Unique one', originalUrl: 'https://a.com/4', content: 'body4' }),
    );
    const hit = await dedup.isDuplicate({
      title: 'Another unique',
      originalUrl: 'https://b.com/5',
      content: 'body5',
    });
    expect(hit).toBeNull();
  });

  it('similarity 计算', () => {
    expect(similarity('预充式注射器指南', '预充式注射器指南')).toBeGreaterThan(0.8);
    expect(similarity('apple', 'banana')).toBe(0);
  });
});
