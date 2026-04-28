# 稳定基础记忆

## 项目定位

- 项目名：一树 OPC
- 形态：面向创业者的一人公司助手型微信小程序
- 核心理念：`Conversation as OS`
- 当前目标不是多端铺开，而是把微信小程序主链路做成可运行、可联调、可上线的产品

## 当前应视为事实的技术基线

- 前端：原生微信小程序，使用 `wxml` / `wxss` / `js` / `json`
- 后端：Node.js
- 数据库：PostgreSQL
- AI 编排：Dify
- 当前仓库主导方向：真实 API 优先，避免主链路默默 fallback 到本地 mock

## 产品结构原则

- 以对话页为主操作系统，而不是把原型拆成大量独立主页面
- 新能力优先作为 conversation scene 接入，而不是先加新页面
- 登录、引导、聊天、项目推进、报告、分享，应尽量连成一条真实业务链

## 当前系统里的关键模块

- 前端主页面包括：
  - `pages/welcome/welcome`
  - `pages/conversation/conversation`
  - `pages/profile/profile`
  - `pages/project-detail/project-detail`
  - `pages/tree/tree`
  - `pages/share-preview/share-preview`
- 后端承担鉴权、router、chat、profile、report、share、memory 等能力
- Dify 已是核心编排层，不只是辅助实验组件

## 记忆架构的稳定认识

当前项目的记忆设计是“多层记忆并存”，不是只靠一份摘要：

- `L0` 原始消息：`Message`
- `L0.5` 会话窗口：`SessionContextEntry`
- `L1` 原子事实：`UserFact`
- `L2` 对话摘要：`ChatflowSummary`
- `L3` 聚合画像：`UserProfile`

运行上的稳定规则：

- 每轮对话会组装 Layer A/B/C 形成 `memoryBlock`
- 事实抽取、摘要、画像更新大多是异步 fire-and-forget
- Dify snapshot 注入和 A/B/C 三层记忆目前并存

## Dify 与业务流的稳定认识

- 资产盘点已经不是单个 prompt，而是多工作流协同
- 当前至少有 4 个资产盘点相关工作流：
  - 首次盘点
  - 断点续盘
  - 复盘更新
  - 报告生成
- Router 与 chatflow 的职责需要分开：
  - 路由层负责分流、引导话术、快捷回复、切换时机
  - chatflow 层负责内部追问、结构化输出、报告生成

## 合规与上线约束

以下不只是“待办”，而是长期必须成立的约束：

- 生产环境必须有真实 `DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGIN`、`PUBLIC_BASE_URL`
- 必须有真实 `WECHAT_APP_ID` 与 `WECHAT_APP_SECRET`
- `trial` / `release` 必须使用真实 HTTPS 域名
- 登录协议页、隐私页、AIGC 标识、内容安全是上线红线，不是锦上添花

## 处理文档冲突时的规则

- 如果旧文档与当前代码冲突，以当前代码为准
- 如果产品蓝图与当前实现冲突，默认把蓝图视为“目标态”，不是“现状”
- 早期架构文档可以保留方法论和职责划分，但不要直接复用其中过时的技术栈描述
