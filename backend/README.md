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
- `DEV_MOCK_WECHAT_LOGIN`: 本地联调时默认走 mock 登录（开启后会优先跳过微信 code2Session）
- `DEV_MOCK_DIFY`: 本地未接通 Dify 时允许聊天受控降级
- `DIFY_ENABLED`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `DIFY_SNAPSHOT_TTL_MINUTES`: Dify 快照上下文刷新 TTL，默认 `15`
- `ROUTER_CHATFLOW_ID_MASTER` / `ROUTER_CHATFLOW_ID_ASSET` / `ROUTER_CHATFLOW_ID_EXECUTION` / `ROUTER_CHATFLOW_ID_MINDSET` / `ROUTER_CHATFLOW_ID_STEWARD`
- `DIFY_API_KEY_MASTER` / `DIFY_API_KEY_EXECUTION` / `DIFY_API_KEY_MINDSET` / `DIFY_API_KEY_STEWARD`
- `DIFY_API_KEY_ASSET_FIRST` / `DIFY_API_KEY_ASSET_RESUME` / `DIFY_API_KEY_ASSET_REVIEW` / `DIFY_API_KEY_ASSET_REPORT`

说明：

- 如果不配置按模块拆分的 `DIFY_API_KEY_*`，Router 会继续回退到全局 `DIFY_API_KEY`
- 资产盘点模块不再使用 `DIFY_API_KEY_ASSET` 这类单一资产 key，当前只认下面 4 个独立工作流 key
- `DIFY_API_KEY_ASSET_FIRST` 对应 `1-首次资产盘点流.dsl.yml`
- `DIFY_API_KEY_ASSET_RESUME` 对应 `2-断点续盘流.dsl.yml`
- `DIFY_API_KEY_ASSET_REVIEW` 对应 `3-复盘更新流.dsl.yml`
- `DIFY_API_KEY_ASSET_REPORT` 对应 `4-报告生成流.dsl.yml`
- 当前配置层只会读取这 4 个资产子工作流 key；其中 `DIFY_API_KEY_ASSET_REPORT` 用于 Workflow 模式的报告生成应用
- `ROUTER_CHATFLOW_ID_*` 是后端暴露给前端和状态层的“模块标识”，不要求等于 Dify 内部 app id，建议保持稳定命名
- 若要启用 Dify 快照注入，相关 Dify 应用需声明输入变量与会话变量：`context_version`、`context_refreshed_at`、`snapshot_meta`、`user_profile`、`weekly_report`、`monthly_report`、`growth_context`
- Dify 对话续聊时会忽略新的 `inputs`，请在各 chatflow 开始节点后用 `Variable Assigner` 把这些输入变量覆盖写入同名会话变量

## 资产盘点流 Dify 配置说明

当前仓库里的正式 DSL 是根目录的 `资产盘点流.dsl.yml`，手工调试版是 `资产盘点流.debug.dsl.yml`。

### 开始节点输入类型

由于当前使用的 Dify 版本对 `advanced-chat + json_object` 输入兼容性一般，资产盘点流里这组快照上下文统一按字符串传入：

- `context_version`: `text-input`
- `context_refreshed_at`: `text-input`
- `snapshot_meta`: `paragraph`
- `user_profile`: `paragraph`
- `weekly_report`: `paragraph`
- `monthly_report`: `paragraph`
- `growth_context`: `paragraph`

对应地，后端会把复杂快照序列化成 JSON 字符串后再注入 Dify。

### 会话变量

各 Dify 应用需要声明同名会话变量：

- `context_version`
- `context_refreshed_at`
- `snapshot_meta`
- `user_profile`
- `weekly_report`
- `monthly_report`
- `growth_context`
- `inventory_stage`
- `profile_snapshot`
- `dimension_reports`
- `next_question`
- `report_brief`
- `final_report`

### 开始节点后的初始化

在开始节点后放一个条件节点判断 `context_version` 是否存在：

- 首轮有输入时，把开始节点输入覆盖写入同名会话变量
- 续聊时直接使用已有会话变量

### 继续追问回复节点

`继续追问回复` 不能只输出 `followup_message`，否则当前端拿到的就是“铺垫半句”，真实问题会丢在 `next_question` 里。

当前正确写法是：

```yaml
answer: |-
  {{#3000000000002.structured_output.followup_message#}}

  {{#3000000000002.structured_output.next_question#}}
```

如果 Dify 里还是旧流程，请重新导入 DSL 并重新发布，否则前端仍会看到不完整追问。

## Prisma Studio 查看用户画像

本地查看数据库推荐直接用 Prisma Studio：

```bash
cd backend
npx prisma studio --port 5555
```

打开 `http://localhost:5555` 后：

1. 在 `User` 表中筛选 `loginMode = dev-fresh-user`
2. 找到当前模拟新用户的 `id`
3. 进入 `ReportSnapshot` 表
4. 筛选：
   - `kind = PROFILE`
   - `userId = 该用户 id`
5. 打开记录里的 `data` 字段，即可查看画像 JSON

如果要核对某段对话是不是属于这个用户，再去 `Message` 表按 `userId` 过滤即可。

注意：

- 聊天消息会先写入 `Message`
- `PROFILE` 快照只有在调用 `/profile` 时才会重新计算并写回 `ReportSnapshot`
- `ASSET_INVENTORY` 快照会在调用 `/profile` 或 `/asset-inventory` 时刷新基础结构
- 当资产盘点模块通过 Router 命中 `asset` Dify 应用时，后端会在每轮回复后回读 Dify 会话变量，并把 `inventory_stage`、`profile_snapshot`、`dimension_reports`、`next_question`、`report_brief`、`final_report` 同步进 `ReportSnapshot(kind=ASSET_INVENTORY).data.flowState`
- 所以如果你刚完成一轮资产盘点对话，想看最新画像，先用当前用户登录态请求一次 `GET /profile`，再刷新 Prisma Studio
- 如果你想直接看结构化资产档案，可请求 `GET /asset-inventory`

## 微信登录联调清单

若当前是本地联调模式，请先确保 `DEV_MOCK_WECHAT_LOGIN=true`，避免被微信凭证问题阻塞。

若需要真实微信登录，请先将 `DEV_MOCK_WECHAT_LOGIN=false`，再检查以下三项一致：

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
