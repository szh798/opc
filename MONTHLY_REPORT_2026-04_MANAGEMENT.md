# 一树 OPC 项目月报 - 管理汇报版

报告周期：2026-04-01 至 2026-04-30  
项目范围：OPC 小程序与后端、Dify 工作流、自动化/真机验收、种子智能体方案  
说明：本文档中的文件链接均使用 VS Code URI，点击后可直接在 VS Code 中打开对应文件。

## 一、本月目标完成率

本月整体目标完成率：约 88%。其中 OPC 核心产品闭环完成度约 90%，上线准备度约 80%-85%，种子智能体方案完成度约 75%，自动化与真机巡检链路完成度约 80%。

| 目标 | 完成率 | 本月完成情况 | 关键产物 |
| --- | ---: | --- | --- |
| OPC 小程序主体验闭环 | 90% | 主对话、登录卡片、项目入口、卡片渲染、成果资产库和输入链路基本可用 | [pages/conversation/conversation.js](vscode://file/D:/workspace/opc/pages/conversation/conversation.js), [pages/project-detail/project-detail.js](vscode://file/D:/workspace/opc/pages/project-detail/project-detail.js) |
| 后端核心 API 与业务服务 | 90% | 完成认证、路由、项目、任务、报告、机会流、资产盘点等核心模块 | [backend/src/router/router.service.ts](vscode://file/D:/workspace/opc/backend/src/router/router.service.ts), [backend/src/project.service.ts](vscode://file/D:/workspace/opc/backend/src/project.service.ts), [backend/src/task.service.ts](vscode://file/D:/workspace/opc/backend/src/task.service.ts) |
| 登录与身份体系 | 85% | 微信登录、手机号登录、短信验证码、开发态模拟新用户登录均已形成；正式授权还需生产环境复验 | [backend/src/auth/auth.service.ts](vscode://file/D:/workspace/opc/backend/src/auth/auth.service.ts), [services/auth.service.js](vscode://file/D:/workspace/opc/services/auth.service.js), [components/cards/login-card/login-card.js](vscode://file/D:/workspace/opc/components/cards/login-card/login-card.js) |
| 资产盘点与报告流式进度 | 90% | 已完成 SSE 流式事件、进度卡、最终报告卡、markup 过滤和真实流 smoke | [backend/src/router/router-sse.ts](vscode://file/D:/workspace/opc/backend/src/router/router-sse.ts), [backend/src/router/streaming-markup-filter.ts](vscode://file/D:/workspace/opc/backend/src/router/streaming-markup-filter.ts), [components/cards/asset-report-progress-card/asset-report-progress-card.js](vscode://file/D:/workspace/opc/components/cards/asset-report-progress-card/asset-report-progress-card.js) |
| 挖宝机会流与项目承接 | 85% | 完成 opportunity draft、方向生成、方向选择、深聊、立项和项目承接主链路 | [backend/src/opportunity/opportunity.service.ts](vscode://file/D:/workspace/opc/backend/src/opportunity/opportunity.service.ts), [backend/src/opportunity/opportunity-dify.service.ts](vscode://file/D:/workspace/opc/backend/src/opportunity/opportunity-dify.service.ts), [services/opportunity.service.js](vscode://file/D:/workspace/opc/services/opportunity.service.js) |
| 成果资产库与任务推进 | 80% | 项目详情页已支持成果概览、成果条目、筛选、详情 sheet 和继续聊；任务推进仍需继续补后端状态闭环 | [components/cards/artifact-item-card/artifact-item-card.js](vscode://file/D:/workspace/opc/components/cards/artifact-item-card/artifact-item-card.js), [components/common/artifact-detail-sheet/artifact-detail-sheet.js](vscode://file/D:/workspace/opc/components/common/artifact-detail-sheet/artifact-detail-sheet.js), [components/cards/daily-tasks-card/daily-tasks-card.js](vscode://file/D:/workspace/opc/components/cards/daily-tasks-card/daily-tasks-card.js) |
| 种子智能体方案 | 75% | 完成产品定位、三角色体系、MVP 固定状态机、Chatflow、数据库字段和开发分工；尚未完整编码落地 | [种子成长规划师_开发者PRD与状态机_V4(1).md](vscode://file/D:/workspace/opc/种子成长规划师_开发者PRD与状态机_V4(1).md), [种子主人格_MVP核心Chatflow详细设计_V1(1).md](vscode://file/D:/workspace/opc/种子主人格_MVP核心Chatflow详细设计_V1(1).md), [seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md](vscode://file/D:/workspace/opc/seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md) |
| 发布预检与真机验收 | 80% | 本地 release preflight、Minium 自动化、ADB 真机巡检和 USB reverse 调试链路已跑通；生产 HTTPS 仍是阻塞项 | [LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md](vscode://file/D:/workspace/opc/LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md), [outputs/minium-release-run.log](vscode://file/D:/workspace/opc/outputs/minium-release-run.log), [outputs/adb-patrol/14-after-scan-pull.png](vscode://file/D:/workspace/opc/outputs/adb-patrol/14-after-scan-pull.png) |

核心数据：
- 本月 Git 提交数：66 个。
- 涉及唯一文件：586 个。
- 累计新增：约 127147 行。
- 累计删除：约 34979 行。
- 当前基线：`main` 分支，`30cb423`。

## 二、我们做得好的

1. 产品主链路从原型推进到可验收闭环。

本月不只是补页面，而是把“登录 - 主对话 - 资产盘点 - 报告生成 - 机会方向 - 项目承接 - 成果资产库 - 任务跟进”串成了完整体验。主链路对应文件集中在 [pages/conversation/conversation.js](vscode://file/D:/workspace/opc/pages/conversation/conversation.js)、[backend/src/router/router.service.ts](vscode://file/D:/workspace/opc/backend/src/router/router.service.ts)、[pages/project-detail/project-detail.js](vscode://file/D:/workspace/opc/pages/project-detail/project-detail.js)。

2. 后端能力补得比较完整，没有只停留在前端 mock。

后端已经覆盖认证、路由、项目、任务、报告、机会流、Dify 调用、健康检查和发布预检。核心模块包括 [backend/src/auth/auth.service.ts](vscode://file/D:/workspace/opc/backend/src/auth/auth.service.ts)、[backend/src/router/router.service.ts](vscode://file/D:/workspace/opc/backend/src/router/router.service.ts)、[backend/src/opportunity/opportunity.service.ts](vscode://file/D:/workspace/opc/backend/src/opportunity/opportunity.service.ts)、[backend/src/project.service.ts](vscode://file/D:/workspace/opc/backend/src/project.service.ts)、[backend/src/task.service.ts](vscode://file/D:/workspace/opc/backend/src/task.service.ts)。

3. 资产报告流式体验做出了真实进度感。

资产报告不再是“用户等待最终结果”，而是通过 SSE 事件展示生成过程，包括 `card.created`、`card.patch`、`card.completed`、`final_report.created` 和 `stream.done`。相关产物包括 [backend/src/router/router-sse.ts](vscode://file/D:/workspace/opc/backend/src/router/router-sse.ts)、[backend/src/router/streaming-markup-filter.ts](vscode://file/D:/workspace/opc/backend/src/router/streaming-markup-filter.ts)、[components/cards/asset-report-progress-card/asset-report-progress-card.js](vscode://file/D:/workspace/opc/components/cards/asset-report-progress-card/asset-report-progress-card.js)、[backend/reports/asset-report-stream-live-smoke.md](vscode://file/D:/workspace/opc/backend/reports/asset-report-stream-live-smoke.md)。

4. 开始建立“可上线”的工程纪律。

本月补齐了上线前 checklist、release preflight、生产部署配置、Nginx 反代配置、PM2 配置、数据库备份脚本和 smoke 脚本。对应产物包括 [LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md](vscode://file/D:/workspace/opc/LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md)、[backend/scripts/release-preflight.js](vscode://file/D:/workspace/opc/backend/scripts/release-preflight.js)、[deploy/tencent-cloud/README.md](vscode://file/D:/workspace/opc/deploy/tencent-cloud/README.md)、[deploy/tencent-cloud/opc-backend.conf](vscode://file/D:/workspace/opc/deploy/tencent-cloud/opc-backend.conf)。

5. 真机和自动化验证开始进入常规流程。

完成 Android ADB 连接、scrcpy 控制、USB reverse 调试、微信开发者工具预览码、Minium release smoke。关键产物包括 [outputs/minium-release-run.log](vscode://file/D:/workspace/opc/outputs/minium-release-run.log)、[outputs/summary.json](vscode://file/D:/workspace/opc/outputs/summary.json)、[outputs/wechat-preview/opc-preview-android-usb-loopback-20260429-173527.png](vscode://file/D:/workspace/opc/outputs/wechat-preview/opc-preview-android-usb-loopback-20260429-173527.png)、[outputs/adb-patrol/14-after-scan-pull.png](vscode://file/D:/workspace/opc/outputs/adb-patrol/14-after-scan-pull.png)。

6. 种子智能体不是口头想法，已经沉淀到可开发文档。

种子智能体已经完成产品定位、三角色体系、MVP 固定路由、天赋盘点五板块、种子主人格 Chatflow、RAG 知识库、数据库设计和开发分工。关键文档包括 [种子成长规划师_开发者PRD与状态机_V4(1).md](vscode://file/D:/workspace/opc/种子成长规划师_开发者PRD与状态机_V4(1).md)、[种子主人格_MVP核心Chatflow详细设计_V1(1).md](vscode://file/D:/workspace/opc/种子主人格_MVP核心Chatflow详细设计_V1(1).md)、[seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md](vscode://file/D:/workspace/opc/seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md)。

## 三、我们应该做得更好的

1. 上线阻塞项应该更早前置。

生产 HTTPS、DNS、证书、Nginx 反代和微信合法域名是上线必要条件，但本月末才成为明确阻塞。后续要在功能开发中段就同步验证生产 `/health` 和 `/ready`。相关文件：[LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md](vscode://file/D:/workspace/opc/LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md)、[deploy/tencent-cloud/opc-backend.conf](vscode://file/D:/workspace/opc/deploy/tencent-cloud/opc-backend.conf)。

2. 敏感信息和临时产物管理还不够严格。

历史 smoke token 曾进入 Git 历史，虽然已经识别并写入风险清单，但说明本地调试产物和发布产物之间的边界要更清楚。后续需要把 `.env`、token、日志、临时文件的忽略规则和轮换流程常态化。相关文件：[.gitignore](vscode://file/D:/workspace/opc/.gitignore)、[backend/scripts/release-preflight.js](vscode://file/D:/workspace/opc/backend/scripts/release-preflight.js)。

3. 自动化测试覆盖还不够系统。

目前已有 Minium release smoke、资产报告 smoke、Dify timeout smoke，但还没有把“登录 - 资产盘点 - 项目承接 - 成果资产库 - 任务推进”形成稳定的端到端回归套件。相关测试基础：[tests/minium_release/suite.json](vscode://file/D:/workspace/opc/tests/minium_release/suite.json)、[tests/minium_release/test_conversation_ui_contract.py](vscode://file/D:/workspace/opc/tests/minium_release/test_conversation_ui_contract.py)、[backend/scripts/asset-report-stream-live-smoke.ts](vscode://file/D:/workspace/opc/backend/scripts/asset-report-stream-live-smoke.ts)。

4. 任务推进闭环还需要更明确。

任务卡和项目详情页已经有基础，但“任务完成后如何推进下一轮 follow-up、如何同步 `nextValidationAction`、如何让前端显示明确反馈”还没有完全闭环。相关文件：[backend/src/task.service.ts](vscode://file/D:/workspace/opc/backend/src/task.service.ts)、[components/cards/daily-tasks-card/daily-tasks-card.js](vscode://file/D:/workspace/opc/components/cards/daily-tasks-card/daily-tasks-card.js)。

5. 文档产物多，但版本和入口需要再整理。

本月沉淀了很多 PRD、Prompt、部署、测试和报告文档，但入口分散。下个月需要建立一个清晰的文档索引，把“当前有效版本”和“历史参考版本”区分开。现有索引基础：[docs/agent-memory/INDEX.md](vscode://file/D:/workspace/opc/docs/agent-memory/INDEX.md)、[docs/dify-prompts/asset-report-workflow.md](vscode://file/D:/workspace/opc/docs/dify-prompts/asset-report-workflow.md)。

6. 种子智能体还停留在方案阶段，需要尽快切到最小可运行版本。

种子智能体的 PRD 已经比较完整，但还需要落实 Prisma 迁移、Dify Chatflow 配置、雷达图卡片组件和最小端到端 smoke。相关文档：[seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md](vscode://file/D:/workspace/opc/seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md)、[种子主人格_MVP核心Chatflow详细设计_V1(1).md](vscode://file/D:/workspace/opc/种子主人格_MVP核心Chatflow详细设计_V1(1).md)。

## 四、下个月要做什么

### 重要且紧急

| 事项 | 目标 | 负责人建议 | 关联文件 |
| --- | --- | --- | --- |
| 打通生产 HTTPS | `https://api.atreeagent.com/health` 和 `/ready` 返回 200 | 后端/运维 | [deploy/tencent-cloud/opc-backend.conf](vscode://file/D:/workspace/opc/deploy/tencent-cloud/opc-backend.conf), [deploy/tencent-cloud/README.md](vscode://file/D:/workspace/opc/deploy/tencent-cloud/README.md) |
| 轮换历史 token 和生产密钥 | 废弃历史 smoke token，同步生产 `JWT_SECRET` | 后端/运维 | [LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md](vscode://file/D:/workspace/opc/LAUNCH_PRE_RELEASE_CHECKLIST_2026-04-29.md), [backend/src/shared/app-config.ts](vscode://file/D:/workspace/opc/backend/src/shared/app-config.ts) |
| 跑完整 release check | 不跳过真实 smoke，完成上线前自动化检查 | 后端 | [backend/scripts/release-preflight.js](vscode://file/D:/workspace/opc/backend/scripts/release-preflight.js), [backend/scripts/release-like-config-smoke.ts](vscode://file/D:/workspace/opc/backend/scripts/release-like-config-smoke.ts) |
| 真机验收登录链路 | 微信登录、手机号登录、验证码登录、开发登录各跑一遍 | 前端/后端 | [components/cards/login-card/login-card.js](vscode://file/D:/workspace/opc/components/cards/login-card/login-card.js), [services/auth.service.js](vscode://file/D:/workspace/opc/services/auth.service.js), [backend/src/auth/auth.service.ts](vscode://file/D:/workspace/opc/backend/src/auth/auth.service.ts) |
| 资产报告真机端到端验收 | 从触发资产盘点到最终报告卡完整跑通 | 前端/后端 | [backend/scripts/asset-report-stream-live-smoke.ts](vscode://file/D:/workspace/opc/backend/scripts/asset-report-stream-live-smoke.ts), [components/cards/asset-report-progress-card/asset-report-progress-card.js](vscode://file/D:/workspace/opc/components/cards/asset-report-progress-card/asset-report-progress-card.js) |
| 任务推进闭环修复 | 完成任务后能稳定推进下一轮 follow-up | 后端/前端 | [backend/src/task.service.ts](vscode://file/D:/workspace/opc/backend/src/task.service.ts), [components/cards/daily-tasks-card/daily-tasks-card.js](vscode://file/D:/workspace/opc/components/cards/daily-tasks-card/daily-tasks-card.js) |
| 种子智能体 MVP 落地切片 | 先落地数据模型、一个 onboarding flow、一个 `zhongzi_main_chat` smoke | 产品/后端/Dify/前端 | [seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md](vscode://file/D:/workspace/opc/seed_PRD_V5_两个人格固定状态机+未来迭代路径(1).md), [backend/prisma/schema.prisma](vscode://file/D:/workspace/opc/backend/prisma/schema.prisma) |

### 重要但不紧急

| 事项 | 目标 | 负责人建议 | 关联文件 |
| --- | --- | --- | --- |
| 建立文档索引 | 把 PRD、Prompt、部署、测试、报告分成当前版本和历史版本 | 产品/研发 | [docs/agent-memory/INDEX.md](vscode://file/D:/workspace/opc/docs/agent-memory/INDEX.md), [MONTHLY_REPORT_2026-04.md](vscode://file/D:/workspace/opc/MONTHLY_REPORT_2026-04.md) |
| 补完整端到端自动化套件 | 覆盖登录、资产盘点、项目承接、成果资产库、任务推进 | 测试/研发 | [tests/minium_release/suite.json](vscode://file/D:/workspace/opc/tests/minium_release/suite.json), [tests/minium_asset_report/test_asset_report_flow.py](vscode://file/D:/workspace/opc/tests/minium_asset_report/test_asset_report_flow.py) |
| 统一错误提示和异常态 | 登录失败、网络失败、Dify 超时、SSE 断连都有明确用户反馈 | 前端/后端 | [utils/request.js](vscode://file/D:/workspace/opc/utils/request.js), [backend/src/shared/error-report.service.ts](vscode://file/D:/workspace/opc/backend/src/shared/error-report.service.ts) |
| 建立监控指标 | 监控登录成功率、Dify 超时率、5xx、SSE 断连、数据库连接池 | 后端/运维 | [backend/src/shared/error-report.service.ts](vscode://file/D:/workspace/opc/backend/src/shared/error-report.service.ts), [backend/src/main.ts](vscode://file/D:/workspace/opc/backend/src/main.ts) |
| 种子雷达图和更新卡片组件 | 为种子 MVP 做儿童天赋雷达图、访谈进度和雷达更新卡片 | 前端 | [components/cards/asset-report-progress-card/asset-report-progress-card.js](vscode://file/D:/workspace/opc/components/cards/asset-report-progress-card/asset-report-progress-card.js), [theme/roles.js](vscode://file/D:/workspace/opc/theme/roles.js) |
| Dify Prompt 版本管理 | 给资产盘点、机会流、种子 Chatflow 建版本记录 | 后端/Dify | [docs/dify-prompts/asset-report-workflow.md](vscode://file/D:/workspace/opc/docs/dify-prompts/asset-report-workflow.md), [docs/dify-prompts/asset-audit-flow.md](vscode://file/D:/workspace/opc/docs/dify-prompts/asset-audit-flow.md) |
| 清理临时产物 | 清理 `.pyc`、临时日志、旧预览码、过期报告 | 研发 | [.gitignore](vscode://file/D:/workspace/opc/.gitignore), [outputs/minium-release-run.log](vscode://file/D:/workspace/opc/outputs/minium-release-run.log) |

