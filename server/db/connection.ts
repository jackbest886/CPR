/**
 * 数据库适配层（DbAdapter）。
 *
 * 设计要点：
 * - `DbAdapter` 为对上层（repository / pipeline / routes / tests）暴露的统一契约。
 * - 提供 `SqliteAdapter`（better-sqlite3，MVP 默认）与 `PgAdapter`（pg，部署阶段启用）。
 * - 若 better-sqlite3 原生模块在沙箱中不可用，自动回退到纯 JS 的 sql.js 适配器，
 *   对外方法签名（exec/run/get/all/close）完全一致，上层无需改动。
 * - `createDb(cfg)` 工厂按 `DB_TYPE` 选择实现。
 *
 * 说明：适配层方法统一为 async，以同时兼容同步（SQLite）与异步（Postgres）后端，
 * 保证切换存储后端时上层代码零改动。这是相对类图（sync 示意）的有意增强。
 */
import * as fs from 'fs';
import * as nodePath from 'path';
import type { AppConfig } from '../config';

/** 数据库统一适配接口 */
export interface DbAdapter {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  get<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined>;
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  close(): Promise<void>;
}

/** SQLite（better-sqlite3）适配器 */
class SqliteAdapter implements DbAdapter {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** Postgres（pg）适配器：将 `?` 占位符转为 `$1..$n` */
class PgAdapter implements DbAdapter {
  private pool: any;

  constructor(pool: any) {
    this.pool = pool;
  }

  private toPg(sql: string): { sql: string; count: number } {
    let i = 0;
    const out = sql.replace(/\?/g, () => `$${++i}`);
    return { sql: out, count: i };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    const { sql: pgSql } = this.toPg(sql);
    await this.pool.query(pgSql, params);
  }

  async get<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const { sql: pgSql } = this.toPg(sql);
    const res = await this.pool.query(pgSql, params);
    return (res.rows[0] as T) ?? undefined;
  }

  async all<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const { sql: pgSql } = this.toPg(sql);
    const res = await this.pool.query(pgSql, params);
    return res.rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** 纯 JS 回退适配器（sql.js / WASM SQLite）：保持相同签名 */
async function createSqlJsAdapter(dbPath: string): Promise<DbAdapter> {
  const modName = 'sql.js';
  const sqljs = (await import(modName)) as any;
  const SQL = await sqljs.default();
  const isMemory = dbPath === ':memory:';
  let db: any;
  if (!isMemory && fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  const persist = async (): Promise<void> => {
    if (isMemory) return;
    const data = db.export();
    fs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
  };

  return {
    async exec(sql: string): Promise<void> {
      db.run(sql);
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      db.run(sql, params);
      await persist();
    },
    async get<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T | undefined> {
      const stmt = db.prepare(sql);
      const res = stmt.get(params);
      stmt.free();
      return res as T | undefined;
    },
    async all<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const stmt = db.prepare(sql);
      const res = stmt.all(params);
      stmt.free();
      return res as T[];
    },
    async close(): Promise<void> {
      await persist();
      db.close();
    },
  };
}

/**
 * 按配置创建数据库适配器。
 * - sqlite：优先 better-sqlite3，失败回退 sql.js（纯 JS）。
 * - postgres：使用 pg 连接池。
 */
export async function createDb(cfg: AppConfig): Promise<DbAdapter> {
  if (cfg.dbType === 'postgres') {
    const modName = 'pg';
    const pgMod = (await import(modName)) as any;
    const Pool = pgMod.default?.Pool ?? pgMod.Pool;
    const pool = new Pool({ connectionString: cfg.databaseUrl });
    return new PgAdapter(pool);
  }

  const isMemory = cfg.dbPath === ':memory:';
  const resolved = isMemory
    ? ':memory:'
    : nodePath.resolve(process.cwd(), cfg.dbPath);

  const sqliteMod = 'better-sqlite3';
  try {
    const betterSqlite3 = (await import(sqliteMod)) as any;
    const Database = betterSqlite3.default ?? betterSqlite3;
    if (!isMemory) {
      fs.mkdirSync(nodePath.dirname(resolved), { recursive: true });
    }
    const db = new Database(resolved);
    try {
      db.pragma('journal_mode = WAL');
    } catch {
      /* 某些构建忽略 */
    }
    return new SqliteAdapter(db);
  } catch (err) {
    console.warn(
      '[db] better-sqlite3 不可用，回退到纯 JS 存储(sql.js):',
      (err as Error).message,
    );
    return createSqlJsAdapter(cfg.dbPath);
  }
}
