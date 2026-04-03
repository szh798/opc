# 一树OPC 内测上线检查清单

## 1. 生产环境配置

- 复制 `utils/runtime-config.local.example.js` 为 `utils/runtime-config.local.js`
- 填写 `trial` 和 `release` 对应的真实 HTTPS API 域名
- 在微信公众平台配置合法 request 域名
- 在后端生产环境配置真实 `DATABASE_URL`、`JWT_SECRET`、`PUBLIC_BASE_URL`
- 配置真实 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`
- 配置真实 `DIFY_API_KEY`，并确认工作流已发布

## 2. 数据与部署

- 执行 `cd backend && npm ci`
- 执行 `cd backend && npm run db:deploy`
- 执行 `cd backend && npm run db:seed`
- 执行 `cd backend && npm run build`
- 启动后端生产服务
- 确认文件存储目录 `STORAGE_DIR` 可写

## 3. 手动 Smoke

- `cd backend && npm run smoke`
- 如需完整鉴权和聊天验证，额外提供：
  - `SMOKE_BASE_URL`
  - `SMOKE_REFRESH_TOKEN`
  - `SMOKE_CHAT_MESSAGE`

示例：

```bash
cd backend
SMOKE_BASE_URL=https://api.your-domain.com \
SMOKE_REFRESH_TOKEN=your-refresh-token \
SMOKE_CHAT_MESSAGE="你好，请介绍一下你自己" \
npm run smoke
```

## 4. 小程序体验版验收

- 登录卡片能打开《用户协议》《隐私政策》
- 微信登录返回 `201`
- 主对话能正常流式回复
- 项目详情页可继续真实聊天
- 分享海报可生成并保存
- Profile / Projects / Growth / Reports 都能加载真实数据

## 5. 提审前仍需人工完成

- 检查隐私政策与用户协议文案是否符合你的主体和实际数据流
- 补充帮助/客服与反馈渠道
- 确认 Dify 工作流在慢模型场景下稳定
- 完成体验版截图、功能说明与提审资料
