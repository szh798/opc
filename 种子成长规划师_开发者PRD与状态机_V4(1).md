# 种子成长规划师 — 开发者PRD + 路由状态机
## Developer-Facing Product Design Document

**版本**: V2.0（含路由架构升级、Prompt优化、记忆注入服务详设）  
**日期**: 2026年4月  
**团队**: 一树成林科技（与一树OPC共享技术栈）  
**开发人员**: 李金芮（后端/Dify）、史志恒（前端）、王凯（数据库）

---

# 第一章：产品概述

## 1.1 一句话定位
帮家长在AI时代找到孩子的成长方向，并持续陪伴落地。

## 1.2 核心功能闭环
```
天赋盘点（入口）→ 成长路径规划（方向）→ 每周成长任务（日常陪伴）
→ 月度成长报告（成果可视化）→ 微项目系统（阶段性成就）→ 家长教练（问题解决）
↑___________________________反馈循环______________________________↓
```

## 1.3 与OPC的技术复用关系
| 组件     | 复用情况                                  |
| ------ | ------------------------------------- |
| Dify后端 | 完全复用，新增chatflow即可                     |
| 数据库架构  | 复用表结构，新增child_profiles表和growth_tasks表 |
| 记忆系统   | 复用"存事实不存对话"机制，新增记忆注入服务                |
| 前端框架   | 复用"对话即操作系统"范式，换皮肤和颜色                  |
| 路由机制   | 复用三层路由架构（快捷回复→关键词规则→轻量意图分类）           |
|        |                                       |

---

# 第二章：3个智能体角色

MVP阶段只做3个角色（比OPC的5个少，降低复杂度）：

| 角色 | 颜色 | 职责 | 语气 | 对应OPC角色 |
|------|------|------|------|-------------|
| 种子 | #1A6B4A 森林绿 | 主人格 + 家长教练 + 日常对话 | 温暖、不焦虑、像一个育儿经验丰富的好友 | 一树（主人格）|
| 种子·发现 | #7C5CBF 紫色 | 天赋盘点 + 成长路径规划 | 好奇、观察力强、引导式提问 | 一树·挖宝 |
| 种子·引路 | #E8A838 琥珀色 | 每周任务 + 微项目 + 成长报告 | 实操、具体、有趣 | 一树·搞钱 |

**注意：没有"扎心"角色。** 育儿场景不适合锋利的纠偏——家长的育儿焦虑本身就是一种情绪压力，不能再施加更多压力。种子（主人格）在检测到家长过度焦虑时，应该做的是缓解而非加压。

---

# 第三章：路由架构设计（三层路由 + 零LLM路由目标）

> **to 李金芮 & 史志恒：本章是路由系统的核心设计，前后端协同实现。**

## 3.1 三层路由架构

Onboarding阶段100%写死（快捷回复确定性路由）。Onboarding完成后进入日常模式，使用以下三层路由：

| 层级 | 实现方 | 机制 | 延迟 | Token消耗 | 覆盖率 |
|------|--------|------|------|-----------|--------|
| 第一层 | **to 史志恒** | 快捷回复按钮 → 每个按钮绑定chatflow ID | 0ms | 0 | ~50% |
| 第二层 | **to 史志恒** | 前端关键词规则匹配（见下方规则表）| <10ms | 0 | ~30% |
| 第三层 | **to 李金芮** | 轻量意图分类（见下方方案）| <200ms | 极低 | ~20% |

**只有三层都无法判断时，才进入种子主对话流的LLM兜底。**

## 3.2 第二层：前端关键词规则表

> **to 史志恒：在前端维护这个规则表，用户输入时逐条匹配。**

```javascript
const ROUTE_RULES = [
  // 天赋盘点相关
  { keywords: ["天赋", "特长", "擅长", "适合", "盘点", "雷达图"], chatflow: "talent_audit_block1" },
  // 任务相关
  { keywords: ["这周任务", "本周任务", "成长任务", "做什么"], chatflow: "weekly_task_flow" },
  // 任务反馈
  { keywords: ["做了", "完成了", "没做", "没来得及", "做完了"], chatflow: "weekly_task_flow" },
  // 微项目
  { keywords: ["项目", "微项目", "明信片", "集市"], chatflow: "mini_project_flow" },
  // 育儿问题
  { keywords: ["怎么办", "不听话", "发脾气", "沉迷", "叛逆", "不学习", "被欺负"], chatflow: "parent_coach_chat" },
  // 焦虑信号
  { keywords: ["焦虑", "担心", "别人家孩子", "来不及", "落后了"], chatflow: "anxiety_relief_flow" },
  // 重新盘点
  { keywords: ["重新盘点", "更新", "变了", "新变化"], chatflow: "faxian_free_chat" },
  // 闲聊/介绍
  { keywords: ["你好", "你是谁", "能做什么", "怎么用"], chatflow: "zhongzi_main_chat" },
];
```

## 3.3 第三层：轻量意图分类

> **to 李金芮：本层负责处理关键词匹配无法覆盖的20%场景。**

**冷启动阶段（无训练数据时）：** 用Dify中最便宜的小模型做意图分类，不是用大模型做路由。配置一个独立的极简chatflow，只包含1个LLM节点：

```
System prompt（固定，不超过100 tokens）：
"判断用户消息的意图类别。只输出类别编号，不要输出任何其他内容。
类别：1=天赋相关 2=任务相关 3=育儿问题 4=情绪倾诉 5=功能询问 6=闲聊 7=其他"

输入：用户消息原文（通常<100 tokens）
输出：一个数字（<5 tokens）

总消耗：<205 tokens/次，延迟<500ms
```

**数据积累阶段（收集到3000+条标注数据后）：**

> **to 李金芮：替换LLM意图分类为本地分类模型。**

训练一个fastText或DistilBERT微调模型。输入=用户一句话，输出=7个意图标签之一。推理延迟<100ms，Token消耗=0。

训练数据来源：冷启动阶段LLM意图分类的输入输出记录（自动标注），加上人工校验。把每次LLM分类的结果存入 `behavior_logs` 表，字段 `event_type = "intent_classification"`。

---

# 第四章：5大核心模块详细设计

---

## 模块1：天赋盘点（发现 主导）

### chatflow ID: talent_audit_flow
### LLM节点数: 2（深度访谈引导1个 + 雷达图生成1个）
### 预计耗时: 50-60分钟（5个场景板块 × 10分钟，47-64轮对话，用户输出5500-10000字）

### 设计哲学

> **天赋盘点不是问卷，是深度访谈。** 跟OPC的资产盘点一样，目标是留住家长1小时、获取5500-10000字的深度描述。家长愿意花1小时聊自己的孩子——这是全世界最容易让人打开话匣子的话题。不按维度逐个问（那是测评问卷），而是按"孩子生活的场景"展开对话，每个场景自然覆盖多个维度。

### 理论基础

**核心框架：Howard Gardner 多元智能理论**

八维度天赋雷达图直接映射Gardner的八种智能：

```
雷达图维度：
1. 语言智能 — 对文字、故事、语言的敏感度
2. 逻辑数学智能 — 对数字、模式、因果关系的兴趣
3. 空间智能 — 对图形、空间、视觉的感知力
4. 身体运动智能 — 身体协调性、手工能力
5. 音乐智能 — 对节奏、旋律、声音的敏感度
6. 人际智能 — 理解他人、社交领导力
7. 自省智能 — 自我认知、独立思考
8. 自然观察智能 — 对自然界、分类系统的兴趣
```

**叠加层：AI时代能力映射**

| 价值层级 | 智能维度 | AI时代的价值逻辑 |
|----------|---------|-----------------|
| 高价值（AI难以替代）| 人际智能、自省智能、身体运动智能 | 同理心、自我反思、身体感知是AI的盲区 |
| 高价值（AI时代价值倍增）| 逻辑数学智能、空间智能 | 逻辑思维是理解和驾驭AI的底层能力——谁能更好地与AI协作，谁就在未来拉开差距。空间智能在3D/建筑/设计领域因AI工具而被放大 |
| 中价值（AI可辅助但创造性应用不可替代）| 语言智能、音乐智能、自然观察智能 | 纯技能层面AI可替代（写作/作曲/分类），但创造性应用（原创叙事/音乐表达/生态洞察）仍属人类 |

> **to 李金芮：天赋雷达图输出时，每个维度都必须附带"AI时代价值说明"。特别注意逻辑数学智能不要说"会被AI替代"，而要说"这个能力让孩子未来能更好地理解和驾驭AI工具"。**

### RAG知识库

> **to 李金芮：为talent_audit_flow配置独立知识库，只包含以下内容。**

| 知识库文档                               | 内容                                    | 用途                 |
| ----------------------------------- | ------------------------------------- | ------------------ |
| `gardner_8_intelligences.md`        | 八种智能的定义、行为表现特征（按年龄段3-6/6-12/12+）、识别方法 | LLM识别天赋的参考依据       |
| `ai_era_mapping.md`                 | AI时代能力映射表的完整版（含每个维度的详细说明和案例）          | 输出AI时代分析时引用        |
| `interview_guide.md`                | 五个板块的完整问题链+追问规则+板块间过渡语（见下方）           | LLM作为访谈师的操作手册      |
| `talent_radar_output_template.json` | 天赋雷达图的JSON输出结构模板                      | LLM节点#2按此模板输出结构化结果 |
| `age_milestones.md`                 | 各年龄段儿童发展里程碑数据                         | 判断表现是"天赋"还是"正常发育"  |

### System Prompt — LLM节点#1（访谈引导）

> **to 李金芮：prompt控制在250 tokens以内。完整的问题链和追问规则放在RAG知识库的 `interview_guide.md` 中。**

```
角色：种子·发现，儿童天赋深度访谈师。
任务：通过5个场景板块的深度对话（约50分钟），获取足够数据评估孩子的Gardner八维智能。

对话结构：
1. 每个板块从一个开放问题开始，然后根据家长回答追问2-3个细节
2. 追问原则：具体行为 > 笼统印象，举例 > 判断，频率 > 偶发
3. 每个板块结束时做小结（"听起来{child_name}在XX方面很有特点"）
4. 板块间用自然过渡语衔接（参考知识库interview_guide）
5. 当某维度已有充分数据时不重复问，数据不足时在后续板块自然补充
6. 如果家长回答太简短（<20字），追问"能给我举个具体的例子吗？"

严禁：
- 连续问两个以上没有追问的主问题（会变成审讯）
- 忽略家长情绪（如果说到担忧，先回应情绪再继续）
- 在所有板块完成前说"你的孩子XX智能很强"（过早下结论）

当前板块：{current_block}/5
当前孩子：{child_name}，{child_age}岁
已知信息：{memory_injection}
```

### 五板块深度访谈完整问题链

> **to 李金芮：以下内容整理为 `interview_guide.md` 灌入RAG知识库。**

---

#### 板块一：日常自由时间（10分钟，覆盖全维度初筛+心流+行为模式）

**主问题 Q1：**
```
如果周末一整天没有任何安排，{child_name}自己会选择做什么？
从早上起床到晚上睡觉，他的一天通常怎么过？
```
追问方向（根据家长回答选择，不全问）：
- "你说他会花很长时间搭积木——搭的时候是随意搭还是有计划？会不会先画个图？"（空间+逻辑深度）
- "搭完之后他会怎么处理这个作品？给你们看？拆了重搭？还是保留？"（自省+人际信号）
- "这个过程中他会自言自语吗？说什么？"（语言信号）

**主问题 Q2：**
```
他做什么事的时候你叫他吃饭他都不理你？这种情况多吗？
```
追问方向：
- "他在做这件事时是什么表情？"（心流深度数据）
- "是从小就这样还是最近才开始的？"（天赋稳定性判断）
- "他做这件事时是比平时更安静还是更兴奋？"（心流类型——安静沉浸型 vs 兴奋激活型）

**主问题 Q3：**
```
反过来，有没有什么事你们觉得该让他做，但他死活不愿意做的？
```
追问方向：
- "不愿意的时候怎么表现？直接说不要？拖延？还是敷衍做一下？"（行为模式）
- "你觉得他是'不喜欢'还是'觉得自己做不好所以不想做'？"（动机分析——固定vs成长思维信号）

> **板块一结束信号：** 3个主问题+追问共9-12轮对话后，发现做小结："听起来{child_name}在没人管的时候最喜欢做XX，而且做的时候特别投入。这很有意思，待会我们接着看。"

---

#### 板块二：社交与关系（10分钟，深度覆盖人际+自省+语言）

**过渡语：** "刚才聊了他自己一个人的状态，那他跟别的小朋友在一起呢？"

**主问题 Q4：**
```
{child_name}在幼儿园/学校里最好的朋友是谁？他们一般在一起做什么？
```
追问方向：
- "他是主动找这个朋友玩的，还是对方找他的？"（社交主动性）
- "他们在一起谁更像'老大'？"（领导力信号）
- "有没有跟朋友吵过架？吵完怎么处理的？"（冲突解决——人际智能深度）

**主问题 Q5：**
```
他跟大人在一起什么表现？比如你带他去见你的朋友，或亲戚来家里。
```
追问方向：
- "是躲在你后面，还是主动打招呼？"（社交信心）
- "他会不会观察大人聊什么，然后插一句特别到位的话？"（人际+语言交叉信号）
- "他能察觉你的情绪吗？你不开心时他会过来安慰你吗？"（共情能力——人际核心）

**主问题 Q6：**
```
他会不会自己跟自己玩？一个人待着的时候做什么？
```
追问方向：
- "一个人时是安静做事还是自言自语？"（自省 vs 语言信号）
- "有没有说过'我想一个人待会儿'这样的话？"（自省意识强度）
- "有没有表达过'我觉得我是一个XX样的人'？"（自我认知深度——6岁+才追问）

> **板块二结束小结：** "看起来{child_name}在社交上是一个[观察到的特点]的孩子。这些特点在AI时代其实很有价值。"

---

#### 板块三：学习与挑战（10分钟，深度覆盖逻辑数学+语言+自然观察+Grit）

**过渡语：** "刚才聊了他跟人相处的方式。现在我想知道，他面对新东西、面对困难的时候是什么样的。"

**主问题 Q7：**
```
{child_name}对什么东西最好奇？他会不会追着你问"为什么"？
```
追问方向：
- "他最常问的'为什么'是关于什么的？"（好奇心方向→维度定位）
- "你回答了之后他满意吗？还是继续追问？"（思考深度）
- "他有没有自己试过去找答案？翻书、上网查、或者自己做实验？"（自主学习能力）

**主问题 Q8：**
```
他遇到一件不会做但很想做成的事时，通常怎么反应？能给我举个具体的例子吗？
```
追问方向：
- "他坚持了多久？"（Grit的具体量化）
- "中间有没有想过放弃？是什么让他继续的？"（内在动机分析）
- "最后做成了吗？做成之后什么反应？"（成就动机类型）
- "如果最后没做成，他怎么处理的？"（挫折应对模式）

**主问题 Q9：**
```
他对数字、规律敏不敏感？比如会不会数东西、比大小、发现"规律"？
```
追问方向：
- "玩桌游/棋类时什么策略？靠直觉还是会想几步？"（逻辑思维深度）
- "他对钱有概念吗？会不会算东西贵不贵？"（数学应用）

**主问题 Q10：**
```
他对自然界的东西感兴趣吗？动物、植物、天气、石头……
```
追问方向：
- "是泛泛的'喜欢动物'还是会深入研究某一种？"（自然观察深度）
- "有没有收集过什么？树叶、石头、昆虫标本？"（分类和观察能力）
- "在户外时是更喜欢跑跳还是蹲下来看东西？"（身体运动 vs 自然观察倾向）

> **板块三结束小结：** "{child_name}面对挑战的方式很有特点——[观察到的Grit模式]。这个特质比任何具体技能都重要。"

---

#### 板块四：创造与表达（10分钟，深度覆盖空间+音乐+身体运动+语言创造性）

**过渡语：** "接下来我特别想知道，他有没有自己'创造'过什么东西。"

**主问题 Q11：**
```
{child_name}有没有自己创造过什么？不限形式——画、搭的东西、编的故事、发明的游戏规则都算。
```
追问方向：
- "创造的时候是有计划还是边做边想？"（思维模式）
- "会不会主动给你'展示'他的创造？怎么展示的？"（表达欲+表达方式）
- "对自己创造的东西满不满意？会不会反复修改？"（完美主义倾向+自省信号）

**主问题 Q12：**
```
他的身体协调性怎么样？运动方面有什么表现？
```
追问方向：
- "是整体都协调还是某方面特别突出？比如手特别灵巧但不爱跑步？"（粗大运动 vs 精细运动）
- "喜不喜欢做手工、拆东西、用手探索？"（触觉学习者信号）
- "学新的身体动作快不快？游泳、骑车、跳舞？"（身体学习速度）

**主问题 Q13：**
```
他对音乐、声音敏不敏感？
```
追问方向：
- "听到音乐会不会不自觉地跟着动？打拍子、哼唱、跳？"（节奏感）
- "能分辨不同乐器声音吗？对环境里的声音特别敏感？"（听觉敏感度）
- "有没有自己哼过自编的曲调？"（音乐创造力）

> **板块四结束小结：** "他在XX方面的创造力让我印象深刻，特别是[引用家长讲的具体案例]。"

---

#### 板块五：家长视角与价值观（10分钟，收集家长端数据用于后续建议适配）

**过渡语：** "我对{child_name}已经有了很清晰的画面了。最后几个问题是关于你的——因为好的建议必须跟你的价值观匹配。"

**主问题 Q14：**
```
你觉得{child_name}身上最让你骄傲的特点是什么？最让你头疼的呢？
```
追问方向：
- "骄傲的部分，你觉得是天生的还是后天培养的？"（家长对天赋的认知）
- "头疼的部分，你觉得是性格问题还是阶段性的？"（家长归因模式——关联Dweck）

**主问题 Q15：**
```
你最希望{child_name}未来成为什么样的人？不用具体职业，就是一种感觉。
```
追问方向：
- "这个期望跟你自己的成长经历有关系吗？"（家长投射检测）
- "如果{child_name}长大后选了一条跟你期望完全不同的路，你能接受吗？"（家长开放度——影响建议措辞激进程度）

**主问题 Q16：**
```
你现在最焦虑的一件关于{child_name}教育的事是什么？
```
追问方向：
- "这个焦虑是最近才有的还是一直有的？"
- "你身边的朋友也有类似的焦虑吗？"（区分个体焦虑 vs 群体焦虑）

**主问题 Q17（可选）：**
```
你们家现在在教育上花最多精力和钱的是什么？你觉得值吗？
```
追问说明：此问题极有价值——直接暴露家长的教育资源配置是否合理（比如花大量钱学钢琴但孩子天赋不在音乐）。

> **板块五结束：** "{child_name}的完整天赋分析出来了。让我整理一下给你看。"

---

### 整体访谈数据量预期

| 板块 | 时长 | 主问题数 | 含追问总轮数 | 预计用户输出 | 覆盖维度 |
|------|------|---------|------------|------------|---------|
| 一：日常自由时间 | 10min | 3 | 9-12轮 | 1000-2000字 | 全维度初筛+心流+行为模式 |
| 二：社交与关系 | 10min | 3 | 9-12轮 | 1000-2000字 | 人际+自省+语言（深度）|
| 三：学习与挑战 | 10min | 4 | 12-16轮 | 1500-2500字 | 逻辑数学+语言+自然观察+Grit（深度）|
| 四：创造与表达 | 10min | 3 | 9-12轮 | 1000-2000字 | 空间+音乐+身体运动（深度）|
| 五：家长视角 | 10min | 3-4 | 8-12轮 | 1000-1500字 | 家长价值观+焦虑+资源配置 |
| **合计** | **50-60min** | **16-17** | **47-64轮** | **5500-10000字** | **8维度全覆盖，每维度3-5个数据点** |

### 板块间记忆机制（解决长对话Token爆炸问题）

> **to 李金芮：这是深度访谈能实现的关键技术设计。**

每完成一个板块，后端调用小模型对该板块的对话做结构化提取，写入memory_entries。下一个板块开始时，LLM的输入只包含：精简prompt + 前面板块的摘要 + 当前板块的Dify会话记忆（最近5轮原文）。

```
板块一结束 → 小模型提取：
  "[心流] 搭积木时专注40分钟不被打扰"
  "[空间] 会先画设计图再搭建"
  "[行为] 完成后保留作品不拆"
  → 写入memory_entries（source=fixed_flow）

板块二开始时LLM的输入：
  - prompt（250 tokens）
  - 板块一的提取摘要（100-150 tokens）
  - 板块二的Dify会话记忆（最近5轮，500-800 tokens）
  = 总输入 850-1200 tokens（完全可控）
```

> **to 李金芮：实现方式是在Dify中把天赋盘点拆成5个串联的子chatflow，每个子chatflow对应一个板块。板块切换时后端触发小模型提取 → 写入memory → 启动下一个子chatflow并注入上下文。前端用户无感知——始终显示种子·发现在跟他对话。**

> **to 史志恒：板块切换时前端不需要做任何特殊处理，对话界面连续不断。但可以在板块切换时展示一个轻量的进度指示（如"我们聊到了第3/5个话题"），让家长知道还剩多少。**

### 每个板块的Token消耗估算

| 板块             | 输入Tokens/轮           | 轮数         | 板块总消耗               |
| -------------- | -------------------- | ---------- | ------------------- |
| 板块一            | ~1200                | 9-12       | ~12K-15K            |
| 板块二            | ~1100（板块一摘要+当前对话）    | 9-12       | ~10K-13K            |
| 板块三            | ~1200（板块一二摘要+当前对话）   | 12-16      | ~15K-19K            |
| 板块四            | ~1300（板块一二三摘要+当前对话）  | 9-12       | ~12K-16K            |
| 板块五            | ~1400（板块一二三四摘要+当前对话） | 8-12       | ~11K-17K            |
| 雷达图生成（LLM节点#2） | ~1000（五板块摘要汇总）       | 1          | ~2K-3K              |
| **深度访谈总计**     |                      | **47-64轮** | **~62K-83K tokens** |

> 这比浅层8题版本（约15K tokens）贵4-5倍，但这是付费用户的核心诊断环节——用户为此付费199-499元/年，83K tokens的成本约0.5-1元（用小模型做摘要+大模型做对话），ROI极高。

### System Prompt — LLM节点#2（雷达图生成）

> **to 李金芮：此节点的输入不是原始对话，而是5个板块的结构化提取结果（500-800 tokens）。**

```
角色：种子·发现的天赋分析引擎。
任务：基于五个板块的访谈数据，生成Gardner八维天赋雷达图。

输入：{five_blocks_extracted_data}（5个板块的结构化提取汇总）
孩子：{child_name}，{child_age}岁

规则：
1. 每个维度评分1.0-5.0，必须有具体行为证据支撑
2. 没有充分数据的维度标注confidence=low，不瞎猜
3. ai_era_insight必须引用知识库中的ai_era_mapping
4. growth_directions最多3个，必须基于top_talents推导
5. age_note必须根据孩子年龄引用Range理论的阶段建议
6. 输出按知识库中talent_radar_output_template.json格式
```

### 输出成果物

> **to 史志恒：前端渲染雷达图卡片。每个维度除了分数，还要展示1-2条行为证据（从访谈中提取的原话）。**

```json
{
  "talent_radar": {
    "linguistic": { "score": 3.5, "evidence": ["会自言自语讲故事给玩偶听", "跟大人聊天时偶尔蹦出很到位的话"], "confidence": "high" },
    "logical_mathematical": { "score": 4.0, "evidence": ["搭积木时先画设计图再搭", "玩桌游时会想两步以上"], "confidence": "high" },
    "spatial": { "score": 4.5, "evidence": ["搭积木专注40分钟", "会自发保留和展示作品", "拼图能做300片以上"], "confidence": "high" },
    "bodily_kinesthetic": { "score": 2.5, "evidence": ["手工灵巧但不太爱跑跳运动"], "confidence": "medium" },
    "musical": { "score": 3.0, "evidence": ["听到音乐会跟着打拍子"], "confidence": "low" },
    "interpersonal": { "score": 3.5, "evidence": ["能察觉妈妈不开心并主动安慰", "跟朋友吵架后会主动和好"], "confidence": "high" },
    "intrapersonal": { "score": 4.0, "evidence": ["会说'我想一个人待会儿'", "对自己的作品不满意时会反复修改"], "confidence": "high" },
    "naturalistic": { "score": 2.0, "evidence": ["对动植物没有特别兴趣"], "confidence": "medium" }
  },
  "top_talents": ["spatial", "logical_mathematical", "intrapersonal"],
  "ai_era_insight": "你的孩子在空间智能和逻辑思维上有明显优势，而且自省能力很强。逻辑思维让他未来能更好地理解和驾驭AI工具——这是AI时代拉开差距的关键能力。空间智能+逻辑的组合，在建筑设计、游戏开发、工程等领域会被AI工具成倍放大。",
  "growth_directions": [
    {
      "direction": "建筑/设计/3D创造",
      "why": "空间+逻辑的组合，适合'既要想象力又要严谨'的领域",
      "current_action": "多玩积木、拼图、建构类玩具。引导他'解释'自己的作品而不只是搭完就走。"
    },
    {
      "direction": "编程/游戏设计",
      "why": "逻辑+空间+自省的三重组合是程序员/设计师的天赋原型",
      "current_action": "先从Scratch或乐高机器人开始。不急着学代码，先培养'把想法变成可运行的东西'的习惯。"
    },
    {
      "direction": "独立研究/深度探索",
      "why": "自省智能很强意味着他喜欢深入思考。逻辑能力让他能处理复杂信息。",
      "current_action": "鼓励他围绕一个感兴趣的主题做'小研究'——比如'为什么大桥不会塌'。"
    }
  ],
  "age_note": "他现在6岁，正处于广泛探索期（Range理论）。不要过早锁定方向。让他在积木、编程、建筑模型、地图探索等活动中广泛尝试，观察哪个活动最容易让他进入心流状态。",
  "parent_note": "你提到希望他快乐成长、不想太卷。好消息是，他的天赋方向（空间+逻辑+自省）恰好适合'沉浸式自主探索'的成长方式，不需要大量刷题和上课。你在做对的事。",
  "confidence": "high（基于50分钟深度访谈，8个维度均有充分数据）"
}
```

### 异常处理

| 异常情况              | 处理方式                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 家长回答太简短（<20字）     | 追问"能具体说说吗？比如上一次他这么做的时候……"                                                                                              |
| 家长说"我没注意过"/"不记得了" | 发现说"没关系，那换个角度——他最近一次让你印象深刻的事是什么？"                                                                                      |
| 家长突然聊起别的话题        | "有意思，待会聊。先把这部分看完，就剩X个话题了。"将岔开内容存入parking_lot                                                                           |
| 家长说"太多了，我没时间"     | "我们已经聊了X/5个话题了。剩下的部分每个大概5分钟。聊完你就能看到完整的天赋雷达图——很多家长看完都说'原来我的孩子有这么多被忽略的天赋'。如果你现在有事，也可以中途离开，等忙完后再回来继续聊，我会保留有我们对话的记忆，不用担心。" |
| 家长中途关闭小程序         | 保存当前板块进度。下次登录恢复（last_incomplete_flow=talent_audit, last_incomplete_step=block_3_q8）                                    |
| 家长在板块三后要求提前看结果    | 发现说"已经聊了大半了。提前出的结果可能不够全面——再聊10分钟，你拿到的会是一份完整精准的分析。" 如果坚持 → 基于已有数据出结果，标注confidence=low的维度                                |

---

## 模块2：成长路径规划（发现 主导）

### chatflow ID: growth_path_flow
### LLM节点数: 1
### 触发条件: has_talent_radar = true

### 理论基础
- David Epstein《Range》— 年龄越小越应广泛探索，不过早专业化
- Csikszentmihalyi《Flow》— 心流状态是天赋和热爱交叉的信号
- 蒙特梭利阶段理论 — 不同年龄段学习方式根本不同

### System Prompt（精简版）

> **to 李金芮：年龄段路径规则放RAG知识库 `growth_path_rules.md`，prompt只引用。**

```
角色：种子·发现的成长路径功能。
任务：基于天赋雷达图，为孩子设计年龄适配的成长路径。

规则：
1. 3-6岁：只输出"活动建议"，不输出"方向"。强调广泛探索。
2. 6-12岁：输出2-3个"值得深入的方向"，每个含现在→6月→1年路径。
3. 12岁+：可输出终身方向建议+微项目概念+AI时代发展空间。
4. 每个方向必须包含"不合适怎么切换"的退出机制。
5. 不说"应该走XX路"，只说"值得探索"。
6. 路径输出按知识库中的growth_path_template格式。

孩子信息：{child_name}，{child_age}岁
天赋雷达：{talent_radar_summary}
已知信息：{memory_injection}
```

---

## 模块3：每周成长任务（引路 主导）

### chatflow ID: weekly_task_flow
### LLM节点数: 1
### 触发条件: has_growth_path = true

### 理论基础
- Deci & Ryan 自我决定理论 — 每个任务必须满足自主感+胜任感+联结感
- Carol Dweck 成长型思维 — 任务反馈必须基于"努力"而非"聪明"
- Flow理论 — 任务难度必须在"孩子能力边缘"

### RAG知识库

> **to 李金芮：为weekly_task_flow配置独立知识库。**

| 知识库文档 | 内容 |
|-----------|------|
| `sdt_task_checklist.md` | 自我决定理论三需求检查表——每个任务生成后自检 |
| `growth_mindset_feedback.md` | 成长型思维的家长反馈话术模板（按年龄段）|
| `task_templates_by_age.md` | 按年龄段×智能维度的活动素材库（需人工编写补充）|
| `weekly_task_output_template.json` | 任务输出的JSON结构模板 |

### System Prompt（精简版）

```
角色：种子·引路，成长任务设计师。
任务：每周生成2-3个成长任务，基于孩子天赋和上周反馈。

规则：
1. 任务名称要有趣（"秘密建筑师"而不是"空间智能训练3"）
2. 每个任务含：做什么、为什么、观察什么信号、怎么反馈
3. 反馈话术必须按知识库中growth_mindset_feedback模板（表扬努力不表扬聪明）
4. 给3个任务让孩子选1-2个做（自主感）
5. 难度基于上周反馈调整（上周太简单→提高，上周放弃→降低或拆分）
6. 输出按知识库中weekly_task_output_template格式

孩子：{child_name}，{child_age}岁
天赋TOP3：{top_talents}
上周任务反馈：{last_week_feedback}
已知信息：{memory_injection}
```

---

## 模块4：微项目系统（引路 主导，7岁+才开启）

### chatflow ID: mini_project_flow
### LLM节点数: 1
### 触发条件: child_age ≥ 7 AND weekly_tasks_completed ≥ 4

### 理论基础
- Reggio Emilia 项目制学习
- Design Thinking（共情→定义→构思→原型→测试）
- 《Designing Your Life》原型设计理念

### 关键prompt规则

> **to 李金芮：以下规则必须硬编码到system prompt中。**

```
严禁：
- 用"赚钱""收入""利润"等词汇。用"展示""分享""交换"
- 把项目成果跟金钱挂钩。成功标准是"完成了"和"学到了"
- 给孩子压力。中途想放弃时引导家长尊重选择

建议使用：
- "你想让更多人看到你的作品吗？"
- "如果有人很喜欢，你愿意送给他吗？"
- 10岁+可自然引入"价值交换"概念，但措辞必须温和
```

---

## 模块5：家长教练（种子主人格 主导）

### chatflow ID: parent_coach_chat
### LLM节点数: 1
### 触发条件: 日常对话中家长提出育儿问题

### 理论基础
- Daniel Siegel《The Whole-Brain Child》— 年龄段适配引导策略
- Martin Seligman PERMA模型 — 孩子整体幸福感评估
- Angela Duckworth《Grit》— 在天赋方向上培养坚毅力

### RAG知识库

> **to 李金芮：家长教练的知识库是最大的，因为问题种类最多。**

| 知识库文档 | 内容 |
|-----------|------|
| `whole_brain_strategies.md` | Siegel的12种全脑教养策略，按年龄段分类 |
| `perma_assessment.md` | PERMA五维度评估框架和引导问题 |
| `grit_cultivation.md` | 坚毅力培养方法（按年龄段）|
| `common_parenting_qa.md` | 高频育儿问题的回答框架（不想学习/沉迷游戏/社交困难等）|

### System Prompt（精简版）

```
角色：种子，家长的育儿伙伴。
任务：回答育儿问题，所有回答基于这个孩子的天赋档案个性化。

规则：
1. 个性化：不说"孩子不想练琴是正常的"，说"小明的天赋在空间创造不在音乐，精力放在XX更有成就感"
2. 焦虑检测：家长说"别人家都在学编程"→先缓解焦虑再给建议
3. 引用理论时用大白话（"他搭积木时叫不动——这种状态特别珍贵"而不是"根据心流理论"）
4. 每个建议给一个"明天就能做的事"
5. 涉及其他模块能力时自然引导（"要不要我帮你设计一个任务来观察？"）

孩子：{child_name}，{child_age}岁
天赋TOP3：{top_talents}
已知信息：{memory_injection}
```

---

# 第五章：Onboarding全路径状态机

## 5.0 用户状态字段（数据库驱动）

> **to 王凯：以下字段存在users表中，每次用户进入时后端查询决定路由。**

```
onboarding_completed: BOOLEAN
child_name: VARCHAR
child_age: INT
child_gender: VARCHAR
age_stage: ENUM(exploration/focus/depth)
has_talent_radar: BOOLEAN
has_growth_path: BOOLEAN
weekly_tasks_completed: INT
has_mini_project: BOOLEAN
last_incomplete_flow: VARCHAR
last_incomplete_step: VARCHAR
days_inactive: INT
total_sessions: INT
parent_anxiety_level: ENUM(high/medium/low)
```

## 5.1 首次登录入口

### Step 0-2: 登录 + 确认昵称（与OPC完全一致）

> **to 史志恒：Landing页CTA按钮文案是"帮我看看孩子的天赋"。登录后立即触发订阅请求。**

### Step 3: 孩子基本信息
```
[种子] 我需要先认识一下你的孩子。他/她叫什么名字？今年多大了？
```

> **to 史志恒：家长回答后，前端提取年龄数字写入users表。**

年龄决定框架：
```
child_age < 3  → 种子说"3岁以下宝宝还在感官发育期。我先给你一些这个阶段的建议。"
                 → 进入parent_coach_chat（早期养育模式）。不做天赋盘点。
child_age 3-6  → age_stage = "exploration"
child_age 7-12 → age_stage = "focus"
child_age 13+  → age_stage = "depth"
```

### Step 4: 入口分流（所有路径汇聚到"他叫什么名字"）

```
[种子] 你能来这里，说明你在认真想孩子的未来——这已经比大多数家长领先一步了。
       我能帮你做的是：看清你的孩子身上有什么独特的天赋，
       以及这些天赋在AI时代意味着什么。
       你最想从哪里开始？

快捷回复：
[看看我孩子有什么天赋]
[聊聊AI时代该怎么培养孩子]
[我家孩子的情况比较特殊]
```

**不展示任何钩子卡片。** 原因：任何"2分钟快速扫描"类的钩子都会设置错误预期——我们的真正价值是50分钟深度访谈，浅扫描只会让家长觉得"跟ChatGPT没区别"。三个快捷回复本身就是最好的入口。

### 路由总览

> **核心设计原则：三个快捷回复不是三条不同的pipeline，而是三种不同的暖场方式进入同一个pipeline。区别只在入口处的1-3轮暖场对话，之后全部汇入"他叫什么名字→深度访谈"这条唯一的路。**

| 行为 | 暖场轮数 | 汇聚方式 | entry_path |
|------|---------|---------|------------|
| "看看我孩子有什么天赋" | 0轮，直接进入 | → "他叫什么名字？" → 深度访谈 | A |
| "聊聊AI时代该怎么培养" | 1-2轮信息分享 | → "要给你有用的建议得先了解他。他叫什么？" → 深度访谈 | B |
| "我家情况比较特殊" | 2-3轮倾听+共情 | → "解决这个问题的第一步是看清他的天赋。他叫什么？" → 深度访谈 | C |
| 自由输入 | 1-2轮回应 | → 种子自然追问孩子信息 → 深度访谈 | free |

**所有路径在"他叫什么名字"这一句话上汇聚。这之后就是同一个pipeline，没有任何分叉。**

---

## 5.2 Path A: "看看我孩子有什么天赋"

**零暖场，直接进入。** 家长目标最明确，不需要任何铺垫。

```
[种子] 好，我们来好好聊聊他。
       先告诉我——他叫什么名字？今年多大了？
```

家长回答后 → 写入users表 → 进入深度访谈板块一（talent_audit_block1）。

> **to 李金芮：直接调用talent_audit_block1 chatflow（板块一），后续板块由后端自动串联。**

---

## 5.3 Path B: "聊聊AI时代该怎么培养孩子"

**1-2轮暖场，然后桥接。** 家长想要的是"信息"不是"诊断"，直接推盘点会觉得被套路。先给信息价值，再自然桥接。

```
[种子] AI时代最大的变化不是"学什么"变了，而是"怎么找方向"变了。
       以前的路径是先学知识再找工作，未来的路径是先找到自己的天赋方向，
       然后围绕它去学需要的东西——AI会帮你学得更快，但不能帮你选方向。
       
       所以最重要的问题不是"该学什么"，而是"我的孩子天生适合什么"。
       这个问题，我可以帮你回答。跟我聊聊你的孩子？
       他叫什么名字，今年多大了？
```

> 注意：种子没有问"要不要做个盘点"——没有给家长拒绝的机会。而是在信息分享后自然过渡到"跟我聊聊你的孩子"。

**如果家长不接桥，继续追问AI话题：**

```
（家长说"那具体该培养什么能力呢？"）

[种子] 通用的能力清单我可以列——创造力、逻辑思维、同理心、自我认知。
       但说实话，这些清单对你没什么用。因为每个孩子不一样。
       你的孩子可能创造力极强但逻辑一般，也可能反过来。
       笼统地说"培养创造力"跟什么都没说一样。
       
       要给你真正有用的建议，我得先了解你的孩子。
       他叫什么名字？
```

**如果家长仍然不接（概率极低），种子在后续对话中自然穿插采集：**
"你说得对，AI确实在改变教育。你的孩子现在几岁了？他在学校对这些变化有感觉吗？"
暗中收集到名字和年龄后，直接进入深度访谈。

---

## 5.4 Path C: "我家孩子的情况比较特殊"

**先倾听2-3轮，再桥接。** 家长有具体困扰，必须先听他说完。

```
[种子] 好，你说说看。
```

**就这一句话。让家长说。**

家长可能说的情况以及种子的回应模式（**共情→重新框架→桥接到"他叫什么名字"**）：

```
（家长说"他只喜欢玩游戏什么都不想学"）

[种子] 我理解你的担心。但"只喜欢玩游戏"这件事本身藏着很多信息——
       他玩什么类型的游戏？他在游戏里是什么风格？
       这些都能反映他的思维方式和天赋倾向。
       
       与其跟游戏对抗，不如先搞清楚他为什么被游戏吸引，
       那个吸引力背后的天赋是什么，然后找到一个
       跟游戏一样能吸引他、但更有成长价值的方向。
       
       我来帮你找。他叫什么名字？今年多大了？
```

```
（家长说"他被诊断为ADHD"）

[种子] 这不是"有问题"，这是他的大脑运转方式跟大多数人不同。
       ADHD的孩子往往在某些领域有惊人的专注力——关键是找到那个领域。
       
       我来帮你看看他的注意力和能量最自然地流向哪里。
       他叫什么名字？今年多大了？
```

```
（家长说"他现在厌学了"）

[种子] 厌学往往不是"不爱学"，而是"现在学的东西跟他的天赋不匹配"。
       当一个孩子被迫做不擅长的事，他会本能地抗拒。
       
       我来帮你看看他真正擅长的是什么——找到那个点之后，
       你会发现他的学习动力会自己回来。
       他叫什么名字？今年多大了？
```

```
（家长说"我和他爸教育理念不一致"）

[种子] 这种情况很常见。但你们的分歧可能不是"谁对谁错"，
       而是你们还没有一个共同的"基准线"——
       你们的孩子到底擅长什么、适合什么。
       
       如果你们能看到同一份客观的天赋分析，
       讨论就会从"我觉得该这样"变成"他的天赋适合那样"。
       我来帮你们建立这个基准线。他叫什么名字？
```

> **to 李金芮：Path C的回应不需要单独的chatflow。由onboarding_flow的LLM节点#1完成。在system prompt中加入规则："如果家长选择了'情况比较特殊'，你的任务是：倾听→共情→用'搞清楚天赋是解决这个问题的第一步'来桥接→追问'他叫什么名字'。无论家长描述什么情况，桥接逻辑都是一样的。"**

---

## 5.5 自由输入兜底

> **to 史志恒：先走第二层关键词匹配。未命中则调用第三层意图分类API。**

```javascript
const ONBOARDING_RULES = [
  // 明确意图
  { keywords: ["天赋", "特长", "擅长", "适合", "盘点"], route: "path_a" },
  { keywords: ["AI", "人工智能", "未来", "能力", "培养"], route: "path_b" },
  // 特殊情况
  { keywords: ["沉迷游戏", "手机", "不学习", "叛逆", "ADHD", "厌学", "特殊"], route: "path_c" },
  { keywords: ["焦虑", "担心", "不知道怎么办", "迷茫"], route: "path_c" },
  // 闲聊/介绍
  { keywords: ["你好", "你是谁", "能做什么", "怎么用"], route: "intro_then_ask_child" },
];
// intro_then_ask_child: 种子自我介绍后追问"跟我聊聊你的孩子？他叫什么名字？"
// 未命中 → 种子在主对话流中回应，然后自然追问孩子信息
```

---

## 5.6 汇聚后的统一流程

**所有路径在家长说出孩子名字+年龄后，进入完全相同的pipeline：**

```
家长说出名字+年龄 → 写入users表 → 确认基本信息 → 
角色切换到种子·发现（紫色）→ 进入talent_audit_block1（板块一：日常自由时间）→
板块一结束 → 小模型摘要提取 → talent_audit_block2 → ... → 
talent_audit_block5 → talent_radar_gen → 输出天赋雷达图
```

**天赋雷达图输出后：**
```
[发现] {child_name}的天赋分析出来了。
       [天赋雷达图卡片（八维度 + 行为证据 + AI时代分析）]
       [成长路径建议卡片]
       
       这是一个起点，不是终点。随着你持续跟我分享他的表现，这张图会越来越精准。
       
       接下来我每周会给你推2-3个成长小任务，都是有趣的亲子活动，
       专门针对{child_name}的天赋设计的。
       要不要现在看看这周的任务？
       
快捷回复：[好，看看这周做什么] [我先消化一下报告] [我想问问关于报告的问题]
```

**订阅触发点 #2：** 雷达图卡片底部"接收每周成长任务推送"

| 选择 | 路由 |
|------|------|
| "看看这周做什么" | → 切换到种子·引路，调用weekly_task_flow生成本周任务 |
| "先消化一下" | → 不强留。种子说"好的，报告帮你存好了，随时回来看。" |
| "问问关于报告的问题" | → 留在发现自由聊天chatflow，回答家长疑问 |
| 自由输入 | → 发现回应具体问题 |

---

# 第六章：二次登录路由逻辑

## 6.0 入口决策树

> **to 李金芮：后端按以下顺序检查，命中第一个就执行。**

```
Step 1: last_incomplete_flow != null?
  → YES: "上次我们聊到[XX]，继续吗？"  快捷回复: [继续] [先聊别的]

Step 2: has_talent_radar = false?
  → YES: "上次走了一半，{child_name}的天赋雷达图还没出来。就差几个问题了。"

Step 3: has_talent_radar = true BUT weekly_tasks_completed = 0?
  → YES: "{child_name}的天赋已经盘清了，但还没开始第一个成长任务。这周试试？"

Step 4: has_talent_radar = true AND weekly_tasks_completed > 0?
  → 正常日常模式
```

## 6.1 正常日常模式

| 用户阶段 | 种子的问候 |
|----------|----------|
| 第一次完成周任务 | "上周的'秘密建筑师'做了吗？{child_name}有什么反应？" |
| 持续完成任务 | "这周新任务出来了。{child_name}上周的表现已更新到天赋档案里。" |
| 有微项目进行 | "{child_name}的'动物明信片'进行到第几周了？" |
| 超过2周没来 | "好久不见！{child_name}最近有什么新变化？" |

## 6.2 用户主动选择角色

| 角色 | 数据库检查 | 无成果物→ | 有成果物→ |
|------|-----------|----------|----------|
| 种子·发现 | has_talent_radar? has_growth_path? | 缺什么走什么固定流 | 自由聊天（"有新变化吗？要更新雷达图？"）|
| 种子·引路 | has_talent_radar? weekly_tasks_completed? | 前置检查→"先跟发现聊聊？" | 自由聊天（任务反馈+新任务+微项目）|

---

# 第七章：跨Chatflow记忆共享架构

> **to 李金芮 & 王凯：本章是记忆系统的核心设计，后端+数据库协同实现。**

## 7.1 三层记忆架构

| 层级 | 存储位置 | 生命周期 | 负责人 | 用途 |
|------|---------|---------|--------|------|
| 层一：chatflow内部记忆 | Dify原生会话记忆 | 单次chatflow会话期间 | **to 李金芮**：每个chatflow设置保留5轮 | 同一chatflow内的对话连贯性 |
| 层二：切换摘要 | `session_summaries` 临时表 | 30分钟自动清除 | **to 王凯**：建表+定时清理任务 | chatflow切换时传递上下文 |
| 层三：长期记忆 | `memory_entries` 表 | 永久 | **to 王凯**：已有表，新增字段 | 跨会话的个性化 |

## 7.2 层二：切换摘要的具体实现

> **to 李金芮：当用户从chatflow A被路由到chatflow B时，执行以下步骤。**

```
Step 1: chatflow A结束 → 调用小模型生成交接摘要（handoff summary）
Step 2: 摘要写入session_summaries表
Step 3: chatflow B启动时，读取最近30分钟内所有摘要 → 注入system prompt

摘要格式（固定，约100-150 tokens）：
## 刚才的对话摘要
- 来源角色：种子·发现
- 对话主题：天赋盘点第5题
- 关键信息：孩子6岁，喜欢搭积木（空间智能信号强），专注但不太爱社交
- 家长情绪：平静，配合度高
- 未完成事项：还剩3个问题没问
```

> **to 王凯：session_summaries表结构**

```sql
CREATE TABLE session_summaries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  source_chatflow VARCHAR,        -- 来源chatflow ID
  summary TEXT,                   -- 摘要文本
  created_at TIMESTAMP DEFAULT NOW()
);

-- 30分钟自动清理（pg_cron或应用层定时任务）
DELETE FROM session_summaries WHERE created_at < NOW() - INTERVAL '30 minutes';
```

## 7.3 层三：长期记忆的类别

| category | 说明 | 示例 |
|----------|------|------|
| child_identity | 孩子基本信息 | "男孩，6岁，幼儿园大班" |
| child_talent | 天赋相关观察 | "搭积木时会先画设计图再搭建" |
| child_interest | 兴趣爱好 | "最近迷上恐龙，能说出30种名字" |
| child_behavior | 行为模式 | "遇到困难会反复尝试，不太求助" |
| parent_preference | 家长偏好 | "希望孩子快乐成长，不想太卷" |
| parent_concern | 家长担忧 | "担心孩子不爱社交" |
| task_feedback | 任务反馈 | "秘密建筑师：做了2小时非常投入" |

> **to 王凯：memory_entries表需要新增两个字段**

```sql
ALTER TABLE memory_entries ADD COLUMN source VARCHAR DEFAULT 'free_chat';
-- 值：fixed_flow / free_chat / task_feedback
-- 用途：来自固定流程的记忆比闲聊的可信度更高

ALTER TABLE memory_entries ADD COLUMN confirmation_count INT DEFAULT 1;
-- 同一事实被多次提到时+1，而不是重复插入
-- 去重逻辑：新记忆提取后，检查是否已有相似条目（关键实体相同）
-- 如果有 → confirmation_count + 1, updated_at = NOW()
-- 如果没有 → INSERT新条目
```

---

# 第八章：记忆注入服务详细设计

> **to 李金芮 & 王凯：本章是每轮对话调用LLM之前的关键环节。**

## 8.1 调用链路

```
用户发消息 → 前端路由确定chatflow_id → 后端API被调用 →
[记忆注入服务] → 格式化输出 → 作为变量传入Dify chatflow → Dify执行LLM调用
```

## 8.2 Step 1：按chatflow类别过滤

> **to 李金芮：在后端config文件中维护以下配置。**

```json
{
  "talent_audit_flow": {
    "categories": ["child_identity", "child_talent", "child_interest", "child_behavior"],
    "primary_categories": ["child_talent", "child_interest"],
    "max_tokens": 400
  },
  "weekly_task_flow": {
    "categories": ["child_talent", "child_interest", "task_feedback"],
    "primary_categories": ["task_feedback"],
    "max_tokens": 400
  },
  "growth_path_flow": {
    "categories": ["child_talent", "child_interest", "parent_preference"],
    "primary_categories": ["child_talent"],
    "max_tokens": 300
  },
  "parent_coach_chat": {
    "categories": ["child_identity", "child_talent", "child_interest", "child_behavior", 
                    "parent_preference", "parent_concern", "task_feedback"],
    "primary_categories": ["child_talent", "parent_concern"],
    "max_tokens": 500
  },
  "mini_project_flow": {
    "categories": ["child_talent", "child_interest", "task_feedback", "child_behavior"],
    "primary_categories": ["child_talent", "task_feedback"],
    "max_tokens": 400
  },
  "zhongzi_main_chat": {
    "categories": ["child_identity", "child_talent", "child_interest", "child_behavior",
                    "parent_preference", "parent_concern", "task_feedback"],
    "primary_categories": ["child_talent", "child_interest"],
    "max_tokens": 500
  }
}
```

SQL查询：
```sql
SELECT * FROM memory_entries 
WHERE user_id = ? AND category IN (?)
ORDER BY updated_at DESC;
```

## 8.3 Step 2：评分排序

> **to 李金芮：在后端实现以下评分函数。**

```python
def score_memory(entry, chatflow_config):
    score = 0
    
    # 规则1：新鲜度
    days_ago = (now - entry.updated_at).days
    if days_ago <= 7:
        score += 30
    elif days_ago <= 30:
        score += 20
    elif days_ago <= 90:
        score += 10
    else:
        score += 5
    
    # 规则2：来源可信度
    if entry.source == "fixed_flow":
        score += 20
    elif entry.source == "task_feedback":
        score += 15
    else:  # free_chat
        score += 5
    
    # 规则3：被多次验证的事实更可信
    score += min(entry.confirmation_count * 10, 30)  # 最多加30分
    
    # 规则4：当前chatflow的主要类别优先
    if entry.category in chatflow_config["primary_categories"]:
        score += 15
    
    return score
```

## 8.4 Step 3：截断（保证每个类别至少1条）

> **to 李金芮：确保不被单一类别占满。**

```python
def select_memories(sorted_entries, max_tokens, categories):
    selected = []
    remaining_budget = max_tokens
    
    # 第一轮：每个类别至少选1条最高分的
    for cat in categories:
        cat_entries = [e for e in sorted_entries if e.category == cat]
        if cat_entries:
            top = cat_entries[0]
            token_cost = estimate_tokens(top.content)  # 粗估：中文字数 * 1.5
            if token_cost <= remaining_budget:
                selected.append(top)
                remaining_budget -= token_cost
    
    # 第二轮：剩余预算按分数填充
    remaining = [e for e in sorted_entries if e not in selected]
    for entry in remaining:
        token_cost = estimate_tokens(entry.content)
        if token_cost <= remaining_budget:
            selected.append(entry)
            remaining_budget -= token_cost
        if remaining_budget <= 0:
            break
    
    return selected
```

## 8.5 Step 4：格式化

> **to 李金芮：格式化后的文本作为 {memory_injection} 变量传入Dify。**

```python
def format_memories(selected_entries):
    lines = ["## 已知信息"]
    category_map = {
        "child_identity": "孩子",
        "child_talent": "天赋",
        "child_interest": "兴趣",
        "child_behavior": "行为",
        "parent_preference": "家长",
        "parent_concern": "家长担忧",
        "task_feedback": "任务反馈"
    }
    
    # 按类别分组
    grouped = {}
    for entry in selected_entries:
        label = category_map.get(entry.category, "其他")
        if label not in grouped:
            grouped[label] = []
        grouped[label].append(entry.content)
    
    for label, contents in grouped.items():
        lines.append(f"[{label}] " + "；".join(contents))
    
    return "\n".join(lines)
```

**输出示例（约200-400 tokens）：**
```
## 已知信息
[孩子] 男孩，6岁，幼儿园大班
[天赋] 搭积木时会先画设计图再搭建（空间智能信号强）；做拼图时能专注40分钟（心流信号）
[兴趣] 最近迷上恐龙，能说出30种名字；不喜欢画画但喜欢搭建
[行为] 遇到困难会反复尝试，不太求助
[家长] 希望孩子快乐成长，不想太卷
[任务反馈] 上周"秘密建筑师"：做了2小时非常投入，搭了"恐龙博物馆"
```

## 8.6 完整调用链路示例

> **to 李金芮：以下是一次完整的API调用流程。**

```
前端发送: POST /api/chat
{
  chatflow_id: "weekly_task_flow",
  user_id: "uuid-xxx",
  message: "这周做什么"
}

后端处理:
1. 读取config → weekly_task_flow需要 [child_talent, child_interest, task_feedback]，max_tokens=400
2. SQL查询 memory_entries WHERE user_id AND category IN (...)
3. score_memory() 排序
4. select_memories() 截断
5. format_memories() 格式化 → 得到 memory_injection 文本
6. 读取 session_summaries WHERE user_id AND created_at > 30min_ago → 得到 session_context
7. 从 child_profiles 表读取 talent_radar, top_talents
8. 从 growth_tasks 表读取上周反馈 → 得到 last_week_feedback
9. 组装 Dify API 调用:
   {
     chatflow_id: "weekly_task_flow",
     inputs: {
       child_name: "小明",
       child_age: 6,
       top_talents: "空间智能、逻辑数学智能、自省智能",
       last_week_feedback: "秘密建筑师：做了2小时非常投入",
       memory_injection: "[天赋] 搭积木时先画设计图...\n[兴趣] 迷上恐龙...",
       session_context: ""  // 本次无切换摘要
     },
     query: "这周做什么"
   }
10. 返回Dify结果给前端
11. 异步：调用小模型从本轮对话中提取新memory_entries
```

## 8.7 Token消耗估算

| 组成部分 | Token数 |
|---------|---------|
| system prompt（精简版）| 150-200 |
| memory_injection | 200-400 |
| session_context（如果有）| 100-150 |
| Dify内部会话记忆（5轮）| 500-800 |
| RAG检索结果（如果触发）| 200-400 |
| 用户当前输入 | 50-200 |
| **总输入** | **1200-2150** |
| LLM输出 | 200-800 |
| **单轮总消耗** | **1400-2950** |

**对比无优化方案（10轮原文+长prompt+全量记忆 ≈ 5000+）：降低50-70%。**

---

# 第九章：数据库核心表

> **to 王凯：本章定义所有需要建的表。**

## 9.1 users表（家长信息）
```sql
-- 跟OPC的users表结构相同，新增以下字段：
child_name VARCHAR
child_age INT                      -- 每年自动+1
child_gender VARCHAR
age_stage ENUM('exploration','focus','depth')
parent_anxiety_level ENUM('high','medium','low')
entry_path VARCHAR                 -- A/B/C/D/free
```

## 9.2 child_profiles表（孩子天赋档案——核心表）
```sql
CREATE TABLE child_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  talent_radar JSONB,              -- 八维度天赋评分
  top_talents JSONB,               -- 前3个优势维度
  growth_directions JSONB,         -- 成长方向建议
  ai_era_insight TEXT,             -- AI时代分析
  flow_signals JSONB,              -- 心流信号记录
  personality_tags JSONB,
  version INT DEFAULT 1,           -- 每次更新+1
  confidence ENUM('low','medium','high'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 9.3 growth_tasks表（每周成长任务）
```sql
CREATE TABLE growth_tasks (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES child_profiles(id),
  week VARCHAR,                    -- 如 2026-W16
  tasks JSONB,                     -- 本周2-3个任务详情
  status ENUM('pending','completed','skipped'),
  feedback JSONB,                  -- 家长反馈记录
  talent_updates JSONB,            -- 基于反馈更新的天赋信息
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 9.4 mini_projects表（微项目）
```sql
CREATE TABLE mini_projects (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES child_profiles(id),
  project_name VARCHAR,
  talent_match JSONB,
  duration_weeks INT,
  current_week INT DEFAULT 0,
  milestones JSONB,
  status ENUM('planning','in_progress','completed','abandoned'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 9.5 session_summaries表（切换摘要——临时表）
```sql
-- 见第七章 7.2 节
```

## 9.6 其他表（完全复用OPC）
- artifacts, conversation_states, memory_entries（新增source和confirmation_count字段）, behavior_logs, subscription_tokens

---

# 第十章：Chatflow清单汇总

| 编号 | chatflow ID | 角色 | 类型 | LLM节点数 | 独立知识库 | 触发条件 |
|------|-------------|------|------|-----------|-----------|----------|
| 01 | onboarding_flow | 种子 | 固定 | 1 | 无 | 首次登录 |
| 02a | talent_audit_block1 | 发现 | 固定 | 1 | interview_guide + gardner_8_intelligences | 标准盘点·板块一：日常自由时间 |
| 02b | talent_audit_block2 | 发现 | 固定 | 1 | 同上 | 板块一完成→自动进入 |
| 02c | talent_audit_block3 | 发现 | 固定 | 1 | 同上 | 板块二完成→自动进入 |
| 02d | talent_audit_block4 | 发现 | 固定 | 1 | 同上 | 板块三完成→自动进入 |
| 02e | talent_audit_block5 | 发现 | 固定 | 1 | 同上 | 板块四完成→自动进入 |
| 02f | talent_radar_gen | 发现 | 固定 | 1 | ai_era_mapping + talent_radar_template + age_milestones | 板块五完成→生成雷达图 |
| 03 | growth_path_flow | 发现 | 固定 | 1 | growth_path_rules + growth_path_template | has_talent_radar=true |
| 04 | faxian_free_chat | 发现 | 自由 | 1 | gardner_8_intelligences | 发现固定流完成 |
| 05 | weekly_task_flow | 引路 | 固定 | 1 | sdt_task_checklist + growth_mindset_feedback + task_templates_by_age + weekly_task_template | has_growth_path=true |
| 06 | mini_project_flow | 引路 | 固定 | 1 | reggio_emilia_principles + design_thinking_steps + project_template | age≥7 + tasks≥4周 |
| 07 | yinlu_free_chat | 引路 | 自由 | 1 | task_templates_by_age | 引路固定流完成 |
| 08 | parent_coach_chat | 种子 | 自由 | 1 | whole_brain_strategies + perma_assessment + grit_cultivation + common_parenting_qa | 日常育儿问题 |
| 09 | zhongzi_main_chat | 种子 | 自由 | 1 | 无（通用对话）| 日常对话/LLM fallback |
| 10 | anxiety_relief_flow | 种子 | 固定 | 1 | range_early_exploration + common_parenting_qa | 检测到高焦虑信号 |

**总计：15个chatflow（天赋深度访谈拆为6个子chatflow，砍掉了浅层快速扫描），每个只有1个LLM节点。**

> **to 李金芮：天赋盘点的6个子chatflow（02a-02f）在Dify中是6个独立的chatflow，共享同一个知识库。板块切换由后端Agent Router API控制——每个子chatflow结束时后端触发小模型提取摘要→写入memory_entries→启动下一个子chatflow并注入上下文。前端用户完全无感知，始终显示种子·发现在对话。每个子chatflow的Dify会话记忆设为5轮即可（板块内的连贯性由Dify管，板块间的上下文由你的摘要注入机制管）。**

> **to 史志恒：前端需要支持渲染的卡片类型有——天赋雷达图（八维度，每个维度含分数+行为证据）、成长路径卡片、每周任务卡片（含反馈按钮）、微项目进度卡片、月度成长报告卡片。深度访谈过程中可选展示轻量进度指示（"我们聊到了第3/5个话题"）。**

> **to 王凯：总计需要建/改的表——新建5张（child_profiles, growth_tasks, mini_projects, session_summaries, + 考虑新增talent_audit_progress表记录每个板块的完成状态和提取结果），修改1张（memory_entries加source和confirmation_count），复用5张（users, artifacts, conversation_states, behavior_logs, subscription_tokens）。**
