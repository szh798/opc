# 一树 OPC 前端开发任务拆解清单

## 目标

将当前小程序实现为“对话即操作系统”的微信小程序，而不是多个割裂页面的集合。

核心原则：

1. 以 `conversation` 作为主容器页。
2. onboarding、AI 助手、IP 助手、每日任务反馈、周报/月报/召回都优先在对话流中完成。
3. 独立页面只保留：
   - `landing`
   - `conversation`
   - `profile`
   - `project-detail`
   - `tree`
   - `share-preview`

## 本轮已完成

- [x] 新增 `pages/conversation` 作为主对话容器
- [x] 新增 `pages/share-preview` 作为分享预览页
- [x] 将 welcome CTA 切到 `conversation?scene=onboarding_intro`
- [x] 将 AI / IP / 日常反馈 / 周报 / 月报 / 召回收束为 conversation scene
- [x] 按建议补齐 `components/shell`、`components/chat`、`components/cards`、`components/overlays`
- [x] 补齐会话路由、登录、session、tool routing、company、task、share 等 services
- [x] 接通 header / sidebar / bottom input / project sheet / company sheet 到 conversation
- [x] 建立任务拆解文档，方便后续逐阶段继续填业务细节

---

## P0：架构与骨架

### 页面结构

- [ ] 新建 `pages/conversation`
- [ ] 新建 `pages/share-preview`
- [ ] 将 welcome CTA 统一跳转到 `conversation?scene=onboarding`
- [ ] 将 AI/IP/周报/月报/召回等场景收束为 conversation scene，而不是独立主页面

### 组件结构

- [ ] `components/shell/app-header`
- [ ] `components/shell/app-sidebar`
- [ ] `components/shell/bottom-input`
- [ ] `components/overlays/project-sheet`
- [ ] `components/overlays/company-sheet`
- [ ] `components/chat/message-bubble`
- [ ] `components/chat/quick-replies`
- [ ] `components/chat/typing-indicator`
- [ ] `components/cards/login-card`
- [ ] `components/cards/task-card`
- [ ] `components/cards/leverage-card`
- [ ] `components/cards/artifact-card`
- [ ] `components/cards/report-card`
- [ ] `components/cards/milestone-card`
- [ ] `components/cards/social-proof-card`

### services 结构

- [ ] `services/agent.service.js`
- [ ] `services/auth.service.js`
- [ ] `services/session.service.js`
- [ ] `services/onboarding.service.js`
- [ ] `services/conversation.service.js`
- [ ] `services/intent-routing.service.js`
- [ ] `services/project.service.js`
- [ ] `services/profile.service.js`
- [ ] `services/company.service.js`
- [ ] `services/task.service.js`
- [ ] `services/report.service.js`
- [ ] `services/share.service.js`

---

## P1：首次进入闭环

- [ ] Landing 文案与视觉还原
- [ ] 对话内欢迎消息
- [ ] 登录卡片
- [ ] 登录成功卡片原地更新
- [ ] 昵称确认
- [ ] 分流问题
- [ ] 园区钩子卡片
- [ ] 4 条分支的第一轮追问

验收：

- 用户无需离开对话页即可完成首次进入
- 登录不是独立页面
- 分流后 header 角色状态可变化

---

## P2：系统框架

- [ ] Header 三点布局
- [ ] Sidebar 六区结构
- [ ] 个人档案页
- [ ] 项目底部弹层
- [ ] 项目详情 `对话 / 成果` 双 tab
- [ ] 公司管理面板

验收：

- 头像打开侧边栏
- `+` 打开项目弹层
- `公司` 打开半屏管理面板
- 项目成果可查看、后续可继续扩展编辑

---

## P3：杠杆工具

- [ ] 首次点击 AI/IP 助手时出现杠杆理论引导
- [ ] AI 助手对话流
- [ ] IP 助手对话流
- [ ] 文案卡片的 “复制 / 下一条”

验收：

- 首次引导仅出现一次
- AI/IP 是 conversation scene，不是完全独立产品
- header 角色状态与气泡边框颜色一致

---

## P4：日常循环

- [ ] 今日任务卡
- [ ] 勾选完成交互
- [ ] 结果追问
- [ ] 反馈建议

验收：

- 任务不是静态展示
- 勾选后必须有后续追问和建议

---

## P5：留存与成就

- [ ] 成长树页
- [ ] 里程碑解锁卡片
- [ ] 周报卡片
- [ ] 月度体检卡片
- [ ] 社会证明召回卡片
- [ ] 分享预览页

验收：

- 用户能明确看到进度
- 卡片可分享
- 停滞召回有同路人数据与 CTA

---

## 高风险偏差提醒

- [ ] 不要把 25 个 screen 做成 25 个主页面
- [ ] 不要做前置登录页
- [ ] 不要做手动角色 tab 切换
- [ ] 不要让 sidebar / company 变成“后台系统”
- [ ] 不要过度彩色化或科技感 UI
- [ ] 不要让快捷回复太长、太多
- [ ] 每张关键卡片都要有明确 CTA

---

## 当前建议实施顺序

1. 先完成主容器重构
2. 再统一卡片体系
3. 再收束导航与状态
4. 最后补具体业务细节与动画
