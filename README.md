# 一树OPC WeChat Mini Program (Native)

This repository is a **native WeChat Mini Program** frontend scaffold based on `PRODUCT_MANUAL.md`.

Current goal is to provide a stable base architecture first:
- native mini-program only (`wxml` / `wxss` / `js` / `json`)
- modular directories
- unified request layer
- mock switch
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
- Default mock mode is enabled (`useMock: true`).
- Mock flag is persisted in local storage key: `opc_use_mock`.

Related files:
- `utils/env.js`
- `utils/runtime.js`
- `utils/request.js`
- `utils/mock-switch.js`
- `mock/api-mock.js`

## 3. Unified Request Layer

Use `services/http.service.js` or `utils/request.js` directly.

Example:

```js
const { get } = require("../../services/http.service");

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
  fromMock: true,
  data: {}
}
```

## 4. Mock Switch

Toggle in app runtime:

```js
const app = getApp();
app.setMockEnabled(true);  // or false
```

You can also override per request:

```js
request({
  url: "/bootstrap",
  method: "GET",
  useMock: false
});
```

## 5. Pages Scope (Scaffold Stage)

Pages currently registered in `app.json`:
- `pages/welcome/welcome`
- `pages/conversation/conversation`
- `pages/profile/profile`
- `pages/project-detail/project-detail`
- `pages/tree/tree`
- `pages/share-preview/share-preview`

This keeps the app aligned with "conversation as OS" and avoids implementing all prototype screens as independent pages too early.

## 6. Development Notes

1. Open this folder directly in WeChat DevTools.
2. Keep WeChat native implementation only.
3. Prefer adding new business capabilities as conversation scenes before adding new pages.
4. Keep API contracts updated in `API_CONTRACT.md`.
5. Track implementation progress in `TODO.md`.
