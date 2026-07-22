# 法规情报追踪系统 · 增量 PRD（最新采集 + qwen 分类 + 稳定常驻）

> 本轮增量需求 PRD，仅描述本轮变更部分，不重写整体 PRD。
> 产出：许清楚（产品经理）｜格式：简单增量 PRD（不含竞品分析）｜语言：中文
> 基线：参见 `PRD_reggov_tracker.md`（整体产品定义）与 `overview.md`（前端重设计记录）

---

## 0. 背景与现状摘要（事实基础）

- 数据库现有 **9 条精选中文法规**（FDA 3 / EMA 3 / NMPA 3，2021–2025 真实法规），本轮**必须保留**、不被覆盖或重复。
- 采集调度 cron=`0 8 * * *` Asia/Shanghai 已就绪，但开关 `COLLECTION_ENABLED` 默认 `false`（污染事件修复后默认关闭）。
- **已发生的污染事件（已修复）**：FDA 采集器 `parseOcp()` 从 OCP 落地/导航页用 cheerio 抓所有命中关键词的 `<a>` 链接当法规，导致 21 条英文栏目页（publish_date 全 NULL）入库。已清理 21 条、加固采集器（要求 publishDate + 导航页黑名单过滤）、`COLLECTION_ENABLED` 默认关。
- **qwen-plus 分类能力已基本就位**：`server/classifiers/llm.ts` 已支持 qwen provider（json_object 模式 + 手动解析），`createClassifier` 在无 Key 时回退规则分类器，`config.ts` 已含 qwen 默认值。本轮主要是**验证 + 补强**，而非从零实现。
- **去重能力已就位**：`server/deduplicator.ts` 已实现 URL 归一化 + 标题相似度(≥0.85) + 正文 sha256 三级去重，pipeline 跳过 exact 重复。

---

## 1. 产品目标（本轮）

1. **可靠采集最新法规**：替换有问题的 FDA 导航页抓取，改用带真实发布日期的正式数据源，每日定时拉取近期新增，杜绝无日期栏目页/导航页垃圾再次入库。
2. **qwen-plus 中文分类落地**：新采集英文条目经 qwen-plus 完成类型/状态判定 + 中文翻译概括，Key 可选（无 Key 回退规则分类器，不报错停摆）。
3. **服务稳定常驻**：本地 pm2 进程守护 + 云端 Cloud Studio 全栈 always-on 部署，用户不再遇到"打不开/服务挂了"。

---

## 2. 用户故事

- **US1**：作为商业决策者，我希望每天打开看板就能看到**真实、带发布日期的最新药械组合法规**，而不是栏目页或导航链接垃圾，以便信任看板数据的可靠性。
- **US2**：作为非技术用户，我希望新采集的英文法规有**中文标题和摘要**，以便不必精读英文原文即可判断相关性。
- **US3**：作为长期使用者，我希望服务**7×24 稳定在线、崩溃自动重启**，以便随时访问、不再遇到"打不开"。
- **US4**：作为系统运营者，我希望**不填 LLM Key 系统也能正常跑**（走规则分类器），填上 Key 即自动切换 qwen-plus 增强，以便我从容申请 Key 而不阻塞部署。
- **US5**：作为关注数据质量的人，我希望同一条法规**不重复入库**、9 条精选**不被覆盖**，以便看板保持干净、历史数据完整。

---

## 3. 需求池（P0 / P1 / P2）

### P0（Must have · 本轮必须交付）

#### P0-1 可靠最新法规采集（数据源替换 + 校验 + 去重 + 防垃圾）

**目标**：用正式、带真实发布日期的数据源替换有问题的 FDA 导航页抓取；每日只拉近期新增；杜绝无日期/导航页垃圾。

| 子需求 | 说明 | 验收标准 |
|---|---|---|
| P0-1.1 FDA 数据源替换 | 移除/降级 `parseOcp()` 的 OCP 落地页 cheerio 抓取；改用**带真实发布日期**的正式源：FDA Guidance Documents RSS（CDER/CDRH/CBER 已有）为主，辅以 FDA Federal Register API（按 agency + keyword 检索，返回结构化 `publication_date`）。 | 采集的 FDA 条目 100% 带有效 `publishDate`（YYYY-MM-DD）；不再出现 "About Combination Products" / "RFD Process" 等栏目页。 |
| P0-1.2 EMA 正式 feed | 保留现有 EMA RSS（News + CHMP medicines），确认条目均带 `isoDate`/`pubDate`；对无日期条目丢弃并记日志。 | EMA 采集条目 100% 带有效 `publishDate`。 |
| P0-1.3 NMPA 镜像降级 | NMPA 中文站有 WAF 拦截自动请求；主路径改用 `english.nmpa.gov.cn` 同源英文镜像（可访问），作为 NMPA 采集的可靠兜底；中文栏目 URL 作为可配置备选（`NMPA_COLUMNS`）。 | NMPA 采集不因 WAF 拦截而整批失败；镜像采集的条目带标题+URL，经 LLM/规则翻译为中文呈现。 |
| P0-1.4 publishDate 强校验 | 采集管线对每条 RawItem 强制校验：`publishDate` 必须存在且为有效日期，否则丢弃并记 warn 日志（已有雏形于 `fda.ts`，需统一到管线层）。 | 任何 `publishDate` 为空/无效的条目不入库；日志可追溯被丢弃的条目标题。 |
| P0-1.5 近期窗口过滤 | 每日采集只取**近期新增**（默认近 90 天，可通过 `COLLECT_RECENT_DAYS` 环境变量配置），按发布日期倒序，避免历史回灌。 | 采集后入库的条目 `publishDate` 均在窗口内；超出窗口的历史条目不入库（除非手动触发回溯）。 |
| P0-1.6 导航/栏目页黑名单 | 保留并扩充 `fda.ts` 的 `JUNK_NAV_PATTERNS`；将黑名单提升到共享层（`shared/constants.ts`），供所有采集器复用。 | 命中黑名单模式的条目在采集阶段即被丢弃，不进入分类/去重/入库流程。 |
| P0-1.7 去重保留精选 | 复用现有三级去重（URL 归一 + 标题相似 + 内容哈希）；确认 9 条精选的 `originalUrl` 不被新采集覆盖（去重 exact 命中即跳过）。 | 重复运行采集不产生 9 条精选的副本；新增条目与精选不重复。 |
| P0-1.8 真实法规文档校验 | 采集条目的 URL 必须指向真实法规/指南文档页（而非索引/导航），可通过 URL 路径模式 + 内容长度 + 关键词二次确认。 | 入库条目的 `originalUrl` 经抽查 100% 指向可访问的法规/指南正文页。 |

**采集架构变更示意（FDA 部分）：**
```
旧：OCP 落地页 → cheerio 抓所有 <a> → 关键词命中 → 入库（❌ 无日期、栏目页污染）
新：FDA Guidance RSS（主）+ Federal Register API（辅）
    → 解析结构化条目（含 publication_date）
    → publishDate 强校验 + 近期窗口过滤 + 导航页黑名单
    → 关键词初筛（药械组合相关）
    → 分类 → 去重 → 入库 ✅
```

---

#### P0-2 qwen-plus 中文分类（Key 可选 + 兜底）

**现状**：`server/classifiers/llm.ts` 已支持 qwen provider（json_object 模式），`createClassifier` 无 Key 时回退规则分类器。本轮主要是**验证 + 补强**。

| 子需求 | 说明 | 验收标准 |
|---|---|---|
| P0-2.1 qwen-plus 分类验证 | 确认 `.env` 配置 `LLM_PROVIDER=qwen` + `LLM_API_KEY=<百炼Key>` 后，新采集英文条目经 qwen-plus 完成：类型分类（指南/法规/征求意见/批准/其他）+ 状态判定（已生效/征求意见中/未标注）+ 中文标题与摘要翻译。 | 配 Key 后，英文条目的 `summary` 为中文；`type`/`status` 字段非空且合理；无 Key 时回退规则分类器、`summary` 为抽取式摘要，系统不报错。 |
| P0-2.2 Key 可选不阻塞 | 无 `LLM_API_KEY` 时走规则分类器（已有），系统完整可运行；填 Key 即生效，无需重启代码、仅重启进程即可。 | 删除 `.env` 中的 Key → 重启 → 系统正常启动、采集正常入库（规则分类）；恢复 Key → 重启 → 切换 LLM 分类。 |
| P0-2.3 分类失败兜底 | LLM 调用超时/失败/解析错误时，单条回退规则分类器，不拖垮整批采集（已有 try-catch + 回退）。 | 模拟 LLM 超时（断网或错误 Key），整批采集仍完成、受影响条目走规则分类、日志记录回退事件。 |
| P0-2.4 分类质量基线 | qwen-plus 对英文法规标题+摘要的中文翻译准确、类型/状态判定合理（抽样人工核对）。 | 抽样 10 条新采集条目，中文摘要语义正确、类型/状态判定与人工判断一致率 ≥ 80%。 |

---

#### P0-3 服务稳定性（pm2 + Cloud Studio）

| 子需求 | 说明 | 验收标准 |
|---|---|---|
| P0-3.1 pm2 进程守护（本地） | 提供 `ecosystem.config.cjs`（pm2 配置），`npm start` 包装为 pm2 进程，崩溃自动重启（`max_restarts`/`restart_delay` 合理配置）。 | `pm2 start ecosystem.config.cjs` 启动后进程常驻；`kill -9` 模拟崩溃后 pm2 自动重启；`pm2 logs` 可查看采集日志。 |
| P0-3.2 Cloud Studio 全栈常驻 | 更新 `docs/DEPLOY.md` 为完整稳定方案：Cloud Studio 工作区 + `npm run build` + pm2 常驻 + 端口预览公网访问；含 `.env` 配置（含 COLLECTION_ENABLED=true 开启自动采集）。 | 按 DEPLOY.md 操作，Cloud Studio 工作区服务 7×24 在线、公网 URL 可访问、断开终端后服务不挂。 |
| P0-3.3 采集开关可安全开启 | 确认 `COLLECTION_ENABLED=true` 后定时采集稳定触发，且因 P0-1 的校验加固，不会再次污染数据库。 | 开启自动采集运行 3 天，数据库不出现无日期/栏目页垃圾条目；9 条精选完好。 |
| P0-3.4 健康检查可观测 | 复用 `GET /api/health`（存活+DB连通）与 `GET /api/collect/status`（采集健康）；pm2 + Cloud Studio 可据此做存活监控。 | `/api/health` 返回 200 + db=sqlite；`/api/collect/status` 返回最近一次采集 RunReport。 |

---

### P1（Should have · 本轮尽量做）

| 编号 | 需求 | 说明 | 验收标准 |
|---|---|---|---|
| P1-1 | 采集频率可配 | `COLLECT_CRON` 已可配；补充文档说明高频场景（如 `0 */6 * * *` 每 6 小时）的取舍。 | 修改 `COLLECT_CRON` 重启后按新频率触发。 |
| P1-2 | 采集日志与失败告警 | 采集失败（某源连续失败 N 次）在 `/api/collect/status` 体现 `failed`/`partial` 状态；日志写入 `server.log` 或 pm2 logs。 | 某源采集失败时，`/api/collect/status` 返回 error 字段；日志含失败原因。 |
| P1-3 | 新条目数角标 | 看板顶部"近30天 N"统计已有；增强为自上次访问以来的新增计数提示（前端 localStorage 记录上次访问时间）。 | 用户再次打开看板时，看到"新增 X 条"提示。 |
| P1-4 | NMPA 镜像降级策略 | NMPA 中文栏目采集失败时自动降级到 `english.nmpa.gov.cn` 镜像；日志记录降级事件。 | 中文栏目被 WAF 拦截后，自动尝试镜像源并成功采集，不整批失败。 |
| P1-5 | 近期窗口可配 | `COLLECT_RECENT_DAYS` 环境变量（默认 90），控制只采集近期条目。 | 修改该值后，采集窗口相应变化。 |

### P2（Nice to have · 后续迭代）

| 编号 | 需求 | 说明 |
|---|---|---|
| P2-1 | 邮件/企微/飞书增量推送 | 每日采集完成后推送新增条目摘要（需用户确认渠道与频率）。 |
| P2-2 | 采集失败自动重试 | 单源采集失败后按退避策略重试 2-3 次。 |
| P2-3 | 历史回溯补抓 | 支持手动触发指定时间范围的回溯采集（突破近期窗口）。 |
| P2-4 | 数据备份 | SQLite 定期备份（pm2 cron 或脚本），防止工作区磁盘数据丢失。 |

---

## 4. 待确认问题（Open Questions）

> 以下问题需主理人/用户拍板，直接影响 P0/P1 实现细节：

1. **采集频率**：每日一次（08:00 Asia/Shanghai）是否足够？FDA/EMA 更新频率较高，是否需要对关键源提高频次（如每 6 小时）？
2. **"近期"窗口定义**：默认近 90 天是否合适？太短会漏掉低频更新源的新条目，太长会增加历史回灌风险。建议 90 天，可调。
3. **推送需求**：是否需要邮件/企微/飞书推送每日新增条目？还是仅看板即可（影响 P2-1 是否提前到 P1）？
4. **NMPA 镜像兜底接受度**：NMPA 中文站有 WAF，是否接受以 `english.nmpa.gov.cn` 英文镜像为主采集源（再经 qwen-plus 翻译为中文）？还是必须想办法绕过 WAF 采中文原站？
5. **Federal Register API 注册**：FDA Federal Register API（`www.federalregister.gov/api/v1/documents`）无需 Key 即可按 agency+keyword 检索，是否确认采用？还是仅用现有 FDA RSS 即可？
6. **Cloud Studio 免费额度限制**：Cloud Studio 免费工作区是否有休眠/时长限制？是否需要额外的保活机制（如外部定时 ping `/api/health`）？
7. **LLM Key 申请进度**：用户去阿里云百炼申请 qwen-plus Key 的进度？是否需要先以规则分类器上线、Key 到位后再切换？

---

## 5. 非目标（Out of Scope · 本轮明确不做）

- **不做用户登录/鉴权**：`AUTH_ENABLED` 保持 false，单人/内网使用。
- **不做全文检索**：看板搜索仅限标题/摘要，不建全文索引。
- **不改前端视觉**：保留已对标 Stripe/Linear/Vercel 的方向 A 重设计，不动 theme/RegCard/FilterPanel 视觉。
- **不做竞品分析**：用户未要求。
- **不做历史数据大规模回溯**：本轮只采近期新增，不回灌历史（P2-3 后续）。
- **不动 9 条精选数据**：seed 脚本不重跑、不覆盖、不删除现有精选。
- **不切换数据库**：继续用 SQLite，不迁移到 Postgres。
- **不改共享类型/Schema**：`shared/types.ts` 的 Regulation 字段不变，本轮为采集器/分类器/部署层的增量改造。

---

## 6. 技术约束与风险

| 约束/风险 | 说明 | 缓解措施 |
|---|---|---|
| NMPA WAF 拦截 | NMPA 中文站对自动请求返回 403/拦截页 | 采用 `english.nmpa.gov.cn` 镜像兜底；中文栏目作为可配置备选 |
| Federal Register API 稳定性 | API 偶有限流/变更 | 失败回退到 FDA RSS；单源失败不拖垮整批 |
| qwen-plus 免费额度 | 个人每月 100 万 token 免费额度 | 控制单次分类输入长度（正文截断 2000 字符已有）；超额度时回退规则分类器 |
| Cloud Studio 工作区休眠 | 免费版可能空闲休眠 | pm2 保活 + 外部定时 ping（P1 考虑） |
| 采集源 HTML 结构变更 | cheerio 依赖页面结构，改版即失效 | 优先用 RSS/API（结构化）；HTML 抓取仅作兜底，有解析失败兜底日志 |

---

## 7. 验收里程碑

1. **M1 · 采集加固完成**：FDA 数据源替换 + publishDate 校验 + 近期窗口 + 导航页黑名单上线；手动触发采集，入库条目 100% 带有效日期、无栏目页垃圾、9 条精选完好。
2. **M2 · qwen 分类验证**：配 Key 后新采集条目有中文摘要/类型/状态；无 Key 回退规则分类器；分类失败不拖垮采集。
3. **M3 · 稳定部署上线**：pm2 本地守护 + Cloud Studio 全栈常驻；`COLLECTION_ENABLED=true` 开启自动采集；服务 7×24 在线、公网可访问。
4. **M4 · 稳定运行验证**：自动采集连续运行 3 天，数据库无污染、无重复、9 条精选完好、新条目持续增长。
