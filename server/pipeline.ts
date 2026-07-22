/**
 * 采集管线：遍历各采集器 → 校验过滤 → 分类 → 去重 → 落库 → 产出 RunReport。
 *
 * 校验前移（T03）：在分类前统一进行 publishDate 强校验、近期窗口过滤、
 * 导航页黑名单过滤、真实文档校验，避免垃圾条目进入分类/去重/入库流程。
 *
 * 去重策略：
 * - 精确 URL 命中（重复运行）：跳过入库，不计为新条目。
 * - 模糊重复（不同 URL 但标题相似 / 正文相同）：仍入库，标记 is_duplicate_of，
 *   由 repository.search 默认排除，保持看板干净。
 */
import { randomUUID } from 'crypto';
import type {
  Classification,
  RawItem,
  Regulation,
  RunReport,
  Source,
} from '../shared/types';
import type { Collector } from './collectors/base';
import type { Classifier } from './classifiers';
import type { Deduplicator } from './deduplicator';
import type { RegulationRepository } from './db/repository';
import { normalizeUrl } from './deduplicator';
import {
  isValidPublishDate,
  isWithinRecentWindow,
  isJunkNavigation,
} from './collectors/base';
import { COMBINATION_KEYWORDS, COLLECT_RECENT_DAYS_DEFAULT } from '../shared/constants';

/** 由 RawItem + Classification 构建落库 Regulation */
export function toRegulation(
  raw: RawItem,
  cls: Classification,
  fetchedAt: string,
): Regulation {
  return {
    id: randomUUID(),
    // 优先用 LLM 翻译后的中文标题；若 LLM 未返回或原文已是中文，保持原 title
    title: cls.title && cls.title.trim().length > 0 ? cls.title : raw.title,
    source: raw.source as Source,
    sourceSub: raw.sourceSub,
    publishDate: raw.publishDate,
    type: cls.type,
    status: cls.status,
    summary: cls.summary,
    tags: cls.tags,
    originalLanguage: raw.language ?? (raw.source === 'NMPA' ? 'zh' : 'en'),
    originalUrl: normalizeUrl(raw.url),
    content: raw.content,
    fetchedAt,
    watch: false,
    statusHistory: [],
  };
}

export class Pipeline {
  private collectRecentDays: number;

  constructor(
    private collectors: Collector[],
    private classifier: Classifier,
    private deduplicator: Deduplicator,
    private repository: RegulationRepository,
    collectRecentDays?: number,
  ) {
    this.collectRecentDays = collectRecentDays ?? COLLECT_RECENT_DAYS_DEFAULT;
  }

  /**
   * 校验并过滤原始条目：在分类前统一拦截垃圾条目。
   * @returns true 通过校验，false 丢弃
   */
  private validateAndFilter(raw: RawItem): boolean {
    // ① publishDate 强校验
    if (!isValidPublishDate(raw.publishDate)) {
      console.warn(
        `[pipeline] 丢弃无有效发布日期的条目: ${raw.title} (source=${raw.source})`,
      );
      return false;
    }

    // ② 近期窗口过滤
    if (!isWithinRecentWindow(raw.publishDate!, this.collectRecentDays)) {
      console.warn(
        `[pipeline] 跳过超出 ${this.collectRecentDays} 天窗口的条目: ${raw.title} (date=${raw.publishDate})`,
      );
      return false;
    }

    // ③ 导航页黑名单过滤
    if (isJunkNavigation(raw.title, raw.url)) {
      console.warn(
        `[pipeline] 丢弃导航/栏目页: ${raw.title} (url=${raw.url})`,
      );
      return false;
    }

    // ④ 真实文档校验
    if (!this.isRealDocument(raw)) {
      console.warn(
        `[pipeline] 丢弃非真实文档: ${raw.title} (url=${raw.url})`,
      );
      return false;
    }

    return true;
  }

  /**
   * 真实文档校验：URL 路径模式 + 内容长度 + 关键词确认。
   * 拦截栏目页/索引页/空内容等非文档条目。
   */
  private isRealDocument(raw: RawItem): boolean {
    // URL 路径不应是 /index、/home、/search 等导航页
    const pathLower = raw.url.toLowerCase();
    if (/(\/index\.html?|\/home\/?|\/search\b|\/about\.html?)/.test(pathLower)) {
      return false;
    }

    // 内容长度至少 30 字符（标题或正文）。相较原 50 略放宽，以容纳真实的短标题
    // 组合产品文档（如 EMA 新闻 / 指导原则）。此轻微调整不会 reintroduce 垃圾：
    // 导航/栏目页已被 isJunkNavigation 拦截，无关键词条目仍被下方二次确认拦截。
    const text = `${raw.title} ${raw.content ?? ''}`;
    if (text.replace(/\s+/g, '').length < 30) {
      return false;
    }

    // 关键词二次确认：标题或 content 命中 COMBINATION_KEYWORDS 任一
    const lower = text.toLowerCase();
    const hasKeyword = COMBINATION_KEYWORDS.some((kw) =>
      lower.includes(kw.toLowerCase()),
    );
    if (!hasKeyword) {
      return false;
    }

    return true;
  }

  /** 运行一次完整采集 */
  async runOnce(): Promise<RunReport> {
    const startedAt = new Date().toISOString();
    const perSource: RunReport['perSource'] = {};
    let total = 0;

    for (const collector of this.collectors) {
      const source = collector.source;
      try {
        const items = await collector.collect();
        let count = 0;
        let dropped = 0;
        for (const raw of items) {
          // === 阶段2: 校验过滤（前移到分类前） ===
          if (!this.validateAndFilter(raw)) {
            dropped++;
            continue;
          }

          // === 阶段3: 分类 ===
          const cls = await this.classifier.classify(raw);

          // === 阶段4: 去重 + 入库 ===
          const reg = toRegulation(raw, cls, startedAt);
          const dup = await this.deduplicator.isDuplicate(reg);
          if (dup) {
            if (dup.exact) {
              // 重复运行：跳过入库（9 条精选不被覆盖）
              continue;
            }
            reg.isDuplicateOf = dup.id;
          }
          await this.repository.save(reg);
          count++;
        }
        if (dropped > 0) {
          console.log(`[pipeline] ${source} 采集 ${items.length} 条，校验过滤丢弃 ${dropped} 条，入库 ${count} 条`);
        }
        perSource[source] = { count };
        total += count;
      } catch (e) {
        perSource[source] = {
          count: 0,
          error: (e as Error).message,
        };
      }
    }

    const finishedAt = new Date().toISOString();
    const hasError = Object.values(perSource).some((s) => s.error);
    const status: RunReport['status'] = hasError
      ? total > 0
        ? 'partial'
        : 'failed'
      : 'success';

    const report: RunReport = { startedAt, finishedAt, status, perSource, total };
    await this.repository.saveCollectRun(report);
    return report;
  }
}
