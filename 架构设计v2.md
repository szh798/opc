# 一树OPC 多智能体系统 — 架构评审与实施计划 V2

## Context

**项目**: 一树OPC — 面向一人公司创业者的 AI Native 微信小程序
**核心理念**: 对话即操作系统 (Conversation as OS)
**目标**: 1-2周内交付可用 MVP

**输入文档**:
1. `多智能体系统设计研究报告` — 理论基础 + 原始架构（Master Agent + 6 sub-agents）
2. `一树OPC_前端交互设计交付文档_V3_Final.md` — 25屏 UI/UX 规范
3. `一树OPC_完整路由状态机_V1.md` — **最新权威文档**，零LLM路由架构
4. 20+ docx 知识库文件 — 每个 chatflow 的 RAG 素材

**技术栈（已确认）**:
| 层 | 方案 | 状态 |
|----|------|------|
| 前端 | **uni-app + Vue** | 已确认 |
| 后端 | **Node.js (JavaScript)** | 已有部分开发 |
| 数据库 | **PostgreSQL** | 已确认 |
| AI 编排 | **Dify (已部署)** | 已有4个资产盘点相关工作流 |
| 团队 | **2-3人** | 前后端分工 |
| MVP | **单项目** | 已确认 |

---

## 零、状态机 V3 重写计划（当前优先任务）

### 0.1 为什么要重写 V2

V2 有两个结构性错误：

| 错误 | 具体表现 | 修正方向 |
|------|---------|---------|
| **把chatflow内部对话写进了状态机** | 资产盘点8-12个问题、追问逻辑、雷达图输出话术全在状态机里 | 状态机只写引导话术+快捷回复+路由指向，chatflow内部对话属于chatflow的system prompt |
| **"零LLM路由"太极端** | 纯关键词匹配覆盖不了所有自由输入场景 | 4层递进路由：快捷回复→关键词→轻量本地意图分类→兜底chatflow |

用户第三次修正：也不能走另一个极端完全不写对话内容。**引导性话术和快捷回复必须写进状态机**，因为它们本身就是引导用户走pipeline的手段。

### 0.2 状态机 vs Chatflow 的职责边界

```
写进状态机的（路由层）：
  ✓ 过渡性引导话术（1-3句，把用户引向下一个chatflow）
  ✓ 快捷回复选项（就是路由按钮）
  ✓ 钩子卡片（如园区政策钩子）
  ✓ 决策逻辑："用户点X → 路由到chatflow Y"
  ✓ 边缘情况："用户不点按钮直接打字 → 怎么处理"
  ✓ chatflow完成后的后续路由
  ✓ DB状态检查条件

不写进状态机的（chatflow层）：
  ✗ chatflow内部的多轮Q&A（盘点8-12个问题怎么问）
  ✗ chatflow内部的追问/补问逻辑
  ✗ 卡片生成的具体数据结构
  ✗ system prompt指令
  ✗ chatflow内部的偏题/情绪处理细节

判断标准：如果一段话术的目的是"决定用户去哪个chatflow" → 写进状态机
          如果一段话术的目的是"在chatflow里推进对话" → 不写
```

### 0.3 正确的决策树范式（来自"跟一树聊聊"文档）

```
用户选择/回复
  ├─ 选项A → 一树说一句过渡话术 → 导入XXX对话流
  ├─ 选项B → 一树说一句过渡话术 → 导入YYY对话流
  ├─ 对话框随便说了别的
  │   └─ 检测条件 → 关键词/意图分类 → 路由到对应chatflow
  │   └─ 都匹配不上 → 兜底chatflow接住
  └─ 汇总 / 每个分支的chatflow完成后 → 下一个决策点
```

**每个分支穷举所有可能的用户回复**（包括"直接打字""不选任何按钮""说了完全无关的话"）。

### 0.4 路由架构：4层递进

```
Layer 1: 快捷回复按钮点击 → 按钮自带route_key → 直接路由（零成本，覆盖~65%）
Layer 2: 关键词/正则匹配 → 命中则路由（零成本，覆盖~15%）
Layer 3: 轻量本地意图分类器 → 返回intent → 路由（近零成本，<100ms，覆盖~15%）
Layer 4: yishu_fallback_chat_flow → PRD作RAG的兜底对话（LLM成本，覆盖~5%）
```

**意图分类器设计（Layer 3）：**
- 部署：本地Node.js，不调用云端大模型
- MVP方案：规则加权打分（比纯关键词灵活，不需要ML训练）
- 后续可升级：fine-tuned小型中文分类模型
- 约10个意图类别：

| intent | 描述 | 路由目标 |
|--------|------|---------|
| want_audit | 想盘点/看看自己有什么 | asset_audit_flow |
| want_opportunity | 想看方向/机会 | opportunity_scoring_flow |
| want_money | 想赚钱/接单/成交 | 先检查状态再路由搞钱系列 |
| want_policy | 想看政策/园区/薅羊毛 | park_match_flow |
| has_idea | 有想法想讨论 | info_collection_chat_flow |
| has_business | 已有生意想诊断/放大 | business_health_check_flow |
| feeling_stuck | 迷茫/焦虑/卡住 | 先共情再引导盘点 |
| just_chatting | 闲聊/打招呼 | yishu_fallback_chat_flow |
| asking_product | 问产品功能/你能做什么 | 自我介绍→引导选状态 |
| off_topic | 完全无关 | yishu_fallback_chat_flow |

**Layer 3 只在无活跃chatflow时触发。** 用户在chatflow内的消息直接发给当前chatflow，不走路由。

### 0.5 Chatflow清单（20个）

**参谋智能体处理：** 合并。诊断→挖宝(business_health_check)，策略/执行→搞钱，系统化→管家。已有生意想放大的用户pipeline：挖宝诊断→搞钱策略→管家系统化。

| # | chatflow_id | 角色 | 类型 | 用途 | LLM节点 |
|---|-------------|------|------|------|---------|
| 01 | onboarding_flow | 一树 | 模板 | 登录+昵称+状态分流 | 0 |
| 02 | asset_audit_flow | 挖宝 | 固定 | 首次标准资产盘点（8-12问→雷达图） | 2 |
| 03 | asset_audit_repeat_flow | 挖宝 | 固定 | 二次+资产盘点（单独提示词，关注变化） | 1 |
| 04 | asset_audit_lite_flow | 挖宝 | 固定 | 快速盘点（仅补缺失维度） | 1 |
| 05 | opportunity_scoring_flow | 挖宝 | 固定 | 首次机会评分（3方向→选择） | 1 |
| 06 | opportunity_repeat_flow | 挖宝 | 固定 | 二次+机会识别（单独提示词） | 1 |
| 07 | business_health_check_flow | 挖宝 | 固定 | 生意体检（含"参谋"诊断功能） | 1 |
| 08 | waibao_free_chat_flow | 挖宝 | 自由 | 挖宝日常聊天（所有固定流程完成后） | 1 |
| 09 | info_collection_chat_flow | 一树/挖宝 | 自由 | 闲聊式信息收集（用户拒绝结构化盘点时，通过自然聊天收集信息，找切入点引导回盘点） | 1 |
| 10 | first_deal_flow | 搞钱 | 固定 | 第一单获客 | 1 |
| 11 | productize_flow | 搞钱 | 固定 | 产品结构化 | 1 |
| 12 | pricing_flow | 搞钱 | 固定 | 定价策略 | 1 |
| 13 | scaling_strategy_flow | 搞钱 | 固定 | 生意放大策略（原"参谋"的策略功能：新产品线/涨价/扩客群） | 1 |
| 14 | gaoqian_free_chat_flow | 搞钱 | 自由 | 搞钱日常聊天 | 1 |
| 15 | mindset_fix_flow | 扎心 | 固定 | 卡点修复（逃避型情绪触发，插拔式1-2轮） | 1 |
| 16 | park_match_flow | 管家 | 固定 | 园区/政策匹配（含onboarding钩子的轻量模式） | 1 |
| 17 | revenue_stabilize_flow | 管家 | 固定 | 收入结构稳定化 | 1 |
| 18 | profit_first_flow | 管家 | 固定 | 利润优先配置 | 1 |
| 19 | automation_flow | 管家 | 固定 | 自动化建议（原"参谋"的系统化功能） | 1 |
| 20 | guanjia_free_chat_flow | 管家 | 自由 | 管家日常 | 1 |
| 21 | yishu_fallback_chat_flow | 一树 | 兜底 | PRD作RAG的全能兜底（未开发模块占位+loop检测→留钩子+情绪检测→路由扎心） | 1 |

**总计：21个chatflow。** 比V2多3个：asset_audit_repeat(03), opportunity_repeat(06), scaling_strategy(13)。

**每个chatflow的退出信号（统一协议）：**
chatflow通过在LLM输出中嵌入XML标签通知后端：
```
<flow_complete result="asset_radar" />        — 正常完成，产出了结果
<flow_exit reason="user_wants_other" />        — 用户想聊别的
<flow_exit reason="user_stuck" type="escape" /> — 逃避型情绪
<flow_exit reason="user_stuck" type="distress" /> — 困境型情绪
<flow_exit reason="loop_detected" />           — 对话在循环
<flow_pause />                                  — 保存进度
```
后端检测到标签 → 解析 → 按状态机路由表决定下一步。

### 0.6 V3 文档大纲

```
# 一树OPC 完整路由状态机 V3

## 一、核心原则（6条）
## 二、路由架构（4层递进 + 意图分类器设计）
## 三、用户状态定义（DB字段 + 信息采集门控）
## 四、Chatflow清单与退出信号协议（21个chatflow速查表）

## 五、首次登录完整决策树
  5.0 onboarding_flow（登录+昵称+状态分流）
  5.1 "在上班" 分支
    5.1.1 "纯好奇" → entry_path=1a
    5.1.2 "有模糊想法" → entry_path=1b
    5.1.3 "想做不知道做什么" → entry_path=1c
    5.1.4 用户自由输入
  5.2 "有想法/在做副业" 分支
    5.2.1 "有想法还没开始" → entry_path=2a
    5.2.2 "刚开始做没赚到钱" → entry_path=2b
    5.2.3 "在做有收入了" → entry_path=2c
    5.2.4 用户自由输入
  5.3 "已全职在做" 分支
    5.3.1 "月入<1万" → entry_path=3a
    5.3.2 "月入1-5万" → entry_path=3b
    5.3.3 "月入5万+" → entry_path=3c
    5.3.4 用户自由输入（直接说收入数字等）
  5.4 "帮我查查能薅什么"（钩子卡片）→ park_match_flow
  5.5 用户不点任何按钮直接打字 → 关键词/意图分类 → 分流
  5.6 资产盘点chatflow完成后的后续路由（→机会评分→搞钱→...）
  5.7 生意体检chatflow完成后的后续路由

## 六、二次登录决策树
  6.0 入口决策（优先级判断）
  6.1 恢复未完成流程
  6.2 信息采集门控未通过
  6.3 有雷达图无机会评分
  6.4 日常模式（问候语+任务卡+自由路由）

## 七、用户主动选择角色/功能
  7.1 一树·挖宝（按DB状态决定进哪个chatflow）
  7.2 一树·搞钱（前置检查+按DB状态分流）
  7.3 一树·扎心（主动入口处理）
  7.4 一树·管家（按DB状态分流）
  7.5 角色切换时的上下文处理

## 八、全局机制
  8.1 拒绝重定向表（每个拒绝场景的模板化重定向话术）
  8.2 情绪分级（逃避型 vs 困境型 vs 正常犹豫）
  8.3 边聊边更新（artifact_update协议）
  8.4 上下文传递（60分钟窗口 + 三层context注入）
  8.5 对话风格（system prompt全局指令 + 禁止模式）
  8.6 异常处理（偏题/循环检测/超时/关闭小程序）
  8.7 快捷回复规则（互斥/数量/措辞/排列）

## 九、Token消耗估算
```

### 0.7 关键决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 路由方式 | 4层递进（不是纯零LLM） | 用户反馈"不要太极端"；轻量本地分类器近零成本但覆盖自由输入 |
| chatflow数量 | 21个（V2是18个） | 二次盘点/机会识别需要单独提示词（用户明确要求）；新增scaling_strategy承接参谋功能 |
| 参谋智能体 | 合并：诊断→挖宝，策略→搞钱(scaling_strategy_flow)，系统化→管家 | 用户确认可合并，pipeline保持合理 |
| 对话内容写入程度 | 引导话术+快捷回复写入状态机，chatflow内部Q&A不写入 | 用户三次修正后确认的粒度 |
| info_collection_chat_flow | 独立chatflow，不是asset_audit的一个模式 | 目的不同：info_collection是"闲聊暗中收集"，asset_audit是"结构化提问" |
| 单一info_collection_flow vs 多chatflow | 多chatflow（按目的拆分） | V2架构doc建议单一flow+entry_path切换，但PM视角看不同目的应该分开，提示词差异太大 |

### 0.8 从V2架构压力测试继承的必须覆盖项

| 来源 | 要求 | 在V3状态机的位置 |
|------|------|-----------------|
| R1 | 微信登录失败处理 | §5.0 onboarding_flow |
| R3 | 情绪分类（逃避 vs 困境） | §8.2 |
| R7 | 信息采集门控（4维度SQL） | §三 |
| R8 | 拒绝重定向模板表 | §8.1 |
| Y1 | 快捷回复互斥 | §8.7 |
| Y2 | 晨间问候逻辑（完成 vs 中断） | §6.4 |
| Y3 | 角色切换上下文衔接 | §7.5 |
| Y5 | 扎心介入时机（1天/3天/7天不活跃） | §8.2 |
| Y6 | 语气随路径适配（3a低收入不同情） | 各路径引导话术 |
| 场景D | 用户连续拒绝盘点3次→被动模式 | §6.2 |
| 场景H | 频繁角色切换→恢复conversation_id | §7.5 |

### 0.9 前端文档矛盾更新

| 前端文档说法 | 状态机实际设计 | 处理 |
|-------------|---------------|------|
| "Master Agent自动判断意图" | 4层递进路由（不依赖Master Agent LLM判断） | 以状态机为准 |
| "No manual dropdown角色切换" | 用户可通过Header下拉手动选择角色 | 以状态机为准，前端需加入下拉菜单 |
| 5个Agent颜色已定义 | 一树(黑)/挖宝(紫)/搞钱(绿)/扎心(红)/管家(蓝) | 一致，无矛盾 |

---

## 一、文档矛盾裁定（全部已解决）

| 矛盾 | 裁定 |
|------|------|
| 前端文档说"Master Agent自动判断意图切换角色" vs 状态机"零LLM路由" | **以状态机为准。** 角色切换由DB状态+快捷回复+意图分类兜底（见§三）触发。前端文档需更新此描述。 |
| 用户能否主动切换角色？入口在哪？ | **能。** Header 中间位置显示当前角色，用户点击弹出下拉菜单选择角色。路由逻辑走状态机§4的"用户主动选择角色"检查。 |
| AI助手/IP助手在状态机中无对应chatflow | **MVP 占位处理。** 用户点击后弹出杠杆理论认知卡片（Naval Ravikant 代码+媒体杠杆），告知功能即将上线，触发订阅钩子。 |
| 前端文档的"多项目"概念 | **MVP 单项目。** 后续版本再加多项目支持。 |
| 19个chatflow是否够用 | **按需扩展。** 19个是起点，如果某个chatflow内部逻辑过重（如搞钱模块），拆分为更多子chatflow。 |

---

## 二、核心架构设计（V2 重设计）

### 2.1 根本性架构决策：一条对话流，后端切模式

**用户永远只看到一个连续的对话界面。** 不会因为 chatflow 切换而新开 chat。

```
┌──────────────────────────────────────────────────────┐
│               前端：一条连续的对话流                    │
│   用户看到的是：和一树一直在聊天                        │
│   角色切换只体现在 header 颜色/名称变化                 │
│   消息永远在同一个时间线上                              │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│               后端：消息路由层                          │
│                                                       │
│   1. 收到用户消息                                     │
│   2. 判断当前是否有活跃chatflow                        │
│      ├─ 有 → 消息直接发给当前chatflow的Dify会话       │
│      └─ 无 → 走路由决策（快捷回复/关键词/意图分类）    │
│   3. 如果需要切换chatflow：                           │
│      ├─ 从DB取最近20条消息 + user_facts 作为上下文    │
│      ├─ 创建新Dify会话，注入上下文                    │
│      └─ 通知前端切换header角色（动画过渡）            │
│   4. 所有消息统一写入 messages 表（单时间线）          │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**关键设计原则：**
- **前端永远只有一条消息流。** 不存在"新开一个chat"的概念。
- **后端在 Dify 层面可能有多个 conversation，但用户无感知。**
- **切换 chatflow 时，后端自动将最近的对话上下文注入到新 chatflow。**
- **角色切换 = header 变色 + 后端静默切换 Dify 会话。** 对用户来说只是"一树换了个模式"。

### 2.2 什么时候切换 chatflow，什么时候不切换

**这是最关键的体验设计。**

```
用户在 chatflow 内发消息
  │
  ▼
[判断] 消息是否跟当前 chatflow 相关？
  │
  ├─ 相关（大多数情况）→ 消息直接发给当前 Dify 会话 → 不切换
  │
  ├─ 轻微偏题（"对了我想问下..."）
  │   → 当前 chatflow 的 LLM 自己处理（system prompt 中已包含指令：
  │     "如果用户短暂偏题，简要回应后拉回主题"）
  │   → 不切换
  │
  ├─ 明显偏题（连续2条跟当前chatflow无关）
  │   → 当前 chatflow 的 LLM 输出特殊标记：<flow_exit reason="user_wants_other"/>
  │   → 后端检测到标记 → 询问用户"看起来你想聊别的，我把进度存好了。现在想聊什么？"
  │   → 用户回复后 → 走路由决策 → 切换到新 chatflow（但用户看到的仍是同一个对话流）
  │
  └─ 用户主动切换（点击header下拉选择角色）
      → 后端保存当前chatflow进度
      → 走状态机§4的角色路由检查
      → 切换到新 chatflow（注入上下文）
```

**不切换的情况（占95%）：**
- 用户在资产盘点中，说了一句"对了我之前做过外贸" → 这是盘点的一部分，不切换
- 用户在搞钱模块中，问了一句"我的定价是不是太低了" → 搞钱模块自己处理
- 用户在管家模块中，问了一句"昨天那个客户怎么回事" → 管家记下但继续当前话题

**切换的情况（占5%）：**
- 用户在资产盘点中，连续两次问"我要怎么注册公司" → chatflow 识别偏题 → 提议切换到管家
- 用户主动点击 header 下拉选择"一树·搞钱"
- 当前 chatflow 正常完成 → 自动流转到下一个 chatflow

### 2.3 路由决策（仅在"无活跃chatflow"时触发）

意图分类器只在以下场景触发：
1. 首次登录完成 onboarding 后
2. 二次登录且无未完成流程
3. 当前 chatflow 结束后用户说了新话题
4. 用户从偏题退出后说了新内容

```
[场景] 无活跃chatflow，用户发了一条消息

  → [第一层] 是快捷回复按钮？→ 按钮绑定了目标chatflow → 直接切换
  → [第二层] 关键词匹配（零延迟，~60%命中率）→ 命中则切换
  → [第三层] 意图分类API（小模型，~500 tokens，<1秒）→ 返回route_key → 切换

注意：用户在活跃chatflow中时，这三层完全不运行。
```

---

## 三、数据架构 — 五层加工 + 三级呼吸节奏

### 3.1 设计哲学

用户数据是一条**活的流水线**，有自己的呼吸节奏：

```
Level 0（原材料）    → 对话原文、用户行为日志
Level 1（一级加工）  → 实时提取的关键事实（每轮对话后，<3秒）
Level 2（二级加工）  → 会话级摘要（每个chatflow结束时）
Level 3（三级加工）  → 聚合后的用户画像（多个L1+L2合成，触发式）
Level 4（四级加工）  → 生成的交付物/卡片（LLM基于L1+L2+L3生成）
Level 5（五级加工）  → 跨交付物的洞察（月报/体检/阶段判断，定时）
```

### 3.2 数据呼吸节奏（核心！）

**这是决定用户体验的关键 —— 什么数据在什么时间点进入系统。**

```
┌─────────────────────────────────────────────────────────────┐
│                    呼吸节奏一：实时（每条消息）               │
│                                                              │
│  用户发一条消息 →                                           │
│    ① 消息原文写入 messages 表（Level 0）                    │
│    ② 消息追加到 session_context（Redis/内存，60分钟TTL）    │
│    ③ 消息发给当前 Dify chatflow                            │
│    ④ Dify返回响应 → 响应也写入 messages + session_context  │
│    ⑤ [异步] 后端对本轮 user+assistant 消息做快速事实提取    │
│       → 小模型判断：这轮对话是否暴露了新事实？              │
│       → 如果有 → 写入 user_facts（Level 1）                │
│       → 如果没有 → 跳过（大多数闲聊轮次不会产生新事实）    │
│                                                              │
│  成本：事实提取是异步的，不阻塞响应。每次~200 tokens。      │
│  频率：每轮对话都跑，但大多数时候输出空（=无新事实）。      │
│                                                              │
│  这一层的目的：让系统始终知道用户刚才说了什么，             │
│  并且不漏掉任何有价值的新信息。                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 呼吸节奏二：会话级（chatflow完成时）          │
│                                                              │
│  当一个chatflow完成（产出了最终卡片/用户主动退出）→        │
│    ① 对整段chatflow对话做摘要（小模型，~500 tokens）       │
│       摘要格式："用户在[挖宝·资产盘点]中聊了8轮。          │
│       关键发现：用户做了5年产品经理，擅长用户研究和         │
│       数据分析，有互联网行业人脉但不深，对自媒体感兴趣     │
│       但缺乏执行力。核心恐惧是怕选错方向浪费时间。"        │
│    ② 摘要写入 memory_entries（type=persistent）（Level 2）  │
│    ③ 更新 users 表状态字段（如 has_asset_radar = true）     │
│    ④ 如果chatflow产出了卡片 → 写入 artifacts（Level 4）    │
│    ⑤ 触发画像更新：基于最新user_facts重算user_profiles     │
│                                                              │
│  这一层的目的：把一段长对话压缩成高密度摘要，              │
│  让未来的chatflow不需要读原文也能知道之前发生了什么。       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               呼吸节奏三：会话窗口（60分钟滑动窗口）        │
│                                                              │
│  session_context 是一个60分钟滑动窗口：                     │
│    - 存储最近60分钟内ALL chatflow的原始消息                 │
│    - 存储格式：[{role, content, agent_role, timestamp}, ...]│
│    - 任何新chatflow启动时，自动读取session_context          │
│    - 注入到Dify chatflow的 system prompt 变量中             │
│    - 60分钟后消息从session_context中移除                    │
│    （但messages表和user_facts中的数据永久保留）             │
│                                                              │
│  这一层解决的核心问题：                                     │
│  用户在挖宝里说"我之前做过外贸5年"，                       │
│  5分钟后切到搞钱，搞钱立刻知道用户做过外贸5年。            │
│  因为这条消息还在session_context里。                         │
│                                                              │
│  实现方式：                                                  │
│  - MVP用PostgreSQL临时表 + 后端内存缓存                    │
│  - 后续可升级为Redis                                        │
│                                                              │
│  窗口大小选择60分钟的原因：                                 │
│  - 微信小程序单次使用时长通常 10-30 分钟                   │
│  - 60分钟覆盖了绝大多数"一次使用"的上下文                  │
│  - 超过60分钟的间隔，用户自己也会忘记之前说了什么          │
│  - 此时用持久记忆（会话摘要）就够了                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Context 注入的三层架构（chatflow启动时）

当一个新chatflow启动时，后端组装三层context注入到Dify变量：

```
Layer A: 会话窗口（最新鲜的上下文）
  → session_context 中最近的消息（最多20条，最近60分钟内）
  → 格式："[5分钟前·挖宝] 用户：我做了5年产品经理 / 挖宝：产品经理的核心优势是..."
  → 这让新chatflow立刻知道用户"刚才在聊什么"

Layer B: 用户事实库（结构化的、已验证的用户信息）
  → 从user_facts表查询当前chatflow需要的维度
  → 格式：
    "已知用户信息：
     - 职业：产品经理，5年经验
     - 行业：互联网/SaaS
     - 资源：有一定行业人脉
     - 偏好：对自媒体感兴趣
     - 恐惧：怕选错方向
     - 状态：在上班，想看看机会"
  → 这让chatflow知道"这个用户是谁"

Layer C: 历史摘要（之前的chatflow总结）
  → 从memory_entries表查询该用户的持久记忆
  → 格式："上次对话摘要：用户在资产盘点中发现自己的核心优势是..."
  → 这让chatflow知道"之前发生过什么"
```

**注入优先级（token有限时）：**
Layer A > Layer B > Layer C
（最近的上下文最重要，其次是用户事实，最后是历史摘要）

### 3.4 PostgreSQL 表结构设计（~18张表）

```sql
-- ============================================
-- Level 0: 原材料层
-- ============================================

-- 用户表（状态机核心字段）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wx_openid VARCHAR(128) UNIQUE NOT NULL,
  wx_unionid VARCHAR(128),
  nickname VARCHAR(64),
  avatar_url TEXT,
  preferred_name VARCHAR(32),

  -- 状态机字段（路由状态机文档定义的所有bool）
  onboarding_completed BOOLEAN DEFAULT FALSE,
  has_asset_radar BOOLEAN DEFAULT FALSE,
  has_opportunity_scores BOOLEAN DEFAULT FALSE,
  has_selected_direction BOOLEAN DEFAULT FALSE,
  has_business_health BOOLEAN DEFAULT FALSE,
  has_product_structure BOOLEAN DEFAULT FALSE,
  has_pricing_card BOOLEAN DEFAULT FALSE,
  has_outreach_scripts BOOLEAN DEFAULT FALSE,
  has_revenue_structure BOOLEAN DEFAULT FALSE,
  has_profit_first_config BOOLEAN DEFAULT FALSE,
  has_park_match BOOLEAN DEFAULT FALSE,
  is_active_opc BOOLEAN DEFAULT FALSE,
  entry_path VARCHAR(16),
  last_incomplete_flow VARCHAR(64),
  last_incomplete_step VARCHAR(64),
  days_inactive INT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  asset_audit_word_count INT DEFAULT 0,

  -- 当前活跃chatflow追踪
  active_chatflow_id VARCHAR(64),        -- 当前活跃的chatflow类型
  active_dify_conversation_id VARCHAR(128), -- 当前Dify会话ID
  active_agent_role VARCHAR(16),         -- 当前角色

  -- 元数据
  current_stage VARCHAR(32) DEFAULT 'seed',
  current_milestone INT DEFAULT 0,
  consecutive_login_days INT DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 消息表（全局单时间线！不按conversation分，因为用户只看到一条流）
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  role VARCHAR(8) NOT NULL,              -- user/assistant/system
  content TEXT NOT NULL,
  cards JSONB,                           -- 附带的卡片数据 [{card_type, data}]
  quick_replies JSONB,                   -- 快捷回复按钮配置
  agent_role VARCHAR(16),                -- 发送时的角色
  chatflow_id VARCHAR(64),               -- 哪个chatflow产生的
  dify_conversation_id VARCHAR(128),     -- 对应Dify会话（后端用）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_user_time ON messages(user_id, created_at DESC);
CREATE INDEX idx_messages_session ON messages(user_id, created_at)
  WHERE created_at > NOW() - INTERVAL '60 minutes';

-- 会话窗口（60分钟滑动窗口，用于跨chatflow上下文共享）
-- 这是一个"热"表，定期清理过期数据
CREATE TABLE session_context (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  role VARCHAR(8) NOT NULL,
  content TEXT NOT NULL,
  agent_role VARCHAR(16),
  expires_at TIMESTAMPTZ NOT NULL,       -- created_at + 60分钟
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_session_active ON session_context(user_id, created_at)
  WHERE expires_at > NOW();

-- Chatflow会话追踪（后端追踪每个Dify会话的状态）
CREATE TABLE chatflow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  chatflow_id VARCHAR(64) NOT NULL,
  dify_conversation_id VARCHAR(128),
  agent_role VARCHAR(16),
  status VARCHAR(16) DEFAULT 'active',   -- active/completed/paused/abandoned
  step_reached VARCHAR(64),              -- 当前进度标记
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  summary TEXT,                          -- 完成时的会话摘要（Level 2）
  metadata JSONB DEFAULT '{}'
);

-- 用户行为日志（轻量，用于分析）
CREATE TABLE user_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(32) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Level 1: 一级加工层（实时提取的事实标签）
-- ============================================

-- 用户事实表 —— 系统的"神经元"
-- 每轮对话异步提取，累积成千上万条
CREATE TABLE user_facts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),

  -- 分类体系
  category VARCHAR(32) NOT NULL,
    -- skill: 技能/能力（如"产品设计"、"Python"、"用户研究"）
    -- resource: 资源（如"互联网行业人脉"、"供应商渠道"）
    -- cognition: 认知/洞察（如"理解SaaS商业模式"、"懂内容营销"）
    -- relationship: 关系网络（如"认识XX行业的人"、"有社群运营经验"）
    -- experience: 经历/背景（如"产品经理5年"、"做过外贸"）
    -- personality: 性格特质（如"完美主义"、"行动力强"）
    -- preference: 偏好/意愿（如"想做小而美"、"对自媒体感兴趣"）
    -- pain_point: 痛点/恐惧（如"怕选错方向"、"时间不够"）
    -- goal: 目标/愿景（如"月入5万"、"自由工作"）
    -- business: 商业状态（如"月收入3万"、"3个固定客户"）
    -- behavior: 行为模式（如"连续3天未触达客户"、"总在学习不行动"）

  dimension VARCHAR(32),               -- 雷达图维度：能力/资源/认知/关系/null
  fact_key VARCHAR(128) NOT NULL,      -- 事实键名
  fact_value TEXT NOT NULL,            -- 事实值
  confidence FLOAT DEFAULT 1.0,

  -- 溯源
  source_message_id UUID,
  extracted_by VARCHAR(32),            -- llm_realtime/llm_batch/user_explicit/system_infer
  is_active BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_facts_lookup ON user_facts(user_id, category, fact_key) WHERE is_active = TRUE;
CREATE INDEX idx_facts_dimension ON user_facts(user_id, dimension) WHERE is_active = TRUE;

-- ============================================
-- Level 2: 二级加工层（会话摘要 + 持久记忆）
-- ============================================

-- 记忆条目（会话摘要 + 跨chatflow传递的上下文）
CREATE TABLE memory_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  memory_type VARCHAR(16) NOT NULL,    -- session_summary/persistent/insight
  content TEXT NOT NULL,
  source_chatflow_id VARCHAR(64),
  source_agent_role VARCHAR(16),
  relevance_tags TEXT[],               -- 用于检索时匹配
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_memory_user ON memory_entries(user_id, memory_type, created_at DESC);

-- ============================================
-- Level 3: 三级加工层（聚合画像）
-- ============================================

-- 用户画像快照（由多个user_facts聚合而成）
CREATE TABLE user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  profile_type VARCHAR(32) NOT NULL,   -- asset_radar/personality/ikigai/business_status
  profile_data JSONB NOT NULL,
  source_fact_count INT,               -- 基于多少条facts生成
  is_current BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_profiles_current ON user_profiles(user_id, profile_type) WHERE is_current = TRUE;

-- ============================================
-- Level 4: 四级加工层（交付物/卡片）
-- ============================================

CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  artifact_type VARCHAR(32) NOT NULL,
  title VARCHAR(128),
  data JSONB NOT NULL,
  agent_role VARCHAR(16),
  source_chatflow_session_id UUID,
  is_current BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  shared_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_artifacts_current ON artifacts(user_id, artifact_type) WHERE is_current = TRUE;

-- ============================================
-- Level 5: 五级加工层（里程碑/任务/洞察）
-- ============================================

CREATE TABLE milestones (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  milestone_index INT NOT NULL,
  milestone_name VARCHAR(64),
  status VARCHAR(16) DEFAULT 'locked',
  completed_at TIMESTAMPTZ,
  artifact_ids UUID[],
  UNIQUE(user_id, milestone_index)
);

CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  task_date DATE NOT NULL,
  title VARCHAR(128) NOT NULL,
  description TEXT,
  linked_chatflow VARCHAR(64),
  agent_role VARCHAR(16),
  status VARCHAR(16) DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscription_permissions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  template_id VARCHAR(128) NOT NULL,
  granted BOOLEAN DEFAULT FALSE,
  granted_at TIMESTAMPTZ
);
```

### 3.5 完整的数据流时序图（一条消息的生命旅程）

```
用户发送一条消息："我做了5年产品经理，主要负责B端SaaS"

时间线：
  T+0ms     前端发送消息到后端 POST /api/message
  T+5ms     后端写入 messages 表（Level 0）
  T+10ms    后端写入 session_context 表（expires_at = T+60min）
  T+15ms    后端查询 users.active_chatflow_id
              → 有活跃chatflow → 发给当前 Dify 会话
              → 无活跃chatflow → 走路由决策
  T+20ms    请求发给 Dify API（带 conversation_id）
  T+2000ms  Dify 返回响应（假设2秒）
  T+2005ms  后端将响应写入 messages 表 + session_context 表
  T+2010ms  后端返回响应给前端
  T+2015ms  前端渲染消息 + 卡片

  [异步，不阻塞用户]
  T+2020ms  后端启动事实提取任务
  T+2500ms  小模型返回提取结果：
            [
              {category:"experience", key:"primary_role", value:"产品经理", confidence:0.95},
              {category:"experience", key:"years_in_role", value:"5年", confidence:0.95},
              {category:"skill", key:"domain", value:"B端SaaS", dimension:"能力", confidence:0.9}
            ]
  T+2510ms  写入 user_facts 表（3条新事实）
  T+2520ms  更新 users.asset_audit_word_count += 消息字数

  [如果这是chatflow的最后一轮（chatflow完成信号）]
  T+3000ms  后端启动会话摘要任务
  T+4000ms  小模型返回摘要："用户在资产盘点中表示自己是5年经验的B端SaaS产品经理..."
  T+4010ms  写入 memory_entries（type=session_summary）
  T+4020ms  更新 chatflow_sessions.status = 'completed'
  T+4030ms  更新 users 状态字段（如 has_asset_radar = true）
  T+4040ms  触发 user_profiles 重算（Level 3）
```

---

## 四、记忆系统设计（已整合到§三的呼吸节奏中）

### 4.1 Context 注入代码（chatflow切换时执行）

```javascript
async function buildChatflowContext(userId, targetChatflowId, targetAgentRole) {

  // === Layer A: 会话窗口（60分钟内的原始对话，最鲜活的上下文） ===
  const sessionMessages = await db.query(`
    SELECT role, content, agent_role, created_at
    FROM session_context
    WHERE user_id = $1 AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 20
  `, [userId]);

  const sessionContextStr = sessionMessages.reverse().map(m =>
    `[${formatTimeAgo(m.created_at)}·${m.agent_role || '用户'}] ${m.content.substring(0, 200)}`
  ).join('\n');

  // === Layer B: 用户事实库（结构化的用户画像） ===
  const facts = await db.query(`
    SELECT category, fact_key, fact_value
    FROM user_facts
    WHERE user_id = $1 AND is_active = TRUE
    ORDER BY category, updated_at DESC
  `, [userId]);

  const factsStr = formatFactsAsText(facts);
  // 输出示例：
  // "已知用户信息：
  //  【经历】产品经理，5年，B端SaaS
  //  【能力】用户研究、数据分析、需求管理
  //  【资源】互联网行业人脉（不深）
  //  【偏好】对自媒体感兴趣，想做小而美
  //  【痛点】怕选错方向浪费时间
  //  【商业】月收入0，还在上班"

  // === Layer C: 历史摘要（之前chatflow的总结） ===
  const summaries = await db.query(`
    SELECT content, source_agent_role, created_at
    FROM memory_entries
    WHERE user_id = $1
    AND memory_type IN ('session_summary', 'persistent')
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId]);

  const summariesStr = summaries.map(s =>
    `[${s.source_agent_role}·${formatDate(s.created_at)}] ${s.content}`
  ).join('\n');

  // === 用户基础状态 ===
  const user = await db.query(`SELECT * FROM users WHERE id = $1`, [userId]);

  // === 组装最终 context（注意token预算） ===
  return {
    user_name: user.preferred_name || user.nickname,
    user_stage: user.current_stage,
    user_status_flags: buildStatusSummary(user), // "已完成资产盘点，未做机会评分"
    session_context: sessionContextStr,           // Layer A（优先级最高）
    user_facts: factsStr,                         // Layer B
    history_summaries: summariesStr,              // Layer C
    current_artifacts: await getCurrentArtifactsSummary(userId)
  };
}
```

### 4.2 事实提取器的 Prompt

```
你是一个精准的信息提取器。从用户和AI的对话中提取关于用户的新事实。

规则：
1. 只提取关于用户本人的事实，不提取AI说的建议
2. 如果本轮对话没有暴露新信息，输出空数组 []
3. 同一信息的更新版本也要提取（如用户纠正了之前的说法）
4. 保持事实原子化——一个事实只描述一件事

输出JSON数组：
[
  {
    "category": "skill|resource|cognition|relationship|experience|personality|preference|pain_point|goal|business|behavior",
    "dimension": "能力|资源|认知|关系|null",
    "key": "fact_key（英文，snake_case）",
    "value": "事实值（中文，简洁）",
    "confidence": 0.0-1.0
  }
]

示例输入：
用户："我之前在字节做了3年产品经理，主要做B端SaaS，后来去了一个创业公司"
AI："字节的经历不错，那创业公司做什么方向？"

示例输出：
[
  {"category":"experience","dimension":null,"key":"work_history_bytedance","value":"字节跳动产品经理3年","confidence":0.95},
  {"category":"experience","dimension":null,"key":"work_history_startup","value":"后来去了创业公司","confidence":0.8},
  {"category":"skill","dimension":"能力","key":"domain_b2b_saas","value":"B端SaaS产品","confidence":0.9}
]
```

### 4.3 会话摘要器的 Prompt（chatflow完成时触发）

```
将以下对话浓缩为一段100-200字的摘要，重点记录：
1. 用户暴露的关键信息和背景
2. 达成的结论或产出物
3. 用户的情绪状态和态度
4. 下一步应该做什么

格式：直接输出摘要文本，不要加标题或标签。
```

---

## 五、卡片协议设计

### 5.1 LLM输出格式

在每个chatflow的system prompt中，要求LLM在需要输出卡片时使用XML标签：

```
当你需要输出结构化卡片时，在正常文本中嵌入以下格式：

<card type="asset_radar">
{
  "dimensions": [
    {"name": "能力", "score": 75, "tags": ["产品设计", "用户研究", "数据分析"]},
    {"name": "资源", "score": 40, "tags": ["互联网行业人脉"]},
    {"name": "认知", "score": 85, "tags": ["行业趋势判断", "商业模式理解"]},
    {"name": "关系", "score": 55, "tags": ["前同事网络", "社群运营经验"]}
  ],
  "summary": "你的核心优势在认知和能力维度",
  "top_strengths": ["产品设计", "行业认知"]
}
</card>

卡片会被前端自动渲染为可视化组件，你只需要在合适的时机插入即可。
卡片前后的文字会正常显示为对话气泡。
```

### 5.2 卡片类型清单

| card_type | 角色 | 数据结构 | 前端组件 |
|-----------|------|---------|---------|
| `asset_radar` | 挖宝 | 四维度分数+标签 | 雷达图/条形图 |
| `opportunity_score` | 挖宝 | 方向名+五维评分+客户+痛点 | 评分矩阵卡片 |
| `opportunity_candidates` | 挖宝 | 3个候选方向数组 | 可选卡片列表 |
| `business_health` | 挖宝 | 四维健康度(✅⚠️❌)+诊断 | 健康度仪表盘 |
| `product_structure` | 搞钱 | 目标客户+痛点+交付物+耗时 | 产品卡片 |
| `pricing_card` | 搞钱 | 三层定价(入门/核心/高端) | 定价阶梯卡片 |
| `outreach_script` | 搞钱 | 话术模板+变量 | 可复制文案卡片 |
| `action_plan` | 扎心 | 48h任务列表+倒计时 | 行动计划卡片 |
| `case_card` | 一树 | 案例标题+描述+收入+标签 | 案例故事卡片 |
| `revenue_model` | 管家 | 三层收入结构 | 收入模型图 |
| `profit_first` | 管家 | 五账户比例+分配金额 | 饼图卡片 |
| `park_match` | 管家 | 园区名+政策+返税+条件 | 政策匹配卡片 |
| `milestone_unlock` | 一树 | 里程碑名+庆祝语 | 庆祝卡片(深色) |
| `daily_tasks` | 一树 | 任务数组(最多3条) | 任务勾选卡片 |
| `login_card` | 一树 | 微信登录按钮 | 登录卡片 |
| `hook_card` | 一树 | 标题+正文+CTA | 钩子引导卡片 |
| `warning` | 扎心 | 警告标题+内容 | 红色边框警告卡片 |
| `leverage_placeholder` | 一树 | 杠杆理论文案+订阅CTA | 占位引导卡片 |
| `quick_replies` | 所有 | 按钮数组 | 横向胶囊按钮 |

### 5.3 后端解析流程

```javascript
function parseAssistantResponse(rawText) {
  const segments = [];
  const cardRegex = /<card type="(\w+)">([\s\S]*?)<\/card>/g;

  let lastIndex = 0;
  let match;

  while ((match = cardRegex.exec(rawText)) !== null) {
    // 卡片前的文字
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: rawText.slice(lastIndex, match.index).trim() });
    }
    // 卡片本身
    segments.push({
      type: 'card',
      card_type: match[1],
      data: JSON.parse(match[2])
    });
    lastIndex = match.index + match[0].length;
  }
  // 卡片后的文字
  if (lastIndex < rawText.length) {
    segments.push({ type: 'text', content: rawText.slice(lastIndex).trim() });
  }

  return segments.filter(s => s.content || s.data); // 过滤空段
}
```

---

## 六、AI助手/IP助手 占位方案

用户点击侧边栏「AI助手」或「IP助手」时，一树发送杠杆理论认知卡片：

```
<card type="leverage_placeholder">
{
  "title": "代码杠杆 × 媒体杠杆",
  "paragraphs": [
    "Naval Ravikant 说过：这个时代有两个不需要任何人许可的免费杠杆——代码和媒体。",
    "代码杠杆让你一个人就能搭建自动化系统，用机器24小时替你干活。过去这是程序员的特权，但AI把这扇门向所有人打开了。",
    "媒体杠杆让你发一条内容的边际成本趋近于零，却可以触达一万人。唯一的门槛是持续输出的决心。",
    "这两个杠杆不依赖资本，不依赖人力，越用越值钱。一树正在为你打造专属的AI杠杆和IP杠杆工具——"
  ],
  "features": [
    {"name": "AI助手", "desc": "帮你识别最耗时的工作环节，直接搭建AI工作流替你干活", "status": "coming_soon"},
    {"name": "IP助手", "desc": "基于你的资产帮你做自媒体定位，一键生成可发布的内容", "status": "coming_soon"}
  ],
  "cta": "功能上线时第一时间通知我",
  "subscribe_template": "leverage_tools_launch"
}
</card>
```

---

## 七、MVP 流式输出方案

MVP 阶段不实现 SSE 流式输出。采用「等待态」方案：

```
用户发送消息 → 显示一树头像 + 打字气泡动画 + 随机文案轮播：
  "一树正在赚钱买算力..."
  "一树正在想怎么帮你搞钱..."
  "让我翻翻你的底牌..."
  "思考中，别急，好事不怕等..."

→ Dify 返回完整响应 → 隐藏等待态 → 渲染消息+卡片（淡入动画）
```

后续版本可通过 `wx.request` + `enableChunked: true` 升级为真正的流式输出。

---

## 八、MVP 范围 & 执行计划

### Week 1: Onboarding → 资产盘点 → 机会评分（端到端）

| Day | 交付物 | 负责 |
|-----|--------|------|
| Day 1 | 评估现有代码和Dify工作流、数据库schema落地、卡片协议确认 | 全员 |
| Day 2-3 | Prompt Engineering：为5个核心chatflow编写system prompt（基于RAG知识库docx） | 产品/AI |
| Day 2-3 | 前端：对话界面+快捷回复+卡片渲染引擎+角色切换header | 前端 |
| Day 2-3 | 后端：Dify代理层+用户状态API+消息存储+记忆提取 | 后端 |
| Day 4-5 | Dify：搭建onboarding+asset_inventory+opportunity_scoring chatflows | AI |
| Day 6-7 | 端到端联调：首次用户从进入到雷达图输出完整跑通 | 全员 |

### Week 2: 搞钱 + 管家 + 留存

| Day | 交付物 | 负责 |
|-----|--------|------|
| Day 8-9 | Prompt + Dify: 搞钱系列(第一单/产品化/定价) + 扎心 + 管家(园区) | AI |
| Day 8-9 | 前端：左侧边栏+个人档案+AI/IP助手占位 | 前端 |
| Day 10-11 | 后端：二次登录路由+意图分类API+任务系统 | 后端 |
| Day 12 | 前端：每日任务卡+里程碑解锁 | 前端 |
| Day 13-14 | 打磨+Bug修复+真实用户测试 | 全员 |

### 明确砍掉的功能（P2/P3）:
- AI助手 / IP助手 → 占位卡片+订阅钩子
- 周报/月度商业体检自动推送
- 成果分享裂变（朋友圈分享图生成）
- 同路人社会证明
- 合伙人匹配
- 多项目管理
- 成就树全屏页（里程碑用简单列表替代）

---

## 九、验证计划

1. **冒烟测试**: 完整走通 onboarding → 资产盘点 → 雷达图输出 → 机会评分 → 选定方向
2. **二次登录测试**: 关闭小程序 → 重新打开 → 验证恢复未完成流程
3. **角色切换测试**: Header下拉切换角色 → 验证路由检查逻辑 + 上下文传递
4. **异常测试**: 用户自由输入非预期文本 → 验证三层路由防线
5. **AI/IP占位测试**: 点击AI助手/IP助手 → 杠杆卡片+订阅钩子
6. **真实用户测试**: 找 3-5 个目标画像用户完整体验 onboarding 流程

---

## 十、下一步行动

1. **获取现有代码仓库** — 评估前后端现有进度
2. **获取已有的4个 Dify 工作流** — 截图或导出 DSL
3. **落地数据库 schema** — 基于§三的设计执行 migration
4. **启动 Prompt Engineering** — 这是单独的、最耗时的关键任务，需要逐个chatflow设计
