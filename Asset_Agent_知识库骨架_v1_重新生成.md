# Asset Agent 知识库骨架 v1

可以。下面我直接给你一版 **Asset Agent 知识库骨架 v1**，适合拿去喂给大模型做 RAG 调用，也适合后面拆成工作流节点、提示词模板或结构化表单。

这版目标很明确：  
**在 20 分钟内，通过 12 道主问题 + 动态追问，完成用户资产识别、Ikigai 四圈归纳、四类资产映射、优势领域初判，以及商业初始定位。**

---

# 一、知识库的调用原则

这套题不要被模型一次性全问完，而要按下面规则调用：

## 1. 主问题数量
固定 **12 道主问题**。

## 2. 追问数量
每道主问题最多追问 **1～2 次**。  
只有在以下情况才追问：
- 用户回答过于抽象
- 没有案例
- 没有对象
- 没有结果
- 无法映射到资产字段

## 3. 收口原则
当某一题已经满足以下任一条件，就停止追问，进入下一题：
- 已拿到具体经历
- 已拿到他人反馈
- 已拿到可验证案例
- 已能提取结构化字段

## 4. 输出原则
每答完一题，模型都要在后台做一次结构化抽取，而不是等 12 题结束后再统一总结。

---

# 二、12 道主问题设计

## Q1. 过去几年里，哪一件事最让你觉得“这事我做得值”？

**提问目的**  
挖掘高成就感经历，提取热爱、能力、初始价值感。

**推荐追问**
- 这件事具体是怎么发生的？
- 你在里面具体做了什么？
- 为什么它让你觉得值？
- 最后产生了什么结果？

**主要抽取字段**
- `high_value_experience`
- `achievement_story`
- `role_in_story`
- `sense_of_meaning`
- `result_or_outcome`

**映射维度**
- Ikigai：热爱、擅长
- 资产：能力、认知

---

## Q2. 有什么事情你一做就容易进入忘记时间的状态？

**提问目的**  
识别心流活动，区分“真投入”与“表面兴趣”。

**推荐追问**
- 这种状态通常发生在什么场景里？
- 你做的是哪一部分最投入？
- 做完之后你通常是什么感受？

**主要抽取字段**
- `flow_activity`
- `flow_context`
- `intrinsic_motivation`
- `energy_gain_signal`

**映射维度**
- Ikigai：热爱
- 优势模式：自然倾向

---

## Q3. 别人最常因为什么事情来找你帮忙？

**提问目的**  
识别用户的外部认可能力，避免只靠自评。

**推荐追问**
- 是哪类人最常找你？
- 他们通常会怎么描述你的价值？
- 你帮完以后通常解决了什么问题？

**主要抽取字段**
- `externally_recognized_strengths`
- `help_request_pattern`
- `trusted_problem_types`
- `perceived_value_by_others`

**映射维度**
- Ikigai：擅长
- 资产：能力、关系

---

## Q4. 有没有哪件事你明明做得不差，但越做越消耗？

**提问目的**  
排除伪优势，识别“能做但不该做”的方向。

**推荐追问**
- 你为什么会做这件事？
- 它让你消耗的是精力、情绪，还是意义感？
- 你做得不差的依据是什么？

**主要抽取字段**
- `draining_but_capable_tasks`
- `false_strengths`
- `misaligned_work_pattern`
- `energy_loss_source`

**映射维度**
- 反向筛选：非核心定位
- 资产过滤：不宜主打的能力

---

## Q5. 你最理解哪一类人的真实问题？

**提问目的**  
定位用户最有感知力的人群与问题场景。

**推荐追问**
- 为什么你会特别理解他们？
- 他们最常见但又最难解决的问题是什么？
- 你是亲身经历过，还是长期观察过？

**主要抽取字段**
- `understood_audience`
- `audience_pain_points`
- `empathy_source`
- `problem_visibility`

**映射维度**
- Ikigai：世界需要
- 资产：认知、关系

---

## Q6. 如果只能长期服务一类人，你最想帮谁？

**提问目的**  
推动从“泛泛想帮助别人”收敛到目标人群。

**推荐追问**
- 为什么是他们，不是别人？
- 你愿意长期陪伴他们解决什么问题？
- 他们现在最缺的是什么？

**主要抽取字段**
- `preferred_target_user`
- `service_preference_reason`
- `long_term_service_motivation`
- `target_user_core_need`

**映射维度**
- Ikigai：世界需要、热爱
- 商业定位：服务对象

---

## Q7. 你最拿得出手的 3 个能力，各自有什么真实例子？

**提问目的**  
把抽象能力变成带证据的能力资产。

**推荐追问**
- 这个能力你在哪次事情里体现得最明显？
- 你的做法和别人有什么不同？
- 结果是什么？

**主要抽取字段**
- `top_skills`
- `skill_evidence_cases`
- `repeatable_capabilities`
- `differentiated_execution_style`

**映射维度**
- Ikigai：擅长
- 资产：能力

---

## Q8. 你现在手里已经有的、能直接调用的资源有哪些？

**提问目的**  
识别现成资源，不把资产只理解成技能。

**推荐追问**
- 这些资源是渠道、供应链、账号、内容、工具，还是某种身份背书？
- 哪些资源别人很难短期复制？
- 哪些资源今天就能拿来试验？

**主要抽取字段**
- `existing_resources`
- `resource_type`
- `resource_uniqueness`
- `resource_accessibility`
- `experiment_ready_resources`

**映射维度**
- 资产：资源

---

## Q9. 你在哪个领域或问题上，比普通人理解得更深？

**提问目的**  
提取认知资产，识别行业理解、判断框架、经验壁垒。

**推荐追问**
- 你为什么会比一般人更懂？
- 你通常会比别人多看到什么？
- 有哪些你觉得是常识，但外行其实不知道？

**主要抽取字段**
- `deep_knowledge_domain`
- `insight_advantage`
- `judgment_framework`
- `non_obvious_knowledge`

**映射维度**
- 资产：认知
- 优势模式：战略思维倾向

---

## Q10. 真遇到事时，哪些人会愿意帮你、信任你、给你介绍机会？

**提问目的**  
识别关系资产，不只统计人脉数量，而是识别可调用信任网络。

**推荐追问**
- 这些人大多是什么类型的人？
- 他们为什么愿意帮你？
- 他们通常能提供的是信息、机会、客户，还是协作？

**主要抽取字段**
- `trust_network`
- `relationship_types`
- `support_reason`
- `relationship_value_type`
- `warm_start_connections`

**映射维度**
- 资产：关系
- 优势模式：关系建立、影响力

---

## Q11. 你做过的事情里，哪一种最可能让别人愿意付费？

**提问目的**  
从“有价值”推进到“可交易价值”。

**推荐追问**
- 有人为这类事情直接或间接付过钱吗？
- 如果没有，谁最可能愿意先付费？
- 他们买的不是你的努力，而是哪个结果？

**主要抽取字段**
- `monetizable_capability`
- `payment_signal`
- `buyer_candidate`
- `purchased_outcome`
- `value_exchange_form`

**映射维度**
- Ikigai：别人愿意付费
- 商业定位：付费点

---

## Q12. 如果你必须在 30 天内做一次小验证，你最想先试什么？

**提问目的**  
逼出最小商业验证路径，完成初始定位收口。

**推荐追问**
- 你准备服务谁？
- 你准备提供什么？
- 你打算怎么开始：内容、服务、产品、陪跑还是撮合？
- 你为什么觉得这条路最值得先试？

**主要抽取字段**
- `30_day_test_direction`
- `mvp_offer`
- `first_target_customer`
- `initial_delivery_form`
- `test_priority_reason`

**映射维度**
- 商业初始定位
- 验证路径

---

# 三、后台结构化字段总表

下面这部分就是你知识库里最值得单独存的字段。后续模型每轮对话都往这里填。

## 1. 用户基础资产层

```json
{
  "high_value_experience": [],
  "flow_activity": [],
  "externally_recognized_strengths": [],
  "draining_but_capable_tasks": [],
  "top_skills": [],
  "existing_resources": [],
  "deep_knowledge_domain": [],
  "trust_network": []
}
```

## 2. Ikigai 四圈层

```json
{
  "love": [],
  "good_at": [],
  "world_needs": [],
  "paid_for": []
}
```

## 3. 四类资产层

```json
{
  "ability_assets": [],
  "resource_assets": [],
  "cognitive_assets": [],
  "relationship_assets": []
}
```

## 4. 优势领域初判层

```json
{
  "executing_signals": [],
  "influencing_signals": [],
  "strategic_thinking_signals": [],
  "relationship_building_signals": [],
  "dominant_domains_preliminary": []
}
```

## 5. 商业定位层

```json
{
  "preferred_target_user": "",
  "target_user_core_need": "",
  "monetizable_capability": "",
  "buyer_candidate": "",
  "purchased_outcome": "",
  "mvp_offer": "",
  "initial_delivery_form": "",
  "30_day_test_direction": ""
}
```

---

# 四、每题回答后的抽取规则

为了让知识库更好调用，你要给模型加一个统一抽取规则。

## 抽取规则 1：优先记录“证据”，不要优先记录“标签”
例如：
- 不要只记“用户擅长沟通”
- 要记“用户曾主导跨团队协作，推动项目在 2 周内落地”

## 抽取规则 2：所有能力都尽量写成“能力 + 场景 + 结果”
例如：
- `内容策划`
- `面向母婴用户做种草内容策划，曾连续输出 30 篇并带来咨询转化`

## 抽取规则 3：所有关系都尽量写成“关系类型 + 可提供价值”
例如：
- `前同事运营负责人，可提供平台流量投放经验`
- `供应链朋友，可帮助低成本拿样`

## 抽取规则 4：所有认知都尽量写成“理解对象 + 判断优势”
例如：
- `理解私域运营中客户信任建立过程，能识别哪些动作会降低转化`

---

# 五、优势领域判断规则

这个部分是让模型根据回答去初步判断用户更偏哪类优势，不是正式测评，而是行为信号识别。

## 执行力信号
如果回答里经常出现：
- 推进
- 落地
- 交付
- 节奏
- 负责到底
- 规划步骤
- 做完闭环

则累计到：
`executing_signals`

## 影响力信号
如果回答里经常出现：
- 表达
- 说服
- 带动
- 主动争取
- 输出观点
- 讲清复杂问题
- 吸引别人行动

则累计到：
`influencing_signals`

## 战略思维信号
如果回答里经常出现：
- 看趋势
- 做判断
- 看模式
- 设计路径
- 提前预判
- 分析框架
- 看本质

则累计到：
`strategic_thinking_signals`

## 关系建立信号
如果回答里经常出现：
- 安抚
- 共情
- 维系信任
- 长期合作
- 懂人
- 愿意帮忙
- 建立连接

则累计到：
`relationship_building_signals`

---

# 六、建议你实际落库时的文档格式

你可以把这套知识库拆成 3 个文件。

## 文件 1：《AssetAgent_QuestionBank.md》
存 12 道主问题、追问规则、收口条件。

## 文件 2：《AssetAgent_FieldSchema.json》
存全部结构化字段定义。

## 文件 3：《AssetAgent_ExtractionRules.md》
存抽取规则、映射规则、输出格式。

这样做的好处是：
- 问题可迭代
- 字段可扩展
- 提取逻辑可单独优化
- 后面接前端、数据库、RAG 检索更方便

---

# 七、给你一版可直接放进知识库的标准条目模板

下面这个模板，你后面每一道题都可以照着写。

```markdown
## 问题编号
Q1

## 主问题
过去几年里，哪一件事最让你觉得“这事我做得值”？

## 提问目的
挖掘高成就感经历，识别热爱与能力线索。

## 允许追问
- 这件事具体发生在什么场景？
- 你在其中做了什么？
- 为什么它对你重要？
- 最后结果是什么？

## 收口条件
满足以下任一条件即可收口：
- 用户给出具体案例
- 用户给出自身角色
- 用户给出结果或影响
- 已能提取结构化字段

## 对应抽取字段
- high_value_experience
- achievement_story
- role_in_story
- sense_of_meaning
- result_or_outcome

## 对应维度
- love
- good_at
- ability_assets
- cognitive_assets
```

---

# 八、我建议你的第一版知识库输出格式

最后大模型在这一环节结束后，不要只输出一段总结，而要输出成这 6 块：

## 1. 用户资产画像
一句话总结这个人最核心的资产特征。

## 2. Ikigai 四圈摘要
- 热爱的
- 擅长的
- 世界需要的
- 可被付费的

## 3. 四类资产清单
- 能力
- 资源
- 认知
- 关系

## 4. 优势领域初判
执行力 / 影响力 / 战略思维 / 关系建立

## 5. 商业初始定位假设
“最适合服务谁、解决什么问题、通过什么方式开始”

## 6. 30 天验证建议
先做什么最小动作，验证哪条线

---

# 九、最关键的一点

你的知识库不要写成“问题大全”，而要写成：

**问题节点 + 提问目的 + 追问规则 + 抽取字段 + 收口条件 + 输出映射**

因为大模型真正调用的时候，不是拿来阅读，而是拿来执行。

如果你愿意，我下一步可以直接继续帮你做第二层，给你整理成一份 **可直接复制到 Dify / Coze / 工作流里的标准知识库文档格式**。
