# 一树OPC WeChat Mini Program (Native)

This repository is a **native WeChat Mini Program** frontend scaffold based on `PRODUCT_MANUAL.md`.

Current goal is to provide a stable base architecture first:
- native mini-program only (`wxml` / `wxss` / `js` / `json`)
- modular directories
- unified request layer
- real API first
- phased delivery docs

## 1. Directory Structure

```text
.
├─ app.js
├─ app.json
├─ app.wxss
├─ pages/
├─ components/
├─ services/
├─ mock/
├─ utils/
├─ theme/
├─ assets/
├─ PRODUCT_MANUAL.md
├─ API_CONTRACT.md
├─ TODO.md
└─ FRONTEND_TASK_BREAKDOWN.md
```

## 2. Runtime Basics

- App-level runtime config is initialized in `app.js`.
- DevTools `develop` 环境默认请求本地后端：`http://127.0.0.1:3000`。
- `trial` / `release` 环境可通过 `utils/runtime-config.local.js` 覆盖成真实 HTTPS API 域名。
- Runtime mock switching is disabled for the main flow so login and chat errors are exposed directly.

Related files:
- `utils/env.js`
- `utils/runtime.js`
- `utils/request.js`
- `utils/runtime-config.local.example.js`

## 3. Unified Request Layer

Use `services/request.js` or `utils/request.js` directly.

Example:

```js
const { get } = require("../../services/request");

get("/bootstrap").then((res) => {
  if (res.ok) {
    console.log(res.data);
  }
});
```

Response shape:

```js
{
  ok: true,
  statusCode: 200,
  fromMock: false,
  data: {}
}
```

Error shape:

```js
{
  ok: false,
  statusCode: 401,
  message: "invalid code",
  raw: {}
}
```

## 4. Current Dev Flow

1. Start PostgreSQL and the backend in `backend/`.
2. Open this folder directly in WeChat DevTools.
3. Confirm the DevTools project AppID matches `backend/.env` `WECHAT_APP_ID`.
4. Use the in-chat login card to complete real mini-program login.
5. Validate chat through `/chat/stream/start` + `/chat/stream/:streamId`.

## 5. Trial / Release Config

1. Copy `utils/runtime-config.local.example.js` to `utils/runtime-config.local.js`.
2. Fill in the real HTTPS API domains for `trial` and `release`.
3. Add those domains to the mini-program合法 request 域名。
4. Keep `utils/runtime-config.local.js` out of git; it is ignored locally.

## 6. Legal Pages

- Login card now opens real in-app legal pages:
  - `pages/legal/legal?type=terms`
  - `pages/legal/legal?type=privacy`
- Before正式提审，请将文案替换为你的主体、联系方式、真实数据流说明。

## 7. Pages Scope

Pages currently registered in `app.json`:
- `pages/welcome/welcome`
- `pages/conversation/conversation`
- `pages/profile/profile`
- `pages/project-detail/project-detail`
- `pages/tree/tree`
- `pages/share-preview/share-preview`

This keeps the app aligned with "conversation as OS" and avoids implementing all prototype screens as independent pages too early.

## 8. Development Notes

1. Open this folder directly in WeChat DevTools.
2. Keep WeChat native implementation only.
3. Prefer exposing real API failures instead of local fallback data.
4. Prefer adding new business capabilities as conversation scenes before adding new pages.
5. Keep API contracts updated in `API_CONTRACT.md`.
6. Track implementation progress in `TODO.md`.
7. Use `LAUNCH_CHECKLIST.md` as the release-prep checklist.
