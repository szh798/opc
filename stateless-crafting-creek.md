# 一树 OPC —— 走到"商业化产品"的工程计划表

## Context

当前项目是一个"能跑的 MVP"，4/30 版本目标是体验版上线。但若站在"能否称为商业化产品"的角度看，**不谈盈利模式、不谈多端扩展**，项目仍缺四类硬能力：

1. **合规红线**：微信内容审核、AIGC 标识、敏感词过滤完全为 0；被监管或被举报即下架。
2. **可观测性与成本控制**：只有基础 Logger + 全局 rate limit，没有错误聚合、没有 Dify token 用量追踪、没有业务级配额——线上出事靠翻服务器日志，滥用靠老板兜底。
3. **数据与质量工程**：有 `BehaviorLog` 表但前端未埋点；0 单元测试；无 feature flag / 灰度；每次改动靠跑 e2e 赌运气。
4. **运营闭环**：有 `/tasks/feedback` 接口但无分类处理，无客服入口，无 admin 后台——问题收得到但处理不了。

本计划表按"必须→应该→最好有"三个优先级分阶段列出补齐项，每项含目标、关键文件、验证方式与工作量估算。用户可按自己的人力和节奏组合执行。

---

## 现状核对（来自代码核查，作为计划依据）

| 维度 | 现状 | 证据 |
|---|---|---|
| 全局 HTTP rate limit | ✅ 100 req/min per userId/IP | [backend/src/main.ts:43-55](backend/src/main.ts#L43-L55) |
| 业务级 per-user 配额 | ❌ 无 | — |
| Dify token 成本追踪 | ❌ 无，只有熔断 | [backend/src/dify.service.ts:64-90](backend/src/dify.service.ts#L64-L90) |
| 全局异常过滤 + requestId | ✅ 基础版 | [backend/src/shared/http-exception.filter.ts](backend/src/shared/http-exception.filter.ts) |
| 结构化日志 / Sentry / APM | ❌ 无 | Fastify 默认 logger |
| BehaviorLog 埋点表 | ✅ 有 schema，8 类事件 | [backend/prisma/schema.prisma:329-337](backend/prisma/schema.prisma#L329-L337) |
| 前端埋点消费 | ❌ 只有 `__track` className，无上报 | — |
| 微信 msgSecCheck | ❌ 完全未接入 | 代码库全局 grep 无命中 |
| AIGC 标识 | ❌ 无 | — |
| 用户反馈接口 | ✅ 有 `/tasks/feedback` + TaskFeedback 表 | [backend/src/task.controller.ts:26-29](backend/src/task.controller.ts#L26-L29) |
| 客服入口 / 分类处理 | ❌ 无 | — |
| Feature flag | ❌ 只有硬编码的 BLOCKED_ROUTE_ACTIONS | [pages/conversation/conversation.js:60-69](pages/conversation/conversation.js#L60-L69) |
| 单元测试 | ❌ 0 个 `.spec/.test` 文件 | `find backend/src -name "*.spec.ts"` 返回 0 |
| Smoke 脚本 | ✅ 7 个，覆盖关键 e2e 路径 | [backend/scripts/](backend/scripts/) |
| Admin 后台 | ❌ 无 admin/* 路由 | 11 个业务 controller，无管理入口 |
| 数据库备份自动化 | ❌ 只有 `.debug-backups/` 手工快照 | — |

---

## 计划表

### 🔴 Phase A —— 上线红线（合规 + 防滥用），2 周

没补完这层，项目在监管意义上就不算"商业化"，随时可下架或网信办敲门。

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| A1 | 微信内容审核接入 | 封装 `contentSecurity.service`，对用户昵称、输入 text、AI 输出全部过 [msgSecCheck v2](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/msgSecCheck.html) | 新增 `backend/src/content-security.service.ts`；在 [user.service.ts:updateCurrentUser](backend/src/user.service.ts)、chat 入口、Dify 回流处统一调用 | 构造违规昵称与 prompt injection 输入，确认被拦且返回可诊断错误 | 3d |
| A2 | AIGC 内容标识 | 生成内容前端加"AI 生成"标签，报告 PDF/图片加水印 | 对话气泡 & 资产报告组件；新增 shared badge 组件 | 真机截图审核入口确认存在 | 1d |
| A3 | per-user 业务配额 | 资产盘点每日 ≤3 次、报告生成每日 ≤5 次、chat 消息 ≤500 条/日 | 新增 `backend/src/shared/quota.guard.ts`；复用现有 rate-limit 插件的 store；挂在 chat/router/report controller 上 | 脚本批量触发资产盘点，第 4 次起返 429 | 2d |
| A4 | Dify 调用用量追踪 | 每次 Dify 调用后写入 `DifyUsageLog(userId, workflowKey, tokensIn, tokensOut, latency, cost)` 表 | 复用 [dify.service.ts](backend/src/dify.service.ts) 响应解析；新增 Prisma 表 + migration | 跑一轮 e2e 后 SQL 查询能按用户汇总用量 | 1.5d |
| A5 | 算法备案材料准备 | 非代码：模型清单、训练数据来源、安全评估报告、AIGC 标识方案文档 | 新文档 `docs/AIGC_FILING.md` | 老板对齐后提交网信办 | 1d |

**Phase A 出口**：生产环境任何用户或模型输出的违规内容都会被拦；任一用户不能靠高频调用烧穿成本；有任何违规出现都能在 DB 里反查到责任人和工作流。

---

### 🟠 Phase B —— 可观测性，2 周

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| B1 | Sentry 接入 | 后端全局异常钩子 + Fastify 请求中间件；前端小程序 error handler → 自建 `/client-errors` 上报 | 挂在 [http-exception.filter.ts:49-52](backend/src/shared/http-exception.filter.ts#L49-L52)；前端 app.js onError | 人为抛 500，Sentry dashboard 15s 内收到 | 1d |
| B2 | 结构化日志 | Fastify 切 pino JSON 输出，带 requestId / userId / route 字段 | [backend/src/main.ts:20](backend/src/main.ts#L20)（logger: true → pinoHttp options） | `jq` 能筛出单个 requestId 完整链路 | 1d |
| B3 | 业务指标看板 v0 | Metabase 或 Grafana 接 Postgres；出 5 张图：DAU、首盘完成率、报告生成成功率、Dify p95 延迟、错误率 Top 10 | 数据源：`User`、`Conversation`、`DifyUsageLog`（A4 新增）、`BehaviorLog` | 每张图能刷出真实数据 | 2d |
| B4 | /ready 深度化 | 当前 /ready 只是返 200；扩展为 DB ping + Dify 连通性 + 核心表可写入探针 | [backend/src/main.ts](backend/src/main.ts) 已有 /ready 端点 | 人为断开 DB，/ready 返 503 | 0.5d |
| B5 | Dify 可用率 SLI | `DifyUsageLog.status` 按 5 分钟窗口统计成功率，低于阈值触发告警 | 复用 A4 表；新增 cron 或在 B3 看板里查询 | 人为让 Dify 返 503，告警在一个窗口内触发 | 1d |

**Phase B 出口**：线上任何 5xx、任何 Dify 抽风、任何慢查询都有人主动发现，而不是靠用户反馈。

---

### 🟡 Phase C —— 数据与实验，3 周

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| C1 | 前端埋点 SDK | 封装 `utils/track.js`：曝光、点击、流程进入/退出、错误；批量上报到 `/events` 接口 → 写入 `BehaviorLog` | 复用 [BehaviorLog 表](backend/prisma/schema.prisma#L329-L337)；新增 `event.controller.ts` | 真机点击任意按钮，BehaviorLog 一分钟内有记录 | 3d |
| C2 | 核心漏斗埋点清单 | 定义并打点：`app_open → login_success → first_inventory_start → dimension_complete(ability/resource/cognition/relationship) → report_generated → 7d_return` | 各页面 onShow / handler 里挂 track() | SQL 查询每个漏斗步骤的转化率 | 2d |
| C3 | 留存/DAU 计算任务 | 每日 cron 跑 DAU / WAU / N 日留存 / Dify 成本汇总，写入 `DailyStats` 表；看板直接读 | 新增 cron + 新表；复用 B3 看板 | 跑一周后看板能出留存曲线 | 2d |
| C4 | A/B 实验基础 | 用户 id hash 分桶，实验配置表（实验名 / 桶 / 流量比）；埋点带 `experiment_arm` 字段 | 新增 `experiment.service.ts` + 表；前端 `getExperiment(key)` SDK | 构造实验，两桶用户走不同分支，埋点能区分 | 3d |

**Phase C 出口**：产品决策从"我觉得"变成"数据说"。能回答"用户卡在哪一步"、"改哪个文案转化率升了"。

---

### 🟢 Phase D —— 工程质量，3 周

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| D1 | Feature flag 模块 | DB 驱动的 `FeatureFlag(key, enabled, userWhitelist, rolloutPct)`；后端 Guard + 前端 SDK | 新增 `feature-flag.service.ts`；替换前端 [BLOCKED_ROUTE_ACTIONS](pages/conversation/conversation.js#L60-L69) 硬编码 | 运行时切换 flag 不需发版，前端 1 分钟内生效 | 2d |
| D2 | 核心服务单测骨架 | 先覆盖 4 个关键服务：router（coverage 计算 + stage 兜底）、assetInventory（三种失败模式）、bootstrap（匿名 vs 登录分叉）、auth | Jest + ts-jest；mock PrismaService；新增 `*.spec.ts` 文件 | `npm test` 能跑通，覆盖率 ≥30% | 4d |
| D3 | CI 流水线 | GitHub Actions：`typecheck` + `test` + `release:check --static-only` | 新增 `.github/workflows/ci.yml` | PR 上能看到绿色/红色状态 | 1d |
| D4 | 灰度 & 白名单 | 基于 D1 的 `rolloutPct` 实现按用户 hash 灰度；白名单支持精确 userId 列表 | 复用 D1 | 新功能配 10% 流量，看板能看到分流 | 1.5d |

**Phase D 出口**：改代码有信心（单测 + CI）、发代码有兜底（flag 可秒关）、发新功能有节奏（灰度可控）。

---

### 🔵 Phase E —— 运营闭环，3 周

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| E1 | Admin 管理后台 | 独立 Next.js 后台，基于 admin JWT；覆盖：用户列表 + 行为日志、feature flag 切换、反馈处理、封号、Dify 用量查询 | 新 `admin-web/` 子项目；复用现有 REST API，加 admin-only 路由 | 管理员能在后台封禁一个测试账号，该用户下次请求返 403 | 5d |
| E2 | 客服入口 | 小程序接入 `button open-type=contact` + 微信客服消息被动回复模板 | 个人设置页 / 对话页面增加入口 | 用户点"联系客服"能进入会话 | 1d |
| E3 | 反馈分类与工作台 | `TaskFeedback` 加 `category`、`status`、`assignee`、`resolvedAt` 字段；E1 后台有工作台视图 | [backend/prisma/schema.prisma:345-355](backend/prisma/schema.prisma#L345-L355) 扩列；[task.controller.ts](backend/src/task.controller.ts) 扩端点 | 管理员能把一个 open 的反馈流转到 resolved | 2d |
| E4 | 运营 SOP 文档 | 封号流程、合规投诉响应、P0 事故响应、数据导出请求处理 | 新 `docs/ops/` | 老板按文档能独立处理一次封号 | 1d |

**Phase E 出口**：出事不再只有"开发去数据库手动改一下"这条路；运营/客服能接手日常工单。

---

### ⚪ Phase F —— 稳定性深水，4 周

| # | 任务 | 关键动作 | 关键文件 / 复用点 | 验证方式 | 工时 |
|---|---|---|---|---|---|
| F1 | 数据库备份自动化 | 每日 pg_dump 到对象存储，保留 30 天；每周做一次恢复演练 | 新 cron + 运维脚本 | 备份可恢复到一个干净库并跑通 smoke | 2d |
| F2 | Dify 多模型降级 | 当前 yunwu 单点；按 workflow 配主/备模型，主模型失败自动切备 | [dify.service.ts](backend/src/dify.service.ts) 熔断逻辑扩展；`DIFY_API_KEY_*_FALLBACK` env | 人为让 yunwu 返 503，产品仍可用 | 3d |
| F3 | SLA 看板 | MTTR（从告警到恢复时间）、错误率、Dify 可用率、p95 延迟；月度导出 | 复用 B3 Metabase | 月底能给老板一张 SLA 数据 | 1d |
| F4 | 灾备切换演练文档 | 数据库主备切换流程、Dify 全部宕机的降级策略、微信小程序被下架的应急话术 | 新 `docs/dr/` | 年度演练能按文档完成一次切换 | 2d |

**Phase F 出口**：单点故障不会直接变成产品事故；事故发生后 30 分钟内有人响应、2 小时内有临时恢复。

---

## 总工作量与路径选择

| 档位 | 做到哪里 | 总工时 | 大致周期 |
|---|---|---|---|
| **最低门槛**：能叫"合规可运营的产品" | A + B + D2~D3 | ~5 周 | 1.5 个月 |
| **推荐版本**：能做增长实验、扛住日常规模 | A + B + C + D + E | ~13 周 | 3~4 个月 |
| **完整版**：商业化产品工程基建齐全 | A + B + C + D + E + F | ~17 周 | 4~5 个月 |

---

## 验证总纲

按阶段做端到端验证（不仅是单元测试过）：

- **Phase A**：构造违规昵称、prompt injection、超额调用三条攻击路径，全部被拦。
- **Phase B**：断网/断 DB/断 Dify 三种故障注入，Sentry 和看板都有响应。
- **Phase C**：跑 20 个模拟用户完整旅程，漏斗每一步都能在看板里看到。
- **Phase D**：一次 PR 触发全部 CI 门槛；一次 feature flag 线上切换生效 <1 分钟。
- **Phase E**：模拟一条用户投诉，从提交到关闭走完整闭环。
- **Phase F**：一次计划内数据库主备切换 + 一次 Dify 主模型手动下线，产品 SLA 不破。

---

## 关键复用点汇总（避免重复造轮子）

- 埋点基础设施：[BehaviorLog schema](backend/prisma/schema.prisma#L329-L337) 已有，只缺前端上报和漏斗清单
- 反馈表：[TaskFeedback schema](backend/prisma/schema.prisma#L345-L355) 已有，只缺 category/status 字段和工作台 UI
- 异常与 requestId：[http-exception.filter.ts](backend/src/shared/http-exception.filter.ts) 是 Sentry 的天然挂钩点
- Dify 熔断：[dify.service.ts:64-90](backend/src/dify.service.ts#L64-L90) 已有熔断，扩展成"熔断 + 降级 + 用量追踪"三件套
- Rate limit：[main.ts:43-55](backend/src/main.ts#L43-L55) 已有全局限流，按业务挂 Guard 即可
- 预检流水：[backend/scripts/release-preflight.js](backend/scripts/release-preflight.js) 是 CI 的现成基底

---

## 不在本计划范围

- 盈利模式、付费订阅、计费、退款
- 微信小程序之外的端（H5、App、Web、国际化）
- 企业版多租户 / workspace 隔离
- AI 能力本身的演进（prompt 调优、新工作流、模型能力升级）——这是产品路线图，不是工程基建
