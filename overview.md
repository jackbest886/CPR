# 法规情报追踪 · 方向 A「专业情报看板」

> 药械组合（Combination Products）法规自动采集与看板。本文件记录最新一轮前端整体重做（方向 A）与死链修复。

## 本轮目标
1. **修死链（已彻底解决）**：原样例标题与「查看原文」指向的泛化/编造页不匹配。本轮将 9 条样例整体替换为**真实官方法规**（FDA OCP 的 UDI/EDDO/HFE、EMA CHMP 固定复方临床/非临床/质量文件、NMPA 2021 第52号通告与两份 CMDE 注册审查指导原则），每个 `originalUrl` 均经实测可访问（200/206），标题与原文严格对应；空 `originalUrl` 仍保留禁用 + Tooltip 保护。
2. **设计重做（方向 A）**：用户反馈旧版（监管情报终端）信息层级/密度/配色/布局四项均不理想，确认改用「专业情报看板」——干净、扁平、秩序感。

## 设计语言（方向 A）
- **扁平无阴影、无渐变**：靠发丝边框 `#e6e8ec` 与留白建立层次，不再依赖 elevation/发光。
- **来源色脊线**：RegCard 左侧 4px 来源色脊线（NMPA `#A32D2D` / FDA `#185FA5` / EMA `#3B6D11`），一眼区分机构。
- **状态着色**：征求意见中 `#BA7517`、已生效 `#2E7D32`、已更新 `#6B3FA0`、已废止 `#8A8F98`。
- **两档字重**：仅 400 / 500；标题 15/500、正文 13/400、辅助 12/tertiary，对比清晰。
- **圆角**：卡片 12 / 控件 8；IBM Plex Sans（正文）+ Mono（日期/编号）。

## 改动清单（纯呈现层，未动 `api.ts` / 后端 / 共享类型）
| 文件 | 变化 |
|---|---|
| `client/src/theme.ts` | 重写为方向 A 令牌：BRAND、SOURCE/STATUS 色、扁平无阴影 theme、字重 400/500 |
| `client/src/components/TopBar.tsx` | 去 CP 方块标与统计块；左侧标题 `法规情报追踪` + 副标 `药械组合 · Combination products`；右侧发丝搜索框 + 墨黑「立即采集」按钮 |
| `client/src/App.tsx` | 根背景 `default`；TopBar 下方细行 `近30天 N · 累计 M`；左栏 200px 筛选 + 主区；保留时间线/列表切换与分页 |
| `client/src/components/FilterPanel.tsx` | 逻辑不变；间距 4pt 节奏、分组标签 12/500、重置发丝边框 |
| `client/src/components/RegCard.tsx` | 白卡 + 发丝边框 + 4px 来源色脊线；元信息行（来源·子机构）+ 状态着色 + TYPE 描边 Chip + 星标；大标题 + 摘要 2 行截断；底行（日期·标签·查看原文↗·状态 Select）；`onPatch` 与空值保护保留 |
| `client/src/components/TimelineView.tsx` | 按 publishDate 分组；精致日期头（等宽日期 + 条数 Chip + 发丝延伸线）；雷达空状态 |

## 本轮（真实数据 + UI 精修）改动
- `scripts/seed.ts`：样例替换为 9 条真实官方法规；upsert 由「仅更新 original_url」改为**全字段 UPDATE**（与 migrations.ts 列名一致），重跑 seed 即可整体刷新，无需删库。
- `client/src/components/RegCard.tsx`：摘要 `-webkit-line-clamp` 2→3（多展示一行真实多句摘要）；所有 Chip 包入 `flex/wrap/gap:1` 容器并加 `mr/my` 留白；元信息行→标题 / 标题→摘要 / 摘要→底部标签行 间距校准，胶囊不再贴文字；hover 仅极轻边框反馈、无阴影。整体视觉对标 Stripe / Linear / Vercel（大留白、精确字号阶梯、1px 发丝边框、克制主色、无渐变）。

## 验证
- `npx tsc --noEmit`（client + server + shared）✅ 0 错误；`npm run build` ✅ 通过
- 9 条 `originalUrl` 逐项 `curl` 实测：8 条返回 200/206；NMPA 中文通告页被 WAF 拦自动请求，改用同源英文镜像 `english.nmpa.gov.cn/.../c_660305.htm`（200，同一份 2021 年第52号通告）
- 服务重启后 `/api/health` 200（db=sqlite），接口返回标题与 `originalUrl` 完全对应
- 预览：`http://localhost:3000`（WorkBuddy 内置预览或浏览器打开）

## 待办 / 未启动
- QA 严过关回归测试轮次（本轮为纯视觉迭代，功能与接口未变）
- 三待拍板项：LLM 供应商（含数据出境合规）/ 云部署节点 / 邮件·企微推送
- 真实外网采集调度（当前为 9 条样例数据）
