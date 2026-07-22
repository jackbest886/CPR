/**
 * 法规仓储：封装对 regulations / collect_runs 的全部数据访问。
 * 仅依赖 DbAdapter 接口，因此对存储后端（SQLite/Postgres/sql.js）无感知。
 */
import { randomUUID } from 'crypto';
import type {
  CollectRunRow,
  Paginated,
  RegFilter,
  Regulation,
  RunReport,
  Source,
  StatsResponse,
  StatusHistoryEntry,
} from '../../shared/types';
import { RECENT_DAYS } from '../../shared/constants';
import type { DbAdapter } from './connection';

/** regulations 表行（蛇形命名字段） */
interface RegRow {
  id: string;
  title: string;
  source: string;
  source_sub: string | null;
  publish_date: string | null;
  effective_date: string | null;
  type: string;
  status: string | null;
  summary: string | null;
  tags: string | null;
  original_language: string;
  original_url: string;
  content: string | null;
  fetched_at: string;
  is_duplicate_of: string | null;
  watch: number;
  status_history: string | null;
}

/** 行 -> Regulation 领域对象 */
function rowToRegulation(row: RegRow): Regulation {
  return {
    id: row.id,
    title: row.title,
    source: row.source as Regulation['source'],
    sourceSub: row.source_sub ?? undefined,
    publishDate: row.publish_date ?? undefined,
    effectiveDate: row.effective_date ?? undefined,
    type: row.type as Regulation['type'],
    status: (row.status as Regulation['status']) ?? undefined,
    summary: row.summary ?? undefined,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    originalLanguage: row.original_language as Regulation['originalLanguage'],
    originalUrl: row.original_url,
    content: row.content ?? undefined,
    fetchedAt: row.fetched_at,
    isDuplicateOf: row.is_duplicate_of ?? undefined,
    watch: !!row.watch,
    statusHistory: row.status_history
      ? (JSON.parse(row.status_history) as StatusHistoryEntry[])
      : [],
  };
}

/** Regulation 领域对象 -> 行 */
function regulationToRow(reg: Regulation): RegRow {
  return {
    id: reg.id,
    title: reg.title,
    source: reg.source,
    source_sub: reg.sourceSub ?? null,
    publish_date: reg.publishDate ?? null,
    effective_date: reg.effectiveDate ?? null,
    type: reg.type,
    status: reg.status ?? null,
    summary: reg.summary ?? null,
    tags: JSON.stringify(reg.tags ?? []),
    original_language: reg.originalLanguage,
    original_url: reg.originalUrl,
    content: reg.content ?? null,
    fetched_at: reg.fetchedAt,
    is_duplicate_of: reg.isDuplicateOf ?? null,
    watch: reg.watch ? 1 : 0,
    status_history: JSON.stringify(reg.statusHistory ?? []),
  };
}

/** PATCH /api/regulations/:id 的可接受字段 */
export interface RegPatch {
  watch?: boolean;
  status?: Regulation['status'];
  by?: string;
}

/**
 * 法规仓储实现。
 */
export class RegulationRepository {
  constructor(private db: DbAdapter) {}

  /**
   * 组合筛选 + 分页检索。
   * 默认排除重复记录（is_duplicate_of IS NOT NULL），保持看板干净。
   */
  async search(filter: RegFilter): Promise<Paginated<Regulation>> {
    const where: string[] = ['is_duplicate_of IS NULL'];
    const params: unknown[] = [];

    if (filter.source && filter.source.length > 0) {
      where.push(`source IN (${filter.source.map(() => '?').join(',')})`);
      params.push(...filter.source);
    }
    if (filter.type && filter.type.length > 0) {
      where.push(`type IN (${filter.type.map(() => '?').join(',')})`);
      params.push(...filter.type);
    }
    if (filter.status && filter.status.length > 0) {
      where.push(`status IN (${filter.status.map(() => '?').join(',')})`);
      params.push(...filter.status);
    }
    if (filter.watch !== undefined) {
      where.push('watch = ?');
      params.push(filter.watch ? 1 : 0);
    }
    if (filter.q && filter.q.trim().length > 0) {
      where.push('(title LIKE ? OR content LIKE ?)');
      params.push(`%${filter.q}%`, `%${filter.q}%`);
    }
    if (filter.tags && filter.tags.length > 0) {
      const tagWheres = filter.tags.map(() => 'tags LIKE ?');
      where.push(`(${tagWheres.join(' OR ')})`);
      filter.tags.forEach((t) => params.push(`%${t}%`));
    }
    if (filter.from) {
      where.push('publish_date >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('publish_date <= ?');
      params.push(filter.to);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const orderSql =
      filter.sort === 'list'
        ? 'ORDER BY fetched_at DESC'
        : 'ORDER BY publish_date DESC';

    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const pageSize =
      filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 20;

    const totalRow = await this.db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM regulations ${whereSql}`,
      params,
    );
    const total = totalRow?.c ?? 0;

    const rows = await this.db.all<RegRow>(
      `SELECT * FROM regulations ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    return {
      items: rows.map(rowToRegulation),
      total,
      page,
      pageSize,
    };
  }

  /** 按 id 获取单条（含 statusHistory；重复记录也可查到） */
  async getById(id: string): Promise<Regulation | null> {
    const row = await this.db.get<RegRow>(
      'SELECT * FROM regulations WHERE id = ?',
      [id],
    );
    return row ? rowToRegulation(row) : null;
  }

  /** 新增一条法规（幂等：相同 id 忽略） */
  async save(reg: Regulation): Promise<void> {
    const row = regulationToRow(reg);
    await this.db.run(
      `INSERT OR IGNORE INTO regulations (
        id, title, source, source_sub, publish_date, effective_date,
        type, status, summary, tags, original_language, original_url,
        content, fetched_at, is_duplicate_of, watch, status_history
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id,
        row.title,
        row.source,
        row.source_sub,
        row.publish_date,
        row.effective_date,
        row.type,
        row.status,
        row.summary,
        row.tags,
        row.original_language,
        row.original_url,
        row.content,
        row.fetched_at,
        row.is_duplicate_of,
        row.watch,
        row.status_history,
      ],
    );
  }

  /**
   * 人工校正 watch / status。
   * - watch 直接更新。
   * - status 变化时追加一条 status_history。
   * 返回更新后的 Regulation；不存在返回 null。
   */
  async update(id: string, patch: RegPatch): Promise<Regulation | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const next: Regulation = { ...existing };
    if (patch.watch !== undefined) {
      next.watch = patch.watch;
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      const history: StatusHistoryEntry[] = existing.statusHistory ?? [];
      history.push({
        status: patch.status,
        at: new Date().toISOString(),
        by: patch.by,
      });
      next.status = patch.status;
      next.statusHistory = history;
    }

    const row = regulationToRow(next);
    await this.db.run(
      'UPDATE regulations SET watch = ?, status = ?, status_history = ? WHERE id = ?',
      [row.watch, row.status, row.status_history, id],
    );
    return next;
  }

  /** 看板统计：按来源/类型/状态计数 + 近 N 天新增 */
  async stats(): Promise<StatsResponse> {
    const base = 'FROM regulations WHERE is_duplicate_of IS NULL';
    const bySource = await this.db.all<{ source: string; c: number }>(
      `SELECT source, COUNT(*) as c ${base} GROUP BY source`,
    );
    const byType = await this.db.all<{ type: string; c: number }>(
      `SELECT type, COUNT(*) as c ${base} GROUP BY type`,
    );
    const byStatus = await this.db.all<{ status: string; c: number }>(
      `SELECT status, COUNT(*) as c ${base} GROUP BY status`,
    );

    const from = new Date();
    from.setDate(from.getDate() - RECENT_DAYS);
    const recentRow = await this.db.get<{ c: number }>(
      `SELECT COUNT(*) as c ${base} AND publish_date >= ?`,
      [from.toISOString().slice(0, 10)],
    );

    return {
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r.c])),
      byType: Object.fromEntries(byType.map((r) => [r.type, r.c])),
      byStatus: Object.fromEntries(
        byStatus.map((r) => [r.status ?? '未标注', r.c]),
      ),
      recent: recentRow?.c ?? 0,
    };
  }

  /** 最近一次采集运行状态（采集健康） */
  async getLatestCollectRun(): Promise<CollectRunRow | null> {
    const row = await this.db.get<CollectRunRow>(
      'SELECT * FROM collect_runs ORDER BY id DESC LIMIT 1',
    );
    return row ?? null;
  }

  /** 持久化一次采集运行报告 */
  async saveCollectRun(report: RunReport): Promise<void> {
    await this.db.run(
      `INSERT INTO collect_runs (started_at, finished_at, status, per_source, error)
       VALUES (?,?,?,?,?)`,
      [
        report.startedAt,
        report.finishedAt,
        report.status,
        JSON.stringify(report.perSource),
        report.error ?? null,
      ],
    );
  }

  /** 供去重器使用的轻量候选集（id/url/title/content） */
  async listForDedup(): Promise<
    { id: string; originalUrl: string; title: string; content: string | null }[]
  > {
    const rows = await this.db.all<{
      id: string;
      original_url: string;
      title: string;
      content: string | null;
    }>('SELECT id, original_url, title, content FROM regulations');
    // 将蛇形列名映射为模型 camelCase，保证调用方按 originalUrl 精确查重可用
    return rows.map((r) => ({
      id: r.id,
      originalUrl: r.original_url,
      title: r.title,
      content: r.content,
    }));
  }

  /** 按归一化 original_url 精确查重 */
  async findByOriginalUrl(
    url: string,
  ): Promise<{ id: string } | null> {
    const row = await this.db.get<{ id: string }>(
      'SELECT id FROM regulations WHERE original_url = ?',
      [url],
    );
    return row ?? null;
  }

  /** 便捷：生成新 id（也供 pipeline 使用） */
  static newId(): string {
    return randomUUID();
  }
}
