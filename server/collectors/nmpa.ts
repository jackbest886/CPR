/**
 * NMPA 采集器：英文镜像（主路径）+ 中文栏目（降级备选）。
 *
 * 主路径：english.nmpa.gov.cn 英文镜像（无 WAF，language='en'）。
 * 降级路径：中文栏目 cde.org.cn / cmde.org.cn（WAF 拦截时 catch 返回空数组）。
 *
 * 英文镜像文章 URL 路径含日期：YYYY-MM/DD/c_XXXXXX.htm → 可提取 publishDate。
 * 导航/栏目页黑名单由 base.ts 的 isJunkNavigation 统一处理（Pipeline 层）。
 */
import { load } from 'cheerio';
import type { AppConfig } from '../config';
import type { RawItem, Language } from '../../shared/types';
import {
  COMBINATION_KEYWORDS,
  DEFAULT_NMPA_ENGLISH_COLUMNS,
} from '../../shared/constants';
import { Collector, fetchText, resolveUrl, normalizeDate } from './base';

/** 由栏目 URL 推导子机构 */
function deriveSub(columnUrl: string): string {
  if (/cde/i.test(columnUrl)) return 'CDE';
  if (/cmde/i.test(columnUrl)) return 'CMDE';
  if (/english\.nmpa/i.test(columnUrl)) return 'NMPA-EN';
  return 'NMPA';
}

/** 判断文本是否与药械组合相关（命中任一关键词，大小写不敏感） */
export function isCombinationRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return COMBINATION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * 从 NMPA 英文镜像文章 URL 路径中提取发布日期。
 * 路径模式：YYYY-MM/DD/c_XXXXXX.htm → YYYY-MM-DD
 * @returns YYYY-MM-DD 格式日期，无法提取时返回 undefined
 */
function extractDateFromUrl(url: string): string | undefined {
  const match = /(\d{4})-(\d{2})\/(\d{2})\/c_\d+\.htm/i.exec(url);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return normalizeDate(`${y}-${m}-${d}`);
}

export class NmpaCollector implements Collector {
  source = 'NMPA' as const;
  private englishColumns: string[];
  private chineseColumns: string[];

  constructor(cfg: AppConfig) {
    this.englishColumns = DEFAULT_NMPA_ENGLISH_COLUMNS;
    this.chineseColumns = cfg.nmpaColumns;
  }

  async collect(): Promise<RawItem[]> {
    // === 主路径：英文镜像 ===
    let items: RawItem[] = [];
    try {
      items = await this.collectFromMirror();
      if (items.length > 0) {
        console.log(`[nmpa] 英文镜像采集 ${items.length} 条`);
        return items;
      }
    } catch (e) {
      console.error('[nmpa] 英文镜像采集失败:', (e as Error).message);
    }

    // === 降级路径：中文栏目 ===
    console.warn('[nmpa] 英文镜像无结果或异常，降级到中文栏目');
    items = await this.collectFromChinese();
    console.log(`[nmpa] 中文栏目采集 ${items.length} 条`);
    return items;
  }

  /** 采集英文镜像栏目 */
  async collectFromMirror(): Promise<RawItem[]> {
    const out: RawItem[] = [];
    for (const columnUrl of this.englishColumns) {
      try {
        const html = await fetchText(columnUrl);
        out.push(...this.parseHtml(html, columnUrl, 'en'));
      } catch (e) {
        console.error(`[nmpa] 英文镜像栏目采集失败 ${columnUrl}:`, (e as Error).message);
      }
    }
    return out;
  }

  /** 采集中文栏目（WAF 降级备选） */
  async collectFromChinese(): Promise<RawItem[]> {
    const out: RawItem[] = [];
    for (const columnUrl of this.chineseColumns) {
      try {
        const html = await fetchText(columnUrl);
        out.push(...this.parseHtml(html, columnUrl, 'zh'));
      } catch (e) {
        console.warn(`[nmpa] 中文栏目采集失败（疑似 WAF 拦截） ${columnUrl}:`, (e as Error).message);
      }
    }
    return out;
  }

  /**
   * 解析 NMPA 栏目 HTML：抽取链接并按关键词初筛。
   * @param html 栏目页 HTML
   * @param columnUrl 栏目页 URL（用于 resolveUrl 和 deriveSub）
   * @param lang 语言标记（'en' 英文镜像 / 'zh' 中文栏目，默认 'zh'）
   */
  parseHtml(html: string, columnUrl: string, lang: Language = 'zh'): RawItem[] {
    const $ = load(html);
    const sub = deriveSub(columnUrl);
    const items: RawItem[] = [];
    const seen = new Set<string>();

    $('a').each((_, el) => {
      const a = $(el);
      const title = a.text().trim();
      const href = a.attr('href') || '';
      if (!title || title.length < 4) return;
      // 跳过 javascript: 和 # 链接
      if (/^(javascript:|#)/i.test(href)) return;

      const url = resolveUrl(href, columnUrl);
      const extra = a.attr('title') || '';
      if (!isCombinationRelated(title + ' ' + extra + ' ' + url)) return;
      if (seen.has(url)) return;

      seen.add(url);

      // 英文镜像：从 URL 路径提取日期；中文栏目：无日期留待 Pipeline 过滤
      const publishDate = lang === 'en' ? extractDateFromUrl(url) : undefined;

      items.push({
        source: 'NMPA' as const,
        sourceSub: sub,
        title,
        url,
        content: title,
        language: lang,
        publishDate,
      });
    });
    return items;
  }
}
