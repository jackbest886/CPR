/**
 * 数据库迁移：建表、索引、版本记录。
 * 通过 `runMigrations(db)` 幂等执行（使用 IF NOT EXISTS）。
 */
import type { DbAdapter } from './connection';

/**
 * 完整 schema（与系统架构设计 §3.1 一致）。
 * regulations 表含 6 个索引 + __migrations__ + collect_runs。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS regulations (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  source            TEXT NOT NULL,
  source_sub        TEXT,
  publish_date      TEXT,
  effective_date    TEXT,
  type              TEXT NOT NULL,
  status            TEXT,
  summary           TEXT,
  tags              TEXT,
  original_language TEXT,
  original_url      TEXT NOT NULL,
  content           TEXT,
  fetched_at        TEXT NOT NULL,
  is_duplicate_of   TEXT,
  watch             INTEGER NOT NULL DEFAULT 0,
  status_history    TEXT
);

CREATE INDEX IF NOT EXISTS idx_reg_source        ON regulations(source);
CREATE INDEX IF NOT EXISTS idx_reg_type          ON regulations(type);
CREATE INDEX IF NOT EXISTS idx_reg_status        ON regulations(status);
CREATE INDEX IF NOT EXISTS idx_reg_publish_date  ON regulations(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_reg_original_url  ON regulations(original_url);
CREATE INDEX IF NOT EXISTS idx_reg_watch         ON regulations(watch);

CREATE TABLE IF NOT EXISTS __migrations__ (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS collect_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT,
  finished_at TEXT,
  status      TEXT,
  per_source  TEXT,
  error       TEXT
);
`;

const CURRENT_VERSION = 1;

/**
 * 执行迁移：建表 + 写入迁移版本（幂等）。
 * 注：Postgres 路径的 `INSERT OR IGNORE` 语法需要在部署阶段替换为
 * `ON CONFLICT DO NOTHING`，MVP（SQLite）按此实现并通过验证。
 */
export function runMigrations(db: DbAdapter): void {
  db.exec(SCHEMA);
  db.run('INSERT OR IGNORE INTO __migrations__(version, applied_at) VALUES (?, ?)', [
    CURRENT_VERSION,
    new Date().toISOString(),
  ]);
}
