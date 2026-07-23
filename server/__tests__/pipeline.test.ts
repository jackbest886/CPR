import { describe, it, expect } from 'vitest';
import { toRegulation, normalizeType, normalizeStatus } from '../pipeline';
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

/**
 * 落库前兜底归一化：无论分类器（含 LLM/qwen）返回什么枚举外值，
 * normalizeType / normalizeStatus 都映射到合法 RegType / RegStatus，
 * 杜绝因枚举不匹配而丢文档（对应修复 A）。
 */
describe('normalizeType / normalizeStatus — 枚举外值兜底', () => {
  it("qwen 返回「指导文件」→ 指南", () => {
    expect(normalizeType('指导文件')).toBe('指南');
  });

  it("qwen 返回「现行有效」→ 已生效", () => {
    expect(normalizeStatus('现行有效')).toBe('已生效');
  });

  it('undefined → 其他 / undefined', () => {
    expect(normalizeType(undefined)).toBe('其他');
    expect(normalizeStatus(undefined)).toBeUndefined();
    expect(normalizeStatus(null)).toBeUndefined();
  });

  it('合法枚举值原样返回', () => {
    expect(normalizeType('指南')).toBe('指南');
    expect(normalizeType('法规')).toBe('法规');
    expect(normalizeType('征求意见')).toBe('征求意见');
    expect(normalizeType('批准')).toBe('批准');
    expect(normalizeStatus('已更新')).toBe('已更新');
    expect(normalizeStatus('已废止')).toBe('已废止');
    expect(normalizeStatus('征求意见中')).toBe('征求意见中');
  });

  it('英文关键词也能正确映射', () => {
    // 'Draft Guidance for Comment' 含 "for comment" → 征求意见（语义正确）
    expect(normalizeType('Draft Guidance for Comment')).toBe('征求意见');
    expect(normalizeType('Guidance for Industry')).toBe('指南');
    expect(normalizeType('Regulatory Framework')).toBe('法规');
    expect(normalizeStatus('Effective')).toBe('已生效');
    expect(normalizeStatus('Withdrawn')).toBe('已废止');
  });
});

/**
 * 回归测试：toRegulation 对分类器返回的枚举外值做兜底归一化（双保险）。
 * 模拟 LLM(qwen) 返回枚举外值（如「指导文件」「现行有效」）时，
 * 落库 type/status 仍被安全归一化为合法枚举，整条文档不会因枚举不匹配而丢失。
 */
describe('toRegulation — 枚举外值兜底归一化', () => {
  const fetchedAt = '2026-07-23T00:00:00.000Z';

  it('分类器返回「指导文件」「现行有效」被归一化为「指南」「已生效」', () => {
    const raw: RawItem = {
      source: 'FDA',
      title: 'Combination Products Guidance for Industry',
      url: 'https://www.federalregister.gov/documents/x',
      publishDate: '2026-07-20',
      content: 'Guidance on combination products under 21 CFR Part 4.',
      language: 'en',
    };
    // 模拟分类器（如 qwen）返回枚举外值
    const cls = {
      type: '指导文件',
      status: '现行有效',
      tags: [],
      summary: 'Combination products guidance.',
    } as unknown as Classification;

    const reg = toRegulation(raw, cls, fetchedAt);

    expect(reg.type).toBe('指南');
    expect(reg.status).toBe('已生效');
    // 其余字段不受影响
    expect(reg.title).toBe(raw.title);
    expect(reg.summary).toBe('Combination products guidance.');
  });
});
