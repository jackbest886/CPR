import { describe, it, expect } from 'vitest';
import { Pipeline } from '../pipeline';
import { FdaCollector } from '../collectors/fda';
import { RuleClassifier } from '../classifiers';
import type { Collector } from '../collectors/base';
import type { RawItem, Regulation } from '../../shared/types';
import type { Deduplicator } from '../deduplicator';
import type { RegulationRepository } from '../db/repository';

/**
 * 端到端回归（Bug B）：验证"标题不含组合关键词、仅 abstract 含 combination product"
 * 的真 FDA 组合产品文档，在修复放宽 provenance 判定后，能完整通过 Pipeline 四重校验
 * （isValidPublishDate / isWithinRecentWindow / isJunkNavigation / isRealDocument）
 * 并成功入库；反之 OMB 等无关键词文档应被丢弃，不过度引入噪声。
 *
 * 这是对 collectors.test.ts（仅断言 provenance 标记有无）的端到端补全，
 * 直接覆盖用户报告的"看板条数从 ~91 暴跌到 ~11"这一入库丢失症状。
 */

const cfg = { nmpaColumns: [] } as any;

function fakeCollectorReturning(items: RawItem[]): Collector {
  return { source: 'FDA', collect: async () => items };
}

function fakeRepoRecording(saved: Regulation[]) {
  return {
    save: async (reg: Regulation) => {
      saved.push(reg);
    },
    saveCollectRun: async () => {},
    findByOriginalUrl: async () => null,
    listForDedup: async () => [],
  } as unknown as RegulationRepository;
}

function fakeDedupNoHit(): Deduplicator {
  return { isDuplicate: async () => null } as unknown as Deduplicator;
}

describe('端到端：放宽后真组合产品文档入库（Bug B 回归）', () => {
  it('标题无组合词、仅 abstract 含 combination product 的 FDA 文档应被放行入库', async () => {
    const fda = new FdaCollector(cfg);
    const rawItems = fda.parseFederalRegister(
      {
        count: 1,
        results: [
          {
            title: 'Guidance for Industry: Design Controls for Drug Delivery Systems',
            html_url: 'https://www.federalregister.gov/documents/abc-123',
            publication_date: '2026-07-20',
            abstract:
              'This guidance clarifies design control expectations for products that meet the definition of a combination product under 21 CFR Part 4.',
          },
        ],
      },
      'combination product',
    );

    const saved: Regulation[] = [];
    const pipeline = new Pipeline(
      [fakeCollectorReturning(rawItems)],
      new RuleClassifier(),
      fakeDedupNoHit(),
      fakeRepoRecording(saved),
      365, // collectRecentDays 足够宽，避免被近期窗口过滤
    );

    const report = await pipeline.runOnce();

    // 关键断言：文档未被 isRealDocument 误杀，成功入库
    expect(report.perSource['FDA']?.count).toBe(1);
    expect(saved.length).toBe(1);
    expect(saved[0].title).toBe(
      'Guidance for Industry: Design Controls for Drug Delivery Systems',
    );
    // provenance 标记确保 isRealDocument 关键词二次确认通过，文档得以恢复
    expect(saved[0].content).toContain('[FR query match: combination product]');
    // 落库 type/status 经 normalizeType/normalizeStatus 兜底，永远合法
    expect(saved[0].type).toBe('指南');
  });

  it('标题与 abstract 均无组合词（OMB 行政公告）应被 Pipeline 丢弃，不过度引入噪声', async () => {
    const fda = new FdaCollector(cfg);
    const rawItems = fda.parseFederalRegister(
      {
        count: 1,
        results: [
          {
            title: 'Agency Information Collection Activities; Submission for OMB Review',
            html_url: 'https://www.federalregister.gov/documents/omb-1',
            publication_date: '2026-07-20',
            abstract:
              'The agency invites comment on a proposed information collection requirement.',
          },
        ],
      },
      'combination product',
    );
    // 防御性确认：该文档确实未被加 provenance 标记
    expect(rawItems[0].content).not.toContain('[FR query match:');

    const saved: Regulation[] = [];
    const pipeline = new Pipeline(
      [fakeCollectorReturning(rawItems)],
      new RuleClassifier(),
      fakeDedupNoHit(),
      fakeRepoRecording(saved),
      365,
    );

    const report = await pipeline.runOnce();

    // 关键断言：无组合关键词文档被 isRealDocument 二次确认拦截，入库数为 0
    expect(report.perSource['FDA']?.count).toBe(0);
    expect(saved.length).toBe(0);
  });
});
