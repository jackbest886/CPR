import { describe, it, expect } from 'vitest';
import { toRegulation } from '../pipeline';
import type { Classification, RawItem } from '../../shared/types';

/**
 * 回归测试：法规条目标题保持原始语言（英文保持英文、中文保持中文），
 * 不翻译、不改写为另一种语言。对应源改动：pipeline.ts `toRegulation`
 * 改为 `title: raw.title`（永远使用原始标题）。
 */
describe('toRegulation — 标题保持原文语言', () => {
  const fetchedAt = '2026-07-23T00:00:00.000Z';

  it('英文 RawItem（FDA）生成的 Regulation.title 严格等于原始英文标题', () => {
    const raw: RawItem = {
      source: 'FDA',
      sourceSub: 'CDER',
      title: 'Combination Products: Prefilled Syringe Guidance for Industry',
      url: 'https://www.fda.gov/combination-products/prefilled-syringe',
      publishDate: 'Mon, 15 Jul 2026 12:00:00 GMT',
      content: 'Guidance on prefilled syringe combination products for diabetes.',
      language: 'en',
    };
    const cls: Classification = {
      type: '指南',
      status: '已生效',
      tags: ['预充式注射器', '糖尿病'],
      summary: 'Guidance on prefilled syringe combination products for diabetes.',
    };

    const reg = toRegulation(raw, cls, fetchedAt);

    // 关键回归断言：标题未被翻译 / 改写为中文
    expect(reg.title).toBe('Combination Products: Prefilled Syringe Guidance for Industry');
    expect(reg.title).toBe(raw.title);
    // 其余字段按分类结果落库，未被标题改动影响
    expect(reg.type).toBe('指南');
    expect(reg.summary).toBe(cls.summary);
    expect(reg.originalLanguage).toBe('en');
  });

  it('中文 RawItem（NMPA）生成的 Regulation.title 保持原始中文标题', () => {
    const raw: RawItem = {
      source: 'NMPA',
      title: '关于药物涂层球囊批准公告',
      url: 'https://cde.org.cn/z',
      publishDate: '2026-07-10',
      content: '已批准药物涂层器械产品上市。',
      language: 'zh',
    };
    const cls: Classification = {
      type: '批准',
      tags: ['药物涂层器械'],
      summary: '已批准药物涂层器械产品上市。',
    };

    const reg = toRegulation(raw, cls, fetchedAt);

    // 关键回归断言：中文标题原样保留，不应被英文化改写
    expect(reg.title).toBe('关于药物涂层球囊批准公告');
    expect(reg.title).toBe(raw.title);
    expect(reg.originalLanguage).toBe('zh');
  });

  it('标题与分类摘要相互独立：改摘要不影响 title（防止回归被误写回标题）', () => {
    const raw: RawItem = {
      source: 'FDA',
      title: 'Draft Guidance for Comment: Drug-Device Combination Labeling',
      url: 'https://fda.gov/y',
      content: 'Open for comment on drug-device combination labeling.',
      language: 'en',
    };
    const cls: Classification = {
      type: '征求意见',
      status: '征求意见中',
      tags: [],
      // 摘要即使包含中文语义标签说明，title 也绝不掺入
      summary: '公开征求意见中',
    };

    const reg = toRegulation(raw, cls, fetchedAt);

    expect(reg.title).toBe(raw.title);
    expect(reg.title).not.toContain('征求意见');
  });
});
