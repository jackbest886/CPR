/**
 * 法规情报追踪系统 · 共享类型定义
 *
 * 前后端共用同一份类型，避免重复定义与契约漂移。
 * 本文件仅含类型，不引入任何运行时依赖。
 */

/** 监管来源 */
export type Source = 'NMPA' | 'FDA' | 'EMA';

/** 法规类型 */
export type RegType = '指南' | '法规' | '征求意见' | '批准' | '其他';

/** 法规状态（可空） */
export type RegStatus = '征求意见中' | '已生效' | '已更新' | '已废止';

/** 原文语言 */
export type Language = 'zh' | 'en';

/**
 * 采集器产出的原始条目契约：尚未经过分类/去重。
 */
export interface RawItem {
  source: Source;
  sourceSub?: string;
  title: string;
  url: string;
  publishDate?: string;
  content?: string;
  language?: Language;
}

/**
 * 分类器产出：对一条 RawItem 补全结构化字段。
 */
export interface Classification {
  type: RegType;
  status?: RegStatus;
  tags: string[];
  summary: string;
  /** LLM 或规则分类器对原文标题的中文翻译（仅当原文非中文时填写，中文原文不填） */
  title?: string;
}

/** 状态变更历史记录 */
export interface StatusHistoryEntry {
  status: RegStatus;
  at: string;
  by?: string;
}

/**
 * 落库后的法规记录（与数据库 regulations 表一一对应）。
 */
export interface Regulation {
  id: string;
  title: string;
  source: Source;
  sourceSub?: string;
  publishDate?: string;
  effectiveDate?: string;
  type: RegType;
  status?: RegStatus;
  summary?: string;
  tags: string[];
  originalLanguage: Language;
  originalUrl: string;
  content?: string;
  fetchedAt: string;
  isDuplicateOf?: string;
  watch: boolean;
  statusHistory?: StatusHistoryEntry[];
}

/** 视图排序模式 */
export type SortMode = 'timeline' | 'list';

/**
 * 看板检索/筛选条件（对应 GET /api/regulations 的 query 与 POST body）。
 */
export interface RegFilter {
  source?: Source[];
  type?: RegType[];
  status?: RegStatus[];
  tags?: string[];
  q?: string;
  from?: string;
  to?: string;
  watch?: boolean;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
}

/** 统一响应信封 */
export interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

/** 分页结果 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /api/meta/tags 响应 */
export interface MetaResponse {
  sources: Source[];
  types: RegType[];
  statuses: RegStatus[];
  formTags: string[];
  dimTags: string[];
}

/** GET /api/stats 响应 */
export interface StatsResponse {
  bySource: Record<string, number>;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recent: number;
}

/** 单次采集运行报告 */
export interface RunReport {
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed';
  perSource: Record<string, { count: number; error?: string }>;
  total: number;
  error?: string;
}

/** collect_runs 表行（采集健康状态） */
export interface CollectRunRow {
  id: number;
  started_at: string;
  finished_at: string;
  status: string;
  per_source: string;
  error: string | null;
}
