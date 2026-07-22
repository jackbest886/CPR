/**
 * 配置加载：读取 .env 并产出强类型 AppConfig。
 * 通过 dotenv 自动加载项目根目录 .env。
 */
import 'dotenv/config';
import {
  ENV,
  DEFAULT_NMPA_COLUMNS,
  COLLECT_RECENT_DAYS_DEFAULT,
  KEEPALIVE_INTERVAL_MS,
} from '../shared/constants';

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 应用强类型配置 */
export interface AppConfig {
  dbType: 'sqlite' | 'postgres';
  dbPath: string;
  databaseUrl?: string;
  port: number;
  tz: string;
  cronEnabled: boolean;
  collectCron: string;
  runOnStart: boolean;
  llmProvider?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  authEnabled: boolean;
  nmpaColumns: string[];
  /** 自动采集总开关：false 时调度器不注册/启动定时采集（默认关闭） */
  collectionEnabled: boolean;
  /** 近期窗口天数：只采集近 N 天发布的条目（默认 90） */
  collectRecentDays: number;
  /** 自 ping 保活开关（默认 true） */
  keepaliveEnabled: boolean;
  /** 自 ping 保活间隔毫秒（默认 300000 = 5 分钟） */
  keepaliveIntervalMs: number;
}

/**
 * 解析 LLM 配置，并按所选国内厂商应用默认值。
 * 规则：仅当对应值为空时才补默认；显式环境变量始终优先。
 *
 *  - glm     → 智谱 BigModel，默认 glm-4-flash
 *  - qwen    → 阿里云百炼 DashScope，默认 qwen-plus
 *  - deepseek→ DeepSeek 开放平台，默认 deepseek-chat
 */
function resolveLlmConfig(): Pick<
  AppConfig,
  'llmProvider' | 'llmApiKey' | 'llmModel' | 'llmBaseUrl'
> {
  const llmProvider = process.env[ENV.LLM_PROVIDER] || undefined;
  const llmApiKey = process.env[ENV.LLM_API_KEY] || undefined;
  let llmModel = process.env[ENV.LLM_MODEL] || undefined;
  let llmBaseUrl = process.env[ENV.LLM_BASE_URL] || undefined;

  switch (llmProvider) {
    case 'glm':
      llmBaseUrl ||= 'https://open.bigmodel.cn/api/paas/v4';
      llmModel ||= 'glm-4-flash';
      break;
    case 'qwen':
      llmBaseUrl ||= 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      llmModel ||= 'qwen-plus';
      break;
    case 'deepseek':
      llmBaseUrl ||= 'https://api.deepseek.com/v1';
      llmModel ||= 'deepseek-chat';
      break;
  }

  return { llmProvider, llmApiKey, llmModel, llmBaseUrl };
}

/**
 * 从 process.env 构造配置；NMPA_COLUMNS 未设置时回退到默认栏目常量。
 */
export function loadConfig(): AppConfig {
  const nmpaRaw = process.env[ENV.NMPA_COLUMNS];
  const nmpaColumns =
    nmpaRaw && nmpaRaw.trim().length > 0
      ? nmpaRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_NMPA_COLUMNS;

  return {
    dbType: (process.env[ENV.DB_TYPE] as 'sqlite' | 'postgres') || 'sqlite',
    dbPath: process.env[ENV.DB_PATH] || './data/reggov.db',
    databaseUrl: process.env[ENV.DATABASE_URL] || undefined,
    port: toNumber(process.env[ENV.PORT], 3000),
    tz: process.env[ENV.TZ] || 'Asia/Shanghai',
    cronEnabled: toBool(process.env[ENV.CRON_ENABLED], true),
    collectCron: process.env[ENV.COLLECT_CRON] || '0 8 * * *',
    runOnStart: toBool(process.env[ENV.RUN_ON_START], true),
    ...resolveLlmConfig(),
    authEnabled: toBool(process.env[ENV.AUTH_ENABLED], false),
    nmpaColumns,
    collectionEnabled: toBool(process.env[ENV.COLLECTION_ENABLED], true),
    collectRecentDays: toNumber(
      process.env[ENV.COLLECT_RECENT_DAYS],
      COLLECT_RECENT_DAYS_DEFAULT,
    ),
    keepaliveEnabled: toBool(process.env[ENV.KEEPALIVE_ENABLED], true),
    keepaliveIntervalMs: toNumber(
      process.env[ENV.KEEPALIVE_INTERVAL_MS],
      KEEPALIVE_INTERVAL_MS,
    ),
  };
}

/** 默认导出全局配置（模块加载即解析一次） */
export const config: AppConfig = loadConfig();
