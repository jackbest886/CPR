/**
 * EMA 采集器：EMA 公开 RSS（News / CHMP 意见）+ medicines API（结构化）。
 * 解析方法（parseRss/parseApi）可被测试以本地 fixtures 注入。
 */
import Parser from 'rss-parser';
import type { AppConfig } from '../config';
import type { RawItem } from '../../shared/types';
import { DEFAULT_EMA_RSS, type SourceFeed } from '../../shared/constants';
import { Collector, fetchText, normalizeDate } from './base';

export class EmaCollector implements Collector {
  source = 'EMA' as const;
  private feeds: SourceFeed[];
  private parser: Parser;

  constructor(_cfg: AppConfig) {
    this.feeds = DEFAULT_EMA_RSS;
    this.parser = new Parser();
  }

  async collect(): Promise<RawItem[]> {
    const out: RawItem[] = [];
    for (const feed of this.feeds) {
      try {
        const raw = await fetchText(feed.url);
        if (feed.kind === 'rss') {
          out.push(...(await this.parseRss(raw, feed.sourceSub)));
        }
      } catch (e) {
        console.error(`[ema] 采集失败 ${feed.url}:`, (e as Error).message);
      }
    }
    return out;
  }

  /** 解析 EMA RSS（fixtures 可注入） */
  async parseRss(xml: string, sourceSub: string): Promise<RawItem[]> {
    const feed = await this.parser.parseString(xml);
    const out: RawItem[] = [];
    for (const it of feed.items ?? []) {
      const publishDate = normalizeDate(it.isoDate ?? it.pubDate);
      if (!publishDate) {
        // 双重保险：管线层也会校验，采集器层先丢弃并告警
        console.warn(`[ema] 跳过无发布日期的条目: ${it.title ?? '(无标题)'}`);
        continue;
      }
      out.push({
        source: 'EMA' as const,
        sourceSub,
        title: it.title ?? '',
        url: it.link ?? '',
        publishDate,
        content: it.contentSnippet ?? it.content ?? '',
        language: 'en' as const,
      });
    }
    return out;
  }

  /** 解析 EMA medicines API 返回的 JSON（结构化条目） */
  parseApi(json: unknown, sourceSub = 'API'): RawItem[] {
    const arr = Array.isArray(json) ? json : ((json as any)?.medicines ?? []);
    return arr.map((m: any) => ({
      source: 'EMA' as const,
      sourceSub,
      title: String(m.title ?? m.name ?? ''),
      url: String(m.url ?? m.link ?? ''),
      publishDate: normalizeDate(m.date ?? m.publishDate),
      content: String(m.summary ?? m.description ?? ''),
      language: 'en' as const,
    }));
  }
}
