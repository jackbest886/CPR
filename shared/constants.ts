/**
 * 法规情报追踪系统 · 共享常量与配置清单（唯一来源）
 *
 * 所有枚举值、语义标签体系、采集源配置、环境变量名均集中于此，
 * 前后端共享，杜绝魔法字符串。
 */
import type { Source, RegType, RegStatus } from './types';

/** 来源枚举（唯一来源） */
export const SOURCES: Source[] = ['NMPA', 'FDA', 'EMA'];

/** 类型枚举（唯一来源） */
export const REG_TYPES: RegType[] = ['指南', '法规', '征求意见', '批准', '其他'];

/** 状态枚举（唯一来源，可空） */
export const REG_STATUSES: RegStatus[] = ['征求意见中', '已生效', '已更新', '已废止'];

/**
 * 组合形态标签（一级）：覆盖药械组合边界。
 */
export const FORM_TAGS: string[] = [
  '预充式注射器',
  '自动注射笔',
  '药物涂层器械',
  '生物材料组合',
  '伤口闭合组合',
  '吸入组合产品',
  '植入式给药系统',
  '透皮给药组合',
  '其他组合产品',
];

/**
 * 维度标签（二级）：监管路径 / 治疗领域 / 信号类型。
 */
export const DIM_REG_PATH: string[] = ['器械主导', '药物主导', '交叉标记'];
export const DIM_THERAPY: string[] = ['肿瘤', '糖尿病', '心血管', '自免', '抗感染', '其他'];
export const DIM_SIGNAL: string[] = ['机会信号', '风险信号', '中性动态'];
export const DIM_TAGS: string[] = [...DIM_REG_PATH, ...DIM_THERAPY, ...DIM_SIGNAL];

/** 全部维度标签（用于前端元信息展示） */
export const ALL_DIM_TAGS: string[] = DIM_TAGS;

/**
 * 环境变量名清单（唯一来源）。
 */
export const ENV = {
  DB_TYPE: 'DB_TYPE',
  DB_PATH: 'DB_PATH',
  DATABASE_URL: 'DATABASE_URL',
  PORT: 'PORT',
  TZ: 'TZ',
  CRON_ENABLED: 'CRON_ENABLED',
  COLLECT_CRON: 'COLLECT_CRON',
  RUN_ON_START: 'RUN_ON_START',
  LLM_PROVIDER: 'LLM_PROVIDER',
  LLM_API_KEY: 'LLM_API_KEY',
  LLM_MODEL: 'LLM_MODEL',
  LLM_BASE_URL: 'LLM_BASE_URL',
  AUTH_ENABLED: 'AUTH_ENABLED',
  NMPA_COLUMNS: 'NMPA_COLUMNS',
  COLLECTION_ENABLED: 'COLLECTION_ENABLED',
  COLLECT_RECENT_DAYS: 'COLLECT_RECENT_DAYS',
  KEEPALIVE_ENABLED: 'KEEPALIVE_ENABLED',
  KEEPALIVE_INTERVAL_MS: 'KEEPALIVE_INTERVAL_MS',
} as const;

/** 采集源条目：RSS / 网页 / API */
export interface SourceFeed {
  source: Source;
  sourceSub: string;
  url: string;
  kind: 'rss' | 'html' | 'api';
}

/** FDA 默认采集源（Guidance RSS — 辅源；主源为 Federal Register API） */
export const DEFAULT_FDA_RSS: SourceFeed[] = [
  {
    source: 'FDA',
    sourceSub: 'CDER',
    url: 'https://www.fda.gov/about-fda/center-drug-evaluation-and-research-cder/cder-guidance-documents/rss.xml',
    kind: 'rss',
  },
  {
    source: 'FDA',
    sourceSub: 'CDRH',
    url: 'https://www.fda.gov/about-fda/center-devices-and-radiological-health-cdrh/cdrh-guidance-documents/rss.xml',
    kind: 'rss',
  },
  {
    source: 'FDA',
    sourceSub: 'CBER',
    url: 'https://www.fda.gov/vaccines-blood-biologics/cber-guidance-documents/rss.xml',
    kind: 'rss',
  },
  {
    source: 'FDA',
    sourceSub: 'Recalls',
    url: 'https://www.fda.gov/about-fda/fda-news-events-fda/recalls/rss.xml',
    kind: 'rss',
  },
  {
    source: 'FDA',
    sourceSub: 'News',
    url: 'https://www.fda.gov/about-fda/fda-news-events-fda/news/rss.xml',
    kind: 'rss',
  },
];

/** EMA 默认采集源（RSS + CHMP 意见） */
export const DEFAULT_EMA_RSS: SourceFeed[] = [
  {
    source: 'EMA',
    sourceSub: 'News',
    url: 'https://www.ema.europa.eu/en/news/rss.xml',
    kind: 'rss',
  },
  {
    source: 'EMA',
    sourceSub: 'CHMP',
    url: 'https://www.ema.europa.eu/en/rss-feed/medicines-human/chronological.xml',
    kind: 'rss',
  },
];

/**
 * NMPA 默认栏目 URL（CDE/CMDE）。
 * 说明：脆弱路径不硬编码于采集器；由常量集中管理，
 * 并由环境变量 NMPA_COLUMNS 在部署时覆盖。
 */
export const DEFAULT_NMPA_COLUMNS: string[] = [
  'https://www.cde.org.cn/main/guide/approvalNews',
  'https://www.cde.org.cn/main/guide/informative',
  'https://www.cmde.org.cn/CL0004/',
];

/** 去重：标题相似度阈值（>= 判定为候选重复） */
export const DEDUP_TITLE_SIMILARITY = 0.85;

/** 抽取式摘要截取长度（无 LLM 时） */
export const SUMMARY_EXTRACT_CHARS = 200;

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;

/** 统计"近 N 天"窗口 */
export const RECENT_DAYS = 30;

/**
 * 药械组合强信号关键词（用于 NMPA 初筛与规则分类兜底）。
 * 命中即视为与组合产品相关。
 */
export const COMBINATION_KEYWORDS: string[] = [
  '药械组合',
  '组合产品',
  '组合器械',
  'combination product',
  'combination products',
  'prefilled syringe',
  'pre-filled syringe',
  'auto-injector',
  'drug-device',
  'drug device',
  'device-drug',
  '预充式注射器',
  '预灌封注射器',
  '自动注射笔',
  '注射笔',
  '药物涂层',
  '药物洗脱',
  '吸入制剂',
  '吸入组合',
  '植入式',
  '植入给药',
  '透皮',
  '伤口闭合',
  '生物材料',
  // —— 以下为 21 CFR 3.2(e) 组合产品术语扩充（具体复合词，非泛词）——
  'drug/biologic',
  'biologic-device',
  'biologic/device',
  'biologic device',
  'drug-biologic',
  'drug biologic',
  'pen injector',
  'insulin pen',
  'injector pen',
  'drug-eluting',
  'drug eluting',
  'transdermal',
  'transdermal patch',
  'transdermal system',
  'co-packaged',
  'co-packaged combination',
  'cross-labeled',
  'cross-labeling',
  'on-body delivery',
  'wearable injector',
  'metered dose inhaler',
  'antibiotic bone cement',
  'antimicrobial coating',
  'device coated',
  'impregnated with drug',
  'drug-coated',
  'antibody-drug conjugate',
  'antibody-drug conjugates',
  'office of combination products',
  'primary mode of action',
  'constituent part',
  '21 cfr part 4',
  '21 cfr part 3',
  'request for designation',
  'rfd process',
  'drug-device combination',
  'drug/device',
  '药械组合产品',
  '药物器械组合',
  '生物制品组合',
  '药物洗脱支架',
  '透皮贴剂',
  '共包装',
  '联合包装',
  '交叉标记',
  '交叉标签',
];

/**
 * 已知导航/栏目/索引页模式（跨源共享）。
 * 从 fda.ts 提升并扩充，覆盖 FDA / EMA / NMPA 通用导航页。
 * 命中即跳过，避免整站栏目页被当成法规条目入库。
 */
export const JUNK_NAV_PATTERNS: RegExp[] = [
  // FDA OCP / Guidance 导航页
  /about combination products/i,
  /information about the office of combination products/i,
  /combination products policy council/i,
  /meetings,?\s*conferences/i,
  /jurisdictional information/i,
  /rfd process/i,
  /how to prepare a pre-request/i,
  /feedback on combination/i,
  /guidance & regulatory information/i,
  /combination products guidance documents/i,
  /current good manufacturing practice requirements/i,
  /postmarketing safety reporting/i,
  /classification of products as drugs and devices/i,
  /combination product (contacts|definition)/i,
  /frequently asked questions/i,
  /performance reports/i,
  /acts,?\s*rules and regulations/i,
  /guidance documents?$/i,
  /mailto:/i,
  // EMA / NMPA 通用导航页
  /index\.html?$/i,
  /\/home\/?$/i,
  /sitemap/i,
  /search results/i,
  /about nmpa/i,
  /leadership/i,
  /our responsibilities/i,
  /nmpa organizations/i,
  /affiliated institutions/i,
  /contact us/i,
  /popular science/i,
  /pharmacopoeia/i,
  /newsletter/i,
  /database$/i,
];

/**
 * NMPA 英文镜像栏目 URL（主路径）。
 * english.nmpa.gov.cn 对自动请求友好（无 WAF），文章链接 URL 路径含日期。
 */
export const DEFAULT_NMPA_ENGLISH_COLUMNS: string[] = [
  'https://english.nmpa.gov.cn/news.html',
  'https://english.nmpa.gov.cn/drugs.html',
  'https://english.nmpa.gov.cn/medicaldevices.html',
];

/**
 * Federal Register API 配置常量。
 * 无需认证，美国政府公开数据 API。
 */
export const FEDERAL_REGISTER_API = {
  baseUrl: 'https://www.federalregister.gov/api/v1/documents',
  agencySlug: 'food-and-drug-administration',
  keyword: 'combination product',
  perPage: 20,
  /**
   * 多关键词采集：每个关键词都单独向 Federal Register 发起翻页查询，且均限定
   * FDA agency（agencySlug）。覆盖 FDA 组合产品的多类术语（药械 / 生物制品-器械 /
   * 药-生物制品 / 预充注射 / 自动注射 / 注射笔 / 药物洗脱 / 透皮 / 共包装 / 交叉标签），
   * 所有查询词均能在 COMBINATION_KEYWORDS 中找到对应子串（或因文档同时含
   * "combination product" 等已命中项），因此通过 pipeline 的 isRealDocument 校验，
   * 不会误伤也不会漏掉真实文档。
   */
  keywords: [
    'combination product',
    'combination products',
    'drug-device',
    'drug/device',
    'biologic-device',
    'biologic/device',
    'prefilled syringe',
    'pre-filled syringe',
    'auto-injector',
    'pen injector',
    'drug-eluting',
    'transdermal',
    'co-packaged',
    'cross-labeled',
  ],
} as const;

/** Federal Register 翻页采集上限：单个关键词最多抓取的页数（明确上限，避免死循环） */
export const MAX_FR_PAGES = 5;
/** Federal Register 单关键词累计文档上限：达到即停止翻页（性能护栏） */
export const MAX_FR_DOCS = 100;

/** 近期窗口默认天数（只采集近 N 天发布条目） */
export const COLLECT_RECENT_DAYS_DEFAULT = 365;

/** 自 ping 保活默认间隔（5 分钟，毫秒） */
export const KEEPALIVE_INTERVAL_MS = 300000;
