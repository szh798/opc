# AIGC 算法备案材料 —— 一树 OPC

> 作用：为"深度合成服务算法备案"（互联网信息服务算法备案系统）与生成式 AI 服务登记提供底稿。
> 老板填表时按本文内容复制、按需裁剪；若监管部门要材料，也直接给本文的相关章节。
> 状态：**草稿（Phase A5）**，尚未正式提交。正式提交前需由法务或合规顾问复核。
>
> 最近更新：2026-04-20

---

## 1. 服务基本信息

| 字段 | 内容 |
|---|---|
| 服务名称 | 一树 OPC（创业者指导小程序） |
| 服务形态 | 微信小程序（首发），后续可能扩展 H5 / App |
| 面向用户 | 具备创业意愿的中国境内自然人 |
| 核心能力 | 基于个人"四维资产"（能力 / 资源 / 认知 / 关系）完成盘点与复盘，给出个性化建议、任务拆解、阶段指引 |
| 运营主体 | 待老板填写（营业执照/社会信用代码/负责人） |
| 服务上线计划 | 2026-04-30 体验版上线 |
| 主域名 | atreeagent.com（后端 API：api.atreeagent.com） |
| 小程序 AppID | 待老板填写 |

---

## 2. 使用的算法/模型清单

**重要澄清**：本项目**自身不训练模型**。所有"生成"能力都通过第三方 API 完成；项目负责 prompt 设计、业务编排、上下文管理、安全过滤。

| # | 用途 | 上游平台 | 基础模型 | 调用方式 | 备案口径 |
|---|---|---|---|---|---|
| 1 | 通用对话路由 / 资产盘点对话 / 资产复盘对话 | Dify（部署在 yunwu）| GPT-4.1 级模型（经 Dify 平台中转） | HTTPS / Server-Sent Events | 使用第三方已备案深度合成算法 |
| 2 | 资产报告生成（长文本合成） | Dify（部署在 yunwu）| DeepSeek-R1 | HTTPS workflow run | 使用第三方已备案深度合成算法 |
| 3 | 会话摘要 / 记忆抽取 / 对话标题 | 智谱 AI | glm-4 系列 | HTTPS | 使用第三方已备案深度合成算法 |
| 4 | 政策匹配 & 官方话术改写 | Dify workflow | 同 1 | 同 1 | 同 1 |

**Dify 工作流清单**（详细 YAML 见 `dify-workflows/`）：

- `asset-inventory-chatflow.yml` ——首次资产盘点对话
- `asset-review-chatflow.yml` —— 资产复盘对话
- `asset-report-workflow.yml` —— 资产报告生成
- `growth-question-chatflow.yml` —— 成长疑问咨询（通用问答）
- `opportunity-signal-chatflow.yml` —— 机会信号识别
- `policy-matcher-chatflow.yml` —— 政策匹配
- `task-decomposition-chatflow.yml` —— 任务拆解

---

## 3. 训练数据来源

**本项目不做模型训练，也不做模型微调**；所有训练数据问题归属于上游模型提供方（OpenAI / DeepSeek / 智谱）。

本项目自有的"语料资产"仅限于：

1. **Prompt 与工作流配置**：由项目团队原创撰写，无第三方抓取或版权素材（见 `dify-workflows/*.yml`）。
2. **专家规则蒸馏文档**：来自老板与顾问的访谈整理（见 `资产盘点流_专家规则蒸馏.md`），属团队内部知识产权。
3. **知识库**：当前版本无 RAG 检索库；未来若接入，会单独补充本章节。

用户产生的对话数据在本系统内用于：

- 持久化到 PostgreSQL，用于用户下次回来时的记忆延续
- 在会话窗口内回传给上游模型作为 context

**明确不做**：将用户数据打包回流给上游模型用于训练、将用户数据出售/共享给第三方营销。用户协议中需写明这一点。

---

## 4. 安全评估

### 4.1 生成内容安全（内容合规）

| 风险 | 技术措施 | 代码位置 |
|---|---|---|
| 用户输入夹带违规（色情、政治、辱骂、prompt injection） | 微信 msgSecCheck v2 前置过滤 | `backend/src/shared/content-security.service.ts` |
| 用户昵称违规 | msgSecCheck scene=1 | `backend/src/user.service.ts:updateCurrentUser` |
| 模型输出越界（幻觉、违法建议） | (1) Prompt 层面在系统提示中限定领域与禁区 (2) 后续 Phase A 迭代补输出侧 msgSecCheck（受 QPS 与长度限制，暂未开启） | 各 chatflow YAML 系统提示 |
| AIGC 内容未显著标识 | 助手对话气泡尾部"AI 生成"标签；资产报告头部"AI 生成 · 仅供参考"标签 | `components/chat/message-bubble/`、`pages/profile/profile.wxml` |

### 4.2 滥用防护（反刷量、反资源耗尽）

| 风险 | 技术措施 | 代码位置 |
|---|---|---|
| 单用户高频刷接口 | Fastify 全局 rate limit：100 req/min per userId/IP | `backend/src/main.ts` |
| 单用户每日过度调用高成本工作流 | per-user 每日配额：资产盘点 3 次/日、资产报告 5 次/日、对话消息 500 条/日 | `backend/src/shared/quota.service.ts` |
| 上游 Dify 抽风导致服务雪崩 | Dify apiKey 级熔断，60s 内连续失败 5 次自动停用 10 分钟 | `backend/src/dify.service.ts` |
| 资源耗尽 / 成本失控 | 每次 Dify 调用写入 `DifyUsageLog`（tokens、latency、cost）；Phase B 看板消费 | `backend/src/shared/dify-usage-tracker.ts` |

### 4.3 用户数据安全

| 维度 | 现状 |
|---|---|
| 登录认证 | 微信 code2session + 项目侧 JWT（短时 access + 长时 refresh） |
| 账户数据存储 | PostgreSQL（字段加密待 Phase F 补） |
| 对话数据传输 | 全链路 HTTPS（后端 `api.atreeagent.com` 全站 TLS） |
| 匿名访问 | 未登录用户只走 anonymous bootstrap，不落库，不返回任何真实用户数据 |
| 数据删除请求响应 | Phase E 通过 admin 后台 + 客服工单处理（当前无自助删号入口） |

### 4.4 未成年人保护

- 小程序登录依赖微信身份，小于 14 岁用户由微信侧识别。
- 产品定位是"创业者指导"，用户协议中需声明仅向 18 岁以上具备民事行为能力的自然人提供。
- 不做面向未成年人的推广投放。

---

## 5. AIGC 显著标识方案

**合规依据**：《生成式人工智能服务管理暂行办法》第 17 条、《互联网信息服务深度合成管理规定》第 17 条。

### 5.1 标识形式

1. **对话气泡**：AI 助手每一条非占位回复的末尾，渲染"AI 生成"小标签（灰色，右下角）。
   - 代码：`components/chat/message-bubble/message-bubble.wxml`
   - 样式：`components/chat/message-bubble/message-bubble.wxss :: .message-bubble__aigc-tag`
2. **资产报告**：报告卡片头部固定渲染"AI 生成 · 仅供参考"标签（紫色底，1rpx 边框）。
   - 位置 1：`pages/profile/profile.wxml`（个人主页详细报告）
   - 位置 2：`components/asset-report-sheet/asset-report-sheet.wxml`（对话内拉起的资产雷达弹层）
3. **分享卡片 / 截图导出**（待 Phase E 补完）：在分享图下方刻水印"内容由一树 AI 生成"。
4. **语音 / 视频**：当前不支持 AI 语音或视频输出；若未来接入需在媒体内嵌隐式水印（按规定）。

### 5.2 用户协议中的提示

需要在《用户服务协议》《隐私政策》中增补：

- 本服务基于生成式 AI 技术输出内容，结果可能存在不准确、不完整或与实际情况不符的情况，请在使用前自行核实。
- 本服务不保证 AI 生成内容能解决具体商业/法律/投资问题，重大决策建议咨询专业人士。
- 用户在服务中输入的内容将被传递至第三方深度合成服务提供方（Dify / 智谱）用于生成响应；不会被本项目用于训练。
- 严禁利用本服务生成违法违规内容；一经发现立即封禁账户并依法处置。

---

## 6. 投诉与应急机制

| 场景 | 响应路径 | 负责人 |
|---|---|---|
| 用户举报违规内容 | 小程序内反馈入口（`/tasks/feedback`）→ 后端 `TaskFeedback` 表 → admin 后台（Phase E）人工审核 | 运营 |
| 监管部门正式函件 | 邮箱 compliance@atreeagent.com（待老板申请） → 老板 72h 内响应 | 老板 |
| 服务器事故 / 数据泄漏 | 内部事故响应 SOP（Phase F 文档） | 技术负责人 |
| 模型输出严重违规 | 临时下线对应工作流（Feature flag，Phase D），同步调整 prompt 与内容过滤后复上 | 技术负责人 |

---

## 7. 变更与版本

| 日期 | 变更 |
|---|---|
| 2026-04-20 | 草稿初版，对齐 Phase A 工程落地项 |

---

## 附录：待补项（提交前 TODO）

- [ ] 老板补全第 1 节"运营主体"信息
- [ ] 法务/合规顾问复核本文各章节表述
- [ ] 《用户服务协议》与《隐私政策》按第 5.2 节补充 AIGC 说明
- [ ] 申请 compliance@atreeagent.com 邮箱
- [ ] 输出模型侧 msgSecCheck 通路评估（QPS、延迟、分段处理方案）
- [ ] 分享图 AIGC 水印落地（Phase E）
- [ ] Admin 后台违规内容处置闭环（Phase E）
- [ ] 数据库字段级加密 / 访问审计（Phase F）
