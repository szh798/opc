# AGENTS.md

## Project
这是「一树OPC」微信小程序原生前端项目。
产品定位：AI-Native 一人公司智能体操作系统
核心理念：对话即操作系统（Conversation as OS）

## Source of truth
1. PRODUCT_MANUAL.md 是业务和交互真相
2. screen_01.png ~ screen_25.png 是视觉真相
3. 若冲突：
   - 视觉以截图为准
   - 业务逻辑以 PRODUCT_MANUAL.md 为准

## Hard constraints
- 必须使用微信小程序原生
- 不要使用 uni-app / Taro / React / H5
- 以对话页为产品核心
- 其他能力采用侧边栏、半屏弹层、全屏页方式承载
- 页面代码中不要散落接口调用
- 所有数据请求走 services
- 支持 mock / real api 切换
- chat service 必须预留流式能力

## UI style
- 沉稳、锋利、有温度、不废话、像个活人
- 不要做成传统后台
- 90% 黑白灰
- 颜色只承担状态作用
- 对话区留白大
- 卡片内部信息密度高
- 快捷回复使用胶囊按钮
- Header 中间显示当前角色图标和名称
- 角色色：
  - 一树OPC：黑
  - 一树·挖宝：紫
  - 一树·搞钱：绿
  - 一树·扎心：红
  - 一树·管家：蓝

## Architecture
项目至少包含：
- /pages
- /components
- /services
- /mock
- /utils
- README.md
- API_CONTRACT.md
- TODO.md

## Services
至少包含：
- auth.js
- user.js
- chat.js
- project.js
- result.js
- company.js
- task.js
- growth.js
- report.js
- share.js

统一响应格式：
{
  "code": 0,
  "message": "ok",
  "data": {}
}

## Working style
- 复杂任务分阶段完成
- 每一轮先实现最小可运行闭环，再补细节
- 每完成一轮都自查
- 不要只输出方案，优先输出代码
- 不要省略页面
- 不要把“以后再做”当成交付完成

## Validation
每次改动后尽量检查：
- 页面是否可运行
- 交互链路是否可点击
- 是否有重复代码
- 是否有页面内硬编码数据
- 是否偏离 PRODUCT_MANUAL.md 和原型截图