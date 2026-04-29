# 一树 OPC 上线前检查清单

日期：2026-04-29  
目标：完成上线前代码冻结、生产配置、自动化预检、体验版验收、灰度发布与正式发布准备。  
原则：上线前不再新增功能，只修 P0/P1；必须保留可回滚版本点、生产配置快照和数据库备份。

## 0. 当前状态

- 本地代码检查已进入上线收口阶段。
- 当前 `main` 本地曾领先远端 3 个提交，需要上线前确认已推送远端。
- `release:check -- --skip-install --skip-smoke` 已通过：30 passed，1 warning，0 failed。
- 完整线上 smoke 仍被生产域名 HTTPS 阻塞：`https://api.atreeagent.com/health` 和 `/ready` 请求失败。
- `backend/.smoke_access_token.tmp` 曾经进过 git 历史，疑似包含真实 token，必须视为已泄露并轮换/作废。
- 本地 `JWT_SECRET` 已轮换，生产环境必须同步新的密钥，否则旧 token 行为会不一致。

## 1. 代码冻结

- [ ] 确认 `git status --short` 没有非预期改动。
- [ ] 确认本次上线改动已经提交。
- [ ] 执行 `git push origin main`。
- [ ] 记录上线 commit SHA。
- [ ] 冻结新功能，只允许修复 P0/P1。

建议命令：

```powershell
git status --short
git log --oneline -5
git push origin main
git rev-parse HEAD
```

上线版本点：

```text
commit SHA:
负责人:
确认时间:
```

## 2. 本地静态检查

- [ ] 前端关键 JS 语法检查通过。
- [ ] 后端 TypeScript 检查通过。
- [ ] 后端构建通过。

建议命令：

```powershell
node --check pages/conversation/conversation.js
node --check components/cards/login-card/login-card.js
node --check services/card-registry.service.js

cd backend
npm run typecheck
npm run build
```

## 3. 自动化预检

- [ ] 不带真实 smoke 的预检通过。
- [ ] 配置真实登录态后，完整预检通过。
- [ ] 如果完整预检失败，必须先修复失败项，不允许带失败上线。

建议命令：

```powershell
cd backend
npm run release:check -- --skip-install --skip-smoke
```

完整 smoke 需要先配置其中一个：

```powershell
$env:SMOKE_ACCESS_TOKEN='真实 access token'
# 或
$env:SMOKE_REFRESH_TOKEN='真实 refresh token'
```

然后执行：

```powershell
cd backend
npm run release:check -- --skip-install
```

## 4. 生产域名与 HTTPS

当前阻塞项：`api.atreeagent.com` 的 HTTPS 请求仍失败。上线前必须完成：

- [ ] DNS 指向真实公网服务器 IP，不应解析到 `198.18.0.230` 这类测试网段地址。
- [ ] 服务器 80/443 端口可访问。
- [ ] 已签发 `api.atreeagent.com` 的 HTTPS 证书。
- [ ] Nginx 或网关已正确反代到后端 `localhost:3000`。
- [ ] `/health` 返回 200。
- [ ] `/ready` 返回 200。

建议服务器命令：

```bash
sudo certbot certonly --nginx -d api.atreeagent.com
sudo nginx -t
sudo systemctl reload nginx
```

建议本地验证：

```powershell
curl.exe -i https://api.atreeagent.com/health
curl.exe -i https://api.atreeagent.com/ready
```

相关配置文件：

```text
deploy/tencent-cloud/opc-backend.conf
deploy/tencent-cloud/README.md
```

## 5. 生产环境变量

生产环境必须确认以下变量：

- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET`
- [ ] `CORS_ORIGIN=https://api.atreeagent.com`
- [ ] `PUBLIC_BASE_URL=https://api.atreeagent.com`
- [ ] `WECHAT_APP_ID`
- [ ] `WECHAT_APP_SECRET`
- [ ] `DIFY_ENABLED=true`
- [ ] `DIFY_API_BASE_URL`
- [ ] `DIFY_API_KEY_*`
- [ ] `ZHIPU_API_KEY`

开发入口必须关闭：

- [ ] `ALLOW_DEV_FRESH_USER_LOGIN=false`
- [ ] `ALLOW_MOCK_WECHAT_LOGIN=false`
- [ ] `DEV_MOCK_DIFY=false`

注意：

- `backend/.env` 只用于本地，不应上传生产服务器以外的公开位置。
- 前端包不得包含 Dify Key、JWT Secret、`.env` 或 smoke token。
- 如果生产 Dify 不是 Dify Cloud，必须确认 `DIFY_API_BASE_URL` 是否应为自建地址。

## 6. 数据库与回滚

- [ ] 发布前完成生产数据库备份。
- [ ] 记录备份文件位置和恢复命令。
- [ ] 如有 Prisma 迁移，先在生产执行 `prisma migrate deploy`。
- [ ] 保留上一版后端构建产物或镜像。
- [ ] 保留上一版小程序包。
- [ ] 明确回滚负责人。
- [ ] 明确回滚命令。
- [ ] 明确预计恢复时间。

备份记录：

```text
备份时间:
备份位置:
恢复命令:
回滚负责人:
预计恢复时间:
```

## 7. 微信小程序平台配置

- [ ] 微信公众平台 request 合法域名包含 `https://api.atreeagent.com`。
- [ ] 体验版域名或灰度域名已加入合法域名。
- [ ] 小程序 AppID 与后端 `WECHAT_APP_ID` 一致。
- [ ] 体验版已上传。
- [ ] 体验版二维码已发给验收人员。

## 8. 体验版验收

真机必须覆盖以下链路：

- [ ] 微信登录可用。
- [ ] 手机号登录可用。
- [ ] 登录卡不再显示“一键进入 Opportunity Hub”。
- [ ] 主对话可发送消息。
- [ ] AI 输出为流式输出，速度和视觉可接受。
- [ ] 资产报告生成进度卡可动态更新。
- [ ] 最终资产报告可查看。
- [ ] 点击“稍后”后继续和一树聊天。
- [ ] 项目详情可打开。
- [ ] 成果 Tab 可展示成果资产库。
- [ ] 成果详情半屏弹窗可打开。
- [ ] 成果“继续聊”可返回主对话。
- [ ] 每日任务卡动作可点击，有明确反馈。
- [ ] 前端控制台没有持续 502/401 循环。
- [ ] 没有 mock 文案暴露。
- [ ] 没有 Dify Key、后端密钥、`.env`、smoke token 泄露。

## 9. 灰度发布

- [ ] 先灰度给内测用户。
- [ ] 观察 1-2 小时。
- [ ] 登录成功率正常。
- [ ] 后端 5xx 没有持续上升。
- [ ] Dify 超时率可接受。
- [ ] 流式断连可恢复。
- [ ] 资产报告失败率可接受。
- [ ] 数据库连接数正常。
- [ ] 无 P0/P1 后再提交正式发布。

## 10. 正式发布后观察

发布后 24 小时内只做稳定性修复，不继续加功能。

重点观察：

- [ ] 登录成功率。
- [ ] `/health`、`/ready`。
- [ ] `/auth/*`。
- [ ] `/bootstrap`。
- [ ] `/router/sessions/*`。
- [ ] `/router/sessions/:sessionId/messages/stream`。
- [ ] Dify 调用耗时与失败率。
- [ ] 数据库连接池。
- [ ] 微信小程序客户端错误。

## 11. 已知上线阻塞项

必须在正式发布前处理：

- [ ] `api.atreeagent.com` HTTPS 请求失败。
- [ ] 生产服务器 DNS / 证书 / Nginx 反代未完成或未验证。
- [ ] 历史 smoke token 需要轮换或作废。
- [ ] 生产 `JWT_SECRET` 需要同步新值。
- [ ] 缺真实登录态 smoke token，无法覆盖登录后完整链路。

## 12. 签核

```text
产品验收:
技术验收:
后端负责人:
前端负责人:
运维/部署负责人:
是否允许灰度:
是否允许正式发布:
签核时间:
```
