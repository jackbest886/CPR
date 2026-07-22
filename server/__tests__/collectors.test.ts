import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FdaCollector } from '../collectors/fda';
import { EmaCollector } from '../collectors/ema';
import { NmpaCollector, isCombinationRelated } from '../collectors/nmpa';

const __dirname = dirname(fileURLToPath(import.meta.url));
function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

const cfg = { nmpaColumns: [] } as any;

describe('FdaCollector', () => {
  it('解析 RSS fixtures', async () => {
    const c = new FdaCollector(cfg);
    const items = await c.parseRss(fixture('fda.xml'), 'CDER');
    expect(items.length).toBe(2);
    expect(items[0].source).toBe('FDA');
    expect(items[0].sourceSub).toBe('CDER');
    expect(items[0].title).toContain('Prefilled Syringe');
    expect(items[0].publishDate).toBe('2026-07-15');
  });
});

describe('EmaCollector', () => {
  it('解析 RSS fixtures', async () => {
    const c = new EmaCollector(cfg);
    const items = await c.parseRss(fixture('ema.xml'), 'CHMP');
    expect(items.length).toBe(1);
    expect(items[0].source).toBe('EMA');
    expect(items[0].title).toContain('auto-injector');
    expect(items[0].publishDate).toBe('2026-07-17');
  });
});

describe('NmpaCollector', () => {
  it('按关键词初筛栏目链接', () => {
    const c = new NmpaCollector(cfg);
    const items = c.parseHtml(
      fixture('nmpa.html'),
      'https://www.cde.org.cn/main/guide/approvalNews',
    );
    // 三条含组合关键词，一条（工作会议）不含
    expect(items.length).toBe(3);
    expect(items.every((i) => i.source === 'NMPA')).toBe(true);
    expect(items.every((i) => i.sourceSub === 'CDE')).toBe(true);
    expect(items.some((i) => i.title.includes('工作会议'))).toBe(false);
  });

  it('isCombinationRelated', () => {
    expect(isCombinationRelated('药械组合产品指导原则')).toBe(true);
    expect(isCombinationRelated('局领导调研座谈')).toBe(false);
  });
});
