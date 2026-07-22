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
  MAX_FR_PAGES,
  MAX_FR_DOCS,
  COMBINATION_KEYWORDS,
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
 * 构造 Federal Register API 查询 URL（含近期日期窗口 + 关键词 + 页码）。
 * 始终限定 FDA agency（agencySlug），不越界到其它机构。
 * @param recentDays 近期窗口天数（从今天往前推）
 * @param keyword 关键词（如 'combination product'），默认 FEDERAL_REGISTER_API.keyword
 * @param page 页码（从 1 开始），默认 1
 */
export function buildFederalRegisterUrl(
  recentDays: number = COLLECT_RECENT_DAYS_DEFAULT,
  keyword: string = FEDERAL_REGISTER_API.keyword,
  page: number = 1,
): string {
  const gte = new Date();
  gte.setDate(gte.getDate() - recentDays);
  const gteStr = gte.toISOString().slice(0, 10); // YYYY-MM-DD
  const params = new URLSearchParams();
  params.set(`conditions[agencies][]`, FEDERAL_REGISTER_API.agencySlug);
  params.set('conditions[term]', keyword);
  params.set('conditions[publication_date][gte]', gteStr);
  params.set('order', 'newest');
  params.set('per_page', String(FEDERAL_REGISTER_API.perPage));
  params.set('page', String(page));
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

    // === 主源：Federal Register API（多关键词 + 翻页，仍限定 FDA agency）===
    const keywords = FEDERAL_REGISTER_API.keywords.length
      ? FEDERAL_REGISTER_API.keywords
      : [FEDERAL_REGISTER_API.keyword];
    for (const keyword of keywords) {
      let page = 1;
      let kwTotal = 0;
      // 明确上限：页数 ≤ MAX_FR_PAGES 且累计 < MAX_FR_DOCS，杜绝死循环
      while (page <= MAX_FR_PAGES && kwTotal < MAX_FR_DOCS) {
        try {
          const apiUrl = buildFederalRegisterUrl(this.recentDays, keyword, page);
          const raw = await fetchText(apiUrl);
          const json: FrApiResponse = JSON.parse(raw) as FrApiResponse;
          const pageItems = this.parseFederalRegister(json, keyword);
          if (pageItems.length === 0) {
            // 空页 = 已到末页，终止该关键词翻页
            break;
          }
          out.push(...pageItems);
          kwTotal += pageItems.length;
          page += 1;
        } catch (e) {
          console.error(
            `[fda] Federal Register API 翻页失败 keyword="${keyword}" page=${page}:`,
            (e as Error).message,
          );
          // 单页失败仅中断该关键词，不影响其他关键词与后续 RSS 辅源
          break;
        }
      }
      console.log(`[fda] Federal Register API 关键词 "${keyword}" 采集 ${kwTotal} 条`);
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

  /**
   * 解析 Federal Register API JSON 响应为 RawItem[]。
   *
   * @param keyword 本次查询使用的关键词（来自 FEDERAL_REGISTER_API.keywords）。
   *
   * provenance 策略（条件式标记）：
   * 只当文档的**标题或摘要本身**已命中 `COMBINATION_KEYWORDS` 时，才把
   * `[FR query match: ${keyword}]` provenance 标记追加到 content（作为辅助，
   * 确保 isRealDocument 关键词二次确认通过）。否则**不加任何标记**，仅返回
   * 原始摘要，让 isRealDocument 严格判定——非组合产品文档将被正确过滤。
   *
   * 这样做的理由：Federal Register 的全文检索是宽松的相关性匹配，可能仅因
   * 脚注/附件中提及关键词就返回文档。若无条件给每条加 provenance 标记，
   * 会让 isRealDocument 的关键词二次确认形同虚设（因为 keyword 本身就是
   * COMBINATION_KEYWORDS 之一，标记注入后必然通过）。条件式标记确保只有
   * 标题/摘要本身确实涉及组合产品的文档才入库，避免非组合产品文档混入看板。
   *
   * 注意：这**不弱化**四重校验——管线层仍会对每条执行
   * isValidPublishDate / isWithinRecentWindow / isJunkNavigation / isRealDocument
   * 全部检查。
   */
  parseFederalRegister(json: unknown, keyword: string): RawItem[] {
    const resp = json as FrApiResponse;
    const results = Array.isArray(resp?.results) ? resp.results : [];
    return results
      // 防御：跳过 null/undefined 脏条目；并要求 title/html_url/publication_date 齐备（去空）
      .filter((doc): doc is FrDocument =>
        !!doc && !!doc.title && !!doc.html_url && !!doc.publication_date,
      )
      .map((doc) => {
        const abstract = doc.abstract ?? '';
        // 只当标题或摘要本身命中 COMBINATION_KEYWORDS 时，才认为这是真实组合产品文档
        // 此时加 provenance 标记作为辅助（确保 isRealDocument 通过）；
        // 否则不加标记，让 isRealDocument 严格判定（非组合产品文档会被正确过滤）
        const titleLower = (doc.title ?? '').toLowerCase();
        const abstractLower = abstract.toLowerCase();
        const isComboRelated = COMBINATION_KEYWORDS.some(
          (kw) =>
            titleLower.includes(kw.toLowerCase()) ||
            abstractLower.includes(kw.toLowerCase()),
        );
        const provenanceTag = isComboRelated
          ? `\n\n[FR query match: ${keyword}]`
          : '';
        const content = abstract
          ? `${abstract}${provenanceTag}`
          : provenanceTag.replace(/^\n\n/, '');
        return {
          source: 'FDA' as const,
          sourceSub: 'FederalRegister',
          title: doc.title ?? '',
          url: doc.html_url ?? '',
          publishDate: normalizeDate(doc.publication_date) ?? doc.publication_date,
          content,
          language: 'en' as const,
        };
      });
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
