# API Contract（冻结接口版）

更新时间：2026-04-03

## 1. 冻结范围（本轮必须遵守）

本轮目标是“前端接口全量接入与联调闭环”，并且**不改变后端接口定义、不改变现有 service 导出签名**。

冻结规则：

1. 后端端点冻结
- URL 不变
- Method 不变
- 请求字段语义不变
- 响应字段语义不变

2. 现有 service 导出冻结
- 已有函数名不变
- 已有入参不变
- 已有返回语义不变

3. 仅允许增量
- 可以新增可选函数（不影响旧调用方）
- 可以增强内部实现（mock 覆盖、容错、状态收口）

---

## 2. Request 层统一约定

### 2.1 统一入口
- Runtime request：`utils/request.js`
- Service facade：`services/request.js`
- 兼容导出：`services/http.service.js`

### 2.2 Runtime 配置
来源：`utils/env.js` + `utils/runtime.js`

```ts
type RuntimeConfig = {
  env: "dev" | "staging" | "prod";
  baseURL: string;
  timeout: number;
  mockDelay: number;
  useMock: boolean;
}
```

### 2.3 mock / real 切换
通过 `services/request.js`：
- `isMockMode()`
- `setRequestMockMode(enabled: boolean)`
- `toggleRequestMockMode()`

持久化 key：`opc_use_mock`

### 2.4 统一响应结构（request 层）

```ts
type ApiResponse<T> = {
  ok: boolean;
  statusCode: number;
  fromMock: boolean;
  data?: T;
  message?: string;
  raw?: unknown;
}
```

说明：
- 若后端返回 `{ code, message, data }`，request 层会自动解包为上面的 `ApiResponse<T>`。
- `code === 0` 视为成功；`code !== 0` 视为业务失败（`ok=false`）。

---

## 3. 服务层冻结清单（已有导出保持兼容）

本轮按 AGENTS.md 要求，保持以下服务文件已有导出稳定：

- `services/auth.service.js`
- `services/user.service.js`
- `services/chat.service.js`
- `services/project.service.js`
- `services/result.service.js`
- `services/company.service.js`
- `services/task.service.js`
- `services/growth.service.js`
- `services/report.service.js`
- `services/share.service.js`

备注：
- 允许新增可选函数，但不删改旧导出。
- 页面禁止直接请求网络，统一走 services。

---

## 4. 后端端点冻结清单（按 `backend/src` 控制器）

### 4.1 Auth
- `POST /auth/wechat-login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

### 4.2 User
- `GET /user`
- `PATCH /user/profile`
- `GET /user/sidebar`

### 4.3 Chat
- `GET /chat/scenes/:sceneKey`
- `POST /chat/messages`
- `POST /chat/stream/start`
- `GET /chat/stream/:streamId`

### 4.4 Project / Result
- `GET /projects`
- `POST /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`
- `GET /projects/:projectId/results`
- `GET /results/:resultId`
- `POST /results/share`

### 4.5 Company
- `GET /company/cards`
- `GET /company/panel`
- `POST /company/actions/:actionId`

### 4.6 Task
- `GET /tasks/daily`
- `POST /tasks/:taskId/complete`
- `POST /tasks/feedback`

### 4.7 Growth
- `GET /growth/tree`
- `GET /growth/milestones/current`
- `GET /growth/milestones/:milestoneId`

### 4.8 Report
- `GET /reports/weekly`
- `GET /reports/monthly`
- `GET /reports/social-proof`
- `GET /milestone/current`
- `GET /tree/milestones`

### 4.9 Share
- `GET /share/preview`
- `POST /share/generate-image`
- `POST /share/caption`

### 4.10 Legacy（兼容保留）
- `GET /bootstrap`
- `GET /sidebar`
- `GET /profile`
- `GET /conversation/home`
- `GET /conversation/onboarding`
- `GET /conversation/ai`
- `GET /conversation/ip`

---

## 5. 页面 - 服务 - 端点映射（主交付链路）

| 页面/链路 | Service 调用 | 端点 |
|---|---|---|
| welcome -> conversation | 页面跳转 | - |
| conversation 启动 | `fetchBootstrap`、`fetchCompanyCards` | `/bootstrap`、`/company/cards` |
| conversation 场景拉取 | `fetchConversationSceneRemote` | `/chat/scenes/:sceneKey` |
| conversation 发送消息 | `startChatStream` + `pollChatStream`（主）；`sendChatMessage`（兼容） | `/chat/stream/start` + `/chat/stream/:streamId`；`/chat/messages` |
| conversation 每日任务 | `fetchDailyTasks`、`completeTask`、`fetchTaskFeedback` | `/tasks/daily`、`/tasks/:taskId/complete`、`/tasks/feedback` |
| conversation 公司 CTA 回流 | `executeCompanyAction` | `/company/actions/:actionId` |
| 项目详情/成果 | `fetchProjectDetail`、`fetchProjectResults`、`fetchResultDetail`、`shareResultCard` | `/projects/:id`、`/projects/:id/results`、`/results/:id`、`/results/share` |
| 个人档案 | `fetchProfile`、`fetchCurrentUser` | `/profile`、`/user` |
| 成长树 | `fetchGrowthTree`、`fetchGrowthMilestoneById` | `/growth/tree`、`/growth/milestones/:id` |
| 周报/月检/召回/里程碑 | `fetchWeeklyReport`、`fetchMonthlyCheck`、`fetchSocialProof`、`fetchMilestone` | `/reports/weekly`、`/reports/monthly`、`/reports/social-proof`、`/milestone/current` |
| 分享预览与生成 | `fetchSharePreview`、`buildShareCaption`、`generateShareImage` | `/share/preview`、`/share/caption`、`/share/generate-image` |

---

## 6. Legacy 与 v1 并存策略

1. 当前策略
- legacy 端点（`/bootstrap`、`/sidebar`、`/conversation/*`）继续保留，承担兼容职责。
- 新域端点（`/chat/*`、`/growth/*`、`/share/*` 等）作为主链路。

2. 迁移原则
- 新功能优先接新域端点。
- legacy 仅兜底，不阻断主链路。

3. 下线条件
- 页面主链路完成迁移并稳定后，再评估下线 legacy。

---

## 7. Mock 覆盖范围（与控制器一致）

`mock/api-mock.js` 已覆盖：
- auth / user / chat / project / result / company / task / growth / report / share
- legacy 兼容：`/bootstrap`、`/sidebar`、`/profile`、`/conversation/*`
- 健康接口：`/`、`/health`

### 7.1 聊天流式 mock 事件
`/chat/stream/start` + `/chat/stream/:streamId` 支持：
- `meta`
- `token`
- `message`
- `done`
- `error`（输入包含 `mock-error` 触发）

用于验证：
- token 逐步落地
- done 收尾
- error 分支容错

---

## 8. 页面状态与容错策略

1. 主页面统一三态
- `loading`
- `empty`
- `error`（带 retry）

2. fallback 规则
- 仅在请求失败时使用 fallback。
- 不覆盖真实接口成功结果。

3. 页面请求约束
- 页面/组件禁止直接 `wx.request`。
- 所有请求统一走 `services/*`。

---

## 9. 本轮交付边界

- 目标：接口接入完整性 + 链路稳定性
- 非目标：视觉重构、业务流程重设计
- 允许：小范围无感知修复（响应解包、状态收口、mock补齐）
