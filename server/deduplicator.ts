/**
 * 去重器：original_url 归一 → 标题相似度(≥0.85) → 正文 sha256 命中。
 *
 * 返回 `{ id, exact }`：id 为命中的主记录 id；
 * exact=true 表示归一化 URL 精确命中（通常为重复运行导致，pipeline 会跳过入库）；
 * exact=false 表示模糊重复（标题相似 / 正文相同但 URL 不同，多为跨源重复），
 * pipeline 会将其入库并标记 `is_duplicate_of`。
 */
import { createHash } from 'crypto';
import { DEDUP_TITLE_SIMILARITY } from '../shared/constants';
import type { RegulationRepository } from './db/repository';

/** 去重判定目标（RawItem / 待落库 Regulation 的最小字段） */
export interface DedupTarget {
  title: string;
  originalUrl: string;
  content?: string;
}

export interface DedupHit {
  id: string;
  exact: boolean;
}

/** 归一化 URL：去查询参数/锚点、去尾部斜杠、host 转小写 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return url
      .trim()
      .split('#')[0]
      .split('?')[0]
      .replace(/\/+$/, '');
  }
}

/** 字符二元组集合（中英文均适用） */
function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/\s+/g, '');
  const set = new Set<string>();
  if (t.length === 0) return set;
  if (t.length === 1) {
    set.add(t);
    return set;
  }
  for (let i = 0; i < t.length - 1; i++) {
    set.add(t.slice(i, i + 2));
  }
  return set;
}

/** Jaccard 相似度（基于字符二元组） */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** sha256 十六进制 */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export class Deduplicator {
  constructor(private repo: RegulationRepository) {}

  /**
   * 判断目标是否为重复。
   * 1) 归一化 URL 精确命中 → 重复（exact=true）
   * 2) 正文 sha256 命中 → 重复（exact=false）
   * 3) 标题相似度 ≥ 阈值 → 重复（exact=false）
   * 否则返回 null（非重复）。
   */
  async isDuplicate(item: DedupTarget): Promise<DedupHit | null> {
    const norm = normalizeUrl(item.originalUrl);

    // 1. 归一化 URL 精确命中
    const byUrl = await this.repo.findByOriginalUrl(norm);
    if (byUrl) return { id: byUrl.id, exact: true };

    // 候选集（id/url/title/content）
    const candidates = await this.repo.listForDedup();
    const contentHash = item.content ? sha256(item.content) : null;

    for (const c of candidates) {
      if (c.originalUrl && normalizeUrl(c.originalUrl) === norm) {
        return { id: c.id, exact: true };
      }
      if (contentHash && c.content) {
        if (sha256(c.content) === contentHash) {
          return { id: c.id, exact: false };
        }
      }
      if (similarity(item.title, c.title) >= DEDUP_TITLE_SIMILARITY) {
        return { id: c.id, exact: false };
      }
    }
    return null;
  }
}
