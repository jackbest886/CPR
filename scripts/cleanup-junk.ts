/**
 * 一次性清理脚本：清除采集器误抓的 FDA 导航/分类栏目页。
 *
 * ── 污染根因 ──
 * server/collectors/fda.ts 的 parseOcp() 会抓取 FDA 组合产品落地页
 * （https://www.fda.gov/combination-products，一个导航/分类页），
 * 并用 cheerio 把页面上所有命中关键词（combination|guidance）的 <a> 链接
 * 当成法规条目入库。这些链接本质是「栏目页 / 索引页」（如
 * "FDA Guidance Documents"、"Jurisdictional Information"、"RFD Process"、
 * "Combination Products Meetings, Conferences, & Workshops" 等），
 * 并非真实法规；且 parseOcp 不会为它们附上 publishDate，
 * 因此落库后 publish_date 全为 NULL。
 *
 * ── 区分谓词 ──
 * 所有垃圾条目 publish_date 均为 NULL；
 * 所有精选条目（含脚本种子 9 条）publish_date 均非 NULL。
 * 因此 `DELETE FROM regulations WHERE publish_date IS NULL`
 * 可精确清除这 11 条垃圾，同时完整保留 9 条精选。
 *
 * ── 安全性 ──
 * - 默认 DRY_RUN（预览）：仅打印待清除条目，不做任何修改。
 * - 设置 DRY_RUN=0 才真正执行 DELETE。
 * - 删除后再次校验：剩余条目 publish_date 必须全部非 NULL，否则以非零码退出。
 * - 可重跑：已清空时 DELETE 为空操作，幂等安全。
 *
 * 运行：
 *   npm run cleanup:junk           # 预览（默认 dry-run）
 *   DRY_RUN=0 npm run cleanup:junk # 真正执行删除
 */
import { config } from '../server/config';
import { createDb } from '../server/db/connection';

interface JunkRow {
  id: string;
  title: string;
  source: string;
  url: string;
}

interface RemainRow {
  id: string;
  title: string;
  source: string;
  publish_date: string;
}

/** 已知「垃圾栏目页」标题关键词（仅用于预览时辅助标注，不影响删除谓词） */
const JUNK_HINTS = [
  'guidance documents',
  'combination products',
  'meetings, conferences',
  'feedback on combination',
  'guidance & regulatory',
  'jurisdictional information',
  'rfd process',
  'current good manufacturing',
  'classification of products',
];

function isLikelyJunk(title: string): boolean {
  const t = title.toLowerCase();
  return JUNK_HINTS.some((h) => t.includes(h));
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN !== '0'; // 默认预览
  const db = await createDb(config);

  try {
    // 1) 预览：统计并列出 publish_date 为 NULL 的条目
    const countRow = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM regulations WHERE publish_date IS NULL',
    );
    const junkCount = countRow?.c ?? 0;

    const junkRows = await db.all<JunkRow>(
      `SELECT id, title, source, original_url AS url
       FROM regulations WHERE publish_date IS NULL ORDER BY source, id`,
    );

    console.log(
      `\n[cleanup] publish_date IS NULL 的条目数：${junkCount}`,
    );
    console.log('[cleanup] 这些条目（待清除）：');
    for (const r of junkRows) {
      const flag = isLikelyJunk(r.title) ? ' [栏目页]' : '';
      console.log(`  - [${r.source}]${flag} ${r.title}\n      ${r.url}`);
    }

    if (junkCount === 0) {
      console.log('[cleanup] 没有需要清除的条目，数据库已干净。');
      await db.close();
      return;
    }

    if (dryRun) {
      console.log(
        '\n[cleanup] DRY_RUN 模式：未做任何删除。设置 DRY_RUN=0 以真正执行。',
      );
      await db.close();
      return;
    }

    // 2) 执行删除（仅在非 dry-run 时）
    await db.run('DELETE FROM regulations WHERE publish_date IS NULL');

    // 3) 校验剩余条目
    const remainingRow = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM regulations',
    );
    const remainingNullRow = await db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM regulations WHERE publish_date IS NULL',
    );
    const remainingNull = remainingNullRow?.c ?? 0;
    const remainingCount = remainingRow?.c ?? 0;

    const remainRows = await db.all<RemainRow>(
      `SELECT id, title, source, publish_date
       FROM regulations ORDER BY publish_date DESC, source, id`,
    );

    console.log(`\n[cleanup] 删除完成。剩余条目数：${remainingCount}`);
    console.log(
      `[cleanup] 剩余条目中 publish_date 仍为 NULL 的数量：${remainingNull}`,
    );
    console.log('[cleanup] 剩余条目（按日期倒序）：');
    for (const r of remainRows) {
      console.log(`  - [${r.source}] ${r.publish_date} ${r.title}`);
    }

    if (remainingNull > 0) {
      console.error(
        '[cleanup] 校验失败：仍残留 NULL publish_date 条目，中止。',
      );
      await db.close();
      process.exit(1);
    }

    console.log(
      '\n[cleanup] 清理成功：所有垃圾栏目页已清除，精选条目均保留。',
    );
    await db.close();
  } catch (e) {
    await db.close().catch(() => undefined);
    throw e;
  }
}

main().catch((e) => {
  console.error('[cleanup] 失败:', e);
  process.exit(1);
});
