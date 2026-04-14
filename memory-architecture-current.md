# 一树 OPC 当前记忆架构(Phase 1.6 + 清理 Round 1/2 完成状态)

> 快照时间:2026-04-13(清理收口后)
> 对齐设计文档:`abundant-forging-papert.md`
> 下一阶段:Phase 1.7 入口 A / B(见文末,需先和产品对齐才能开工)

## 分层现状

| 层级 | 数据载体 | 写入路径 | 读出路径 | 状态 |
|---|---|---|---|---|
| **L0** 原始消息 | `Message` | `router.service.startStream` 事务写入 | 审计/回放 | ✅ 已有 |
| **L0.5** 会话窗口 | `SessionContextEntry` | `SessionWindowService.appendAsync` (每轮 user + assistant 各 1 行) | `fetchRecent` → Layer A | ✅ Phase 1.4 |
| **L1** 原子事实 | `UserFact` | `MemoryExtractionService.extractAsync` (GLM-4-Flash 抽取) | `fetchUserFactsForAgent` → Layer B | ✅ Phase 1.2 + 1.3 |
| **L2** 对话摘要 | `ChatflowSummary` | `ChatflowSummaryService.summarizeAsync` (GLM-4-Air 摘要) | `fetchLayerCSummaries` → Layer C | ✅ Phase 1.5 |
| **L3** 聚合画像 | `UserProfile` (asset_radar) | `UserProfileService.recomputeAsync` (按 dimension 聚合 UserFact) | `getCurrentProfile` 供前端雷达图 | ✅ Phase 1.6 |

## 三层 Context 注入组装(Layer A + B + C)

每轮 `startStream` 只做一次注入组装([router.service.ts:startStream](backend/src/router/router.service.ts)):

```ts
const [sessionEntries, facts, summaries] = await Promise.all([
  this.sessionWindowService.fetchRecent(userId),        // Layer A
  this.fetchUserFactsForAgent(userId, decision.agentKey), // Layer B
  this.chatflowSummaryService.fetchLayerCSummaries(userId) // Layer C
]);
const memoryBlock = [
  this.sessionWindowService.formatAsLayerA(sessionEntries),
  this.formatFactsAsLayerB(facts),
  this.chatflowSummaryService.formatAsLayerC(summaries)
].filter(s => s && s.trim()).join("\n\n");
```

三层并发取,A > B > C 顺序拼接成 `memoryBlock:string` 透传给下游
(`generateAssistantReply` → `buildModelQuery` 或 `buildAssetIntakeSummary`)。

### Layer A 示例(60 分钟会话窗口)

```
最近对话:
[3分钟前·挖宝] 用户:我做了5年产品经理
[3分钟前·挖宝] 挖宝:产品经理的核心优势是...
[2分钟前·用户] 用户:主要做 B 端 SaaS
```

### Layer B 示例(L1 UserFact 按 category 聚合)

```
已知用户信息:
【经历】字节产品经理 3 年 / 之前做外贸
【能力】B 端 SaaS 产品 / 用户研究
【目标】月入 5 万
```

### Layer C 示例(最近 chatflow 摘要)

```
之前对话摘要:
[asset·3小时前] 用户在资产盘点中暴露出 5 年产品经理经历,B 端 SaaS 背景...
[execution·昨天] 用户在搞钱流中确认月目标 5 万,倾向做自媒体副业...
```

## 每轮对话的数据流全景

```
startStream(userId, input)
 ├─ Promise.all 取 A/B/C 三层 → memoryBlock
 ├─ 构造 handoff + 送 Dify 拿 answer
 ├─ 写事务: ConversationState + Message + StreamEvent + BehaviorLog
 └─ fire-and-forget 五件事:
    ① sessionWindow.appendAsync(user)    ← Phase 1.4
    ② sessionWindow.appendAsync(assistant) ← Phase 1.4
    ③ memoryExtraction.extractAsync      ← Phase 1.2 (glm-4-flash → UserFact)
    ④ chatflowSummary.summarizeAsync     ← Phase 1.5 (仅在 agent_switch / completed 时)
         └─ 成功 → userProfile.recomputeAsync ← Phase 1.6 (级联)
```

## Phase 1.4 — Layer A(60 分钟滑动会话窗口)

[SessionWindowService](backend/src/memory/session-window.service.ts)

### 写入
每轮 user text 和 assistant answer 各追加一行到 `SessionContextEntry`,
`expiresAt = now + SESSION_WINDOW_TTL_MINUTES (默认 60 分钟)`。
纯 `agent_switch` / `system_event` 输入以 `role=system` 入窗,便于摘要时识别。

### 读取
按 `userId` + `expiresAt > now()` 过滤,取最近 `SESSION_WINDOW_MAX_MESSAGES`(默认 20)条,
时间倒序取后反转为正序。渲染成"[3分钟前·挖宝] 用户:..."中文块。

### 表约束
`SessionContextEntry`:`id BIGSERIAL`,索引 `(userId, expiresAt, createdAt)` 支撑窗口查询。

### 过期 GC(懒清理)
[session-window.service.ts](backend/src/memory/session-window.service.ts):每次 `appendAsync` 写入成功后,
有 `LAZY_GC_PROBABILITY = 5%` 的概率顺手 `DELETE FROM SessionContextEntry WHERE userId = ? AND expiresAt < now()`。
单用户写入量级 < 1k 时完全够用,省去额外的 cron / partition 基建。失败只 debug 日志,不影响主链路。

## Phase 1.5 — Layer C(chatflow 摘要)

[ChatflowSummaryService](backend/src/memory/chatflow-summary.service.ts)
[chatflow-summary.prompt.ts](backend/src/memory/chatflow-summary.prompt.ts)

### 触发条件
在 `startStream` 事务后判断:
1. **agent_switch**:`previousAgentKey !== decision.agentKey` 或 `input.inputType === "agent_switch"`
   → 摘要上一个 agent 的会话窗口内容
2. **session_completed**:`ConversationState.status` 从 `in_progress` 转为 `completed`
   → 摘要当前 agent 的会话窗口内容

### 5 分钟去重
`runSummarize` 第一步先查 `chatflowSummary.findFirst({ userId, sourceAgentKey, createdAt: { gt: now - dedupWindow } })`,
命中则 `summary=skipped_dedup` 直接 return。这样用户短时间反复 agent_switch 不会刷出一堆几乎一样的摘要。
窗口大小由 `CHATFLOW_SUMMARY_DEDUP_WINDOW_MS` 控制(默认 `300000` 即 5 分钟)。

### 写入流程
```
summarizeAsync(userId, { agentKey, chatflowId, trigger })
  → sessionWindow.fetchRecent(userId, { sinceAgentKey: agentKey, limit: 40 })
  → 如果少于 CHATFLOW_SUMMARY_MIN_MESSAGES(默认 4)条 → 跳过
  → zhipu.chatCompletion(glm-4-air, text mode, temperature=0.3)
      system: CHATFLOW_SUMMARY_SYSTEM_PROMPT (100-200 字中文摘要)
      user: transcript (用户+agent 交替)
  → 写入 ChatflowSummary(memoryType=session_summary, trigger)
  → 成功 → 级联 userProfile.recomputeAsync
```

### Layer C 读取
`fetchLayerCSummaries(userId, CHATFLOW_SUMMARY_INJECT_LIMIT=3)`
→ 按 `createdAt desc` 取最近 N 条,对外按时间正序返回。

## Phase 1.6 — L3 asset_radar 聚合画像

[UserProfileService](backend/src/memory/user-profile.service.ts)

### 触发
由 `ChatflowSummaryService.runSummarize` 成功后级联 fire-and-forget 调用,
不暴露给 `startStream` 直接使用。

### 聚合公式(当前只实现 asset_radar)
```ts
// 查所有 dimension ∈ {capability, resource, cognition, relationship} 的活跃 UserFact
// 按 dimension 分桶,每桶统计 count + avgConfidence + 前 3 条样本 factValue
for each dimension in [capability, resource, cognition, relationship]:
  density     = min(1, count / 15)        // 15 条事实 ≈ 满分密度
  raw         = (density * 0.7 + avgConfidence * 0.3) * 100
  floorScore  = min(5 * count, 30)        // 稀疏时的保底分
  score       = max(round(raw), floorScore)
  clampedScore = min(score, 100)
```

### 写入
```
persist(userId, asset_radar, profileData, sourceFactCount)
  → tx:
      current = findFirst({isCurrent:true}, order by version desc)
      if current: update isCurrent=false
      create version = (current?.version || 0) + 1
```

`profileData` JSONB 结构:
```json
{
  "dimensions": [
    {"dimension":"capability","label":"能力","score":72,"factCount":8,"samples":["B 端 SaaS 产品","用户研究","..."]},
    {"dimension":"resource","label":"资源","score":30,"factCount":3,"samples":["..."]},
    {"dimension":"cognition","label":"认知","score":55,"factCount":6,"samples":["..."]},
    {"dimension":"relationship","label":"关系","score":18,"factCount":2,"samples":["..."]}
  ],
  "totalFactCount": 19,
  "generatedAt": "2026-04-13T08:00:00.000Z"
}
```

## 新增配置项(`.env` / `app-config.ts`)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SESSION_WINDOW_TTL_MINUTES` | 60 | 会话窗口 TTL |
| `SESSION_WINDOW_MAX_MESSAGES` | 20 | 每次注入最多取多少条 |
| `CHATFLOW_SUMMARY_ENABLED` | true | L2 摘要总开关 |
| `CHATFLOW_SUMMARIZER_MODEL` | glm-4-air | 摘要模型(比抽取器大一档) |
| `CHATFLOW_SUMMARIZER_MAX_TOKENS` | 400 | 输出上限 |
| `CHATFLOW_SUMMARIZER_TIMEOUT_MS` | 20000 | 请求超时 |
| `CHATFLOW_SUMMARY_MIN_MESSAGES` | 4 | 少于此消息数的窗口不触发摘要 |
| `CHATFLOW_SUMMARY_INJECT_LIMIT` | 3 | Layer C 注入最近几条 |
| `CHATFLOW_SUMMARY_DEDUP_WINDOW_MS` | 300000 | 同 user+agent 去重窗口(默认 5 分钟) |
| `USER_PROFILE_RECOMPUTE_ENABLED` | true | L3 重算总开关 |

## 相关服务与文件

### L0.5 会话窗口
- [session-window.service.ts](backend/src/memory/session-window.service.ts) — 追加 + 读取 + 渲染 Layer A

### L1 事实抽取
- [memory-extraction.service.ts](backend/src/memory/memory-extraction.service.ts) — L1 抽取器
- [memory-extraction.prompt.ts](backend/src/memory/memory-extraction.prompt.ts)
- [zhipu-client.service.ts](backend/src/memory/zhipu-client.service.ts) — GLM OpenAI 兼容客户端

### L2 摘要
- [chatflow-summary.service.ts](backend/src/memory/chatflow-summary.service.ts)
- [chatflow-summary.prompt.ts](backend/src/memory/chatflow-summary.prompt.ts)

### L3 画像
- [user-profile.service.ts](backend/src/memory/user-profile.service.ts)

### 注入入口
- [router.service.ts:startStream](backend/src/router/router.service.ts) — 三层并发取,组装 `memoryBlock` 透传

### 其它相关
- [DifySnapshotContextService](backend/src/dify-snapshot-context.service.ts) — 另一套 snapshot → Dify inputs 的快照注入,仍在使用,与 Layer A/B/C 并存

## 数据库表索引概览

| 表 | 关键索引 | 用途 |
|---|---|---|
| `UserFact` | `(userId, category, factKey, version) UNIQUE` / `(userId, category, isActive, updatedAt)` / `(userId, dimension, isActive)` | Layer B 查询 + L3 聚合 |
| `SessionContextEntry` | `(userId, expiresAt, createdAt)` | Layer A 滑动窗口查询 |
| `ChatflowSummary` | `(userId, memoryType, createdAt)` / `(userId, sourceAgentKey, createdAt)` | Layer C 最近摘要查询 |
| `UserProfile` | `(userId, profileType, version) UNIQUE` / `(userId, profileType, isCurrent)` | 取当前版本画像 |

所有 `id` 都是 `BigInt`(`BIGSERIAL`),对外 JSON 序列化必须 `.toString()`。

## Phase 1.7 入口(待启动,需先和产品对齐)

清理已经收口,下一阶段两个候选方向都需要外部输入才能动手,暂时只立目标不写代码。

### 入口 A — L3 画像扩展:`personality` / `ikigai` / `business_status`

**现状**
- [UserProfileService.recomputeAssetRadar](backend/src/memory/user-profile.service.ts) 只覆盖 `asset_radar` 一种 profileType
- [schema.prisma](backend/prisma/schema.prisma) 的 `UserProfileType` enum 已预埋上述三个值,DB 层面不需要再迁移
- L1 [UserFact](backend/src/memory/memory-extraction.service.ts) 已经在抽 `personality` / `pain_point` / `preference` / `goal` / `business` / `behavior` 等 category,数据源齐全

**待对齐(产品侧)**
1. **每种画像的输入维度**
   - `personality`:取 `category in (personality, behavior)`?要不要把 `pain_point` 折算成"恐惧/逃避倾向"?
   - `ikigai`:四象限 = 擅长(skill+能力 dimension)× 热爱(preference)× 价值(business+goal)× 世界需要(?),最后一象限缺数据源
   - `business_status`:取 `category in (business, goal, behavior)`?评分按"已落地/规划中/未启动"三态而不是 0-100 数值?
2. **每种画像的产出结构**
   - 是不是都套用 `asset_radar` 那套 `dimensions: [{label, score, factCount, samples}]`?
   - 还是 ikigai 走四象限 JSON、business_status 走状态机 JSON?
3. **触发与缓存策略**
   - 现在 `recomputeAsync` 只在 `ChatflowSummaryService` 摘要写完后级联触发一次,3 种新画像是否同样跟摘要级联?还是按 agent 维度区分?

**实现入口**
- [user-profile.service.ts:recomputeAsync](backend/src/memory/user-profile.service.ts) 加 dispatch:按 profileType 路由到不同的 `recomputeXxx` 方法
- 每种画像新增一个 private aggregator,沿用 `persist(userId, profileType, profileData, count)` 做版本管理
- 不需要新表 / 新 migration

### 入口 B — `DifySnapshotContextService` 与 `memoryBlock` 注入源统一

**现状**
- Router 这边:`startStream` 已经走 Layer A + B + C 三层注入,组装出 `memoryBlock` 透传给 Dify
- Dify 这边:[DifySnapshotContextService](backend/src/dify-snapshot-context.service.ts) 仍维护一份独立的 snapshot,把用户事实塞进 chatflow 入参变量
- 两套数据源可能不一致(尤其 L1 抽取的最新事实和 snapshot 的快照之间)

**待对齐(Dify 平台侧)**
1. **影响面**:统一注入意味着改 Dify chatflow 模板的入参 schema(把现有的零散变量替换成单个 `memory_block` 文本变量),所有 chatflow 都要同步改
2. **节奏**:是借下次 Dify 大版本一起改?还是先在 router 端"双写"——既维持旧 snapshot 入参又同时注入 `memoryBlock`,等 Dify 那边切完再下线 snapshot?
3. **回退**:如果 chatflow 模板没了细分变量,出问题时如何快速回退到旧 snapshot 注入

**实现入口**
- [router.service.ts:startStream](backend/src/router/router.service.ts) 在调 Dify 时把 `memoryBlock` 也作为 inputs 字段下发
- 等 Dify 端模板切完后,删除 [DifySnapshotContextService](backend/src/dify-snapshot-context.service.ts) 及其调用点
- 风险主要在 Dify 平台侧而非代码侧

## 已完成 Phase 路线图

- ✅ **Phase 1.1** — 乱码修复 + `UserFact` 表建表 migration(`0004_add_user_fact`)
- ✅ **Phase 1.2** — L1 写入(fire-and-forget extractor,glm-4-flash)
- ✅ **Phase 1.3** — L1 读取统一到 `UserFact`,旧 `MemoryEntry` 读路径下线
- ✅ **Phase 1.4** — `SessionContextEntry` + `SessionWindowService`(Layer A,60 分钟滑动窗口)
- ✅ **Phase 1.5** — `ChatflowSummary` + `ChatflowSummaryService`(Layer C,glm-4-air 摘要)
- ✅ **Phase 1.6** — `UserProfile` + `UserProfileService`(L3 asset_radar 聚合)
- ✅ **清理 Round 1** — drop `MemoryEntry` 表 + `MemoryCategory` enum (migration `0006_drop_memory_entry`)
- ✅ **清理 Round 2** — `SessionContextEntry` 懒清理(5% 概率) + `ChatflowSummary` 5 分钟去重 + `CHATFLOW_SUMMARY_DEDUP_WINDOW_MS` 提到 `app-config.ts` + `.env.example` 补全
- ⏳ **Phase 1.7 入口 A** — L3 扩展(`personality` / `ikigai` / `business_status`)
- ⏳ **Phase 1.7 入口 B** — `DifySnapshotContextService` 与 `memoryBlock` 注入源统一
- ⏳ **前端对接** — 雷达图页面调 `getCurrentProfile(userId, 'asset_radar')` 取数据渲染
