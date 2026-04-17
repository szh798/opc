# 问题修复报告

## 1. 修复背景
- 本次修复来源：`TEST_REPORT.md` 已识别的 Blocker/High 问题与你补充的 8 点稳态建议。
- 修复目标：在不改业务功能的前提下，完成发布态规则收敛、`/bootstrap` 鉴权修复、Router 契约/流式协议修复、最小必要回归补测。
- 输入材料：`TEST_REPORT.md`、`test-summary.json`、`backend/scripts/*smoke*` 输出、`outputs/*/result.json`、Minium `run.log`。

## 2. 问题清单与处理结果

### [Blocker] 发布态判定与安全开关约束不明确
- 问题现象：发布态与开发态边界不清，`ALLOW_DEV_FRESH_USER_LOGIN` 存在发布误开风险。
- 根因分析：环境判定分散，缺统一 release-like 规则与启动时强校验。
- 修复方案：在配置层新增统一判定 `isReleaseLike`/`enforceReleaseGuards`，并在 release-like 下强制：
  - `ALLOW_DEV_FRESH_USER_LOGIN` 必须为 `false/未设置`
  - 必须存在 `WECHAT_APP_ID/WECHAT_APP_SECRET`
  同时新增启动摘要日志（不输出敏感值）。
- 修改文件：
  - `backend/src/shared/app-config.ts`
  - `backend/src/main.ts`
- 风险说明：环境变量误设会触发启动失败（这是预期的发布保护行为）。
- 验证方式：
  - 启动日志检查 `Runtime summary` 字段。
  - release-like 启动验证（`APP_ENV=production` + `ALLOW_DEV_FRESH_USER_LOGIN=false` + 假微信配置）。
- 验证结果：通过。匿名 `/bootstrap` 在 release-like 下命中 401（见下个问题证据）。

### [Blocker] `/bootstrap` 发布态应强鉴权
- 问题现象：匿名 `/bootstrap` 在发布态策略下不应返回 200。
- 根因分析：原实现仅使用 `OptionalAccessTokenGuard`，未区分发布态。
- 修复方案：新增 `ReleaseBootstrapAccessGuard`，在 release-like 环境强制 `user.id` 存在，否则 401。
- 修改文件：
  - `backend/src/auth/release-bootstrap-access.guard.ts`
  - `backend/src/bootstrap.controller.ts`
  - `backend/src/app.module.ts`
- 风险说明：若前端未处理 401，发布态首开可能出现体验问题；已补前端 401 fallback 回归（见下一项）。
- 验证方式：
  - release-like 进程下验证：
    - 匿名 `GET /bootstrap`
    - 带 `Bearer accessToken` 的 `GET /bootstrap`
- 验证结果：通过。`ANON_STATUS=401`，`AUTH_STATUS=200`。

### [High] 前端首屏在 `/bootstrap=401` 下的容错
- 问题现象：后端改为发布态 401 后，前端首屏可能白屏/死循环。
- 根因分析：缺少对 401 的显式回归保护。
- 修复方案：在前端服务回归测试里模拟 `/bootstrap` 401，断言返回安全 fallback（未登录用户 + 空列表结构）。
- 修改文件：
  - `scripts/phase4-services.test.js`
- 风险说明：仍需联动真实小程序首屏人工验证（见未解决问题）。
- 验证方式：`node scripts/phase4-services.test.js`
- 验证结果：通过。

### [High] Router `routeAction` 契约漂移
- 问题现象：`mindset_unblock` 等 action 解析失败，`company_*_followup` 映射不一致。
- 根因分析：后端映射表与前端期望双边漂移，且缺定点测试。
- 修复方案：
  - 补齐/修正 action 映射；
  - 新增后端定点决策测试；
  - 增加前端冻结快照并由后端契约测试比对。
- 修改文件：
  - `backend/src/router/router.constants.ts`
  - `backend/scripts/router-action-decision-smoke.ts`
  - `backend/scripts/router-contract-regression-smoke.ts`
  - `tests/contracts/route-actions.frontend.snapshot.json`
  - `backend/package.json`
- 风险说明：新增 action 时需同步更新快照，否则会被回归拦截（预期行为）。
- 验证方式：
  - `npm run test:router-decision`
  - `npm run test:router-contract`
- 验证结果：通过。

### [High] Router 流式终止协议不一致 / smoke 定位成本高
- 问题现象：存在缺失 `done/token` 或错误被掩盖，导致链路定位困难。
- 根因分析：流式成功/失败终止语义不统一，smoke 断言不够严格。
- 修复方案：
  - 统一终止语义：成功 `done(status=success)`；错误 `error -> done(status=error)`；单流仅一个终止；
  - 修复显式 `chatflowId` 在 non-master 被覆盖问题；
  - 强化 `smoke:router`：有 `error` 立即失败、校验 `done` 唯一性和成功状态。
- 修改文件：
  - `backend/src/router/router.service.ts`
  - `backend/scripts/router-phase4-smoke.js`
  - `scripts/router-stream-protocol.test.js`
- 风险说明：严格断言可能暴露更多真实问题（符合上线门禁目标）。
- 验证方式：
  - `node scripts/router-stream-protocol.test.js`
  - `npm run smoke:router`（带有效 refresh token）
- 验证结果：通过。

### [Medium] Minium 输入控件定位不稳
- 问题现象：原 `#composer-input/#composer-send-button` 在 conversation 场景频繁找不到。
- 根因分析：全局选择器对组件层级变化敏感。
- 修复方案：仅修改测试侧定位策略，改为容器内选择器：
  - `.conversation-footer .composer__input`
  - `.conversation-footer .composer__send`
- 修改文件：
  - `tests/minium_release/test_conversation_ui_contract.py`
  - `tests/minium_asset_report/test_asset_report_flow.py`
- 风险说明：当前机器上的 DevTools 端口占用/权限限制导致 Minium 运行不稳定，无法形成完整结果集。
- 验证方式：
  - `python -m py_compile tests/minium_release/test_conversation_ui_contract.py`
  - Minium 复跑（见第 3 节）
- 验证结果：语法通过；端到端结果仍受环境阻塞（未完全验证）。

### [Medium] `backend/.env.example` 缺失
- 问题现象：环境一致性审计不完整。
- 根因分析：示例环境文件缺失/不全。
- 修复方案：恢复并补齐示例配置，纳入 release-like 相关键。
- 修改文件：
  - `backend/.env.example`
- 风险说明：示例文件需与真实配置持续同步。
- 验证方式：文件存在性与关键键检查。
- 验证结果：通过。

## 2.1 改动文件清单（按类型）
- 业务/服务端代码：
  - `backend/src/shared/app-config.ts`
  - `backend/src/main.ts`
  - `backend/src/bootstrap.controller.ts`
  - `backend/src/app.module.ts`
  - `backend/src/auth/release-bootstrap-access.guard.ts`
  - `backend/src/router/router.constants.ts`
  - `backend/src/router/router.service.ts`
- 测试脚本：
  - `scripts/phase4-services.test.js`
  - `scripts/router-stream-protocol.test.js`
  - `backend/scripts/router-action-decision-smoke.ts`
  - `backend/scripts/router-contract-regression-smoke.ts`
  - `backend/scripts/router-phase4-smoke.js`
  - `tests/minium_release/test_conversation_ui_contract.py`
  - `tests/minium_asset_report/test_asset_report_flow.py`
- 配置/契约：
  - `backend/.env.example`
  - `backend/package.json`
  - `tests/contracts/route-actions.frontend.snapshot.json`
  - `tests/minium_asset_report/requirements.lock.txt`

## 2.2 修复前 / 修复后证据（关键）
- `/bootstrap` 发布态鉴权：
  - 修复前（开发态默认）：匿名 `GET /bootstrap` -> 200（历史测试报告）。
  - 修复后（release-like 验证）：匿名 `GET /bootstrap` -> 401；鉴权后 -> 200。
- Router 契约：
  - 修复前：`npm run test:router-contract` 报 `mindset_unblock` 解析失败。
  - 修复后：`npm run test:router-contract` 通过。
- Router 流式协议：
  - 修复前：`smoke:router` 在 `company action route` 缺终止/令牌事件。
  - 修复后：`npm run smoke:router` 通过，`company action route events done=1 token>0 error=0`。

## 3. 测试与验证结果
- lint：失败（仓库无 `lint` script，`npm run lint` 返回 Missing script）。
- type-check：通过（`npm run typecheck`）。
- build：通过（`npm run build`）。
- unit test：通过（`node scripts/phase4-services.test.js`、`node scripts/router-stream-protocol.test.js`、`npm run test:dify-timeout`、`npm run test:encoding`）。
- integration test：通过（`npm run test:router-contract`、`npm run test:router-decision`）。
- e2e test：
  - 后端 smoke：通过（`npm run smoke`，带新签发 refresh token）。
  - router smoke：通过（`npm run smoke:router`，带新签发 refresh token）。
- Minium：
  - 历史稳定结果：`outputs/20260417104438`，5 条中 3 通过 2 失败（失败点为旧选择器 `#composer-input`）。
  - 本次复跑：受 DevTools 端口占用/权限限制影响，多个 run 仅到 setup 阶段，未产出完整 `result.json`（如 `outputs/20260417115747`、`outputs/20260417120217`、`outputs/20260417120621`）。
- 人工验证建议：
  - 发布态前端首屏：未登录首开、登录回流、401 提示与重试策略。
  - 真机微信授权链路（iOS/Android）。
  - Minium 在可控 DevTools 会话（可释放端口）下完整复跑。

## 4. 未解决问题
- `backend/.env` 仍为 `ALLOW_DEV_FRESH_USER_LOGIN=true`，且缺 `WECHAT_APP_ID/WECHAT_APP_SECRET`：
  - 原因：本次按“最小改动”不直接改你的本地运行环境文件。
  - 建议：上线环境必须改为 `ALLOW_DEV_FRESH_USER_LOGIN=false` 且补齐微信配置。
- Minium 全量回归未形成完整新结果：
  - 原因：本机微信开发者工具进程端口占用且无权限清理，导致会话不稳定。
  - 建议：在可控测试机重新跑 `tests/minium_release/suite.json`，并输出完整 case-level `result.json`。
- 真实微信授权与真机链路仍未完成闭环：
  - 原因：环境前置缺失（微信正式配置/真机）。
  - 建议：列为上线前必测清单，不可用“自动化通过”替代。

## 5. 最终结论
- 当前状态：**可回归 / 可提测（后端主链路）**，但 **不满足直接上线条件**。
- 已清理的阻塞代码问题：发布态规则、`/bootstrap` 强鉴权、Router 契约与流式协议、后端 smoke 门禁。
- 仍阻塞上线的前置项：
  1. 生产/发布配置未就绪（`ALLOW_DEV_FRESH_USER_LOGIN` 与微信真实配置）。
  2. Minium 全量复跑证据不完整（环境阻塞）。
  3. 真机与真实微信授权链路未闭环。
