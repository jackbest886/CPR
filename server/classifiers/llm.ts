/**
 * LLM 分类器（可选增强）：OpenAI 兼容调用，结构化输出
 * type / status / tags / summary。任何失败（无密钥 / 超时 / 解析错误）
 * 自动回退到规则分类器，保证整链在缺密钥时仍可跑通。
 *
 * 厂商适配：
 *  - provider 为 'openai'（或空/未设置）→ 复用既有 zodResponseFormat（json_schema）路径，
 *    行为与既有测试完全一致。
 *  - provider 为 glm / qwen / deepseek 等国内厂商 → 使用 response_format: json_object，
 *    并在拿到结果后剥离 ```json 代码围栏、手动 JSON.parse + zod 校验，
 *    以规避国内网关对 json_schema 结构化输出支持不稳定的问题。
 */
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { Classification, RawItem } from '../../shared/types';
import { REG_STATUSES, REG_TYPES } from '../../shared/constants';
import { RuleClassifier, type Classifier } from './index';

/** LLM 结构化输出 schema（zod 校验） */
const ClassificationSchema = z.object({
  type: z.enum(REG_TYPES as [string, ...string[]]),
  status: z.enum(REG_STATUSES as [string, ...string[]]).nullable(),
  tags: z.array(z.string()),
  summary: z.string(),
  title: z.string().nullable().optional(),
});

/** 系统提示词（OpenAI 路径；国内路径会追加 JSON 约束，见 classify） */
const SYSTEM_PROMPT =
  '你是法规情报分类助手。根据标题与正文，判断法规类型、状态，' +
  '给出中文语义标签（组合形态 + 维度），并生成一句话中文摘要。' +
  '若原文为英文（如 FDA / NMPA 英文镜像条目），必须将 title 字段返回为中文翻译版本；' +
  '若原文已是中文，title 字段可省略或返回原标题。' +
  '字段为：type / status / tags / summary / title。';

/** 分类器配置（由 createClassifier 传入） */
type ClassifierConfig = {
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  /** LLM 厂商：'openai' | 'glm' | 'qwen' | 'deepseek' | 其他/空 */
  provider?: string;
};

/** 视为「走 OpenAI 原生 json_schema 路径」的 provider 取值 */
const OPENAI_PROVIDERS = new Set(['openai', undefined, '']);

/**
 * LLM 增强分类器。
 */
export class LlmClassifier implements Classifier {
  private client: OpenAI;
  private model: string;
  private provider?: string;
  private rule = new RuleClassifier();

  constructor(cfg: ClassifierConfig) {
    this.client = new OpenAI({
      apiKey: cfg.llmApiKey,
      baseURL: cfg.llmBaseUrl || undefined,
    });
    this.model = cfg.llmModel || 'gpt-4o-mini';
    this.provider = cfg.provider;
  }

  async classify(item: RawItem): Promise<Classification> {
    try {
      // OpenAI（及兼容 json_schema 的网关）：沿用既有结构化输出路径，保证既有测试/行为不变
      if (OPENAI_PROVIDERS.has(this.provider)) {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `标题: ${item.title}\n正文: ${(item.content || '').slice(0, 2000)}`,
            },
          ],
          response_format: zodResponseFormat(ClassificationSchema, 'classification'),
        });
        const content = completion.choices[0]?.message?.content || '{}';
        const parsed = ClassificationSchema.parse(JSON.parse(content));
        return {
          type: parsed.type as Classification['type'],
          status: (parsed.status as Classification['status']) ?? undefined,
          tags: parsed.tags,
          summary: parsed.summary,
          title: parsed.title ?? undefined,
        };
      }

      // 国内厂商（glm / qwen / deepseek）：仅稳定支持 json_object 模式，需手动解析
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              SYSTEM_PROMPT +
              '\n仅输出一个 JSON 对象，不要包含任何解释文字或 Markdown 代码块，' +
              '字段为：type（字符串）、status（字符串或 null）、tags（字符串数组）、summary（字符串）。' +
              '必须包含 title 字段（若原文为英文，返回中文翻译；若原文已是中文，可省略或返回原标题）。',
          },
          {
            role: 'user',
            content: `标题: ${item.title}\n正文: ${(item.content || '').slice(0, 2000)}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      const raw = completion.choices[0]?.message?.content || '{}';
      // 剥离 ```json / ``` 围栏与周围空白，兼容模型额外包裹代码块的情况
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = ClassificationSchema.parse(JSON.parse(cleaned));
      return {
        type: parsed.type as Classification['type'],
        status: (parsed.status as Classification['status']) ?? undefined,
        tags: parsed.tags,
        summary: parsed.summary,
        title: parsed.title ?? undefined,
      };
    } catch (e) {
      console.warn('[llm] 分类失败，回退到规则分类器:', (e as Error).message);
      return this.rule.classify(item);
    }
  }
}
