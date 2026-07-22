/**
 * FDA 采集器：Federal Register API（主源）+ FDA Guidance RSS（辅源）。
 *
 * 主路径：调用 Federal Register API（无需 Key），获取结构化 publication_date。
 * 辅路径：FDA Guidance RSS（CDER/CDRH/CBER/Recalls/News），RSS 日期可能缺失。
 *
 * 导航/栏目页黑名单已提升到 shared/constants.ts，由 base.ts 的 isJunkNavigation 统一使用。
 * publishDate 校验已提升到 Pipeline 管线层，采集器不再做日期过滤。
 */
import Parser from 'rss-parser';
import type { AppConfig } from '../config';
import type { RawItem } from '../../shared/types';
import {
  DEFAULT_FDA_RSS,
  FEDERAL_REGISTER_API,
  COLLECT_RECENT_DAYS_DEFAULT,
  type SourceFeed,
} from '../../shared/constants';
import { Collector, fetchText, normalizeDate } from './base';

/** Federal Register API 单条文档的最小字段集 */
interface FrDocument {
  title?: string;
  html_url?: string;
  publication_date?: string;
  abstract?: string;
}

/** Federal Register API 响应结构 */
interface FrApiResponse {
  count?: number;
  results?: FrDocument[];
}

/**
 * 构造 Federal Register API 查询 URL（含近期日期窗口）。
 * @param recentDays 近期窗口天数（从今天往前推）
 */
export function buildFederalRegisterUrl(recentDays: number = COLLECT_RECENT_DAYS_DEFAULT): string {
  const gte = new Date();
  gte.setDate(gte.getDate() - recentDays);
  const gteStr = gte.toISOString().slice(0, 10); // YYYY-MM-DD
  const params = new URLSearchParams();
  params.set(`conditions[agencies][]`, FEDERAL_REGISTER_API.agencySlug);
  params.set('conditions[term]', FEDERAL_REGISTER_API.keyword);
  params.set('conditions[publication_date][gte]', gteStr);
  params.set('order', 'newest');
  params.set('per_page', String(FEDERAL_REGISTER_API.perPage));
  params.set('page', '1');
  return `${FEDERAL_REGISTER_API.baseUrl}?${params.toString()}`;
}

export class FdaCollector implements Collector {
  source = 'FDA' as const;
  private feeds: SourceFeed[];
  private parser: Parser;
  private recentDays: number;

  constructor(cfg: AppConfig) {
    this.feeds = DEFAULT_FDA_RSS;
    this.parser = new Parser();
    this.recentDays = cfg.collectRecentDays;
  }

  async collect(): Promise<RawItem[]> {
    const out: RawItem[] = [];

    // === 主源：Federal Register API ===
    try {
      const apiUrl = buildFederalRegisterUrl(this.recentDays);
      const raw = await fetchText(apiUrl);
      const json: FrApiResponse = JSON.parse(raw) as FrApiResponse;
      const frItems = this.parseFederalRegister(json);
      out.push(...frItems);
      console.log(`[fda] Federal Register API 采集 ${frItems.length} 条`);
    } catch (e) {
      console.error('[fda] Federal Register API 采集失败，回退到 RSS:', (e as Error).message);
    }

    // === 辅源：FDA Guidance RSS ===
    for (const feed of this.feeds) {
      try {
        const raw = await fetchText(feed.url);
        if (feed.kind === 'rss') {
          out.push(...(await this.parseRss(raw, feed.sourceSub)));
        }
      } catch (e) {
        console.error(`[fda] RSS 采集失败 ${feed.url}:`, (e as Error).message);
      }
    }

    return out;
  }

  /** 解析 Federal Register API JSON 响应为 RawItem[] */
  parseFederalRegister(json: unknown): RawItem[] {
    const resp = json as FrApiResponse;
    const results = Array.isArray(resp?.results) ? resp.results : [];
    return results
      .filter((doc) => doc.title && doc.html_url && doc.publication_date)
      .map((doc) => ({
        source: 'FDA' as const,
        sourceSub: 'FederalRegister',
        title: doc.title ?? '',
        url: doc.html_url ?? '',
        publishDate: normalizeDate(doc.publication_date) ?? doc.publication_date,
        content: doc.abstract ?? '',
        language: 'en' as const,
      }));
  }

  /** 解析 FDA Guidance RSS（fixtures 可注入） */
  async parseRss(xml: string, sourceSub: string): Promise<RawItem[]> {
    const feed = await this.parser.parseString(xml);
    return (feed.items ?? []).map((it) => ({
      source: 'FDA' as const,
      sourceSub,
      title: it.title ?? '',
      url: it.link ?? '',
      publishDate: normalizeDate(it.isoDate ?? it.pubDate),
      content: it.contentSnippet ?? it.content ?? '',
      language: 'en' as const,
    }));
  }
}
