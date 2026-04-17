# 自动化测试报告

## 1. 项目概况
- 项目名称：opc（微信小程序 + opc-backend）
- 项目类型：微信原生小程序 + Node.js/NestJS 全栈项目
- 技术栈：微信小程序（WXML/WXSS/JS）、NestJS、TypeScript、Prisma、PostgreSQL、Minium
- 测试时间：2026-04-17 10:07 至 10:46（Asia/Shanghai）
- 测试执行者：Codex
- 当前分支 / commit：`main` / `2315cef0852ff700f3e135fd2b915b95f1261ec6`

## 2. 测试目标与范围
- 本次测试目标：
  - 执行仓库静态巡检、后端基线检查、smoke、Minium UI 自动化，并产出上线评审报告。
- 覆盖范围：
  - 目录结构识别、脚本能力识别、环境配置审计、后端编译与回归、前后端契约测试、Minium UI smoke。
- 未覆盖范围：
  - 真机微信授权链路、微信正式环境域名校验、Dify 全量真实工作流回归、发布包上传验签。
- 已知限制：
  - 当前工作区 `backend/.env.example` 缺失（git 状态为 deleted），导致示例环境与实际环境一致性审计不完整。
  - `npm run typecheck` / `npm run build` 在当前机器上因 Prisma 引擎文件锁冲突失败（见第 7 节）。

## 3. 执行环境
- Node 版本：`v24.14.0`
- Python 版本：`3.11.9`
- 包管理器：`npm 11.9.0`、`pip 24.0`
- 操作系统：Windows（PowerShell）
- 关键依赖：
  - 后端：NestJS 11、Prisma 6.17.1、TypeScript 5.9.3
  - Minium：`minium==1.6.0`（项目外 venv：`%USERPROFILE%\.venvs\opc-minium`）
- 环境变量情况：
  - `backend/.env` 存在，`WECHAT_APP_ID` / `WECHAT_APP_SECRET` 缺失；
  - `ALLOW_DEV_FRESH_USER_LOGIN=true`、`DEV_MOCK_WECHAT_LOGIN=true`、`ALLOW_MOCK_WECHAT_LOGIN=true`。
- Minium 是否可运行：可连接并执行（5 条用例执行完成）
- 是否覆盖真机：否
- 是否覆盖微信开发者工具环境：是（DevTools 1.06.2504060，基础库 3.15.1）

## 4. 项目结构识别结果
- 关键目录：
  - 小程序：`pages/`、`components/`、`services/`、`utils/`
  - 后端：`backend/src/`、`backend/scripts/`
  - 测试：`scripts/phase4-services.test.js`、`tests/minium_asset_report/`、`tests/minium_release/`
- 关键页面：
  - `welcome`、`conversation`、`profile`、`settings`、`legal`、`project-detail`、`tree`、`share-preview`
- 关键组件：
  - `components/shell/bottom-input`、`components/chat/quick-replies`、`components/cards/artifact-card`
- 关键服务：
  - 前端：`services/router.service.js`、`services/conversation-state.service.js`、`services/card-registry.service.js`
  - 后端：`backend/src/router/router.constants.ts`、`backend/src/router/router.service.ts`、`backend/src/auth/*`
- 关键接口：
  - `/health`、`/bootstrap`、`/auth/*`、`/router/*`、`/chat/stream/*`
- 高风险模块识别：
  - 登录态和开发开关：`backend/src/shared/app-config.ts` + `backend/.env`
  - 路由契约：`backend/src/router/router.constants.ts` 与前端 `pages/conversation/conversation.js`
  - 对话输入可测性：`components/shell/bottom-input/*`

## 5. 执行过程与命令记录
- `node -v`
  - 目的：环境检查
  - 退出码：0
  - 耗时：~0.2s
  - 结果摘要：通过（v24.14.0）
- `npm -v`
  - 目的：环境检查
  - 退出码：0
  - 耗时：~0.8s
  - 结果摘要：通过（11.9.0）
- `python --version`
  - 目的：环境检查
  - 退出码：0
  - 耗时：~0.3s
  - 结果摘要：通过（3.11.9）
- `npm ls --depth=0`（`backend/`）
  - 目的：依赖安装状态检查
  - 退出码：0
  - 耗时：~1.6s
  - 结果摘要：通过
- `python -m venv %USERPROFILE%\.venvs\opc-minium` + `pip install -r tests/minium_asset_report/requirements.lock.txt`
  - 目的：Minium 独立环境
  - 退出码：0
  - 耗时：~25.3s
  - 结果摘要：通过
- `node --check`（全仓 JS）+ JSON 解析 + `usingComponents` 完整性 + `app.json` 页面完整性
  - 目的：静态巡检
  - 退出码：0
  - 耗时：~5s
  - 结果摘要：通过
- `npm run typecheck`（`backend/`）
  - 目的：后端 type-check（优先复用脚本）
  - 退出码：1
  - 耗时：~3.8s
  - 结果摘要：失败（Prisma `query_engine-windows.dll.node` 文件锁 `EPERM rename`）
- `npm run build`（`backend/`）
  - 目的：后端构建（优先复用脚本）
  - 退出码：1
  - 耗时：~5s
  - 结果摘要：失败（同上文件锁）
- `npx tsc -p tsconfig.json --noEmit`、`npx tsc -p tsconfig.build.json`
  - 目的：在脚本受文件锁影响时验证编译正确性
  - 退出码：0
  - 耗时：~7.2s
  - 结果摘要：通过
- `npm run test:dify-timeout`
  - 目的：高价值回归（Dify 超时熔断）
  - 退出码：0
  - 耗时：~3.2s
  - 结果摘要：通过
- `node scripts/phase4-services.test.js`
  - 目的：前端纯逻辑回归 + routeAction 快照一致性
  - 退出码：0
  - 耗时：~0.3s
  - 结果摘要：通过
- `npm run test:router-contract`
  - 目的：后端路由契约回归
  - 退出码：1
  - 耗时：~1.7s
  - 结果摘要：失败（`mindset_unblock` 未能解析）
- `npm run test:encoding`
  - 目的：低优先级编码回归
  - 退出码：0
  - 耗时：~2.0s
  - 结果摘要：通过
- DB 可达性：`pg_isready`（不可用）+ Prisma `SELECT 1`
  - 目的：数据库可达性探测
  - 退出码：`pg_isready`=1，Prisma 探测=0
  - 耗时：~0.8s
  - 结果摘要：DB 可达（Prisma 结果 `[{"ok":1}]`）
- `npm run smoke`（带 refresh token）
  - 目的：后端 smoke
  - 退出码：0
  - 耗时：~38.1s
  - 结果摘要：通过（含 auth + stream）
- `npm run smoke:router`（带 refresh token）
  - 目的：router smoke
  - 退出码：1
  - 耗时：~88.0s
  - 结果摘要：失败（`company action route` 缺 `done/token` 事件）
- Minium：
  - `minitest --test -s tests/minium_release/suite.json ...`：退出码 0，套件可加载（5 用例）
  - `minitest -s tests/minium_release/suite.json ... -g`：退出码 0，执行完成，5 用例中 3 通过、2 失败

## 6. 测试结果汇总
| 类别 | 结果 | 说明 |
|------|------|------|
| dependency check | 通过 | 后端 npm 依赖完整；Minium venv 独立安装成功 |
| lint | 未执行 | 仓库无统一 lint script |
| type-check | 失败（脚本）/通过（回退） | `npm run typecheck` 受 Prisma 文件锁失败；`npx tsc --noEmit` 通过 |
| build | 失败（脚本）/通过（回退） | `npm run build` 受 Prisma 文件锁失败；`npx tsc -p tsconfig.build.json` 通过 |
| existing unit tests | 通过 | `test:dify-timeout`、`phase4-services.test.js`、`test:encoding` 通过 |
| existing integration tests | 失败 | `test:router-contract` 失败（routeAction 契约） |
| existing e2e tests | 部分通过 | `smoke` 通过；`smoke:router` 失败 |
| Minium UI tests | 部分通过 | 5 条执行：3 通过，2 失败（选择器找不到） |
| additional tests added | 是 | 新增前后端契约回归 + Minium release 用例 |
| config audit | 失败 | `.env.example` 缺失、release 风险开关、微信真实登录配置缺失 |
| mini-program risk audit | 失败 | 存在 Blocker/High（见第 7、10 节） |

## 7. 详细问题列表

### 问题 1：发布风险开关开启（`ALLOW_DEV_FRESH_USER_LOGIN=true`）
- 严重级别：Blocker
- 所属模块：后端配置
- 影响范围：登录态、用户数据污染风险
- 复现步骤：
  1. 查看 `backend/.env`；
  2. 发现 `ALLOW_DEV_FRESH_USER_LOGIN=true`。
- 实际结果：开发“fresh user”开关开启。
- 期望结果：生产/体验发布配置应为 `false` 或未设置。
- 初步原因分析：开发环境配置未与发布策略隔离。
- 修复建议：上线前将该配置置为 `false`，并在 CI 发布前做强校验。
- 相关文件：`backend/.env`
- 相关日志：配置审计命令输出
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 2：匿名 `/bootstrap` 返回 200（不满足当前上线审计策略）
- 严重级别：Blocker（按本次审计策略）
- 所属模块：认证/启动接口
- 影响范围：匿名访问策略、发布安全边界
- 复现步骤：
  1. 不带 token 请求 `GET /bootstrap`；
  2. 返回 200。
- 实际结果：匿名请求成功。
- 期望结果：按本次上线策略，匿名请求应拒绝（401）。
- 初步原因分析：当前实现允许 guest bootstrap。
- 修复建议：若目标是严格鉴权发布，需在服务端对 `/bootstrap` 加鉴权或按环境分级策略。
- 相关文件：`backend/src/bootstrap.controller.ts`、`backend/src/bootstrap.service.ts`（行为域）
- 相关日志：`Invoke-WebRequest http://127.0.0.1:3000/bootstrap` 返回 200
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 3：routeAction 契约不一致（`mindset_unblock` 未解析）
- 严重级别：High
- 所属模块：Router 契约
- 影响范围：快捷回复路由可靠性
- 复现步骤：
  1. 执行 `npm run test:router-contract`；
  2. 断言失败：`mindset quick reply routeAction should resolve: mindset_unblock`。
- 实际结果：后端 `resolveActionDecision` 未覆盖该 action。
- 期望结果：前后端暴露的 routeAction 应可解析或明确禁用策略。
- 初步原因分析：快捷回复集合与 routeAction 决策表漂移。
- 修复建议：补齐后端映射，或在前端/常量层去除不可路由 action 并同步快照。
- 相关文件：`backend/src/router/router.constants.ts`、`backend/scripts/router-contract-regression-smoke.ts`
- 相关日志：`npm run test:router-contract` 输出
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 4：router smoke 在 `company action route` 缺关键事件
- 严重级别：High
- 所属模块：Router stream
- 影响范围：系统事件链路稳定性
- 复现步骤：
  1. 获取有效 refresh token；
  2. 执行 `npm run smoke:router`；
  3. 在 `company action route` 阶段失败。
- 实际结果：缺 `done/token` 事件。
- 期望结果：每个系统事件流应输出完整事件集合（至少 `meta` + `token` + `done`）。
- 初步原因分析：特定 routeAction 在流式输出中提前结束或事件聚合异常。
- 修复建议：排查 `router.service` 对 `company_tax_followup` 相关系统事件的流式产出路径。
- 相关文件：`backend/scripts/router-phase4-smoke.js`、`backend/src/router/router.service.ts`
- 相关日志：`npm run smoke:router` 输出
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 5：Minium 两条对话输入用例失败（`#composer-input` 未命中）
- 严重级别：Medium
- 所属模块：小程序 UI 自动化可测性
- 影响范围：输入/发送主交互自动化覆盖
- 复现步骤：
  1. 执行 `minitest -s tests/minium_release/suite.json -c tests/minium_asset_report/config.json -g --task-limit-time 180`；
  2. `test_conversation_initial_contract` 与 `test_input_submit_renders_user_message_or_error` 报 `MiniElementNotFoundError`。
- 实际结果：页面中找不到 `#composer-input`。
- 期望结果：用例可稳定定位输入控件。
- 初步原因分析：当前 DOM 层级和自定义组件 id 透传行为导致选择器不可见。
- 修复建议：保持“先只读审计”原则，后续如需改造，应先提交选择器建议并审批后再增加稳定定位属性。
- 相关文件：`tests/minium_release/test_conversation_ui_contract.py`、`outputs/20260417104438/.../result.json`
- 相关日志：对应 case `run.log` + `17104522.wxml` / `17104537.wxml`
- 是否由 Minium 发现：是
- 是否有截图/输出证据：有（WXML 与日志）

### 问题 6：`npm run typecheck/build` 受 Prisma 引擎文件锁影响
- 严重级别：Medium
- 所属模块：本地构建链路
- 影响范围：本地脚本稳定性、CI 一致性
- 复现步骤：
  1. 本机已有 `npm run dev` 后端常驻；
  2. 执行 `npm run typecheck` 或 `npm run build`。
- 实际结果：`EPERM rename ... query_engine-windows.dll.node`
- 期望结果：脚本可稳定执行。
- 初步原因分析：`pretypecheck/prebuild` 自动 `prisma generate` 与已加载引擎冲突。
- 修复建议：在 CI 使用干净进程执行；本地执行前停止后端进程或分离 Prisma generate。
- 相关文件：`backend/package.json`
- 相关日志：`npm run typecheck/build` 输出
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 7：配置基线文件缺失（`backend/.env.example`）
- 严重级别：Medium
- 所属模块：配置治理
- 影响范围：环境一致性审计完整性
- 复现步骤：
  1. `git status` 显示 `D backend/.env.example`
- 实际结果：示例配置文件在工作树缺失。
- 期望结果：示例配置应存在并可用于环境完整性对比。
- 初步原因分析：当前分支存在未提交删除。
- 修复建议：恢复或补齐示例文件并纳入发布前校验。
- 相关文件：`backend/.env.example`
- 相关日志：`git status`
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

### 问题 8：Prisma `package.json#prisma` 迁移提示
- 严重级别：Low
- 所属模块：依赖维护
- 影响范围：未来升级
- 复现步骤：执行 Prisma 相关命令。
- 实际结果：提示该配置在 Prisma 7 将废弃。
- 期望结果：迁移到 `prisma.config.ts`。
- 初步原因分析：版本演进提示。
- 修复建议：排期升级时一并迁移。
- 相关文件：`backend/package.json`
- 相关日志：`prisma generate` 警告
- 是否由 Minium 发现：否
- 是否有截图/输出证据：有（命令输出）

## 8. 自动补充测试说明
- 新增测试文件：
  - `backend/scripts/router-contract-regression-smoke.ts`
  - `tests/contracts/route-actions.frontend.snapshot.json`
  - `tests/minium_release/test_core_ui_smoke.py`
  - `tests/minium_release/test_conversation_ui_contract.py`
  - `tests/minium_release/suite.json`
  - `tests/minium_asset_report/requirements.lock.txt`
- 每个测试覆盖风险：
  - router contract：覆盖后端 routeAction 解析与前端快照一致性。
  - front snapshot：冻结核心 routeAction 契约，减少隐式漂移。
  - Minium core UI：覆盖核心页面可打开与基础导航能力。
  - Minium conversation contract：覆盖输入控件、提交、快捷回复、卡片场景（当前两项失败）。
- 测试结果：
  - 前端纯逻辑回归通过；
  - 后端 router contract 失败（发现真实不一致）；
  - Minium 5 条中 3 通过 2 失败。
- 是否改动了非测试代码：
  - 是（最小必要）：
    - `backend/package.json`：新增 `test:router-contract` 脚本；
    - `.gitignore`：新增 Minium 输出/venv 忽略规则。
  - 未改动业务逻辑与业务页面实现。

## 9. Minium 专项结果
- Minium 覆盖场景：
  - welcome / conversation / profile / settings / legal 页面打开；
  - conversation 初始结构、资产路由场景、artifact 选择器存在性、输入发送链路。
- 成功场景：
  - `test_registered_core_pages_open`
  - `test_artifact_card_selector_contract_when_present`
  - `test_asset_route_can_render_quick_replies_or_artifact_state`
- 失败场景：
  - `test_conversation_initial_contract`
  - `test_input_submit_renders_user_message_or_error`
- 失败原因：
  - `#composer-input` 未命中（`MiniElementNotFoundError`），见输出证据。
- 截图/证据路径：
  - 运行日志：`outputs/20260417104438/*/*/run.log`
  - 失败结果：`outputs/20260417104438/*/*/result.json`
  - 失败时页面快照：`outputs/20260417104438/test_conversation_initial_contract/20260417104508380600/17104522.wxml`
  - 失败时页面快照：`outputs/20260417104438/test_input_submit_renders_user_message_or_error/20260417104522888277/17104537.wxml`
- 仍需人工验证场景：
  - 微信真实授权链路（真实 `WECHAT_APP_ID/SECRET`）
  - 真机兼容性（Android/iOS）
  - Dify 真实流完整回归（资产盘点/报告链路）

## 10. 小程序专项风险
- 真机未验证风险：存在（未覆盖）
- 微信授权链路风险：高（当前 `.env` 缺 `WECHAT_APP_ID/SECRET`）
- 样式兼容风险：中（仅 DevTools 覆盖）
- 网络异常风险：中（未系统化覆盖断网/弱网）
- mock/真实接口切换风险：高（`DEV_MOCK_WECHAT_LOGIN` 与 `ALLOW_DEV_FRESH_USER_LOGIN` 开启）
- 发布配置风险：高（发布前配置隔离与开关治理不满足上线要求）

## 11. 上线风险评估
- 当前是否建议上线：**不建议上线**
- 上线前必须修复项：
  - 关闭发布环境 `ALLOW_DEV_FRESH_USER_LOGIN`；
  - 明确并修正匿名 `/bootstrap` 鉴权策略（按本次策略应改为拒绝匿名）；
  - 修复 routeAction 契约不一致（至少 `mindset_unblock` 漂移）；
  - 修复 router smoke `company action route` 事件缺失。
- 可延期修复项：
  - Prisma 7 配置迁移；
  - 本地脚本 Prisma 文件锁体验优化。
- 建议人工补测项：
  - 真机登录授权、隐私协议弹窗、网络波动恢复、Dify 真流长会话。

## 12. 结论
- 本次已完成仓库静态巡检、后端基线、smoke、Minium 自动化与报告产出。
- 前端纯逻辑回归测试新增并通过，后端路由契约测试新增并发现不一致。
- 后端核心 smoke（含鉴权）通过，router smoke 在系统事件链路出现关键失败。
- Minium 套件已可加载并执行，5 条用例中 3 条通过、2 条失败。
- 失败用例集中在 conversation 输入控件选择器可见性，已产出 WXML/日志证据。
- 当前配置存在发布风险开关（`ALLOW_DEV_FRESH_USER_LOGIN=true`），不满足上线要求。
- 真实微信登录配置缺失，真实授权链路不可验证。
- 工作区缺失 `backend/.env.example`，配置一致性审计完整性不足。
- 综合 Blocker/High 风险，当前版本不满足上线评审通过条件。
