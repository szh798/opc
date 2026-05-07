# 一树 OPC 项目月报

报告周期：2026-04-01 至 2026-04-30  
项目范围：微信小程序前端 + NestJS/Fastify 后端 + Dify 工作流 + 种子智能体方案 + 真机/自动化验证  
数据来源：本地 Git 记录、发布检查清单、Minium 自动化结果、ADB 真机巡检产物、开发者工具预览产物  
当前基线：`main` 分支，`30cb423`

## 一、本月总体进度

4 月项目从小程序骨架和本地 mock 体验，推进到具备真实后端、登录、对话路由、资产盘点、政策/园区机会、项目承接、任务跟进、Dify 流程接入和发布前预检能力的可验收版本。同时，围绕“种子成长规划师/种子智能体”完成了一套可复用的育儿场景智能体方案，包括产品定位、角色体系、固定状态机、MVP Chatflow、记忆架构、数据库字段和开发分工。

本月共形成 66 个 Git 提交，涉及 586 个唯一文件，累计约 127147 行新增、34979 行删除。核心产品闭环已经基本可用，当前开发完成度约 90%，上线准备度约 80%-85%。剩余主要风险集中在生产 HTTPS 域名、生产密钥同步、正式 smoke、微信真机授权链路和历史 smoke token 轮换。

## 二、重点项目进展

### 1. 微信小程序主对话体验

进度：90%  
状态：主对话页、角色入口、登录卡片、输入框、卡片渲染、快捷回复和项目入口已经形成主链路。

本月完成：
- 搭建小程序主界面、欢迎页、成长树、个人页、项目详情页等基础页面。
- 将对话页从静态 mock 推进到后端路由驱动，支持卡片、消息、快捷回复、项目入口和上下文恢复。
- 修复项目入口与路由流处理，避免点击项目后落到错误开发提示页。
- 调整登录卡片、底部输入框、对话气泡、侧边栏、头部导航等关键 UI。

对应文件：
- `app.js`
- `app.json`
- `app.wxss`
- `pages/conversation/conversation.js`
- `pages/conversation/conversation.wxml`
- `pages/conversation/conversation.wxss`
- `pages/welcome/welcome.*`
- `pages/tree/tree.*`
- `pages/profile/profile.*`
- `components/chat-shell/*`
- `components/shell/bottom-input/*`
- `components/cards/login-card/*`
- `components/cards/artifact-card/*`
- `services/conversation.service.js`
- `services/router.service.js`
- `services/card-registry.service.js`
- `utils/request.js`
- `utils/runtime.js`

### 2. NestJS/Fastify 后端服务

进度：90%  
状态：后端已经覆盖认证、用户、对话、路由、项目、任务、报告、订阅、资产盘点和发布健康检查。

本月完成：
- 新增后端工程和主要 API 模块。
- 接入 JWT 鉴权、微信登录、手机号/SMS 登录、本地开发登录。
- 补齐 `/health`、`/ready`、`/bootstrap`、`/auth/*`、`/router/*`、`/project/*`、`/task/*` 等核心链路。
- 将本地内存数据逐步迁移到 Prisma/Postgres 数据模型。
- 修复 release preflight 在 Windows 下的兼容问题。

对应文件：
- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/shared/app-config.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/wechat.service.ts`
- `backend/src/auth/aliyun-sms.service.ts`
- `backend/src/auth/sms-verification.service.ts`
- `backend/src/bootstrap.controller.ts`
- `backend/src/bootstrap.service.ts`
- `backend/src/router/router.controller.ts`
- `backend/src/router/router.service.ts`
- `backend/src/project.controller.ts`
- `backend/src/project.service.ts`
- `backend/src/task.controller.ts`
- `backend/src/task.service.ts`
- `backend/src/report.controller.ts`
- `backend/src/report.service.ts`
- `backend/package.json`
- `backend/tsconfig.json`

### 3. 登录与身份体系

进度：85%  
状态：开发登录、微信登录、手机号登录和短信验证码链路均已形成，正式授权仍需在生产 AppID 和真机环境做最终确认。

本月完成：
- 新增 Aliyun SMS 登录能力。
- 新增手机号身份、短信验证码和微信手机号登录接口。
- 增加 `auth-no-mock` 回归测试，修复测试参数构造问题。
- 增加开发环境模拟新用户登录，便于本地和真机快速巡检。
- 修复真实微信昵称、头像、登录态合并和用户资料展示相关问题。

对应文件：
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.dto.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/access-token.guard.ts`
- `backend/src/auth/optional-access-token.guard.ts`
- `backend/src/auth/aliyun-sms.service.ts`
- `backend/src/auth/sms-verification.service.ts`
- `backend/src/auth/wechat.service.ts`
- `backend/prisma/migrations/0012_add_sms_verification_code/migration.sql`
- `backend/prisma/migrations/0013_add_phone_identity/migration.sql`
- `services/auth.service.js`
- `components/cards/login-card/login-card.js`
- `components/cards/login-card/login-card.wxml`
- `pages/phone-login/phone-login.*`
- `backend/scripts/auth-no-mock-release-smoke.ts`

### 4. 资产盘点与资产报告

进度：90%  
状态：资产盘点从普通接口升级到真实 SSE 流式进度体验，前端可展示进度卡和最终报告卡。

本月完成：
- 接入资产盘点首盘/续盘流程和 Dify 工作流。
- 增加资产报告流式进度协议，覆盖 `card.created`、`card.patch`、`card.completed`、`final_report.created`、`stream.done`。
- 新增进度卡片、最终报告卡片、资产标签、雷达预览和报告详情呈现。
- 增加流式 markup 过滤，避免 Dify 内部 XML/标签泄露到前端。
- 增加真实流 smoke 和本地自动化验收脚本。

对应文件：
- `backend/src/router/router-sse.ts`
- `backend/src/router/router.constants.ts`
- `backend/src/router/router.controller.ts`
- `backend/src/router/router.dto.ts`
- `backend/src/router/router.service.ts`
- `backend/src/router/streaming-markup-filter.ts`
- `backend/src/dify.service.ts`
- `backend/src/profile.service.ts`
- `backend/src/project.service.ts`
- `backend/src/task.service.ts`
- `backend/prisma/migrations/0015_asset_report_stream_progress/migration.sql`
- `backend/scripts/asset-report-stream-acceptance.ts`
- `backend/scripts/asset-report-stream-live-smoke.ts`
- `backend/reports/asset-report-stream-live-smoke.md`
- `components/cards/asset-report-progress-card/*`
- `components/asset-report-sheet/*`
- `pages/dev/asset-report-progress-preview/*`
- `services/chat-stream.service.js`
- `services/report.service.js`
- `tests/minium_asset_report/*`

### 5. 挖宝/政策/园区机会流

进度：85%  
状态：已形成“3 个方向 -> 选择方向 -> 深聊 -> 立项 -> 跟进”的 V1 主链路。

本月完成：
- 新增 opportunity hub 状态和机会草稿模型。
- 接入 Dify opportunity flow，支持方向生成、方向来源暴露、深聊、立项和后续项目承接。
- 修复 Dify 方向来源暴露问题。
- 增加政策/园区机会服务和前端机会卡片。
- 梳理每个用户最多 1 个隐藏 opportunity draft 和 1 个 active project 的 V1 范围。

对应文件：
- `backend/src/opportunity/opportunity.controller.ts`
- `backend/src/opportunity/opportunity.service.ts`
- `backend/src/opportunity/opportunity-dify.service.ts`
- `backend/src/opportunity/opportunity.constants.ts`
- `backend/src/opportunity/followup-cron.service.ts`
- `backend/src/policy/policy-opportunity.service.ts`
- `backend/prisma/migrations/0013_opportunity_project_v1/migration.sql`
- `backend/prisma/migrations/0014_add_opportunity_dify_conversation_ids/migration.sql`
- `services/opportunity.service.js`
- `pages/conversation/conversation.js`
- `pages/project-detail/project-detail.*`
- `dify-workflows/README.md`
- `dify-workflows/*.dsl.yml`

### 6. 项目详情、成果资产库与任务跟进

进度：80%  
状态：项目详情页已经具备成果概览、成果列表、分组、筛选、详情 sheet、继续聊和任务推进能力。

本月完成：
- 将项目详情页成果 Tab 升级为“项目成果资产库”。
- 增加成果概览卡、成果条目卡、成果详情半屏弹窗。
- 支持成果按阶段和类型组织，并可从成果返回主对话继续推进。
- 增加项目任务、每日任务、本轮目标和 nextValidationAction 的状态流转基础。
- 梳理任务完成后如何推进后端跟进轮次的剩余问题。

对应文件：
- `pages/project-detail/project-detail.js`
- `pages/project-detail/project-detail.wxml`
- `pages/project-detail/project-detail.wxss`
- `components/cards/artifact-item-card/*`
- `components/cards/artifacts-overview-card/*`
- `components/common/artifact-detail-sheet/*`
- `components/cards/daily-tasks-card/*`
- `services/project.service.js`
- `services/task.service.js`
- `backend/src/project.controller.ts`
- `backend/src/project.service.ts`
- `backend/src/task.controller.ts`
- `backend/src/task.dto.ts`
- `backend/src/task.service.ts`
- `backend/src/project-followup-reminder.service.ts`

### 7. Dify 工作流与提示词资产

进度：85%  
状态：资产盘点、机会生成、任务复盘和路由流已经沉淀为可维护的工作流资产。

本月完成：
- 新增和迭代多个 Dify DSL 工作流。
- 梳理资产盘点、断点续盘、复盘更新、方案规划、项目建议等 prompt。
- 后端增加 Dify timeout、fallback、no-circuit 和 snapshot context 相关逻辑。
- 增加 Dify 相关 smoke，用于验证超时和真实流输出。

对应文件：
- `backend/src/dify.service.ts`
- `backend/src/dify-snapshot-context.service.ts`
- `backend/scripts/dify-timeout-no-circuit-smoke.ts`
- `docs/dify-prompts/asset-report-workflow.md`
- `docs/dify-prompts/asset-audit-flow.md`
- `docs/dify-prompts/task-review-flow.md`
- `dify-workflows/*.dsl.yml`
- `dify-workflows/*.md`

### 8. 发布前预检与生产部署准备

进度：80%  
状态：本地发布预检、部署文档、腾讯云部署配置和上线检查清单已形成；生产 HTTPS 仍是上线前阻塞项。

本月完成：
- 增加生产部署配置和 Nginx 反代示例。
- 增加 Postgres 备份脚本、PM2 ecosystem 配置和腾讯云部署说明。
- 清理 release-risk 本地产物和日志。
- 增加上线前检查清单，明确代码冻结、静态检查、自动化预检、生产域名、环境变量、数据库备份、微信平台配置、体验版验收和灰度发布事项。
- 识别历史 smoke token 风险，并标记为必须轮换/废弃。

对应文件：
- `LAUNCH_CHECKLIST.md`
- `LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md`
- `TEST_REPORT.md`
- `FIX_REPORT.md`
- `deploy/tencent-cloud/README.md`
- `deploy/tencent-cloud/opc-backend.conf`
- `deploy/tencent-cloud/backup-postgres.sh`
- `deploy/tencent-cloud/ecosystem.config.cjs`
- `backend/scripts/release-preflight.js`
- `backend/scripts/release-like-config-smoke.ts`
- `backend/.env.production.example`
- `.gitignore`

### 9. 种子成长规划师/种子智能体方案

进度：75%  
状态：已完成从产品定位到开发者 PRD、路由状态机、MVP Chatflow、数据库表设计和团队任务拆分的方案沉淀；当前主要是方案和架构资产，尚未进入完整编码落地。

本月完成：
- 完成“种子成长规划师”产品定位：面向家长的儿童天赋发现、成长路径和日常育儿陪伴智能体。
- 明确 MVP 阶段 3 个角色：`种子`、`种子·发现`、`种子·引路`，并去掉不适合育儿场景的“扎心”角色。
- 完成 MVP 固定状态机：用数据库字段判断用户是否完成 onboarding、是否有未完成盘点、是否已有天赋雷达图、是否有雷达图更新待展示。
- 明确 MVP 阶段路由不依赖 LLM 分类，采用 if-else 数据库字段检查，降低路由成本和不确定性。
- 设计天赋盘点流程：5 个深度访谈板块，预计 50-60 分钟，47-64 轮对话，目标采集 5500-10000 字家长描述。
- 将天赋雷达图映射到 Gardner 多元智能 8 个维度，包括语言、逻辑数学、空间、身体运动、音乐、人际、自省、自然观察。
- 完成 `zhongzi_main_chat` 主人格 Chatflow 设计，明确焦虑缓释、育儿问答、天赋信号持续采集、成长建议和闲聊陪伴 5 个职责。
- 梳理种子主人格 RAG 知识库：全脑教养策略、PERMA 幸福感评估、Grit 坚毅力培养、常见育儿问答、年龄适配规则、焦虑缓释话术。
- 设计种子 MVP 数据库字段和表：`child_profiles`、`talent_audit_progress`、`memory_entries` 扩展字段、`users` 新增儿童和雷达图状态字段。
- 输出给后端/Dify、前端、数据库三类开发角色的执行任务清单。

对应文件：
- `种子成长规划师_开发者PRD与状态机_V4(1).md`
- `种子主人格_MVP核心Chatflow详细设计_V1(1).md`
- `seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md`
- `backend/prisma/seed.ts`
- `services/agent.service.js`
- `theme/roles.js`
- `ROUTER_V2_API_CONTRACT.md`
- `memory-architecture-current.md`

### 10. 自动化测试、真机巡检与本地调试

进度：80%  
状态：Minium、release smoke、ADB 真机巡检和 Android USB reverse 调试链路已经跑通。

本月完成：
- 创建 Python 3.12 Minium 虚拟环境并跑通 release UI smoke。
- 产出 Minium 自动化结果，覆盖核心页面打开、对话初始合同、资产路由、输入提交等用例。
- 安装 Android Platform Tools 和 scrcpy，连接 Samsung Android 真机。
- 使用 `adb reverse tcp:3000 tcp:3000` 解决手机访问本地后端问题。
- 生成微信开发者工具预览码，并用真机巡检登录页、欢迎页、CTA、输入锁定和错误提示。
- 修复真机 loopback 调试保护逻辑，使 Android USB reverse 能访问 `127.0.0.1:3000`。

对应文件和产物：
- `tests/minium_release/*`
- `tests/minium_asset_report/*`
- `outputs/minium-release-run.log`
- `outputs/minium-release-report/*`
- `outputs/adb-patrol/*.png`
- `outputs/wechat-preview/*.png`
- `outputs/wechat-preview/opc-preview-android-usb-info.json`
- `outputs/minium-venv/*`
- `utils/env.js`
- `utils/request.js`
- `utils/runtime-config.local.example.js`

## 三、功能级明细与文件说明

### 1. 主对话页与消息流

业务目标：让用户进入小程序后，可以围绕“一树”进行连续对话，并通过卡片、快捷回复和项目入口完成业务推进。

具体进度：
- 完成主对话页的页面骨架、滚动容器、消息列表、输入框、角色头部、侧边栏入口和底部操作区。
- 支持用户消息、AI 消息、卡片消息、typing 状态、快捷回复、路由返回结果和错误态展示。
- 将对话从纯前端 mock 推进到后端路由服务，支持 `/router/sessions` 和流式消息入口。
- 补齐项目入口恢复逻辑，用户从项目卡进入项目详情后可继续回到主对话。
- 修复登录前输入框应锁定的问题，未登录时提示“先点击登录卡片，我们就开始...”。
- 调整对话页卡片渲染顺序，避免最终报告卡、进度卡和普通消息互相覆盖。

关键文件：
- `pages/conversation/conversation.js`：主对话状态管理、消息追加、卡片渲染、登录态处理、项目入口、Dify 路由回调。
- `pages/conversation/conversation.wxml`：主对话结构、卡片插槽、输入区、登录卡片和快捷回复绑定。
- `pages/conversation/conversation.wxss`：对话页布局、卡片间距、移动端视觉细节。
- `components/shell/bottom-input/*`：底部输入框组件。
- `components/chat-shell/*`：对话外壳。
- `services/conversation.service.js`：本地会话场景、初始化对话内容和上下文恢复。
- `services/router.service.js`：前端路由请求封装。
- `services/chat-stream.service.js`：流式事件解析和前端消费。

验收情况：
- Minium 用例覆盖了核心页面打开、初始对话合同、输入提交和资产路由卡片。
- Android 真机截图覆盖欢迎页、登录页、输入锁定和登录 pending 状态。

剩余事项：
- 继续补齐跨智能体切换后的上下文恢复回归用例。
- 生产环境下需要再次验证流式消息断连恢复和错误提示。

### 2. 登录、授权与用户体系

业务目标：支持开发、微信、手机号和验证码等多种登录方式，保证本地联调和正式上线都能完成身份闭环。

具体进度：
- 完成 JWT access token / refresh token 的签发、刷新和鉴权守卫。
- 接入微信 code 登录和微信手机号授权接口。
- 新增 Aliyun SMS 服务，支持短信验证码发送、校验和登录。
- 新增开发态“模拟新用户登录”，用于真机、本地和自动化巡检。
- 登录成功后合并用户资料，更新昵称、头像、initial、loginMode、loggedIn 等字段。
- 修复 auth no-mock 回归测试入参问题，避免测试误报。
- 明确 release-like 环境下禁止 mock 登录和开发登录开关。

关键接口：
- `POST /auth/wechat-login`
- `POST /auth/phone-login`
- `POST /auth/sms/send-code`
- `POST /auth/sms/verify-code`
- `POST /auth/sms-login`
- `POST /auth/dev-fresh-login`
- `POST /auth/refresh`
- `GET /auth/me`

关键文件：
- `backend/src/auth/auth.controller.ts`：认证接口入口。
- `backend/src/auth/auth.service.ts`：登录、发 token、刷新 token、用户身份合并。
- `backend/src/auth/wechat.service.ts`：微信 code 和手机号能力。
- `backend/src/auth/aliyun-sms.service.ts`：阿里云短信发送。
- `backend/src/auth/sms-verification.service.ts`：验证码生成、校验和消费。
- `backend/src/auth/access-token.guard.ts`：access token 鉴权。
- `backend/src/auth/optional-access-token.guard.ts`：可选登录态鉴权。
- `services/auth.service.js`：小程序端登录请求和 token 存储。
- `components/cards/login-card/*`：登录卡片、微信登录、手机号登录、验证码登录、开发登录按钮。
- `pages/phone-login/phone-login.*`：手机号验证码登录页。

数据模型：
- `backend/prisma/migrations/0012_add_sms_verification_code/migration.sql`
- `backend/prisma/migrations/0013_add_phone_identity/migration.sql`
- `backend/prisma/schema.prisma`

验收情况：
- 本地后端 `POST /auth/dev-fresh-login` 返回 `201`，可以创建开发新用户。
- Android USB reverse 下 `/ready` 可从手机访问，说明后端连通性已排除。

剩余事项：
- 正式 AppID 下微信授权链路还需要真机最终验收。
- 历史 smoke token 需要轮换/废弃。
- 生产 `JWT_SECRET` 需要同步新值。

### 3. 资产盘点与报告流式进度

业务目标：用户发起资产盘点后，可以看到真实的生成进度，而不是等待一个静态结果。

具体进度：
- 后端新增资产报告流式协议，向前端推送进度卡片事件。
- 支持 `card.created` 创建进度卡，`card.patch` 更新步骤和进度，`card.completed` 标记完成。
- 支持 `final_report.created` 生成最终报告卡，`stream.done` 结束流。
- 处理 Dify 返回内容中的 XML、markup 和内部标签，避免污染前端展示。
- 前端新增资产报告进度卡，展示步骤、进度条、资产标签和雷达预览。
- 前端支持进度卡与最终报告卡去重，避免同一报告出现两张卡。
- 增加开发预览页，专门调试资产报告进度卡组件。

关键事件：
- `assistant.text.delta`
- `card.created`
- `card.patch`
- `job.step`
- `card.completed`
- `final_report.created`
- `stream.done`

关键文件：
- `backend/src/router/router-sse.ts`：SSE 输出工具。
- `backend/src/router/router.service.ts`：资产盘点流、事件组装、Dify 接入、报告生成。
- `backend/src/router/streaming-markup-filter.ts`：流式 markup 过滤。
- `backend/src/router/router.controller.ts`：流式接口入口。
- `backend/src/task.service.ts`：任务和报告生成相关状态。
- `backend/src/project.service.ts`：报告与项目资产关联。
- `components/cards/asset-report-progress-card/*`：资产报告进度卡。
- `components/asset-report-sheet/*`：资产报告详情展示。
- `pages/dev/asset-report-progress-preview/*`：进度卡调试页。
- `services/chat-stream.service.js`：前端 SSE/流事件消费。
- `services/card-registry.service.js`：卡片类型注册。

脚本与报告：
- `backend/scripts/asset-report-stream-acceptance.ts`
- `backend/scripts/asset-report-stream-live-smoke.ts`
- `backend/reports/asset-report-stream-live-smoke.md`
- `tests/minium_asset_report/test_asset_report_flow.py`
- `tests/minium_asset_report/test_asset_report_rendering.py`

验收情况：
- 真实流 smoke 已产出 256 个流式事件。
- 已验证事件顺序：先创建进度卡，再更新进度，最后完成并生成最终报告。

剩余事项：
- 需要用同一条真实资产盘点流在开发者工具和真机上再做一次端到端验收。
- 需要纳入发布前 checklist，避免后续改动破坏事件顺序。

### 4. 挖宝机会流与项目承接

业务目标：一树不只是聊天工具，而是能从用户上下文中挖掘商业方向，并把方向沉淀为项目推进。

具体进度：
- 明确 V1 业务范围：每个用户最多 1 个隐藏 opportunity draft 和 1 个 active project。
- 完成“3 个候选方向 -> 选择方向 -> 深聊持久化 -> 立项摘要 -> 确认立项 -> 3 天一轮跟进”的主链路。
- 后端新增 opportunity 模块，支持机会草稿、方向生成、方向选择、项目承接。
- 接入 Dify opportunity flow，支持通过 Dify 生成方向和深聊内容。
- 修复 Dify 方向来源未暴露的问题。
- 项目详情页可以承接 opportunity 生成的上下文和成果。

关键文件：
- `backend/src/opportunity/opportunity.controller.ts`：机会相关接口。
- `backend/src/opportunity/opportunity.service.ts`：机会草稿、方向、项目承接核心逻辑。
- `backend/src/opportunity/opportunity-dify.service.ts`：Dify 机会流调用。
- `backend/src/opportunity/opportunity.constants.ts`：机会流常量。
- `backend/src/policy/policy-opportunity.service.ts`：政策/园区机会服务。
- `services/opportunity.service.js`：小程序端 opportunity 请求。
- `pages/conversation/conversation.js`：方向卡、选择方向、深聊入口。
- `pages/project-detail/project-detail.js`：项目详情承接。

数据库文件：
- `backend/prisma/migrations/0013_opportunity_project_v1/migration.sql`
- `backend/prisma/migrations/0014_add_opportunity_dify_conversation_ids/migration.sql`

工作流文件：
- `dify-workflows/README.md`
- `dify-workflows/*.dsl.yml`

剩余事项：
- 需要补充“方向选择后继续深聊”的回归测试。
- 需要在真实 Dify 配置下验证多轮上下文不会串线。

### 5. 项目详情页与成果资产库

业务目标：项目不是只停留在聊天记录里，而是沉淀为可查看、可筛选、可继续推进的成果资产库。

具体进度：
- 项目详情页新增成果 Tab，定位为“项目成果资产库”。
- 支持成果概览卡，展示项目成果数量、状态和阶段分布。
- 支持成果条目卡，展示来源 Agent、状态、标签、指标和操作入口。
- 支持按方向、方案、验证、成交、系统等类型筛选。
- 支持成果详情半屏弹窗。
- 支持从成果详情点击“继续聊”，回到主对话并携带成果上下文。
- 增加项目专用输入框 placeholder，区分普通聊天和项目推进。

关键文件：
- `pages/project-detail/project-detail.js`：项目详情状态、成果分组、筛选、sheet 逻辑。
- `pages/project-detail/project-detail.wxml`：项目详情页面结构。
- `pages/project-detail/project-detail.wxss`：项目详情视觉样式。
- `components/cards/artifact-item-card/*`：成果条目卡。
- `components/cards/artifacts-overview-card/*`：成果概览卡。
- `components/common/artifact-detail-sheet/*`：成果详情半屏弹窗。
- `services/project.service.js`：前端项目接口。
- `backend/src/project.controller.ts`：项目接口入口。
- `backend/src/project.service.ts`：项目、成果、状态推进后端逻辑。

剩余事项：
- 需要补真实项目数据做一次成果资产库验收。
- 需要补充成果筛选和“继续聊”路径的自动化用例。

### 6. 每日任务、本轮推进与跟进节奏

业务目标：把“聊天中的建议”转成用户可执行的任务，并推动项目周期性向前走。

具体进度：
- 新增每日任务卡片。
- 梳理本轮目标、今日建议、nextValidationAction 的关系。
- 后端任务服务支持任务状态、任务完成和项目下一步动作。
- 增加项目跟进提醒服务，为后续 3 天一轮推进做准备。
- 明确当前仍需补齐“任务完成后自动推进下一轮”的后端状态同步。

关键文件：
- `components/cards/daily-tasks-card/*`
- `backend/src/task.controller.ts`
- `backend/src/task.dto.ts`
- `backend/src/task.service.ts`
- `backend/src/project-followup-reminder.service.ts`
- `backend/src/opportunity/followup-cron.service.ts`
- `services/task.service.js`

剩余事项：
- 任务完成后，后端需要更稳定地推进 follow-up round。
- 前端需要显示更明确的任务完成反馈和下一步建议。

### 7. 生产部署与上线预检

业务目标：在上线前形成可重复执行的检查流程，避免 mock、密钥、token、HTTPS 和数据库风险进入正式环境。

具体进度：
- 增加腾讯云部署说明。
- 增加 Nginx 反向代理配置。
- 增加 Postgres 备份脚本。
- 增加 PM2 ecosystem 配置。
- 修复 release preflight 在 Windows 下的执行兼容问题。
- 编写上线前检查清单，覆盖代码冻结、静态检查、自动化预检、生产域名、环境变量、数据库备份、微信平台配置、体验版验收和灰度发布。
- 清理本地 release-risk 产物和日志。

关键文件：
- `deploy/tencent-cloud/README.md`
- `deploy/tencent-cloud/opc-backend.conf`
- `deploy/tencent-cloud/backup-postgres.sh`
- `deploy/tencent-cloud/ecosystem.config.cjs`
- `backend/scripts/release-preflight.js`
- `backend/scripts/release-like-config-smoke.ts`
- `backend/.env.production.example`
- `LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md`

当前阻塞：
- `api.atreeagent.com` 生产 HTTPS 仍需打通。
- `/health` 和 `/ready` 需要在公网 HTTPS 下返回 200。
- 生产环境变量需要最终核对。

### 8. 真机连接、Minium 自动化与调试产物

业务目标：用真机和自动化测试验证小程序不是只在开发者工具里可用。

具体进度：
- 安装 Android Platform Tools。
- 连接 Samsung Android 真机，确认 `adb devices -l` 正常。
- 安装并启动 scrcpy，用于电脑控制/观察手机。
- 发现手机无法访问电脑局域网后端，定位到 Windows Public 网络和防火墙规则。
- 使用 `adb reverse tcp:3000 tcp:3000` 建立 USB 反向代理。
- 将本地 dev `baseURL` 调整为 `http://127.0.0.1:3000`。
- 修复小程序前端对真机 loopback 的保护逻辑，允许 Android USB reverse 调试。
- 生成微信开发者工具预览码并在手机上扫码巡检。
- 创建 Python 3.12 Minium 虚拟环境，跑通 release UI smoke。

关键命令/验证点：
- `adb devices -l`
- `adb reverse tcp:3000 tcp:3000`
- 手机侧访问 `http://127.0.0.1:3000/ready` 返回 200。
- Minium release suite 结果：4 个 case，0 failed，0 error。

关键文件和产物：
- `outputs/adb-patrol/*.png`
- `outputs/wechat-preview/*.png`
- `outputs/minium-release-run.log`
- `outputs/minium-release-report/*`
- `outputs/minium-venv/*`
- `tests/minium_release/suite.json`
- `tests/minium_release/test_core_ui_smoke.py`
- `tests/minium_release/test_conversation_ui_contract.py`
- `utils/request.js`
- `utils/env.js`
- `utils/runtime-config.local.example.js`

剩余事项：
- 下次真机调试前先确认 `adb reverse --list`。
- 如果改回局域网访问，需要把 Windows 网络改为 Private 或新增防火墙规则。

### 9. 种子智能体方案、状态机与开发任务

业务目标：在 OPC 多智能体系统的技术基础上，沉淀“种子成长规划师”这一育儿场景智能体产品方案，让后续可以复用登录、对话、记忆、Dify Chatflow、卡片渲染和数据库能力，快速进入儿童天赋盘点与家长教练场景。

具体进度：
- 完成种子产品一句话定位：面向家长的儿童天赋发现、成长路径规划和日常育儿陪伴智能体。
- 明确 MVP 阶段只做 3 个角色，降低复杂度：`种子` 作为主人格和家长教练，`种子·发现` 负责天赋盘点和成长路径，`种子·引路` 负责每周任务、微项目和成长报告。
- 明确育儿场景不设置“扎心”角色，避免对家长焦虑二次施压；高焦虑场景由种子主人格先缓释情绪，再给建议。
- 完成 MVP 路由策略：用户只有“未完成盘点”和“完成盘点后进入种子主人格”两个核心状态，使用数据库字段判断，不引入 LLM 路由。
- 设计用户进入决策树：`onboarding_completed`、`last_incomplete_flow`、`has_talent_radar`、`radar_update_pending` 决定下一步进入 onboarding、恢复盘点、引导盘点或进入 `zhongzi_main_chat`。
- 设计天赋盘点深度访谈：5 个场景板块，覆盖日常自由时间、社交关系、学习挑战、创造表达、家长视角与价值观。
- 设计访谈数据目标：50-60 分钟，47-64 轮对话，采集 5500-10000 字家长描述，不做测评问卷，而做深度访谈。
- 设计八维度天赋雷达图：语言、逻辑数学、空间、身体运动、音乐、人际、自省、自然观察，并要求每个维度包含行为证据和置信度。
- 设计板块间记忆机制：每个访谈板块结束后提取摘要，写入 `memory_entries`，启动下一个板块并注入上下文，解决长对话 token 爆炸问题。
- 完成种子主人格 `zhongzi_main_chat` 设计，MVP 阶段作为用户完成天赋盘点后的唯一日常 Chatflow。
- 明确种子主人格 5 个职责：焦虑缓释、育儿问题回答、天赋信号持续采集、成长建议、闲聊陪伴。
- 设计雷达图动态更新机制：日常对话中提取新的天赋信号，异步写入 memory，达到阈值后重算雷达图并设置 `radar_update_pending`。
- 明确 MVP 阶段前端不用实现复杂角色切换，只需要主对话屏、开场白渲染、雷达图卡片、雷达图更新卡片和访谈进度提示。
- 明确后端/Dify 任务：配置 `zhongzi_main_chat`，实现信号异步提取，检查雷达图更新，注入 `recent_changes`，更新登录决策树。
- 明确数据库任务：新增儿童档案字段和表，扩展 `memory_entries` 的来源和确认次数字段，增加查询索引。

关键 Chatflow：
- `onboarding_flow`：首次登录暖场和孩子信息采集。
- `talent_audit_block1` 至 `talent_audit_block5`：五个天赋盘点访谈板块。
- `talent_radar_gen`：汇总五个板块摘要并生成八维度雷达图。
- `zhongzi_main_chat`：MVP 核心日常体验，承担家长教练、信号采集和陪伴。
- V2 预留：`growth_path_flow`、`faxian_free_chat`、`weekly_task_flow`、`mini_project_flow`、`yinlu_free_chat`、`anxiety_relief_flow`。

关键数据设计：
- `users` 新增：`child_name`、`child_age`、`child_gender`、`age_stage`、`parent_anxiety_level`、`entry_path`、`radar_update_pending`、`has_talent_radar`、`onboarding_completed`、`last_incomplete_flow`、`last_incomplete_step`、`days_inactive`、`total_sessions`。
- `child_profiles`：孩子天赋档案，存储八维度雷达、TOP3 天赋、成长方向、AI 时代分析、心流信号、性格标签、家长价值观说明、版本和置信度。
- `talent_audit_progress`：记录五个盘点板块的结构化提取结果、当前板块和完成状态。
- `memory_entries` 扩展：增加 `source` 和 `confirmation_count`，支持固定流、自由对话和任务反馈来源，并对重复事实做确认次数累加。

关键文件：
- `种子成长规划师_开发者PRD与状态机_V4(1).md`：种子开发者 PRD、3 角色设计、三层路由、5 大模块、onboarding 状态机、二次登录、记忆注入、数据库表和 Chatflow 清单。
- `种子主人格_MVP核心Chatflow详细设计_V1(1).md`：种子主人格 MVP Chatflow、system prompt、RAG 知识库、天赋信号采集、雷达图更新、记忆模块和开发分工。
- `seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md`：MVP 简化版固定状态机、两个人格实现边界、P0/P1 Chatflow 和 V2 迭代路径。
- `memory-architecture-current.md`：当前 OPC 记忆架构，给种子智能体复用长期记忆、摘要和注入机制提供基础。
- `ROUTER_V2_API_CONTRACT.md`：多智能体路由 API 合同，给种子 V2 角色切换和 Chatflow 路由提供参考。
- `theme/roles.js`、`services/agent.service.js`：OPC 现有智能体角色元数据和前端读取方式，可作为种子角色体系复用参考。

开发分工沉淀：
- 后端/Dify：实现 `zhongzi_main_chat`，接入 6 个 RAG 知识库，做会话后信号提取、雷达图更新检查、`recent_changes` 注入和登录决策树。
- 前端：主对话流不做复杂快捷回复，重点支持后端开场白、雷达图卡片、雷达图更新卡片、访谈进度提示和角色 UI 占位。
- 数据库：新增 `child_profiles`、`talent_audit_progress`，扩展 `users` 和 `memory_entries`，增加按用户、类别、创建时间/更新时间的索引。

剩余事项：
- 当前主要是产品和技术方案沉淀，尚未完整进入编码实现。
- 需要把种子数据模型正式迁移到 Prisma schema。
- 需要为雷达图卡片、访谈进度卡片和雷达图更新卡片建立前端组件。
- 需要把 8 个 MVP Chatflow 在 Dify 中实际配置并完成端到端 smoke。

## 四、关键数据

| 指标 | 数据 |
| --- | ---: |
| Git 提交数 | 66 |
| 涉及唯一文件 | 586 |
| 文件变更记录 | 1574 |
| 新增行数 | 127147 |
| 删除行数 | 34979 |
| 当前分支 | `main` |
| 当前基线 | `30cb423` |
| 自动化 UI smoke | 已跑通 |
| Android 真机后端连通性 | USB reverse 下 `/ready` 200 |
| 发布准备度 | 80%-85% |

## 五、主要产出清单

前端页面：
- `pages/conversation/conversation.*`
- `pages/project-detail/project-detail.*`
- `pages/tree/tree.*`
- `pages/profile/profile.*`
- `pages/phone-login/phone-login.*`
- `pages/dev/asset-report-progress-preview/*`

前端组件：
- `components/cards/login-card/*`
- `components/cards/asset-report-progress-card/*`
- `components/cards/artifact-item-card/*`
- `components/cards/artifacts-overview-card/*`
- `components/cards/daily-tasks-card/*`
- `components/common/artifact-detail-sheet/*`
- `components/asset-report-sheet/*`
- `components/shell/*`

前端服务：
- `services/auth.service.js`
- `services/bootstrap.service.js`
- `services/chat-stream.service.js`
- `services/conversation.service.js`
- `services/opportunity.service.js`
- `services/project.service.js`
- `services/report.service.js`
- `services/router.service.js`
- `services/task.service.js`
- `utils/request.js`
- `utils/env.js`
- `utils/runtime.js`

后端模块：
- `backend/src/auth/*`
- `backend/src/router/*`
- `backend/src/opportunity/*`
- `backend/src/policy/*`
- `backend/src/project.*`
- `backend/src/task.*`
- `backend/src/report.*`
- `backend/src/profile.service.ts`
- `backend/src/dify.service.ts`
- `backend/src/shared/*`

数据库与迁移：
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/0012_add_sms_verification_code/migration.sql`
- `backend/prisma/migrations/0013_add_phone_identity/migration.sql`
- `backend/prisma/migrations/0013_opportunity_project_v1/migration.sql`
- `backend/prisma/migrations/0014_add_opportunity_dify_conversation_ids/migration.sql`
- `backend/prisma/migrations/0015_asset_report_stream_progress/migration.sql`

测试与脚本：
- `backend/scripts/asset-report-stream-acceptance.ts`
- `backend/scripts/asset-report-stream-live-smoke.ts`
- `backend/scripts/auth-no-mock-release-smoke.ts`
- `backend/scripts/dify-timeout-no-circuit-smoke.ts`
- `backend/scripts/release-like-config-smoke.ts`
- `backend/scripts/release-preflight.js`
- `backend/scripts/restart-backend.ps1`
- `tests/minium_release/*`
- `tests/minium_asset_report/*`

部署与文档：
- `deploy/tencent-cloud/README.md`
- `deploy/tencent-cloud/opc-backend.conf`
- `deploy/tencent-cloud/backup-postgres.sh`
- `deploy/tencent-cloud/ecosystem.config.cjs`
- `docs/agent-memory/*`
- `docs/dify-prompts/*`
- `种子成长规划师_开发者PRD与状态机_V4(1).md`
- `种子主人格_MVP核心Chatflow详细设计_V1(1).md`
- `seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md`
- `LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md`
- `WEEKLY_REPORT_2026-04-27_2026-04-29.md`

## 六、验证情况

已完成验证：
- `node --check pages/conversation/conversation.js` 通过。
- 后端 TypeScript 检查通过。
- `npm run smoke:policy` 通过。
- Dify timeout 回归问题已修复。
- `auth-no-mock` 回归测试参数构造问题已修复。
- `asset-report-stream-live` 真实流 smoke 跑通，产出流式事件。
- Minium release UI smoke 跑通。
- Android 真机通过 ADB 连接并完成多轮截图巡检。
- Android 真机通过 USB reverse 访问本地 `/ready` 成功。
- 微信开发者工具预览码已生成，真机可扫码进入小程序。

需要继续验证：
- 生产 HTTPS 下 `/health` 和 `/ready`。
- 生产 AppID 下微信授权、手机号授权和短信链路。
- 正式环境 Dify 工作流和生产密钥。
- 完整 release smoke，不跳过真实登录态。
- 资产报告流式进度卡在真机上的端到端体验。

## 七、风险与阻塞

1. 生产 HTTPS 仍是最大阻塞项，`api.atreeagent.com/health` 和 `/ready` 必须在公网 HTTPS 下返回 200。
2. 历史 `backend/.smoke_access_token.tmp` 曾进入 Git 历史，必须视为已泄露并轮换/废弃。
3. 生产 `JWT_SECRET` 需要同步新值，否则旧 token 行为和生产环境会不一致。
4. 微信正式授权链路仍需在真实 AppID、真机和合法域名配置下最终验收。
5. Android 本地真机调试目前依赖 `adb reverse`，这是开发态方案，不可作为生产访问方案。
6. 资产报告流式卡片涉及 SSE 顺序、前端去重和最终卡切换，建议上线前再跑一次真实链路验收。

## 八、下月计划

P0：
- 打通 `api.atreeagent.com` 生产 HTTPS、DNS、证书和 Nginx 反代。
- 轮换历史 smoke token，同步生产 `JWT_SECRET`。
- 跑完整 `release:check -- --skip-install`，不跳过真实 smoke。
- 在真机上完整验收登录、主对话、资产盘点、资产报告流式卡片、项目详情、成果资产库和任务推进。

P1：
- 将资产报告流式验收脚本纳入发布前 checklist。
- 用真实项目数据补一轮项目成果资产库验收。
- 增加跨智能体确认语义的回归用例。
- 清理本地 `.pyc`、临时日志和调试产物，保持发布分支干净。

P2：
- 优化登录失败和网络失败的用户提示文案。
- 继续补齐 Dify 工作流文档和 prompt 版本管理。
- 梳理后台监控指标，覆盖登录成功率、Dify 超时率、5xx、SSE 断连和数据库连接池。

## 九、具体产物链接清单

以下链接均指向当前项目工作区内的本地产物，便于复盘、验收和继续开发。

| 类别 | 产物 | 链接 | 说明 |
| --- | --- | --- | --- |
| 汇报文档 | 4 月月报 Markdown | [MONTHLY_REPORT_2026-04.md](./MONTHLY_REPORT_2026-04.md) | 本月完整月报源文件 |
| 汇报文档 | 4 月月报 Word | [一树OPC项目月报_2026-04.docx](./output/doc/一树OPC项目月报_2026-04.docx) | 可直接发送的 Word 版 |
| 汇报文档 | 4 月底周报 Word | [一树OPC项目周报_2026-04-27_2026-04-29.docx](./output/doc/一树OPC项目周报_2026-04-27_2026-04-29.docx) | 周报沉淀材料 |
| 发布文档 | 上线前检查清单 | [LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md](./LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md) | 上线前风险、检查项和阻塞项 |
| 发布文档 | 上线检查清单 | [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | 常规发布 checklist |
| 发布文档 | 腾讯云部署说明 | [deploy/tencent-cloud/README.md](./deploy/tencent-cloud/README.md) | 服务器部署说明 |
| 发布文档 | Nginx 反代配置 | [deploy/tencent-cloud/opc-backend.conf](./deploy/tencent-cloud/opc-backend.conf) | `api.atreeagent.com` 反向代理配置 |
| 发布文档 | PM2 配置 | [deploy/tencent-cloud/ecosystem.config.cjs](./deploy/tencent-cloud/ecosystem.config.cjs) | 后端进程管理配置 |
| 发布文档 | 数据库备份脚本 | [deploy/tencent-cloud/backup-postgres.sh](./deploy/tencent-cloud/backup-postgres.sh) | 发布前数据库备份脚本 |
| 测试验证 | 资产报告流式 smoke 报告 | [asset-report-stream-live-smoke.md](./backend/reports/asset-report-stream-live-smoke.md) | 真实流式事件验证报告 |
| 测试验证 | 资产报告 E2E 报告 | [asset-report-e2e-auto.md](./backend/reports/asset-report-e2e-auto.md) | 资产报告自动化端到端报告 |
| 测试验证 | Minium release 运行日志 | [minium-release-run.log](./outputs/minium-release-run.log) | 小程序自动化测试运行日志 |
| 测试验证 | Minium 汇总 JSON | [summary.json](./outputs/summary.json) | Minium 测试汇总 |
| 真机预览 | Android 预览二维码 | [opc-preview-android-usb-loopback-20260429-173527.png](./outputs/wechat-preview/opc-preview-android-usb-loopback-20260429-173527.png) | 最新 Android USB reverse 预览二维码 |
| 真机预览 | 预览码信息 | [opc-preview-android-usb-info.json](./outputs/wechat-preview/opc-preview-android-usb-info.json) | 微信开发者工具预览信息 |
| 真机预览 | ADB 巡检截图目录 | [outputs/adb-patrol](./outputs/adb-patrol) | Android 真机巡检截图 |
| 真机预览 | 扫码后登录页截图 | [14-after-scan-pull.png](./outputs/adb-patrol/14-after-scan-pull.png) | 最新扫码后页面截图 |
| 真机预览 | 欢迎页基线截图 | [00-baseline.png](./outputs/adb-patrol/00-baseline.png) | 真机欢迎页基线 |
| 种子智能体 | 种子开发者 PRD 与状态机 | [种子成长规划师_开发者PRD与状态机_V4(1).md](./种子成长规划师_开发者PRD与状态机_V4(1).md) | 种子智能体产品和状态机主文档 |
| 种子智能体 | 种子主人格 Chatflow 设计 | [种子主人格_MVP核心Chatflow详细设计_V1(1).md](./种子主人格_MVP核心Chatflow详细设计_V1(1).md) | `zhongzi_main_chat` 详细设计 |
| 种子智能体 | 种子 V5 固定状态机 | [seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md](./seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md) | MVP 固定状态机和 V2 路线 |
| 种子智能体 | 当前记忆架构 | [memory-architecture-current.md](./memory-architecture-current.md) | 记忆摘要和注入架构 |
| 种子智能体 | Router V2 API 合同 | [ROUTER_V2_API_CONTRACT.md](./ROUTER_V2_API_CONTRACT.md) | 多智能体路由接口参考 |
| Dify/Prompt | 资产报告工作流 Prompt | [asset-report-workflow.md](./docs/dify-prompts/asset-report-workflow.md) | 资产报告生成提示词 |
| Dify/Prompt | 资产盘点工作流 Prompt | [asset-audit-flow.md](./docs/dify-prompts/asset-audit-flow.md) | 资产盘点提示词 |
| Dify/Prompt | 任务复盘工作流 Prompt | [task-review-flow.md](./docs/dify-prompts/task-review-flow.md) | 任务复盘提示词 |
| 核心代码 | 主对话页 JS | [pages/conversation/conversation.js](./pages/conversation/conversation.js) | 小程序主对话逻辑 |
| 核心代码 | 项目详情页 JS | [pages/project-detail/project-detail.js](./pages/project-detail/project-detail.js) | 项目详情和成果资产库 |
| 核心代码 | 后端路由服务 | [backend/src/router/router.service.ts](./backend/src/router/router.service.ts) | 路由、Dify、流式事件核心 |
| 核心代码 | 机会流服务 | [backend/src/opportunity/opportunity.service.ts](./backend/src/opportunity/opportunity.service.ts) | 挖宝机会和项目承接 |
| 核心代码 | 任务服务 | [backend/src/task.service.ts](./backend/src/task.service.ts) | 任务和跟进逻辑 |
| 核心代码 | Prisma schema | [backend/prisma/schema.prisma](./backend/prisma/schema.prisma) | 数据模型定义 |

## 十、汇报口径简版

4 月，一树 OPC 完成了从小程序原型到可验收体验版的核心推进。项目已具备微信小程序主对话、NestJS/Fastify 后端、登录体系、资产盘点、资产报告流式进度、挖宝机会流、项目承接、任务跟进、成果资产库、Dify 工作流接入、自动化 smoke、发布预检和 Android 真机巡检能力。同时，本月沉淀了“种子成长规划师/种子智能体”方案，完成儿童天赋盘点、种子主人格、固定路由状态机、MVP Chatflow、记忆架构和数据库设计任务拆分。本月共 66 个提交，涉及 586 个文件，新增约 12.7 万行。当前 OPC 核心功能完成度约 90%，上线准备度约 80%-85%；种子智能体当前处于产品与技术方案完成、待编码落地阶段。下一阶段重点是生产 HTTPS、密钥轮换、正式 smoke、真机授权链路最终验收，以及种子智能体 Prisma 迁移、Dify Chatflow 配置和前端雷达图卡片实现。
