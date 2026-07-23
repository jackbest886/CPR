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
  RegStatus,
  RegType,
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

/**
 * 将任意字符串安全映射到 `REG_TYPES` 最近成员（落库前兜底）。
 *
 * 无论 LLM(qwen) 还是任何分类器返回什么，都映射到合法 `RegType`，
 * 避免枚举校验不匹配导致整条文档被丢弃。关键词匹配优先级从高到低：
 *  - 含「征求 / draft for comment / consultation / open for comment / for comment」→ 征求意见
 *  - 含「批准 / approval / approved / marketing authorization / authorisation」→ 批准
 *  - 含「指南 / guidance / guide / guideline」→ 指南
 *  - 含「法规 / regulation / regulatory / directive / 指令」→ 法规
 *  - 其余 → 其他
 *
 * 这样既覆盖合法枚举值原样返回，也覆盖枚举外值（如 qwen 返回「指导文件」→「指南」）。
 */
export function normalizeType(raw?: string): RegType {
  const t = (raw ?? '').toLowerCase();
  if (/征求|draft for comment|consultation|open for comment|for comment/.test(t))
    return '征求意见';
  if (/批准|approval|approved|marketing authorization|authorisation/.test(t))
    return '批准';
  if (/指南|guidance|guide|guideline|指导/.test(t)) return '指南';
  if (/法规|regulation|regulatory|directive|指令/.test(t)) return '法规';
  return '其他';
}

/**
 * 将任意字符串（或 null / undefined）安全映射到 `REG_STATUSES` 最近成员，
 * 无法识别时返回 `undefined`（落库前兜底）。关键词匹配优先级从高到低：
 *  - 含「征求 / draft for comment / consultation / open for comment」→ 征求意见中
 *  - 含「废止 / withdraw / revoked / cancelled / terminated」→ 已废止
 *  - 含「更新 / update / revised / amended / revision」→ 已更新
 *  - 含「生效 / in force / effective / enforced / implemented」→ 已生效
 *  - 其余 → undefined
 *
 * 覆盖枚举外值（如 qwen 返回「现行有效」→「已生效」），且保证落库 status 永远合法。
 */
export function normalizeStatus(raw?: string | null): RegStatus | undefined {
  const t = (raw ?? '').toLowerCase();
  if (/征求|draft for comment|consultation|open for comment/.test(t))
    return '征求意见中';
  if (/废止|withdraw|revoked|cancelled|terminated/.test(t)) return '已废止';
  if (/更新|update|revised|amended|revision/.test(t)) return '已更新';
  if (/生效|有效|in force|effective|enforced|implemented/.test(t)) return '已生效';
  return undefined;
}

/** 由 RawItem + Classification 构建落库 Regulation */
export function toRegulation(
  raw: RawItem,
  cls: Classification,
  fetchedAt: string,
): Regulation {
  return {
    id: randomUUID(),
    // 永远使用原始标题（保持原文语言，不做翻译写回）
    title: raw.title,
    source: raw.source as Source,
    sourceSub: raw.sourceSub,
    publishDate: raw.publishDate,
    // 双保险：落库前归一化 type/status，杜绝任何分类器返回的枚举外值导致丢文档
    type: normalizeType(cls.type),
    status: normalizeStatus(cls.status),
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
