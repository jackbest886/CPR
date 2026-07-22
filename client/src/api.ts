/**
 * 前端 API 封装：统一调用 /api 接口（相对路径，开发期由 Vite 代理到后端）。
 * 所有响应遵循统一信封 { code, data, message }，code !== 0 视为异常。
 */
import type {
  CollectRunRow,
  MetaResponse,
  Paginated,
  RegFilter,
  Regulation,
  RegStatus,
  RunReport,
  StatsResponse,
} from '../../shared/types';

const BASE = '/api';

async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(json.message || 'request failed');
  }
  return json.data as T;
}

/** 将筛选条件序列化为 query string */
export function buildQuery(filter: RegFilter): string {
  const qs = new URLSearchParams();
  if (filter.source?.length) qs.set('source', filter.source.join(','));
  if (filter.type?.length) qs.set('type', filter.type.join(','));
  if (filter.status?.length) qs.set('status', filter.status.join(','));
  if (filter.tags?.length) qs.set('tags', filter.tags.join(','));
  if (filter.q) qs.set('q', filter.q);
  if (filter.from) qs.set('from', filter.from);
  if (filter.to) qs.set('to', filter.to);
  if (filter.watch !== undefined) qs.set('watch', filter.watch ? '1' : '0');
  if (filter.sort) qs.set('sort', filter.sort);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.pageSize) qs.set('pageSize', String(filter.pageSize));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export type RegulationsResult = Paginated<Regulation>;

export function fetchRegulations(filter: RegFilter): Promise<RegulationsResult> {
  return http(`${BASE}/regulations${buildQuery(filter)}`);
}

export function fetchRegulation(id: string): Promise<Regulation> {
  return http(`${BASE}/regulations/${encodeURIComponent(id)}`);
}

export function patchRegulation(
  id: string,
  patch: { watch?: boolean; status?: RegStatus; by?: string },
): Promise<Regulation> {
  return http(`${BASE}/regulations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function fetchMeta(): Promise<MetaResponse> {
  return http(`${BASE}/meta/tags`);
}

export function fetchStats(): Promise<StatsResponse> {
  return http(`${BASE}/stats`);
}

export function runCollection(): Promise<RunReport> {
  return http(`${BASE}/collect/run`, { method: 'POST' });
}

export function fetchCollectStatus(): Promise<CollectRunRow | null> {
  return http(`${BASE}/collect/status`);
}
