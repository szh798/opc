# OPC Backend

面向当前微信小程序前端的后端 MVP。

## 运行

```bash
cd backend
npm install
npm run dev
```

默认端口是 `3000`。

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写：

- `PORT`
- `CORS_ORIGIN`
- `PUBLIC_BASE_URL`
- `JWT_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL`
- `ALLOW_MOCK_WECHAT_LOGIN`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

如果暂时没有微信小程序正式 `AppID/AppSecret`，保持 `ALLOW_MOCK_WECHAT_LOGIN=true` 即可本地联调。

## 微信登录说明

前端现在会优先调用 `wx.login()` 获取临时 `code`，再请求后端 `POST /auth/wechat-login`。

要启用真实微信登录，请在 `backend/.env` 中填写：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

这两个值可以在微信公众平台的小程序后台获取：

- 开发管理
- 开发设置

如果这两个值未配置，且 `ALLOW_MOCK_WECHAT_LOGIN=true`，后端会自动退回到本地 mock 登录，方便开发联调。

推荐的请求体如下：

```json
{
  "code": "wx.login() 返回的临时 code",
  "encryptedData": "可选，wx.getUserProfile 返回",
  "iv": "可选，需和 encryptedData 成对出现"
}
```

当前后端行为：

- 收到 `code` 后会调用微信 `jscode2session` 换取 `openid/session_key`
- 如果同时传入 `encryptedData + iv`，后端会解密并同步微信昵称、头像、省市等资料
- 登录成功后会返回 `accessToken`、`refreshToken`、`expiresIn` 和当前用户信息
- 调用 `POST /auth/logout` 会立即失效当前 session，不再接受旧 access token
