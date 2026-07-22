/**
 * 种子脚本：向数据库写入若干「药械组合（Combination Products）」样例法规，
 * 便于本地预览看板（时间线 / 筛选 / 标签 / 摘要）效果。
 * 使用固定 id，重复执行幂等（INSERT OR IGNORE）。
 *
 * 运行：node_modules/.bin/tsx scripts/seed.ts
 */
import { randomUUID } from 'crypto';
import { config } from '../server/config';
import { createDb } from '../server/db/connection';
import { runMigrations } from '../server/db/migrations';
import { RegulationRepository } from '../server/db/repository';

type Reg = {
  id: string;
  title: string;
  source: 'NMPA' | 'FDA' | 'EMA';
  sourceSub: string;
  publishDate: string;
  effectiveDate?: string;
  type: string;
  status?: string;
  summary: string;
  tags: string[];
  originalLanguage: 'zh' | 'en';
  originalUrl: string;
  content?: string;
  watch?: boolean;
};

const samples: Reg[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    title: '《组合产品唯一器械标识（UDI）要求》指导原则草案',
    source: 'FDA', sourceSub: 'OCP', publishDate: '2025-06-26',
    type: '指导原则草案', status: '征求意见中',
    summary: 'FDA 于 2025 年 6 月发布组合产品唯一器械标识（UDI）要求指导原则草案，将阐明 UDI 要求如何适用于含器械组分的组合产品；意见征集截止 2025 年 9 月 24 日。',
    tags: ['UDI', '组合产品', '医疗器械标识'], originalLanguage: 'en',
    originalUrl: 'https://www.federalregister.gov/documents/2025/06/26/2025-11806/unique-device-identifier-requirements-for-combination-products-draft-guidance-for-industry-and-fda',
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    title: '《人因工程原则在组合产品中的应用：问答集》最终版',
    source: 'FDA', sourceSub: 'OCP / CBER / CDER / CDRH', publishDate: '2023-09-07',
    type: '指导原则', status: '已生效',
    summary: 'FDA 2023 年 9 月发布人因工程（HFE）原则应用于组合产品开发的最终版问答指南，澄清组合产品特有属性（最终成品、组合产品关键任务等）如何影响 HFE 流程与用药错误防范。',
    tags: ['人因工程', '可用性', '组合产品'], originalLanguage: 'en',
    originalUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/human-factors-studies-and-related-clinical-study-considerations-combination-product-design-and',
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    title: '《用于递送药品与生物制品的器械之关键药物递送输出（EDDO）》草案',
    source: 'FDA', sourceSub: 'OCP', publishDate: '2024-07-01',
    type: '指导原则草案', status: '征求意见中',
    summary: 'FDA 2024 年 6 月发布草案，明确独立器械与组合产品中确保药物递送性能的关键设计输出（EDDO），并以预充注射器、自动注射器等为例给出识别与验证方法。',
    tags: ['药物递送', '预充注射器', '自动注射器'], originalLanguage: 'en',
    originalUrl: 'https://www.federalregister.gov/documents/2024/07/01/2024-14409/essential-drug-delivery-outputs-for-devices-intended-to-deliver-drugs-and-biological-products-draft',
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    title: '《固定复方药品的临床开发》指导原则（修订版 2）',
    source: 'EMA', sourceSub: 'CHMP', publishDate: '2017-10-01',
    type: '科学指导原则', status: '已生效',
    summary: 'EMA/CHMP 关于固定复方药品临床开发的指导原则（2017 修订版），明确各活性成分疗效贡献的论证、随机对照试验设计及替代终点使用等要求。',
    tags: ['固定复方', '临床开发', 'CHMP'], originalLanguage: 'en',
    originalUrl: 'https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-clinical-development-fixed-combination-medicinal-products-revision-2_en.pdf',
  },
  {
    id: '11111111-1111-1111-1111-111111111105',
    title: '《与医疗器械联用的药品之质量文件》指导原则',
    source: 'EMA', sourceSub: 'CHMP / QWP / BWP', publishDate: '2022-01-01',
    type: '科学指导原则', status: '已生效',
    summary: 'EMA 自 2022 年起实施的指导原则，规定与医疗器械联用（一体式、共同包装、引用式）的药品在上市许可质量部分应提交的文件，覆盖预充注射器、注射笔、吸入剂等，并涉及 MDR 第 117 条与公告机构意见。',
    tags: ['药械组合', '质量文件', 'MDR'], originalLanguage: 'en',
    originalUrl: 'https://www.ema.europa.eu/en/quality-documentation-medicinal-products-when-used-medical-device-scientific-guideline',
  },
  {
    id: '11111111-1111-1111-1111-111111111106',
    title: '《固定复方药品的非临床开发》科学指导原则',
    source: 'EMA', sourceSub: 'CHMP / SWP', publishDate: '2008-08-01',
    type: '科学指导原则', status: '已生效',
    summary: 'EMA 关于固定复方药品非临床开发策略的指导原则，涵盖安全性药理与毒理研究的设计考虑，为组合产品研发提供非临床证据基础。',
    tags: ['固定复方', '非临床', '毒理'], originalLanguage: 'en',
    originalUrl: 'https://www.ema.europa.eu/en/non-clinical-development-fixed-combinations-medicinal-products-scientific-guideline',
  },
  {
    id: '11111111-1111-1111-1111-111111111107',
    title: '国家药监局关于药械组合产品注册有关事宜的通告（2021年第52号）',
    source: 'NMPA', sourceSub: '国家药监局', publishDate: '2021-07-27',
    type: '通告', status: '已生效', watch: true,
    summary: '国家药监局 2021 年发布通告，明确药械组合产品按药品或医疗器械属性申报注册，并建立药审中心与器审中心的联合审评协调机制；属性不明时向标管中心申请属性界定。',
    tags: ['注册管理', '属性界定', '联合审评'], originalLanguage: 'en',
    originalUrl: 'https://english.nmpa.gov.cn/2021-07/27/c_660305.htm',
  },
  {
    id: '11111111-1111-1111-1111-111111111108',
    title: '以医疗器械作用为主的药械组合产品注册审查指导原则',
    source: 'NMPA', sourceSub: '医疗器械技术审评中心（CMDE）', publishDate: '2022-01-17',
    type: '注册审查指导原则', status: '已生效',
    summary: '国家药监局 2022 年发布，适用于以医疗器械作用为主的药械组合产品注册申报与技术审评，从产品描述、药械相互作用、药物含量/剂量、理化与生物学特性、动物试验等 11 个方面提出特殊要求。',
    tags: ['注册审查', '器械主导', 'CMDE'], originalLanguage: 'zh',
    originalUrl: 'https://www.nmpa.gov.cn/directory/web/nmpa/images/1642402564387077651.docx',
  },
  {
    id: '11111111-1111-1111-1111-111111111109',
    title: '以医疗器械作用为主的药械组合产品中药物定性、定量及体外释放研究注册审查指导原则',
    source: 'NMPA', sourceSub: '医疗器械技术审评中心（CMDE）', publishDate: '2022-01-17',
    type: '注册审查指导原则', status: '已生效',
    summary: '国家药监局 2022 年发布，针对含药涂层支架、带药球囊、含银敷料等药械组合医疗器械，规范药物定性、定量及体外释放研究方法学与验证要求，并给出含量与回收率、精密度可接受限度。',
    tags: ['药物释放', '定性定量', '含药器械'], originalLanguage: 'zh',
    originalUrl: 'https://www.nmpa.gov.cn/directory/web/nmpa/images/1642402579068015972.doc',
  },
];

async function main(): Promise<void> {
  const db = await createDb(config);
  runMigrations(db);
  const repo = new RegulationRepository(db);

  let count = 0;
  for (const s of samples) {
    const exists = await repo.getById(s.id);
    if (exists) {
      // 已存在同 id 行时，全字段同步（保留 fetched_at 不变）。
      // 过去只 UPDATE original_url，导致重跑 seed 时标题/摘要/URL 不更新；现已修正。
      await db.run(
        `UPDATE regulations SET
           title = ?, source = ?, source_sub = ?, publish_date = ?, effective_date = ?,
           type = ?, status = ?, summary = ?, tags = ?, original_language = ?,
           original_url = ?, content = ?, watch = ?, status_history = ?
         WHERE id = ?`,
        [
          s.title, s.source, s.sourceSub ?? null, s.publishDate ?? null, s.effectiveDate ?? null,
          s.type, s.status ?? null, s.summary, JSON.stringify(s.tags ?? []), s.originalLanguage,
          s.originalUrl, s.content ?? null, s.watch ? 1 : 0, '[]', s.id,
        ],
      );
      continue;
    }
    await repo.save({
      ...s,
      id: s.id,
      effectiveDate: s.effectiveDate,
      fetchedAt: new Date().toISOString(),
      isDuplicateOf: undefined,
      statusHistory: [],
    } as any);
    count++;
  }

  await db.close();
  console.log(`种子完成：新增 ${count} 条，共 ${samples.length} 条样例法规。`);
}

main().catch((e) => {
  console.error('种子失败:', e);
  process.exit(1);
});
