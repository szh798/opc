# OPC Backend

当前后端已切到 `NestJS + Prisma + PostgreSQL`，不再以 `InMemoryDataService` 作为主运行时数据源。

## 本地启动

1. 准备数据库连接：

```bash
cd backend
cp .env.example .env
```

2. 启动 Postgres。

如果你的当前账号可访问 Docker：

```bash
npm run db:compose:up
```

如果你已经有本机 Postgres，直接把 `.env` 里的 `DATABASE_URL` 改成正确连接即可。

3. 执行迁移并灌入演示数据：

```bash
npm run db:deploy
npm run db:seed
```

4. 启动后端：

```bash
npm run dev
```

## 常用脚本

```bash
npm run typecheck
npm run build
npm run smoke
npm run db:generate
npm run db:migrate
npm run db:deploy
npm run db:seed
npm run install:proxy
npm run prisma:generate:proxy
npm run typecheck:proxy
npm run build:proxy
npm run test:phase4:proxy
```

## Windows 代理网络（Prisma/依赖下载超时时使用）

如果 DNS 解析到 `198.18.x.x` 或出现 `ETIMEDOUT / ECONNRESET`，可直接使用代理脚本：

```bash
npm run install:proxy
npm run test:phase4:proxy
```

默认代理地址是 `http://127.0.0.1:7897`。如需自定义：

```bash
set OPC_PROXY_URL=http://127.0.0.1:7897
set OPC_NPM_REGISTRY=https://registry.npmmirror.com
set OPC_PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
```

## 关键环境变量

- `DATABASE_URL`: PostgreSQL 连接串
- `STORAGE_DIR`: 分享海报等文件的本地存储目录
- `DEV_MOCK_WECHAT_LOGIN`: 本地没有微信正式凭证时允许 mock 登录
- `DEV_MOCK_DIFY`: 本地未接通 Dify 时允许聊天受控降级
- `DIFY_ENABLED`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `ROUTER_CHATFLOW_ID_MASTER` / `ROUTER_CHATFLOW_ID_ASSET` / `ROUTER_CHATFLOW_ID_EXECUTION` / `ROUTER_CHATFLOW_ID_MINDSET` / `ROUTER_CHATFLOW_ID_STEWARD`
- `DIFY_API_KEY_MASTER` / `DIFY_API_KEY_ASSET` / `DIFY_API_KEY_EXECUTION` / `DIFY_API_KEY_MINDSET` / `DIFY_API_KEY_STEWARD`

说明：

- 如果不配置按模块拆分的 `DIFY_API_KEY_*`，Router 会继续回退到全局 `DIFY_API_KEY`
- 如果配置了 `DIFY_API_KEY_MASTER` 和 `DIFY_API_KEY_ASSET`，`master` 与 `asset` 就能真正打到两个不同 Dify 应用
- `ROUTER_CHATFLOW_ID_*` 是后端暴露给前端和状态层的“模块标识”，不要求等于 Dify 内部 app id，建议保持稳定命名

## 微信登录联调清单

真实微信登录要同时满足这三项一致：

- `backend/.env` 中的 `WECHAT_APP_ID`
- `backend/.env` 中的 `WECHAT_APP_SECRET`
- 微信开发者工具当前工程详情页里的 `AppID`

常见报错：

- `invalid appsecret`: 后端 `AppSecret` 不对，或和 `AppID` 不匹配
- `invalid code`: 开发者工具当前工程 `AppID` 不对，或登录凭证已失效
- `code been used`: 同一个 `code` 被重复提交
- `code expired`: 登录凭证过期，需要重新点登录

验收标准：

- `POST /auth/wechat-login` 返回 `201`
- 后续 `/auth/me`、`/bootstrap` 能拿到登录态

## 当前行为说明

- `/bootstrap`、`/sidebar`、`/profile` 支持 guest/demo 数据回退
- `/user`、`/projects*`、`/tasks*`、`/growth/*`、`/reports/*`、`/share/*`、`/chat/messages`、`/chat/stream/*` 走鉴权
- `/chat/scenes/:sceneKey` 保持可选鉴权，便于前端在未登录时做本地场景回退
- Dify 关闭且 `DEV_MOCK_DIFY=false` 时，聊天接口会返回明确错误，不再静默返回 mock 文案
- `/router/*` 现在会把模块级 provider 会话与 handoff 摘要写入 `ConversationState.parkingLot`，用于主流和子流之间的上下文接力
- Router 会优先读取当前模块自己的 Dify conversation id，不再让多个模块共用同一个 provider 会话

## 内测 Smoke Checklist

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

也可以直接运行：

```bash
npm run smoke
```

如果要验证鉴权接口和聊天流，请传入真实 refresh token：

```bash
SMOKE_BASE_URL=https://api.your-domain.com \
SMOKE_REFRESH_TOKEN=your-refresh-token \
SMOKE_CHAT_MESSAGE="你好，请介绍一下你自己" \
npm run smoke
```

联调时重点确认：

- 微信登录返回 `201`
- `/chat/stream/start` 返回 `201`
- `/chat/stream/:streamId` 返回真实 token 流
- `/profile`、`/reports/weekly`、`/reports/monthly`、`/share/preview`、`/projects/:id` 都能在真实接口下返回数据

## 体验版上线前必须检查

- 前端 `trial` / `release` 环境已改为真实 HTTPS API 域名
- 微信公众平台已配置合法 request 域名
- 真实 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 已配置
- Dify 工作流已发布且能稳定返回
- 登录页协议链接已指向真实页面/真实文案
