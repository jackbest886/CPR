/**
 * 分类器：接口 + 规则分类器（默认主路径）+ 工厂。
 *
 * 规则分类器不依赖任何外部密钥即可工作：基于关键词/正则映射
 * 类型 / 状态 / 语义标签，并产出抽取式摘要（正文前 N 字）。
 * 有 LLM_API_KEY 时由 createClassifier 切换到 LlmClassifier（见 llm.ts）。
 */
import type {
  Classification,
  RawItem,
  RegStatus,
  RegType,
} from '../../shared/types';
import { SUMMARY_EXTRACT_CHARS } from '../../shared/constants';
import { LlmClassifier } from './llm';

/** 分类器统一接口 */
export interface Classifier {
  classify(item: RawItem): Promise<Classification>;
}

/** 类型判定关键词（优先级从高到低） */
function detectType(text: string): RegType {
  const t = text.toLowerCase();
  if (/征求|draft for comment|consultation|open for comment|for comment/.test(t))
    return '征求意见';
  if (/批准|approval|approved|marketing authorization|authorisation/.test(t))
    return '批准';
  if (/指南|guidance|guide|guideline/.test(t)) return '指南';
  if (/法规|regulation|regulatory|directive|指令/.test(t)) return '法规';
  return '其他';
}

/** 状态判定关键词 */
function detectStatus(text: string): RegStatus | undefined {
  const t = text.toLowerCase();
  if (/征求|draft for comment|consultation|open for comment/.test(t))
    return '征求意见中';
  if (/废止|withdraw|revoked|cancelled|terminated/.test(t)) return '已废止';
  if (/更新|update|revised|amended|revision/.test(t)) return '已更新';
  if (/生效|in force|effective|enforced|implemented/.test(t)) return '已生效';
  return undefined;
}

/** 组合形态标签关键词映射 */
const FORM_MAP: { tag: string; keys: string[] }[] = [
  { tag: '预充式注射器', keys: ['预充式注射器', '预灌封注射器', 'prefilled syringe', 'pre-filled syringe', 'prefill'] },
  { tag: '自动注射笔', keys: ['自动注射笔', '注射笔', 'auto-injector', 'autoinjector', 'pen injector'] },
  { tag: '药物涂层器械', keys: ['药物涂层', '药物洗脱', 'drug-coated', 'drug coated', 'drug-eluting', 'drug eluting'] },
  { tag: '生物材料组合', keys: ['生物材料', 'biomaterial', 'tissue engineering'] },
  { tag: '伤口闭合组合', keys: ['伤口闭合', '含药敷贴', 'wound closure', 'medicated dressing'] },
  { tag: '吸入组合产品', keys: ['吸入', 'inhaled', 'inhalation'] },
  { tag: '植入式给药系统', keys: ['植入', 'implantable', 'implant'] },
  { tag: '透皮给药组合', keys: ['透皮', 'transdermal', 'patch'] },
];

/** 维度标签关键词映射（监管路径 / 治疗领域 / 信号类型） */
const DIM_MAP: { tag: string; keys: string[] }[] = [
  { tag: '器械主导', keys: ['device-led', '器械主导', 'device primary'] },
  { tag: '药物主导', keys: ['drug-led', '药物主导', 'drug primary'] },
  { tag: '交叉标记', keys: ['cross-labeled', '交叉标记'] },
  { tag: '肿瘤', keys: ['肿瘤', 'oncology', 'cancer', 'tumor'] },
  { tag: '糖尿病', keys: ['糖尿病', 'diabetes'] },
  { tag: '心血管', keys: ['心血管', 'cardiovascular'] },
  { tag: '自免', keys: ['自免', 'autoimmune'] },
  { tag: '抗感染', keys: ['抗感染', 'anti-infective', 'infection'] },
  { tag: '机会信号', keys: ['机会', 'opportunity'] },
  { tag: '风险信号', keys: ['风险', 'risk'] },
  { tag: '中性动态', keys: ['中性', 'neutral'] },
];

/** 组合产品强信号词（用于回退到其他组合产品） */
const COMBO_SIGNAL = ['药械组合', '组合产品', 'combination product', 'combination products'];

/** 检测语义标签（形态 + 维度） */
function detectTags(text: string): string[] {
  const t = text.toLowerCase();
  const tags: string[] = [];

  for (const { tag, keys } of FORM_MAP) {
    if (keys.some((k) => t.includes(k.toLowerCase()))) tags.push(tag);
  }
  for (const { tag, keys } of DIM_MAP) {
    if (keys.some((k) => t.includes(k.toLowerCase()))) tags.push(tag);
  }

  // 命中组合信号但无具体形态 → 归为"其他组合产品"
  if (tags.length === 0 && COMBO_SIGNAL.some((k) => t.includes(k.toLowerCase()))) {
    tags.push('其他组合产品');
  }

  return Array.from(new Set(tags));
}

/** 抽取式摘要：取正文前 N 字，去除多余空白 */
export function extractSummary(content: string, title: string): string {
  const plain = (content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length === 0) return title.slice(0, SUMMARY_EXTRACT_CHARS);
  return plain.slice(0, SUMMARY_EXTRACT_CHARS);
}

/**
 * 规则分类器（默认）：无密钥可完整跑通。
 */
export class RuleClassifier implements Classifier {
  async classify(item: RawItem): Promise<Classification> {
    const text = `${item.title}\n${item.content ?? ''}`;
    const type = detectType(text);
    const status = detectStatus(text);
    const tags = detectTags(text);

    // 抽取式摘要直接使用原文内容与标题，不翻译标题、不因语言改写摘要
    const summary = extractSummary(item.content ?? '', item.title);

    return { type, status, tags, summary };
  }
}

/**
 * 分类器工厂：有 LLM_API_KEY 走 LLM 增强，否则规则分类器。
 */
export function createClassifier(cfg: {
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  llmProvider?: string;
}): Classifier {
  if (cfg.llmApiKey && cfg.llmApiKey.trim().length > 0) {
    return new LlmClassifier({
      llmApiKey: cfg.llmApiKey,
      llmModel: cfg.llmModel,
      llmBaseUrl: cfg.llmBaseUrl,
      provider: cfg.llmProvider,
    });
  }
  return new RuleClassifier();
}
