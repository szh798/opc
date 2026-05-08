# 前端硬编码话术与文案清单

生成日期：2026-05-08

## 统计口径

- 范围：`app.js`、`app.json`、`pages/`、`components/`、`services/`、`utils/` 下的 `.js`、`.wxml`、`.json`。
- 排除：后端代码、测试、历史报告文档、样式文件、`*.local.*` / private 配置文件。
- 纳入：页面静态文案、组件按钮/占位/空态/加载/错误文案、Toast/Modal 文案、前端 Mock/兜底对话话术、服务层错误提示。
- 行号：指向当前源码中的首个出现位置，后续调整源码后可能变化。

## 总览

- 涉及文件：82 个
- 文案条目：1564 条
- 全局配置：2 个文件 / 2 条
- 页面：30 个文件 / 924 条
- 开发预览页：2 个文件 / 44 条
- 组件：27 个文件 / 157 条
- 对话场景话术：1 个文件 / 183 条
- Mock 对话话术：1 个文件 / 15 条


## 全局配置


### app.json

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 22 | string | 一树OPC |

## 页面

### pages/ai-assistant/ai-assistant.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | wxml-text | 正在进入智能助手... |

### pages/conversation/conversation.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 66 | string | 一树正在开发 |
| 68 | string | 一树正在开发 |
| 90 | string | 想做一人公司，没方向 |
| 91 | string | 我现在卡住了 |
| 92 | string | 我想放大规模 |
| 93 | string | 看看园区政策 |
| 97 | string | 报告好了。你真正能变现的不是履历，而是这组组合。 |
| 128 | string | 请先登录后再使用 |
| 161 | string | 访客 |
| 179 | string | 访客 |
| 600 | string | 重试上一步 |
| 644 | string | 创建项目 |
| 646 | string | 例如：智能获客实验 |
| 647 | string | 创建 |
| 670 | string | 深聊工作流返回格式不完整，请检查 Dify 的 deep_dive_result 输出配置后重试 |
| 674 | string | 智能体暂时没有返回内容，请稍后再试 |
| 678 | string | 智能体暂时不可用，请稍后重试 |
| 682 | string | 智能体这次思考超时了，请稍后重试，或在 Dify 中检查模型响应耗时 |
| 686 | string | 智能体这轮没有正常返回，我先按当前信息继续帮你往下拆。 |
| 689 | string | messages 参数非法 |
| 690 | string | 智能体暂时不可用：Dify 当前模型配置不兼容聊天消息格式，请检查该应用绑定的模型或工作流节点 |
| 695 | string | 智能体这轮没有正常返回，我先按当前信息继续帮你往下拆。 |
| 697 | string | 智能体暂时不可用： |
| 774 | string | 待开始 |
| 775 | string | 进行中 |
| 776 | string | 已完成 |
| 777 | string | 已完成 |
| 778 | string | 卡住了 |
| 779 | string | 已跳过 |
| 781 | string | 待开始 |
| 791 | string | 聊聊自己反馈 |
| 792 | string | 判断信号 |
| 797 | string | 聊聊自己反馈 |
| 798 | string | 聊聊客户反馈 |
| 802 | string | 聊聊自己反馈 |
| 803 | string | 复盘这条 |
| 808 | string | 继续聊 |
| 809 | string | 换一个 |
| 813 | string | 完成了 |
| 814 | string | 我卡住了 |
| 815 | string | 换一个 |
| 824 | string | 有客户原话 |
| 825 | string | 只有卡点 |
| 826 | string | 先判断信号 |
| 831 | string | 有客户回应 |
| 832 | string | 没人回应 |
| 833 | string | 遇到卡点 |
| 837 | string | 补充结果 |
| 838 | string | 遇到问题 |
| 839 | string | 先复盘这条 |
| 861 | string | 一树帮你推动 |
| 898 | string | 捕捉机会 |
| 899 | string | 结构化梳理 |
| 900 | string | 机会评分中 |
| 901 | string | 机会比较中 |
| 902 | string | 验证推进中 |
| 906 | string | 待判断 |
| 907 | string | 候选中 |
| 908 | string | 已选中 |
| 909 | string | 已搁置 |
| 910 | string | 已否掉 |
| 921 | template | 当前阶段<br>${OPPORTUNITY_STAGE_LABELS[source.opportunityStage] \|\| "待识别"} |
| 922 | template | 当前评分<br>${scoreValue > 0 ? `${scoreValue}/100` : "待评分"} |
| 922 | template | : "待评分"} |
| 926 | template | 下一步验证动作<br>${source.nextValidationAction} |
| 929 | template | 最近一次验证信号<br>${source.lastValidationSignal} |
| 951 | string | 当前主线机会 |
| 961 | string | 我暂时没生成出稳定的方向，先补充一点你最近的经历、资源或想做的事。 |
| 967 | string | 3 个可以先验证的方向 |
| 984 | string | 立项前先把边界定清 |
| 1013 | string | 这个方向可以继续聊。你先补充一下第一批目标用户是谁，以及你准备怎么拿到真实反馈。 |
| 1025 | string | 项目已立项 |
| 1083 | string | 输入消息... |
| 1396 | string | 输入消息... |
| 1450 | string | 一树帮你推动 |
| 1571 | string | 资产报告已生成，点击卡片即可查看。 |
| 1574 | string | 资产盘点报告已生成 |
| 1575 | string | 你可以现在查看报告，也可以稍后到个人页继续。 |
| 1576 | string | 查看报告 |
| 1577 | string | 稍后 |
| 1594 | template | 资产报告生成失败：${status.lastError} |
| 1595 | string | 资产报告生成失败，请稍后重试。 |
| 1628 | string | 资产报告生成中... |
| 1668 | template | 资产报告生成失败：${folded.error} |
| 1681 | string | 资产报告生成失败，请稍后重试 |
| 1713 | template | 继续补充${activeSkill.title}需要的材料… |
| 1804 | string | 一树正在处理中 |
| 1814 | string | 和一树继续聊… |
| 1843 | string | 和一树继续聊… |
| 1869 | string | 路由处理失败，请重试 |
| 1881 | string | 路由处理失败 |
| 2328 | string | 正在输出，请稍后 |
| 2357 | string | 一树正在处理中 |
| 2372 | string | 和一树继续聊… |
| 2476 | string | 和一树继续聊… |
| 2515 | string | 路由处理失败，请重试 |
| 2528 | string | 路由处理失败 |
| 2596 | string | 我们继续上次没完成的资产盘点。 |
| 2817 | string | 微信已登录 |
| 2818 | string | 登录成功，我们可以继续了 |
| 2819 | string | 已登录 |
| 2820 | string | 小明 |
| 2832 | string | 小明 |
| 2869 | string | 先点一下登录卡片，我们 1 秒进入正式对话。 |
| 2877 | template | 叫我${nextUser.nickname} |
| 2955 | string | 还没注册 |
| 2955 | string | 已经注册了 |
| 2989 | string | 我先记下你还没注册。为了把政策匹配做准，下一步先确认地区：你主要想查哪个城市或区域的政策？ |
| 2990 | string | 我先记下你已注册。为了把政策匹配做准，下一步先确认地区：你主要想查哪个城市或区域的政策？ |
| 3000 | string | 杭州 |
| 3001 | string | 上海 |
| 3002 | string | 我自己输入地区 |
| 3053 | string | 已停止接收 |
| 3054 | template | ${currentText}<br><br>（已停止） |
| 3232 | string | 一树正在思考中... |
| 3300 | string | 抱歉，当前智能体暂时不可用，请稍后再试。 |
| 3528 | string | 使用帮助 |
| 3528 | string | 隐私政策 |
| 3528 | string | 用户协议 |
| 3532 | string | 使用帮助 |
| 3533 | string | 侧边栏里的最近聊天支持左滑删除；更多账号与聊天管理功能已放到设置页。 |
| 3587 | string | 继续推进项目 |
| 3599 | string | 回到对话继续 |
| 3640 | string | 历史会话缺少 ID，请刷新后重试 |
| 3656 | string | 加载中... |
| 3677 | string | 已切换到这条历史会话。继续输入会沿用该会话上下文。 |
| 3696 | string | 历史消息未加载，已切换会话 |
| 3735 | string | 和一树继续聊... |
| 3765 | string | 删除最近聊天 |
| 3766 | string | 删除后，这条最近聊天会从侧边栏移除。 |
| 3767 | string | 删除 |
| 3783 | string | 删除中... |
| 3790 | string | 已删除 |
| 3796 | string | 删除最近聊天失败 |
| 3859 | string | 这个 Skill 暂时不可用 |
| 3873 | template | 和一树继续聊 ${skill.title}… |
| 3907 | string | 创建中... |
| 3913 | string | 探索中 |
| 3914 | string | 进行中 |
| 3934 | string | 创建项目失败，请稍后重试 |
| 4012 | string | 微信登录失败，请稍后重试 |
| 4059 | string | 登录成功后初始化失败，请重试 |
| 4082 | string | 手机号登录页打开失败 |
| 4177 | string | 模拟新用户登录失败，请稍后重试 |
| 4193 | string | 法律文档打开失败 |
| 4219 | string | 我卡住了 |
| 4224 | string | 换一个 |
| 4234 | string | 这项任务 |
| 4238 | template | ${actionLabel \|\| "复盘任务"}：${taskLabel} |
| 4248 | template | 继续聊「${item.label \|\| item.title \|\| "这项任务"}」 |
| 4253 | string | 这项任务 |
| 4271 | template | 可以。把「${taskLabel}」的真实结果、客户原话或卡点发我，我帮你判断下一步。 |
| 4278 | template | 补充「${taskLabel}」的结果... |
| 4310 | string | 任务状态同步失败 |
| 4357 | string | 一树正在基于任务结果生成下一步... |
| 4430 | string | 任务动作提交失败 |
| 4452 | string | 已记录卡点 |
| 4452 | string | 已换成新任务 |
| 4452 | string | 已跳过 |
| 4498 | string | 可以。你把当前卡住的地方发我，我帮你判断下一步怎么跟。 |
| 4530 | string | 任务状态同步失败 |
| 4575 | string | 一树正在基于任务结果生成下一步... |
| 4652 | string | 正在输出，请稍后 |
| 4658 | string | 我们继续聊这份资产报告，帮我判断下一步该从机会、获客还是定价开始。 |
| 4659 | string | 继续聊报告下一步 |
| 4672 | string | 一树正在接着报告往下聊... |
| 4714 | string | 帮我查查能薅什么 |
| 4721 | string | 帮我查查能薅什么 |
| 4730 | string | 帮我查查能薅什么 |
| 4764 | string | 已为你预留下一步操作 |
| 4793 | string | 暂无可复制的来源链接 |
| 4824 | template | 帮我解释这条政策：${item.title} |
| 4825 | string | 帮我解释这条政策 |
| 4828 | string | 重新检索最新政策 |
| 4829 | string | 先盘一盘我的资产 |
| 4830 | string | 帮我加入政策关注 |
| 4831 | string | 切去查政策 |
| 4832 | string | 继续当前流程 |
| 4833 | string | 好的，我们先盘一盘我手里有什么牌 |
| 4834 | string | 先聊点别的，不着急盘资产 |
| 4862 | string | 我想先盘一盘我的资产 |
| 4873 | template | 我们先围绕「${item.title}」拆一下适用条件、收益和风险，再判断是否值得你现在推进。 |
| 4874 | string | 我们先把这条政策拆开看，判断是否适合你当前阶段。 |
| 4882 | string | 已加入政策关注 |
| 4947 | string | 行，那我们先不强推任务。你先跟我说说，你最大的阻力到底是时间，情绪，还是不确定性？ |
| 4950 | string | 时间不够 |
| 4951 | string | 有点累 |
| 4952 | string | 怕白做 |
| 5004 | string | 生成方向中 |
| 5037 | string | 和一树继续聊… |
| 5041 | string | 生成方向失败 |
| 5083 | string | 正在处理，请稍后 |
| 5095 | string | 一树正在接住这个方向，拆成下一轮验证问题 |
| 5101 | string | 一树正在深聊这个方向… |
| 5104 | string | 正在深聊 |
| 5114 | string | 方向已更新，请重新确认 |
| 5119 | string | 回看 3 个方向 |
| 5120 | string | 换一组方向 |
| 5138 | string | 确认立项，或继续补充你的想法… |
| 5139 | string | 回答一树的问题，继续深聊这个方向… |
| 5147 | string | 选择方向失败 |
| 5150 | string | 回看 3 个方向 |
| 5151 | string | 换一组方向 |
| 5154 | string | 和一树继续聊… |
| 5174 | string | 立项中 |
| 5181 | string | 立项摘要已更新，请重新确认 |
| 5196 | string | 和一树继续聊… |
| 5201 | string | 立项失败 |
| 5223 | string | 已开启跟进提醒 |
| 5232 | string | 请先配置提醒模板 |
| 5234 | string | 当前微信版本不支持订阅 |
| 5235 | string | 未开启提醒 |
| 5240 | string | 开启提醒失败 |
| 5300 | string | 回看 3 个方向 |
| 5301 | string | 换一组方向 |
| 5307 | string | 一树正在开发中 |
| 5352 | string | 好的，我们先盘一盘我手里有什么牌 |
| 5357 | string | 先聊点别的，不着急盘资产 |
| 5371 | string | 快捷回复 |
| 5412 | string | 园区路线 |
| 5424 | string | 还没注册 |
| 5431 | string | 已经注册了 |
| 5437 | string | 杭州 |
| 5437 | string | 上海 |
| 5460 | string | 收到地区了。接下来告诉我你的行业方向，比如餐饮、教育、电商、软件服务等。 |
| 5467 | string | 直接在输入框告诉我地区即可 |
| 5481 | string | 在上班，没想过 |
| 5499 | string | 有想法，开始尝试了 |
| 5517 | string | 已经全职在做了 |
| 5529 | string | 我想开始盘点我的资产。 |
| 5530 | string | 对话模式 |
| 5531 | string | 我想开始盘点我的资产，我们用对话的方式来。 |
| 5556 | string | 我想先聊聊我现在主要在做的事。 |
| 5616 | string | 好，这个特别适合用智能助手做。我可以帮你搭一个客户消息自动分类 + 草稿回复的工作流。你现在主要用什么跟客户沟通？ |
| 5619 | string | 微信 |
| 5620 | string | 邮件 |
| 5621 | string | 多个渠道 |
| 5633 | string | 我已经记下了。下一步我会帮你把这个环节拆成「输入 - 判断 - 输出」三步，再设计成一条能重复用的智能流程。 |
| 5655 | string | 记住：你不需要一上来就说服对方，你只需要把风险降低，让他更容易跨出第一步。 |
| 5668 | string | 我懂了。那我们今天不讲大计划，只定一件 15 分钟内能完成的事。 |
| 5686 | string | 先选择一个方向 |
| 5704 | string | 回看 3 个方向 |
| 5705 | string | 换一组方向 |
| 5708 | string | 回答一树的问题，继续深聊这个方向… |
| 5713 | string | 继续 |
| 5733 | string | 一树正在继续深聊这个方向 |
| 5738 | string | 一树正在整理… |
| 5843 | string | 方向已更新，请重新确认 |
| 5848 | string | 回看 3 个方向 |
| 5849 | string | 换一组方向 |
| 5867 | string | 确认立项，或继续补充你的想法… |
| 5868 | string | 回答一树的问题，继续深聊这个方向… |
| 5876 | string | 深聊暂时失败，请稍后再试 |
| 5879 | string | 回看 3 个方向 |
| 5880 | string | 换一组方向 |
| 5895 | string | 正在输出，稍等片刻 |
| 5916 | string | 对话初始化失败，请稍后重试 |
| 5946 | template | 一树正在使用${selectedSkillTitle} |
| 5961 | string | 对话初始化失败，请稍后重试 |
| 5982 | template | 一树正在继续${activeSkillTitle} |
| 6040 | template | 任务「${taskLabel}」的反馈：${text} |
| 6053 | string | 一树正在判断这条反馈的信号强弱 |
| 6100 | string | 输入消息... |
| 6110 | string | 验证反馈 |

### pages/conversation/conversation.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 27 | wxml-text | ✓ |
| 42 | wxml-attr | title: 正在连接一树 |
| 42 | wxml-attr | desc: 拉取最近对话与项目中 |
| 50 | wxml-attr | title: 启动数据拉取失败 |
| 50 | wxml-attr | desc: 当前没有回退本地数据，请检查后端和网络后重试 |
| 80 | wxml-attr | devFreshButtonText: 模拟新用户登录 |
| 106 | wxml-text | 挖宝工作台 |
| 133 | wxml-text | 对象：{{item.targetUser}} |
| 134 | wxml-text | 痛点：{{item.corePain}} |
| 135 | wxml-text | 首个信号：{{item.estimatedTimeToFirstSignal}} · 成本：{{item.validationCost}} · 难度：{{item.executionDifficulty}} |
| 136 | wxml-text | 停止信号：{{item.killSignal}} |
| 144 | wxml-text | {{selectingDirectionId === item.directionId ? '正在深聊…' : '选这个方向深聊'}} |
| 152 | wxml-text | 换一组方向 |
| 158 | wxml-text | 首轮目标：{{message.summary.firstCycleGoal}} |
| 159 | wxml-text | 成功标准：{{message.successCriteriaText}} |
| 160 | wxml-text | 停止标准：{{message.killCriteriaText}} |
| 161 | wxml-text | 需要证据：{{message.evidenceNeededText}} |
| 168 | wxml-text | 确认立项 |
| 174 | wxml-text | 本轮目标：{{message.goal}} |
| 178 | wxml-text | 进入项目详情 |
| 179 | wxml-text | 开启 3 天提醒 |
| 187 | wxml-text | 对象：{{item.targetUser}} |
| 188 | wxml-text | 痛点：{{item.corePain}} |
| 189 | wxml-text | 首个信号：{{item.estimatedTimeToFirstSignal}} · 成本：{{item.validationCost}} · 难度：{{item.executionDifficulty}} |
| 190 | wxml-text | 停止信号：{{item.killSignal}} |
| 198 | wxml-text | {{selectingDirectionId === item.directionId ? '正在深聊…' : '选这个方向深聊'}} |
| 206 | wxml-text | 换一组方向 |
| 212 | wxml-text | 首轮目标：{{message.summary.firstCycleGoal}} |
| 213 | wxml-text | 成功标准：{{message.successCriteriaText}} |
| 214 | wxml-text | 停止标准：{{message.killCriteriaText}} |
| 215 | wxml-text | 需要证据：{{message.evidenceNeededText}} |
| 222 | wxml-text | 确认立项 |
| 228 | wxml-text | 本轮目标：{{message.goal}} |
| 232 | wxml-text | 进入项目详情 |
| 233 | wxml-text | 开启 3 天提醒 |
| 311 | wxml-attr | proofTitle: {{message.proofTitle \|\| '同路人数据'}} |
| 325 | wxml-text | {{message.title \|\| '下一步建议'}} |
| 333 | wxml-text | {{message.actionText \|\| '按这个继续'}} |
| 338 | wxml-text | ✓ |
| 361 | wxml-attr | placeholder: {{selectedSkillInputPlaceholder \|\| activeSkillSessionInputPlaceholder \|\| inputPlaceholder}} |
| 45 | string | 正在连接一树 |
| 46 | string | 拉取最近对话与项目中 |
| 53 | string | 启动数据拉取失败 |

| 144 | string | 正在深聊… |
| 144 | string | 选这个方向深聊 |
| 198 | string | 正在深聊… |
| 198 | string | 选这个方向深聊 |
| 314 | string | {{message.proofTitle \|\| '同路人数据'}} |
| 325 | string | 下一步建议 |
| 333 | string | 按这个继续 |

### pages/milestone/milestone.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 1 | string | 一树正在开发 |


### pages/monthly-check/monthly-check.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 3 | string | 一树正在开发 |
| 16 | string | 小 |
| 28 | string | 小 |



### pages/phone-login/phone-login.json

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | string | 手机号登录 |

### pages/phone-login/phone-login.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 3 | wxml-text | 手机号登录 |
| 4 | wxml-text | 用验证码确认是你本人，登录后继续和一树对话。 |
| 8 | wxml-attr | placeholder: 请输入手机号 |
| 20 | wxml-attr | placeholder: 请输入验证码 |
| 44 | wxml-text | 登录 |
| 13 | string | 请输入手机号 |
| 25 | string | 请输入验证码 |
| 35 | string | 获取验证码 |

### pages/profile/profile.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 18 | template | ${stage} · 连续打卡 ${streakDays} 天 |
| 30 | string | 访客 |
| 34 | string | 访客 |
| 35 | string | 访 |
| 87 | string | 先聊几轮，档案还没开始积累。 |
| 131 | string | 真实接口 |
| 132 | string | 已登录 |
| 132 | string | 未登录 |
| 173 | string | 从相册选择 |
| 173 | string | 拍一张 |
| 379 | string | 小 |
| 380 | string | 小明 |
| 381 | string | 来自 一树·挖宝 |
| 415 | string | 先聊几轮，档案还没开始积累。 |
| 579 | string | 请先登录后再修改头像 |
| 601 | string | 上传中 |
| 624 | string | 头像已更新 |
| 635 | string | 头像上传失败，请重试 |
| 675 | string | 已退出登录 |
| 681 | string | 退出失败，请稍后重试 |
| 703 | string | 资产已合并更新 |

### pages/profile/profile.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 5 | wxml-text | 我的档案 |
| 10 | wxml-attr | title: 正在加载档案 |
| 10 | wxml-attr | desc: 一树在整理你的资产画像 |
| 18 | wxml-text | 一树根据最近的对话为您提炼了新的资产特征，请查看并合并。 |
| 23 | wxml-attr | title: 档案同步失败 |
| 23 | wxml-attr | desc: 当前没有回退本地数据，请检查接口后重试 |
| 23 | wxml-attr | actionText: 重试 |
| 33 | wxml-attr | title: 档案还没开始积累 |
| 33 | wxml-attr | desc: 先聊几轮，一树会自动生成你的资产雷达 |
| 93 | wxml-text | 退出登录 |
| 101 | wxml-text | {{profile.assetReport.isReview ? '资产复盘报告' : '资产盘点报告'}} |
| 104 | wxml-attr | aria-label: 内容由 AI 生成，仅供参考 |
| 104 | wxml-text | AI 生成 · 仅供参考 |
| 105 | wxml-text | 生成于 {{profile.assetReport.generatedAt}} |
| 118 | wxml-text | 资产雷达 |
| 129 | wxml-text | 聊几轮后自动生成 |
| 133 | wxml-text | 差异化优势 |
| 137 | wxml-text | 完成更多任务后解锁 |
| 141 | wxml-text | 性格特质 (CliftonStrengths) |
| 145 | wxml-text | 对话积累后自动识别 |
| 149 | wxml-text | Ikigai 交汇点 |
| 151 | wxml-text | 一树会在你推进一段时间后为你总结 |
| 158 | wxml-text | 暂不更新 |
| 159 | wxml-text | 确认合并更新 |
| 13 | string | 正在加载档案 |
| 14 | string | 一树在整理你的资产画像 |
| 26 | string | 档案同步失败 |
| 27 | string | 当前没有回退本地数据，请检查接口后重试 |
| 28 | string | 重试 |
| 36 | string | 档案还没开始积累 |
| 37 | string | 先聊几轮，一树会自动生成你的资产雷达 |
| 64 | string | 开发 / 账号面板 |
| 64 | string | 账号 |
| 81 | string | 已存在 |
| 81 | string | 未写入 |
| 86 | string | 未命名用户 |
| 86 | string | 无 ID |
| 87 | string | 未配置 |
| 101 | string | 资产复盘报告 |
| 101 | string | 资产盘点报告 |
| 104 | string | 内容由 AI 生成，仅供参考 |

### pages/project-detail/project-detail.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 22 | string | 捕捉机会 |
| 23 | string | 结构化梳理 |
| 24 | string | 机会评分中 |
| 25 | string | 机会比较中 |
| 26 | string | 验证推进中 |
| 30 | string | 待判断 |
| 31 | string | 候选中 |
| 32 | string | 已选中 |
| 33 | string | 已搁置 |
| 34 | string | 已否决 |
| 38 | string | 全部 |
| 39 | string | 方向 |
| 40 | string | 方案 |
| 41 | string | 验证 |
| 42 | string | 成交 |
| 43 | string | 系统 |
| 46 | string | 方向判断 |
| 46 | string | 立项准备 |
| 46 | string | 客户验证 |
| 46 | string | 产品成交 |
| 46 | string | 系统化 |
| 57 | string | 商业方向候选 |
| 58 | string | 方向判断 |
| 59 | string | 方向 |
| 60 | string | AI工具落地 |
| 60 | string | 企业服务 |
| 60 | string | 轻咨询 |
| 64 | string | 商业方向候选 |
| 65 | string | 方向判断 |
| 66 | string | 方向 |
| 67 | string | AI工具落地 |
| 67 | string | 企业服务 |
| 67 | string | 轻咨询 |
| 71 | string | 立项摘要 |
| 72 | string | 立项准备 |
| 73 | string | 方案 |
| 74 | string | 立项 |
| 74 | string | 首轮目标 |
| 78 | string | 立项摘要 |
| 79 | string | 立项准备 |
| 80 | string | 方案 |
| 81 | string | 立项 |
| 81 | string | 首轮目标 |
| 85 | string | 项目跟进 |
| 86 | string | 客户验证 |
| 87 | string | 验证 |
| 88 | string | 本轮跟进 |
| 88 | string | 验证任务 |
| 92 | string | 项目跟进 |
| 93 | string | 客户验证 |
| 94 | string | 验证 |
| 95 | string | 本轮跟进 |
| 95 | string | 验证任务 |
| 99 | string | 机会评分 |
| 100 | string | 方向判断 |
| 101 | string | 方向 |
| 102 | string | 评分矩阵 |
| 106 | string | 已选方向 |
| 107 | string | 方向判断 |
| 108 | string | 方向 |
| 109 | string | 已选择 |
| 109 | string | 深聊方向 |
| 113 | string | 验证动作 |
| 114 | string | 客户验证 |
| 115 | string | 验证 |
| 116 | string | 客户验证 |
| 116 | string | 行动清单 |
| 120 | string | 验证动作 |
| 121 | string | 客户验证 |
| 122 | string | 验证 |
| 123 | string | 客户验证 |
| 123 | string | 行动清单 |
| 127 | string | 产品结构 |
| 128 | string | 产品成交 |
| 129 | string | 方案 |
| 130 | string | 产品化 |
| 130 | string | 交付结构 |
| 134 | string | 三层定价 |
| 135 | string | 产品成交 |
| 136 | string | 成交 |
| 137 | string | 定价 |
| 137 | string | 成交 |
| 141 | string | 触达话术 |
| 142 | string | 客户验证 |
| 143 | string | 验证 |
| 144 | string | 触达 |
| 144 | string | 客户反馈 |
| 148 | string | 生意体检 |
| 149 | string | 系统化 |
| 150 | string | 系统 |
| 151 | string | 复盘 |
| 151 | string | 系统化 |
| 155 | string | 园区政策 |
| 156 | string | 系统化 |
| 157 | string | 系统 |
| 158 | string | 政策 |
| 158 | string | 园区 |
| 162 | string | 利润分配 |
| 163 | string | 系统化 |
| 164 | string | 系统 |
| 165 | string | 利润 |
| 165 | string | 现金流 |
| 169 | string | 资产雷达图 |
| 170 | string | 方向判断 |
| 171 | string | 方向 |
| 172 | string | 资产盘点 |
| 172 | string | 优势组合 |
| 178 | string | 当前最适合优先验证的是“中小企业 AI 工具落地顾问”。它贴合你的产品经验，也更容易拿到第一批客户反馈。 |
| 180 | string | 方向一：AI 工具落地顾问 |
| 181 | string | 方向二：B端产品流程优化 |
| 182 | string | 方向三：企业内部 AI 培训 |
| 186 | string | 这份摘要的价值不是写得完整，而是把项目边界、首轮目标和验证标准先钉住，避免后面变成泛泛执行。 |
| 188 | string | 项目定位：先服务一个清晰客户群 |
| 189 | string | 首轮目标：拿到真实反馈而不是追求完美方案 |
| 190 | string | 验证标准：用客户回应决定下一步 |
| 194 | string | 这一轮最重要的不是把任务都做完，而是拿到能判断方向是否成立的证据。 |
| 196 | string | 完成本轮最多 3 个关键动作 |
| 197 | string | 记录客户原话或明确卡点 |
| 198 | string | 根据反馈决定继续、调整或停止 |
| 202 | string | 评分不是为了证明这个方向好，而是帮你判断它值不值得进入客户验证。 |
| 204 | string | 看需求是否足够明确 |
| 205 | string | 看获客路径是否可执行 |
| 206 | string | 看竞争和交付成本是否可控 |
| 210 | string | 选中方向后，下一步可以先围绕目标客户做小规模验证，让真实反馈帮你校准方案。 |
| 212 | string | 明确目标客户是谁 |
| 213 | string | 验证他们是否愿意聊 |
| 214 | string | 验证他们是否愿意为结果付费 |
| 218 | string | 验证动作的作用是把想法变成证据。每个动作都应该能产生一个明确反馈。 |
| 220 | string | 找 3-5 个真实潜在客户 |
| 221 | string | 问出他们现在最想自动化的重复环节 |
| 222 | string | 记录需求强度、预算意愿和卡点 |
| 226 | string | 产品结构要先小后大，先把一个可交付结果讲清楚，再扩展成完整服务。 |
| 228 | string | 定义最小可交付结果 |
| 229 | string | 拆成交付步骤和边界 |
| 230 | string | 明确客户拿到什么变化 |
| 234 | string | 定价不是越低越容易成交。先用三层价格测试客户对不同结果的付费意愿。 |
| 236 | string | 入门层：降低首次决策成本 |
| 237 | string | 标准层：覆盖核心交付结果 |
| 238 | string | 进阶层：承接更高价值客户 |
| 242 | string | 触达话术可以先放轻一点，先让对方愿意说出现状和痛点。 |
| 244 | string | 先点出一个具体场景 |
| 245 | string | 再问一个容易回答的问题 |
| 246 | string | 最后给一个低成本下一步 |
| 250 | string | 体检的重点是找出当前最影响现金流和增长的一个环节，而不是做复杂报表。 |
| 252 | string | 检查收入来源是否稳定 |
| 253 | string | 检查获客和交付是否卡住 |
| 254 | string | 检查下一步是否能形成复利 |
| 258 | string | 园区政策只适合在业务方向基本明确后承接，不应该反过来决定你做什么项目。 |
| 260 | string | 确认主体和业务范围是否匹配 |
| 261 | string | 看政策能否降低实际成本 |
| 262 | string | 避免为了政策改变项目方向 |
| 266 | string | 利润分配要先保证现金流安全，再考虑扩张投入，否则项目容易越做越忙但不赚钱。 |
| 268 | string | 先留出运营和税费成本 |
| 269 | string | 再设置个人收入和利润池 |
| 270 | string | 最后决定可再投入预算 |
| 274 | string | 资产雷达图不是履历总结，而是判断哪些优势真的能变成商业方向。 |
| 276 | string | 能力决定你能交付什么 |
| 277 | string | 资源决定你能触达谁 |
| 278 | string | 认知决定你能否判断需求 |
| 279 | string | 关系决定你能否启动第一批反馈 |
| 285 | string | 已生成 |
| 286 | string | 已确认 |
| 287 | string | 待确认 |
| 288 | string | 进行中 |
| 289 | string | 需更新 |
| 290 | string | 生成失败 |
| 291 | string | 已完成 |
| 295 | string | 一树 |
| 296 | string | 一树 · 挖宝 |
| 297 | string | 一树 · 挖宝 |
| 298 | string | 一树 · 搞钱 |
| 299 | string | 一树 · 搞钱 |
| 300 | string | 一树 · 扎心 |
| 301 | string | 一树 · 扎心 |
| 302 | string | 一树 · 管家 |
| 303 | string | 一树 · 管家 |
| 359 | string | 刚刚 |
| 372 | string | 刚刚 |
| 375 | template | ${Math.floor(diff / minute)}分钟前 |
| 378 | template | ${Math.floor(diff / hour)}小时前 |
| 381 | template | ${Math.floor(diff / day)}天前 |
| 412 | string | 一树正在思考中... |
| 463 | string | 待评分 |
| 467 | string | 待识别 |
| 468 | string | 待判断 |
| 521 | string | 指标 |
| 550 | string | 候选方向 |
| 550 | template | ${directions.length}个 |
| 551 | string | 最高评分 |
| 552 | string | 建议 |
| 552 | string | 验证 |
| 559 | string | 动作 |
| 559 | template | ${tasks.length}个 |
| 560 | string | 建议 |
| 560 | string | 验证 |
| 570 | string | 维度 |
| 570 | template | ${dimensions.length}项 |
| 571 | string | 平均分 |
| 577 | string | 总分 |
| 577 | string | 评分 |
| 578 | string | 需求 |
| 579 | string | 竞争 |
| 610 | string | 待评分 |
| 611 | string | 待确认 |
| 612 | string | 待确认 |
| 613 | string | 待确认 |
| 620 | template | 当前方向综合 ${scoreText}，建议先进入客户验证，把真实反馈收回来。 |
| 634 | string | 总分 |
| 635 | string | 需求 |
| 636 | string | 竞争 |
| 670 | string | 待评分 |
| 674 | template | 当前方向综合 ${scoreText} |
| 713 | template | 方向${index + 1}：${firstString(item.corePain, item.targetUser)} |
| 769 | string | 项目成果 |
| 779 | string | 这个成果已经沉淀到项目资产库，可继续查看或带回对话完善。 |
| 781 | string | 方向判断 |
| 782 | string | 方向 |
| 810 | string | 已生成 |
| 819 | string | 查看 |
| 820 | string | 确认 |
| 821 | string | 继续聊 |
| 855 | string | 完成第 1 轮客户验证，拿到真实反馈。 |
| 859 | template | 已沉淀 ${count} 项成果 |
| 859 | string | 还没有成果 |
| 860 | template | 下一步：${nextStep} |
| 861 | string | 别只收藏成果，今天要拿一个去验证。 |
| 861 | string | 一树会先帮你把方向、客户和验证动作沉淀下来。 |
| 862 | string | 去验证 |
| 862 | string | 回到对话 |
| 879 | template | ${items.length} 项 |
| 890 | string | 其他成果 |
| 892 | template | ${uncategorizedItems.length} 项 |
| 901 | string | 还没有这类成果 |
| 901 | string | 还没有成果 |
| 903 | string | 先去对话里让一树继续推进这个阶段。 |
| 904 | string | 一树会先帮你把方向、客户和验证动作沉淀下来。你不用整理文档，继续聊就行。 |
| 909 | string | 这个成果 |
| 913 | template | 我们继续完善「${title}」 |
| 945 | string | 跟一树继续聊这个项目... |
| 959 | string | 还没有成果 |
| 960 | string | 一树会先帮你把方向、客户和验证动作沉淀下来。你不用整理文档，继续聊就行。 |
| 1060 | string | 问一树怎么用这些成果... |
| 1061 | string | 跟一树继续聊这个项目... |
| 1085 | string | 项目成果同步失败 |
| 1130 | string | 跟一树继续聊这个项目... |
| 1137 | string | 跟一树继续聊这个项目... |
| 1205 | template | 继续完善「${artifact.title \|\| "这个成果"}」... |
| 1238 | string | 分享卡已生成 |
| 1244 | template | ${item.title \|\| "项目成果"}：${item.details && item.details.intro \|\| ""} |
| 1248 | string | 分享暂不可用 |
| 1257 | string | 已复制成果摘要 |
| 1263 | string | 分享暂不可用 |
| 1295 | string | 本次已标记为确认 |
| 1333 | string | 已开启跟进提醒 |
| 1342 | string | 请先配置提醒模板 |
| 1344 | string | 当前微信版本不支持订阅提醒 |
| 1345 | string | 未开启提醒 |
| 1350 | string | 开启提醒失败 |
| 1372 | string | 正在回复中，请稍等 |
| 1409 | string | 项目对话发送失败，请稍后重试 |
| 1428 | string | 正在回复中，请稍等 |
| 1583 | string | 项目对话发送失败，请稍后重试 |

### pages/project-detail/project-detail.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 11 | wxml-text | 对话 |
| 12 | wxml-text | 成果 |
| 15 | wxml-attr | title: 正在载入项目 |
| 15 | wxml-attr | desc: 读取对话与成果中 |
| 24 | wxml-attr | title: 项目同步失败 |
| 24 | wxml-attr | desc: 当前没有回退本地数据，请检查接口后重试 |
| 24 | wxml-attr | actionText: 重试 |
| 37 | wxml-text | 机会推进 |
| 42 | wxml-text | 当前阶段 |
| 46 | wxml-text | 当前评分 |
| 50 | wxml-text | 下一步验证动作 |
| 51 | wxml-text | {{project.opportunitySummary.nextValidationAction \|\| '等待本轮机会识别结果'}} |
| 54 | wxml-text | 最近一次验证信号 |
| 55 | wxml-text | {{project.opportunitySummary.lastValidationSignal \|\| '还没有验证反馈'}} |
| 62 | wxml-text | 本轮推进 |
| 63 | wxml-text | 第 {{project.currentFollowupCycle.cycleNo}} 轮 |
| 67 | wxml-text | 本轮目标 |
| 71 | wxml-text | 下一步建议 |
| 78 | wxml-text | 开启 3 天提醒 |
| 81 | wxml-attr | title: 这个项目还没有对话 |
| 81 | wxml-attr | desc: 发一句话，我们从这里继续 |
| 140 | wxml-text | 回到对话 |
| 18 | string | 正在载入项目 |
| 19 | string | 读取对话与成果中 |
| 27 | string | 项目同步失败 |
| 28 | string | 当前没有回退本地数据，请检查接口后重试 |
| 29 | string | 重试 |
| 51 | string | 等待本轮机会识别结果 |
| 55 | string | 还没有验证反馈 |
| 84 | string | 这个项目还没有对话 |
| 85 | string | 发一句话，我们从这里继续 |

### pages/settings/settings.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 25 | string | 真实接口 |
| 26 | string | 已登录 |
| 26 | string | 未登录 |
| 38 | string | 游 |
| 76 | string | 游 |
| 198 | string | 设置数据加载失败，请检查后端服务 |
| 233 | string | 使用帮助 |
| 234 | string | 侧边栏里的最近聊天支持左滑删除；设置页可以清空最近聊天、同步账号状态、修改昵称和退出登录。 |
| 246 | string | 登录后可修改昵称 |
| 257 | string | 修改昵称 |
| 259 | string | 输入新的昵称 |
| 260 | string | 保存 |
| 275 | string | 昵称不能为空 |
| 301 | string | 昵称已更新 |
| 309 | string | 昵称更新失败 |
| 340 | string | 已同步最新状态 |
| 346 | string | 同步失败，请稍后重试 |
| 358 | string | 当前未登录 |
| 390 | string | 已退出登录 |
| 396 | string | 退出失败，请稍后重试 |
| 427 | string | 最近聊天已经为空 |
| 434 | string | 清空最近聊天 |
| 435 | string | 清空后，侧边栏中的最近聊天会全部移除。 |
| 436 | string | 清空 |
| 456 | string | 已清空 |
| 464 | string | 清空最近聊天失败 |

### pages/settings/settings.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 5 | wxml-text | 设置 |
| 6 | wxml-text | 账号、聊天与支持 |
| 27 | wxml-text | {{user.nickname \|\| user.name \|\| '未命名用户'}} |
| 34 | wxml-text | 账号与资料 |
| 38 | wxml-text | 昵称 |
| 39 | wxml-text | {{user.nickname \|\| user.name \|\| '未设置'}} |
| 41 | wxml-text | 修改 |
| 48 | wxml-text | 我的档案 |
| 49 | wxml-text | 查看资产雷达与画像 |
| 51 | wxml-text | 查看 |
| 55 | wxml-text | 退出登录 |
| 62 | wxml-text | 聊天管理 |
| 66 | wxml-text | 最近聊天 |
| 67 | wxml-text | 共 {{recentChats.length}} 条 |
| 69 | wxml-text | 清空 |
| 78 | wxml-text | 最近聊天已经清空了。 |
| 82 | wxml-text | 协议与帮助 |
| 86 | wxml-text | 使用帮助 |
| 87 | wxml-text | 查看侧边栏、聊天和登录说明 |
| 89 | wxml-text | › |
| 94 | wxml-text | 隐私政策 |
| 95 | wxml-text | 查看数据与隐私说明 |
| 97 | wxml-text | › |
| 102 | wxml-text | 用户协议 |
| 103 | wxml-text | 查看服务使用规则 |
| 105 | wxml-text | › |
| 27 | string | 未命名用户 |
| 39 | string | 未设置 |


### pages/share-preview/share-preview.json

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | string | 分享预览 |


### pages/social-proof/social-proof.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | string | 一树正在开发 |
| 60 | string | 好，给我一个任务 |
| 68 | string | 我确实有困难，聊聊 |

### pages/tree/tree.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 1 | string | 一树正在开发 |

### pages/weekly-report/weekly-report.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 3 | string | 一树正在开发 |
| 17 | string | 小 |
| 29 | string | 小 |
| 52 | template | 本周报告 · ${safeReport.period \|\| ""} |

### pages/welcome/welcome.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 4 | wxml-text | 一树OPC |
| 5 | wxml-text | 你的一人公司搭子 |
| 7 | wxml-text | 你负责跟我聊天，<br>我负责帮你赚钱。 |
| 17 | wxml-text | 跟一树聊聊？ |
| 21 | wxml-text | {{founderCount}}位一人公司创业者正在这里搞钱 |

## 开发预览页

### pages/dev/asset-report-progress-preview/asset-report-progress-preview.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 4 | string | 整理你的经历和技能 |
| 6 | string | 已提取 12 条有效信息，过滤掉闲聊和重复描述。 |
| 10 | string | 归类到四类资产 |
| 12 | string | 能力、资源、认知、关系已完成初步归类。 |
| 16 | string | 计算资产雷达图 |
| 18 | string | 正在判断哪些优势是真的能变成商业方向。 |
| 22 | string | 提炼隐藏优势 |
| 24 | string | 会输出一段不废话的优势总结。 |
| 29 | string | 能力 |
| 30 | string | 资源 |
| 31 | string | 认知 |
| 32 | string | 关系 |
| 50 | string | 我正在盘你的底牌 |
| 51 | string | 不是简单总结聊天记录，而是把你的经历、技能、资源和认知拆开看。 |


## 组件

### components/app-sidebar/app-sidebar.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 46 | string | 访客 |
| 47 | string | 游 |
| 48 | string | 点击查看我的档案 |
| 78 | string | 访客 |
| 79 | string | 游 |
| 80 | string | 点击查看我的档案 |

### components/app-sidebar/app-sidebar.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 25 | wxml-text | + 新对话 |
| 51 | wxml-text | 还没有最近聊天 |
| 55 | wxml-text | 删除 |
| 74 | wxml-text | 设置 |
| 75 | wxml-text | 帮助 |

### components/asset-report-sheet/asset-report-sheet.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 5 | wxml-text | {{mode === 'update' ? '资产变动确认' : '资产雷达'}} |
| 6 | wxml-text | x |
| 16 | wxml-text | {{profile.name \|\| '未命名'}} |
| 17 | wxml-text | {{profile.stageLabel \|\| '未知阶段'}} |
| 19 | wxml-attr | aria-label: 内容由 AI 生成，仅供参考 |
| 19 | wxml-text | AI 生成 · 仅供参考 |
| 21 | wxml-text | 一树根据最近的对话，为您提炼了新的资产特征，请查看并合并。 |
| 26 | wxml-text | 能力资产评估 |
| 38 | wxml-text | 差异化优势 |
| 45 | wxml-text | 性格特质 (CliftonStrengths) |
| 52 | wxml-text | Ikigai 交汇点 |
| 61 | wxml-text | 暂不更新 |
| 62 | wxml-text | 确认合并更新 |
| 5 | string | 资产变动确认 |
| 5 | string | 资产雷达 |
| 16 | string | 未命名 |
| 17 | string | 未知阶段 |
| 19 | string | 内容由 AI 生成，仅供参考 |

### components/bottom-input/bottom-input.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 14 | string | 输入消息... |

### components/bottom-input/bottom-input.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | wxml-text | + |

### components/cards/artifact-item-card/artifact-item-card.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 30 | wxml-text | 查看 |
| 31 | wxml-text | 确认 |
| 32 | wxml-text | 继续聊 |
| 33 | wxml-text | 分享 |
| 58 | wxml-text | 查看 |
| 59 | wxml-text | 确认 |
| 60 | wxml-text | 继续聊 |

### components/cards/asset-report-progress-card/asset-report-progress-card.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 4 | string | 整理你的经历和技能 |
| 6 | string | 提取有效信息，过滤闲聊和重复描述。 |
| 10 | string | 归类到四类资产 |
| 12 | string | 能力、资源、认知、关系会被初步归类。 |
| 16 | string | 计算资产雷达图 |
| 18 | string | 判断哪些优势真的能变成商业方向。 |
| 22 | string | 提炼隐藏优势 |
| 24 | string | 输出一段不废话的优势总结。 |
| 36 | string | 高 |
| 37 | string | 中 |
| 38 | string | 低 |
| 39 | string | 高 |
| 39 | string | 中 |
| 39 | string | 低 |
| 43 | string | 完成 |
| 44 | string | 进行中 |
| 45 | string | 失败 |
| 46 | string | 等待中 |
| 55 | string | 我正在盘你的底牌 |
| 56 | string | 不是简单总结聊天记录，而是把你的经历、技能、资源和认知拆开看。 |

### components/cards/asset-report-progress-card/asset-report-progress-card.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 5 | wxml-text | {{viewData.status === 'completed' ? '资产报告已生成' : viewData.status === 'failed' ? '生成遇到问题' : '正在生成资产报告'}} |
| 11 | wxml-text | 已经识别到的资产线索 |
| 26 | wxml-text | ✓ |
| 41 | wxml-text | 雷达图预览 |
| 42 | wxml-text | {{viewData.radarPreviewIsFinal ? '最终分数' : '非最终分数'}} |
| 5 | string | 资产报告已生成 |
| 5 | string | 生成遇到问题 |
| 5 | string | 正在生成资产报告 |
| 42 | string | 最终分数 |
| 42 | string | 非最终分数 |

### components/cards/daily-tasks-card/daily-tasks-card.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 9 | string | 一树帮你推动 |

### components/cards/daily-tasks-card/daily-tasks-card.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 3 | wxml-text | {{title \|\| '一树帮你推动'}} |
| 4 | wxml-text | 往前挪动一点点 |
| 16 | wxml-text | {{item.estimate_minutes}} 分钟 |
| 3 | string | 一树帮你推动 |

### components/cards/task-card/task-card.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 14 | wxml-text | ✓ |

### components/chat-shell/chat-shell.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 34 | string | 输入消息... |

### components/chat/message-bubble/message-bubble.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 10 | wxml-text | 本轮使用：{{skillTitle}} |
| 18 | wxml-attr | aria-label: 内容由 AI 生成 |
| 22 | wxml-text | AI 生成 |
| 21 | string | 内容由 AI 生成 |

### components/common/artifact-detail-sheet/artifact-detail-sheet.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 14 | wxml-text | 一句话摘要 |
| 19 | wxml-text | 一树判断 |
| 24 | wxml-text | 关键内容 |
| 31 | wxml-text | 原始内容 |
| 40 | wxml-text | 继续聊 |

### components/overlays/project-sheet/project-sheet.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 7 | wxml-text | 我的项目 |
| 8 | wxml-text | x |
| 25 | wxml-text | + 开始新一轮探索 |


### components/shell/app-sidebar/app-sidebar.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 50 | string | 访客 |
| 51 | string | 游 |
| 52 | string | 点击查看我的档案 |
| 82 | string | 访客 |
| 83 | string | 游 |
| 84 | string | 点击查看我的档案 |

### components/shell/app-sidebar/app-sidebar.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 25 | wxml-text | + 新对话 |
| 61 | wxml-text | 还没有最近聊天 |
| 65 | wxml-text | 删除 |
| 85 | wxml-text | 设置 |
| 86 | wxml-text | 帮助 |

### components/shell/bottom-input/bottom-input.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 14 | string | 输入消息... |

### components/shell/bottom-input/bottom-input.wxml

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 13 | wxml-text | 本轮使用：{{activeSkillTitle}} |
| 33 | wxml-text | + |
| 34 | wxml-attr | aria-label: Skills |
| 47 | wxml-attr | aria-label: 停止输出 |
| 65 | wxml-text | + |
| 81 | wxml-attr | aria-label: 停止输出 |
| 51 | string | 停止输出 |
| 85 | string | 停止输出 |

## 对话场景话术

### services/conversation.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 8 | string | 访客 |
| 12 | string | 继续识别最值得做的机会 |
| 13 | string | 比较并选一个机会 |
| 14 | string | 继续推进当前验证 |
| 15 | string | 更新最近的资产变化 |
| 16 | string | 先自由聊聊 |
| 20 | string | 捕捉机会 |
| 21 | string | 结构化梳理 |
| 22 | string | 机会评分中 |
| 23 | string | 机会比较中 |
| 24 | string | 验证推进中 |
| 28 | string | 待判断 |
| 29 | string | 候选中 |
| 30 | string | 已选中 |
| 31 | string | 已搁置 |
| 32 | string | 已否掉 |
| 48 | string | 继续推进 |
| 58 | string | 我已经大致盘清你的底子了，接下来我们不再泛聊，开始找最值得做的机会。 |
| 71 | string | 这一步我会先帮你把机会收拢成一条主线，再决定先识别、比较还是验证。 |
| 76 | string | 一树帮你推动 |
| 87 | template | 当前阶段：${OPPORTUNITY_STAGE_LABELS[focusProject.opportunityStage] \|\| "待识别"} |
| 88 | template | 决策状态：${DECISION_STATUS_LABELS[focusProject.decisionStatus] \|\| "待判断"} |
| 91 | template | 当前评分：${scoreValue}/100 |
| 94 | template | 下一步动作：${focusProject.nextValidationAction} |
| 97 | template | 最近信号：${focusProject.lastValidationSignal} |
| 104 | string | 当前主线机会 |
| 111 | string | 一树帮你推动 |
| 140 | string | 先别急着看机会。我们先把你的资产盘清，再决定哪条机会最值得往前推。 |
| 146 | string | 能力 |
| 146 | string | 待盘点 |
| 147 | string | 资源 |
| 147 | string | 待盘点 |
| 148 | string | 认知 |
| 148 | string | 待盘点 |
| 149 | string | 关系 |
| 149 | string | 待盘点 |
| 157 | string | 本周报告还在生成中。 |
| 159 | string | 继续推进真实对话和任务后，这里会出现你的周报。 |
| 161 | string | 查看分享 |
| 164 | string | 本月商业体检 |
| 165 | string | 欢迎来到你的一树管家！有什么问题可以尽情呼唤我！ |
| 167 | string | 继续完善进度后，这里将会自动更新商业体检状况。 |
| 168 | string | 查看分享 |
| 171 | string | 还没有足够数据生成社会证明。 |
| 172 | string | 社会证明 |
| 173 | string | 继续推进真实动作后，这里会显示阶段反馈。 |
| 175 | string | 先回到对话继续推进一轮。 |
| 176 | string | 好，给我一个任务 |
| 177 | string | 我确实有困难，聊聊 |
| 180 | string | 里程碑将在后续开放 |
| 182 | string | 当前入口还在开发，先回到对话继续推进。 |
| 183 | string | 一树正在开发 |
| 184 | string | 分享成就 |
| 185 | string | 里程碑功能开放后，你的关键阶段成果会在这里沉淀。 |
| 237 | string | 先别急着做项目，先把方向挖准。<br><br>我会基于你的经历、能力、资源和想法，先给你 3 个可以验证的商业方向。<br>你选一个，我们再继续深聊：客户是谁、痛点够不够痛、你能不能交付、第一步怎么验证。<br><br>聊透了，再立项。 |
| 245 | string | 已有进行中项目 |
| 247 | string | 验证中 |
| 249 | string | 查看当前周期任务 |
| 250 | string | 补充完成结果或卡点 |
| 251 | string | 等待下一轮 3 天跟进建议 |
| 253 | string | 打开项目 |
| 260 | string | 一树帮你推动 |
| 270 | string | 当前 3 个候选商业方向 |
| 281 | string | 先生成 3 个候选方向 |
| 282 | string | 每个方向都会带上首个信号时间、验证成本、执行难度和停止信号，避免只凭感觉选。 |
| 283 | string | 等待生成 |
| 285 | string | 生成 3 个商业方向 |
| 286 | string | 选一个方向深聊 |
| 287 | string | 达到边界清晰后确认立项 |
| 289 | string | 生成 3 个方向 |
| 301 | string | 已选中的方向 |
| 305 | string | 继续深聊这个方向，把客户、场景、验证动作和风险边界说清楚。 |
| 306 | string | 深聊中 |
| 307 | string | 继续深聊 |
| 316 | string | 立项摘要 |
| 337 | string | 打开当前项目 |
| 343 | string | 回看立项摘要 |
| 344 | string | 回看 3 个方向 |
| 345 | string | 换一组方向 |
| 351 | string | 回看 3 个方向 |
| 352 | string | 换一组方向 |
| 357 | string | 生成 3 个商业方向 |
| 368 | string | 访客 |
| 369 | string | 访客 |
| 376 | string | 先点击登录卡片，我们就开始... |
| 381 | string | 嘿，我是一树。在开始之前，先让我认识一下你。 |
| 386 | string | 微信一键登录 |
| 387 | string | 登录是对话的一部分，不是前置门槛。 |
| 388 | string | 微信一键登录 |
| 397 | string | 也可以直接输入你想要的名字... |
| 406 | string | 我怎么称呼你比较好？ |
| 413 | string | 直接发我一个你想要的称呼... |
| 418 | string | 好，那你想让我怎么称呼你？直接给我一个名字就行。 |
| 425 | string | 选一个状态，或者直接告诉我你现在的情况... |
| 431 | string | 欢迎来到一树OPC。<br>我们一起把你手里的想法、能力和机会，慢慢盘成一门生意。<br>你现在处于什么状态? |
| 437 | string | 你知道吗？ |
| 438 | string | 全国有不少园区正在抢一人公司入驻，免费注册地址、税收返还，甚至直接发钱。你可能符合好几个，但一直没听说。 |
| 439 | string | 帮我查查能薅什么 |
| 447 | string | 例如：运营 / 销售 / 产品 / 设计... |
| 452 | string | 你知道吗？你手里可能有一些你自己都没意识到的资产——这些年的工作经历、你积累的资源人脉、你硬磕出来的见识，每一项都可能成为你的第二个收入来源。要不要一起来聊一下？ |
| 456 | string | 好的 |
| 457 | string | 对话模式 |
| 462 | string | 说说你现在在尝试什么... |
| 467 | string | 很好，尝试了就比没开始的人走在前面了。我们一起做一下你的资产盘点，把你手里现有的能力、资源、经验摆到桌面上，看看哪个方向最值得继续投入。 |
| 471 | string | 好的 |
| 476 | string | 说说你现在主要在做的这件事... |
| 481 | string | 已经全职在做了，那我先跟你聊聊你现在在做的这件事——等我们把主营摸清楚了，再把它当作 OPC 的第一个资产正式盘一次。 |
| 485 | string | 好，先聊聊 |
| 490 | string | 你现在是否已经注册... |
| 495 | string | 好眼光，很多人不知道这些政策白白错过了。我先问你几个问题：你现在注册公司了吗？ |
| 499 | string | 还没注册 |
| 500 | string | 已经注册了 |


### services/bootstrap.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 50 | string | 先完成登录和资产盘点，我们再进入机会识别。 |

### services/card-registry.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 3 | string | 资产雷达 |
| 4 | string | 盘点技能、资源和杠杆点，明确下一步发力方向。 |

| 9 | string | 机会评分 |
| 10 | string | 按需求、投入和回报周期评估优先级。 |
| 15 | string | 生意体检 |
| 16 | string | 检查收入质量、现金流与可复用性。 |
| 22 | string | 搭建清晰且有说服力的定价结构。 |

| 33 | string | 实时政策机会 |
| 34 | string | 根据你当前阶段筛出来的政策/园区线索。 |
| 35 | string | 让一树解释 |
| 36 | string | 复制来源 |
| 39 | string | 暂时没查到明确政策 |
| 40 | string | 不是没有机会，可能是地区或行业描述还不够准。 |
| 41 | string | 换个方向查 |
| 42 | string | 先盘资产 |
| 45 | string | 查到一些线索，但需要核验 |
| 46 | string | 这些信息来源或发布时间不够稳，先别直接据此做决策。 |
| 47 | string | 让一树判断 |
| 48 | string | 复制线索 |
| 51 | string | 这个机会可能有坑 |
| 52 | string | 政策看起来诱人，但可能有注册地址、纳税、社保、行业或留存周期要求。 |
| 53 | string | 帮我拆风险 |
| 54 | string | 先盘资产 |
| 57 | string | 要先切去查政策吗？ |
| 58 | string | 你现在还在当前流程里。要先暂停它，切去查政策/园区机会吗？ |
| 59 | string | 切去查政策 |
| 60 | string | 继续当前流程 |
| 63 | string | 48小时行动计划 |
| 69 | string | Skill 结果 |
| 70 | string | 当前 Skill 的结构化结果已生成。 |
| 71 | string | 继续完善 |
| 75 | string | 资产盘点报告 |
| 76 | string | 报告已生成，可直接查看并继续推进。 |
| 77 | string | 查看报告 |
| 78 | string | 稍后 |
| 81 | string | 维度小报告 |
| 82 | string | 该维度盘点已完成，继续推进下一步。 |
| 83 | string | 继续 |
| 84 | string | 稍后 |
| 87 | string | 阶段卡片 |
| 88 | string | 当前阶段的结构化结果已生成。 |
| 89 | string | 继续 |
| 95 | string | 阶段卡片 |
| 96 | string | 当前阶段的结构化结果已生成。 |
| 97 | string | 资产雷达 |
| 98 | string | 盘点技能、资源和杠杆点，明确下一步发力方向。 |
| 99 | string | 机会评分 |
| 100 | string | 按需求、投入和回报周期评估优先级。 |
| 103 | string | 定价卡 |
| 104 | string | 搭建清晰且有说服力的定价结构。 |
| 106 | string | 根据你的画像匹配政策友好型园区。 |
| 107 | string | 实时政策机会 |
| 108 | string | 实时政策机会 |
| 109 | string | 48小时行动计划 |
| 110 | string | 生成未来48小时可执行的关键动作。 |
| 111 | string | 资产盘点报告 |
| 112 | string | 查看报告 |


### services/onboarding.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 9 | template | 就叫${name} |
| 15 | string | 叫我别的名字 |
| 25 | string | 在上班，没想过 |
| 29 | string | 有想法，开始尝试了 |
| 33 | string | 已经全职在做了 |


### services/policy-source.constants.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 2 | string | 申报入口 |
| 3 | string | 官方原文 |
| 4 | string | PDF附件 |
| 5 | string | 政策解读 |
| 6 | string | 解读/报道 |
| 18 | string | 来源 |
| 98 | string | 官方原文 |
| 99 | string | 申报入口 |
| 100 | string | PDF附件 |
| 173 | string | 打开入口 |
| 174 | string | 查看官网 |
| 174 | string | 关注进展 |
| 175 | string | 查看试行稿 |
| 176 | string | 查看官网 |
| 177 | string | 复制PDF链接 |
| 178 | string | 看解读 |
| 179 | string | 看报道 |
| 180 | string | 暂无官方来源 |
| 186 | string | 看原文 |
| 186 | string | 查看官网 |
| 187 | string | 复制PDF链接 |
| 193 | string | 开放办理，需核验条件 |
| 194 | string | 入口待公开 |
| 195 | string | 试行跟踪 |
| 196 | string | 需人工核验 |
| 202 | string | 暂无官方来源 |
| 203 | template | ${group.title}${group.items.length}个 |

### services/subscription.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |
| 8 | string | 保存项目提醒授权失败 |

### services/task.service.js

| 行 | 来源 | 文案 |
| ---: | --- | --- |

| 30 | string | 触达5个潜在客户 |
| 36 | string | 5 个客户都触达了，不错。结果怎么样？你想聊聊吗？ |
| 44 | string | 好，帮我写 |
| 48 | string | 我自己来 |
| 55 | string | 这项任务 |
| 56 | template | ${label}已完成，不错。结果怎么样？你想聊聊吗？ |
| 61 | string | 任务 |
| 64 | template | 先从${label}里挑一个最有希望的线索，我们把他变成今天的唯一优先级。 |
| 68 | string | 这类回复通常不是拒绝，而是风险担心。你可以先给他一个小范围试运行方案，把决策成本降到最低，转化率会更高。 |
| 72 | string | 这种情况先不要追长消息。建议 24 小时后发一条“你是更倾向 A 还是 B？我可以按你方向准备”的二选一跟进。 |
| 76 | string | 这是高质量信号。下一步别讲全套，只聚焦一个结果场景，直接约 15 分钟快速演示或答疑，成交概率会更稳。 |
| 80 | string | 这条先收口，不要硬推。但记下他拒绝的关键词，下次开场先回应这个顾虑，你的对话质量会升一档。 |
| 83 | string | 这次反馈很有价值。我建议你马上做一件事：把对方的关键顾虑复述一句，再给一个可执行的下一步选项，让对方更容易点头。 |
