# API Contract (Native WeChat Mini Program)

Last updated: 2026-03-31

This document defines the unified frontend API layer for the mini program.

## 1. Runtime & Request

### 1.1 Unified request entry

- Main request runtime: `utils/request.js`
- Service-level request facade: `services/request.js`
- Legacy compatibility export: `services/http.service.js`

### 1.2 Runtime config

From `utils/env.js` + `utils/runtime.js`:

```ts
type RuntimeConfig = {
  env: "dev" | "staging" | "prod";
  baseURL: string;         // default https://api.opc.local
  timeout: number;         // default 10000
  mockDelay: number;       // default 180ms
  useMock: boolean;        // default true
}
```

### 1.3 Mock switch

- `services/request.js`:
  - `isMockMode()`
  - `setRequestMockMode(enabled: boolean)`
  - `toggleRequestMockMode()`
- Persisted by `utils/mock-switch.js` + local storage key `opc_use_mock`

### 1.4 Unified response envelope

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

## 2. Service Map

Implemented services:

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

## 3. Endpoint Contract By Domain

## 3.1 Auth

- `POST /auth/wechat-login`
  - Request: `{ code?: string, encryptedData?: string, iv?: string }`
  - Notes:
    - `code` 来自 `wx.login()`
    - `encryptedData` 和 `iv` 为可选，但必须同时传，后端会用它们解密微信用户资料
  - Response:
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 7200,
    "user": {}
  }
  ```

- `POST /auth/refresh`
  - Request: `{ refreshToken?: string }`
  - Response:
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "expiresIn": 7200
  }
  ```

- `GET /auth/me`
  - Response: user profile summary.

- `POST /auth/logout`
  - Response: `{ "success": true }`

## 3.2 User

- `GET /user`
  - Response:
  ```json
  {
    "id": "string",
    "name": "string",
    "nickname": "string",
    "initial": "string",
    "stage": "string",
    "streakDays": 0
  }
  ```

- `PATCH /user/profile`
  - Request: partial user fields
  - Response: merged user object

- `GET /user/sidebar`
  - Response:
  ```json
  {
    "user": {},
    "projects": [],
    "tools": [],
    "recentChats": []
  }
  ```

## 3.3 Chat

- `GET /chat/scenes/:sceneKey`
  - `sceneKey`: `home | onboarding | ai | ip | ...`
  - Response:
  ```json
  {
    "agentKey": "master",
    "messages": [],
    "quickReplies": []
  }
  ```

- `POST /chat/messages`
  - Request:
  ```json
  {
    "conversationId": "string",
    "sceneKey": "string",
    "userMessageId": "string",
    "message": "string"
  }
  ```
  - Response:
  ```json
  {
    "conversationId": "string",
    "userMessageId": "string",
    "assistantMessage": {
      "id": "string",
      "type": "agent",
      "text": "string"
    }
  }
  ```

- `POST /chat/stream/start`
  - Request:
  ```json
  {
    "conversationId": "string",
    "sceneKey": "string",
    "message": "string"
  }
  ```
  - Response:
  ```json
  {
    "streamId": "string",
    "conversationId": "string",
    "status": "streaming"
  }
  ```

- `GET /chat/stream/:streamId`
  - Response: stream events array.

### Stream Event Structure (reserved)

```ts
type ChatStreamEvent =
  | { type: "meta"; streamId: string; createdAt: number }
  | { type: "token"; streamId: string; token: string; index: number }
  | { type: "message"; streamId: string; message: { id: string; text: string } }
  | { type: "heartbeat"; streamId: string; ts: number }
  | { type: "error"; streamId: string; message: string; code?: string }
  | { type: "done"; streamId: string; usage?: { promptTokens: number; completionTokens: number } };
```

## 3.4 Project

- `GET /projects`
- `POST /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`

`GET /projects/:projectId` response:

```json
{
  "id": "media-service",
  "name": "自媒体写作服务",
  "conversation": [],
  "conversationReplies": [],
  "artifacts": []
}
```

## 3.5 Result

- `GET /projects/:projectId/results`
- `GET /results/:resultId`
- `POST /results/share`

`POST /results/share` response:

```json
{
  "success": true,
  "shareId": "share-xxxx"
}
```

## 3.6 Company

- `GET /company/cards`
- `GET /company/panel`
- `POST /company/actions/:actionId`

`GET /company/panel` response:

```json
{
  "title": "我的公司",
  "cards": []
}
```

## 3.7 Task

- `GET /tasks/daily`
- `POST /tasks/:taskId/complete`
- `POST /tasks/feedback`

`POST /tasks/feedback` response:

```json
{
  "messages": [],
  "quickReplies": []
}
```

## 3.8 Growth

- `GET /growth/tree`
- `GET /growth/milestones/current`
- `GET /growth/milestones/:milestoneId`

`GET /growth/tree` response:

```json
{
  "overview": {},
  "milestones": []
}
```

## 3.9 Report

- `GET /reports/weekly`
- `GET /reports/monthly`
- `GET /reports/social-proof`
- `GET /milestone/current`
- `GET /tree/milestones`

## 3.10 Share

- `GET /share/preview`
- `POST /share/generate-image`
- `POST /share/caption`

`POST /share/generate-image` response:

```json
{
  "posterId": "poster-xxxx",
  "imageUrl": "https://..."
}
```

## 3.11 Legacy Compatibility Endpoints

These are still supported during migration:

- `GET /bootstrap`
- `GET /sidebar`
- `GET /conversation/onboarding`
- `GET /conversation/home`
- `GET /conversation/ai`
- `GET /conversation/ip`

## 4. Compatibility & Migration Notes

- Existing page code can keep using sync getters (`getProfile`, `getProjectDetail`, etc.).
- New recommended path is async fetch API (`fetchProfile`, `fetchProjectDetail`, etc.), which already routes through unified request/mode switching.
- Conversation scene assembly logic remains in `services/conversation.service.js` and is compatible with current UI architecture.

## 5. Implemented Mock Router Coverage

`mock/api-mock.js` now covers:

- auth/user/chat/project/result/company/task/growth/report/share
- legacy endpoints (`/bootstrap`, `/sidebar`, `/conversation/*`) for backward compatibility
