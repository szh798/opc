# 一树OPC 发布前检查清单

这份清单分成两层：

1. 自动化预检：复核环境变量、前端域名、构建、迁移、router 回归和 smoke。
2. 人工签核：覆盖微信体验版验收、外部依赖异常演练、回滚与告警。

## 1. 自动化预检

首次执行或 CI 环境：

```bash
cd backend
npm run release:check
```

重复执行或本机已安装依赖：

```bash
cd backend
npm run release:check -- --skip-install
```

只做静态配置检查：

```bash
cd backend
npm run release:check -- --static-only
```

自动化预检默认会检查并执行：

- 生产必填环境变量：`DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGIN`、`PUBLIC_BASE_URL`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`
- 小程序运行配置需填写订阅消息模板：`projectFollowupTemplateId`
- 开发开关已关闭：`ALLOW_DEV_FRESH_USER_LOGIN`、`ALLOW_MOCK_WECHAT_LOGIN`、`DEV_MOCK_DIFY`
- 前端 `trial` / `release` 域名必须是非本地的 HTTPS 地址
- `STORAGE_DIR` 可写
- `backend/.env` 与 `utils/runtime-config.local.js` 未被 git 跟踪
- 后端存在 `rate-limit`、`x-request-id`、`/health`、`/ready`、生产 CORS 保护
- `npm run typecheck`
- `npm run build`
- `npm run test:router-contract`
- `npm run test:dify-timeout`
- `npm run db:deploy`
- `npm run smoke`

说明：

- `SMOKE_REFRESH_TOKEN` 未提供时，`npm run smoke` 只覆盖 guest 接口；正式放行前请补做一次真实登录态 smoke。
- `db:seed` 默认不在发布前检查里执行。只有在本次发版明确需要种子数据且已验证幂等时，才单独执行。

## 2. 生产环境配置

- 在部署系统中配置真实 `DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGIN`、`PUBLIC_BASE_URL`
- 配置真实 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`，并在小程序运行配置中填入项目跟进订阅模板 ID。
- 按实际启用状态配置：
  - `DIFY_ENABLED`
  - `DIFY_API_BASE_URL`
  - `DIFY_API_KEY*`
  - `ZHIPU_API_KEY`
  - `POLICY_SEARCH_*`
- 若启用记忆抽取、摘要、画像增强、digest cron，必须同时配置 `ZHIPU_API_KEY`
- 前端如使用本地覆盖文件，复制 `utils/runtime-config.local.example.js` 为 `utils/runtime-config.local.js`
- 在微信公众平台配置合法 request 域名

## 3. 体验版人工验收

- 登录卡片可打开《用户协议》《隐私政策》
- 微信登录返回 `201`
- `/auth/me`、`/bootstrap` 可拿到真实登录态
- 主对话可正常流式回复
- 项目详情页可继续聊天且上下文延续
- `Profile / Projects / Growth / Reports` 返回真实数据
- 分享海报或分享预览可生成

## 4. 异常演练

- Dify 超时或失败时，接口返回可诊断错误
- 微信登录 `invalid code` / `code expired` 时，返回明确鉴权失败
- 数据库短暂不可用时，`/ready` 失败且告警触发
- 若启用了 `POLICY_SEARCH_ENABLED`，生产 provider 不能是 `mock`

## 5. 观测与回滚

- 生产日志能关联 `x-request-id`
- 5xx、超时、进程退出、数据库连接失败已配置告警
- 多实例部署时，确认 `DIGEST_CRON_ENABLED` 只有唯一执行者
- 发布前完成数据库备份
- 保留上一个稳定版本镜像/包和环境变量快照
- 明确回滚负责人、入口命令和预计恢复时间

## 6. 签核记录

人工签核请使用 [LAUNCH_SIGNOFF_TEMPLATE.md](/home/lu/Desktop/opc-latest/LAUNCH_SIGNOFF_TEMPLATE.md)。
