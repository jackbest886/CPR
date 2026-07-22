import { describe, it, expect } from 'vitest';
import { RuleClassifier, extractSummary } from '../classifiers/index';

const classifier = new RuleClassifier();

describe('RuleClassifier', () => {
  it('FDA 指南 + 预充式注射器 + 糖尿病', async () => {
    const r = await classifier.classify({
      source: 'FDA',
      title: 'Prefilled Syringe Guidance',
      url: 'https://fda.gov/x',
      content: 'Guidance for prefilled syringe combination products for diabetes.',
    });
    expect(r.type).toBe('指南');
    expect(r.tags).toContain('预充式注射器');
    expect(r.tags).toContain('糖尿病');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('征求意见（draft for comment）', async () => {
    const r = await classifier.classify({
      source: 'FDA',
      title: 'Draft Guidance for Comment',
      url: 'https://fda.gov/y',
      content: 'Open for comment on drug-device combination labeling.',
    });
    expect(r.type).toBe('征求意见');
    expect(r.status).toBe('征求意见中');
  });

  it('NMPA 批准 + 药物涂层器械', async () => {
    const r = await classifier.classify({
      source: 'NMPA',
      title: '关于药物涂层球囊批准公告',
      url: 'https://cde.org.cn/z',
      content: '已批准药物涂层器械产品上市。',
    });
    expect(r.type).toBe('批准');
    expect(r.tags).toContain('药物涂层器械');
  });

  it('组合信号但无具体形态 → 其他组合产品', async () => {
    const r = await classifier.classify({
      source: 'FDA',
      title: 'Combination product update',
      url: 'https://fda.gov/u',
      content: 'General combination products policy update.',
    });
    expect(r.tags).toContain('其他组合产品');
  });

  it('extractSummary 回退到标题', () => {
    expect(extractSummary('', '标题A')).toBe('标题A');
  });
});

/**
 * 回归测试：规则分类器不再翻译标题、不再返回 title 字段。
 * 对应源改动：classifiers/index.ts 删除 EN_ZH_MAP / translateEnTitle，
 * classify 仅返回 { type, status, tags, summary }。
 */
describe('RuleClassifier — 标题不翻译且不含 title 字段', () => {
  it('英文 RawItem 分类结果不含 title 字段', async () => {
    const r = await classifier.classify({
      source: 'FDA',
      title: 'Guidance on Prefilled Syringe Combination Products',
      url: 'https://fda.gov/x',
      content:
        'This guidance describes design considerations for prefilled syringe combination products used in diabetes treatment.',
    });

    // 关键回归断言：分类结果不再携带 title
    expect(r).not.toHaveProperty('title');
    expect((r as unknown as Record<string, unknown>).title).toBeUndefined();

    // 其余结构化字段仍完整产出
    expect(r).toHaveProperty('type');
    expect(r).toHaveProperty('tags');
    expect(r).toHaveProperty('summary');
  });

  it('英文 RawItem 的 summary 基于原文英文，未被翻译为中文', async () => {
    const r = await classifier.classify({
      source: 'FDA',
      title: 'Combination Products: Prefilled Syringe Guidance',
      url: 'https://fda.gov/p',
      content:
        'This guidance addresses prefilled syringe combination products and related labeling for diabetes.',
    });

    // summary 抽取自原文英文正文，应保留英文关键词且不含中文字符
    expect(r.summary).toContain('prefilled');
    expect(r.summary).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
