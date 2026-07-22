/**
 * 采集器基类与契约。
 * - `Collecter` 接口：每个来源实现 `collect(): Promise<RawItem[]>`。
 * - `collectors` 注册表：收集所有已注册实例（可选使用）。
 * - 共享工具：fetchText / normalizeDate / resolveUrl。
 */
import type { RawItem, Source } from '../../shared/types';
import { JUNK_NAV_PATTERNS } from '../../shared/constants';

/** 采集器接口（统一契约） */
export interface Collector {
  source: Source;
  collect(): Promise<RawItem[]>;
}

/** 来源注册表（便于统一遍历；也可由入口显式构造） */
export const collectors: Collector[] = [];

export function registerCollector(c: Collector): void {
  collectors.push(c);
}

/** 抓取 URL 文本（Node 18+ 内置 fetch），带超时与 UA */
export async function fetchText(
  url: string,
  timeoutMs = 15000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'reggov-tracker/1.0 (+compliance)' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 将任意日期字符串规范为 YYYY-MM-DD，失败返回 undefined */
export function normalizeDate(input?: string): string | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** 将相对/绝对 URL 解析为绝对 URL */
export function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * 校验发布日期是否存在且为有效 YYYY-MM-DD 格式。
 * 接受 ISO 日期字符串（如 "2025-03-15"），拒绝空值/非法格式。
 */
export function isValidPublishDate(date?: string): boolean {
  if (!date) return false;
  // 严格匹配 YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // 进一步用 Date 校验日历合法性
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

/**
 * 判断日期是否在近期窗口内（从今天往前推 days 天）。
 * @param date YYYY-MM-DD 格式日期
 * @param days 窗口天数（如 90）
 */
export function isWithinRecentWindow(date: string, days: number): boolean {
  const target = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days && diffDays >= -1; // 允许 1 天的未来日期容差
}

/**
 * 判断条目标题/URL 是否命中已知导航/栏目/索引页黑名单。
 * 使用 shared/constants.ts 的 JUNK_NAV_PATTERNS（跨源共享）。
 */
export function isJunkNavigation(title: string, url: string): boolean {
  const hay = `${title} ${url}`;
  return JUNK_NAV_PATTERNS.some((re) => re.test(hay));
}
