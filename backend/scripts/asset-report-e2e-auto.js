/**
 * 资产报告生成 —— 全真实多轮对话 E2E 测试
 *
 * 覆盖：
 *   1. 多轮真实资产盘点对话
 *   2. 触发条件、状态时序、轮次区间
 *   3. /profile 最终报告长度与章节结构
 *   4. Markdown 摘要 + JSON 明细产物
 *
 * 用法：
 *   cd backend && node scripts/asset-report-e2e-auto.js
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const {
  summarizeReport,
  writeJsonReport
} = require("./asset-report-test-helpers");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// E2E 默认优先打本地后端，避免误用 .env 里的线上/远端 PUBLIC_BASE_URL。
// 如果确实要打别的环境，显式传 SMOKE_BASE_URL 即可。
const baseURL = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const streamTimeoutMs = Number(process.env.SMOKE_STREAM_TIMEOUT_MS || 180000);
const reportTimeoutMs = Number(process.env.SMOKE_REPORT_TIMEOUT_MS || 300000);
const minTurns = Number(process.env.SMOKE_MIN_TURNS || 15);
const maxTurns = Number(process.env.SMOKE_MAX_TURNS || 25);
const minReportChars = Number(process.env.SMOKE_MIN_REPORT_CHARS || 3000);
const userMode = String(process.env.SMOKE_USER_MODE || "script").trim().toLowerCase();
const userLlmProvider = String(process.env.SMOKE_USER_LLM_PROVIDER || "zhipu").trim().toLowerCase();
const userLlmModel = String(process.env.SMOKE_USER_LLM_MODEL || process.env.PROFILE_LLM_MODEL || "glm-4-flash").trim();
const userLlmTimeoutMs = Number(process.env.SMOKE_USER_LLM_TIMEOUT_MS || 20000);
const userLlmTemperature = Number(process.env.SMOKE_USER_LLM_TEMPERATURE || 0.7);
const zhipuApiKey = String(process.env.ZHIPU_API_KEY || "").trim();
const zhipuBaseUrl = String(process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").trim();
const scenarioFilter = String(process.env.SMOKE_SCENARIOS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function buildReportTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const reportTimestamp = buildReportTimestamp();
const markdownReportPath = path.join(
  __dirname,
  "..",
  "reports",
  `asset-report-e2e-auto-${reportTimestamp}.md`
);
const jsonReportPath = path.join(
  __dirname,
  "..",
  "reports",
  `asset-report-e2e-auto-${reportTimestamp}.json`
);

const QUESTION_PATTERNS = [
  {
    key: "alignment_confirm",
    patterns: [/这样准不准/, /有要补的吗/, /这层判断准不准/, /你认不认同/, /这样看是否/, /这层对不对/, /要不要补充/]
  },
  {
    key: "ability_adoption",
    patterns: [
      /验证效果/,
      /真正用起来/,
      /怎么用起来/,
      /覆盖.*员工/,
      /带来了什么结果/,
      /减少了什么返工/,
      /省了什么时间/,
      /明确结果/,
      /结果是什么/,
      /用户侧/,
      /你自己这边/,
      /推进出了什么/,
      /拿到.*结果/,
      /可见结果/,
      /最后真的落地/,
      /落地到.*结果/
    ]
  },
  {
    key: "resource_case",
    patterns: [
      /具体问题是什么/,
      /一句原话/,
      /一个具体人/,
      /一次具体推进动作/,
      /最近一次加你微信继续聊的人/,
      /主动追问价格和交付方式/,
      /最近一次.*继续聊/,
      /最想解决的那个具体问题/,
      /把这个起点钉实/,
      /价格追问/,
      /有哪些能力/,
      /哪三项能力/,
      /最犹豫先卖哪一项/,
      /为什么没卖出去/
    ]
  },
  {
    key: "resource_conversion",
    patterns: [
      /博客.*导向/,
      /怎么引导/,
      /验证动作/,
      /导向这个产品/,
      /付费意愿/,
      /转化/,
      /页面或验证动作/,
      /付费迹象/,
      /差一点付费/,
      /付出具体行动/,
      /真的让用户/,
      /最近一次.*付费/,
      /表单/,
      /加微信/,
      /留言/,
      /试用/,
      /购买意向/,
      /导到.*沟通/,
      /真实结果痕迹/
    ]
  },
  {
    key: "cognition_tradeoff",
    patterns: [/主动放弃/, /压缩了/, /砍掉/, /重排/, /简化了/, /取舍/, /没做/, /行业规律/, /用户心理/, /跨界方法/, /改变了.*决策/, /看懂了/]
  },
  {
    key: "relationship_activation",
    patterns: [
      /找熟人试用/,
      /谁愿意信任/,
      /谁愿意帮/,
      /谁会介绍/,
      /种子用户/,
      /合伙人/,
      /月度交流/,
      /熟人/,
      /前同事/,
      /朋友帮/,
      /往前挪了一步/,
      /靠关系推进事情/
    ]
  },
  {
    key: "ability_proof",
    patterns: [
      /做完并推出来/,
      /真实推进项目/,
      /真正推进/,
      /具体功能/,
      /具体一件事/,
      /真实动作/,
      /亲自推动/,
      /真实发生过的事/,
      /具体动作是什么/,
      /拿到明确结果的事/,
      /最近 3 个月/,
      /真实片段/,
      /亲手做成/,
      /具体动作和结果/,
      /你亲手负责/,
      /哪一步是你亲手做的/,
      /最后真的落地了的事/,
      /真实项目上/,
      /亲手推动.*落地/
    ]
  },
  { key: "ability_core", patterns: [/核心能力/, /能力上/, /技能上/, /你最擅长/, /做过.*项目/, /案例/, /成就/, /做过什么/] },
  {
    key: "resource_core",
    patterns: [
      /资源上/,
      /工具上/,
      /平台上/,
      /资产.*有/,
      /拥有/,
      /手头/,
      /现有/,
      /工具/,
      /平台能力/,
      /权限/,
      /具体支持/,
      /调用过/,
      /可调动/,
      /底座/,
      /资源事实/,
      /谁给过你/
    ]
  },
  { key: "cognition_core", patterns: [/认知上/, /理解上/, /判断上/, /信念/, /洞察/, /看法/, /怎么看/] },
  { key: "relationship_core", patterns: [/关系上/, /人脉上/, /合作伙伴/, /伙伴/, /圈子/, /社交/, /联系/] }
];

function buildScenarioSet() {
  return [
    {
      scenario: "balanced_inventory",
      label: "均衡信息场景",
      opening: "我想盘点我的资产，我目前在做一个创业者指导小程序项目，想通过真实多轮盘点拿到完整的资产报告。",
      answers: {
        alignment_confirm: [
          "这层判断基本准，你可以继续往下一维问。如果要补一句，我的优势不是某个孤立技能，而是把产品、流程和判断接成闭环。",
          "整体是准的，可以继续。真要补的话，我更希望你后面在报告里把“结构化拆解 + 工具化落地”这个组合作为核心资产来看。"
        ],
        ability_core: [
          "我能独立搭建微信小程序前端、NestJS 后端、Prisma 数据库和 Dify 工作流。最近从 0 到 1 搭了一个完整的创业者指导产品，包括路由对话、资产盘点、档案页和报告生成。",
          "我还能把模糊的产品想法拆成页面、组件、接口、数据库表和用户流程，对话产品我会按状态机去设计：用户状态、触发条件、交付物、下一步行动。"
        ],
        ability_proof: [
          "最近一次真实推进，是把资产盘点对话和档案页串起来，让用户完成盘点后可以在个人页看到结构化结果，这件事把产品从概念推进成了可演示闭环。",
          "我还独立完成过一个内部 OKR 管理平台，3 个月覆盖 200+ 员工，也做过技术博客，半年涨粉 5000，单篇最高阅读 8 万。"
        ],
        ability_adoption: [
          "OKR 平台真正被用起来，关键动作是我没有只交一个系统，而是把目标模板、使用流程和每周复盘节奏一起设计进去，让团队知道第一周该怎么上手。",
          "在一树 OPC 这个项目里，拆解能力帮我减少了大量返工，因为我会先把页面、接口、数据和流程状态画清楚，再开始落代码，所以前后端联调比较顺。",
          "如果只说一件我亲手做成它的关键动作，就是我把 OKR 平台从“能填数据”改成“团队知道怎么用”：我亲自设计了目标模板、责任人流程和每周复盘节奏，还拉着一线负责人试跑，边用边改。"
        ],
        resource_core: [
          "资源方面，我已经有一个接近完整的一树 OPC 项目，小程序、后端、数据库、Dify 工作流都能跑。还有 5000 订阅用户的技术博客，留存率 35%。",
          "我手里还有完整的产品文档、架构文档、资产盘点 DSL、提示词模板和测试脚本，这些都可以复用，也可以沉淀成内容吸引同频用户。",
          "更具体一点，我实际长期在调用的资源包括微信开发者工具、本地 NestJS 后端、PostgreSQL 数据库、Dify 工作流和自己的部署脚本，这些让我验证新流程时不需要再从零搭环境。",
          "权限和支持上，我可以直接改产品代码、数据库结构和 workflow 提示词，也有几位懂产品和技术的朋友愿意帮我过方案、看 demo、提反馈，这不是空泛人脉，而是能动用的支持。"
        ],
        resource_conversion: [
          "我最近把博客用户导向产品验证时，会先写一篇拆解文章，把我为什么做这个工具、解决什么痛点、适合谁试用讲清楚，再把感兴趣的人导到试用表单或微信沟通里。",
          "目前转化动作还偏早期，更多是验证谁愿意认真反馈、谁愿意深聊需求，我还没有强推付费，但我能感觉到对方法论和工具链感兴趣的人是同一批。",
          "真实结果痕迹上，已经有人会点进试用表单、加我微信继续聊，也有人会顺着文章留言问什么时候能开放体验，这说明内容到产品的链路是能被激活的。",
          "虽然还没形成正式付款，但我已经能筛出两类更高意向的人：一类愿意连续反馈流程问题，一类会主动追问价格和交付方式，这对下一步做小额验证很关键。"
        ],
        resource_case: [
          "最近一次加我微信继续聊的人，是一位想把个人能力整理成可售服务的独立开发者。他最想解决的问题是：自己做了很多东西，但讲不清哪些真的能卖、该先拿什么去试水。",
          "那位主动追问价格的人原话大概是：如果你不只是给我一份分析，而是能告诉我先验证哪条路、再陪我走一轮，我愿意为这种更具体的方案付费试试看。",
          "我当时的推进动作不是立刻报价，而是先把他的情况收成一份简版盘点，再约一次更聚焦的沟通，确认他最急的是“先卖什么”和“怎么验证第一单”。",
          "他当时反复提到的三项能力是：能独立做产品原型、能写技术内容、也能把复杂问题讲清楚；但他最犹豫先卖哪一项，因为怕单卖技术像外包、卖内容又太虚、卖咨询又不知道别人会不会付费。"
        ],
        cognition_core: [
          "认知上我相信一人公司的核心是资产复用、自动化、低成本验证和持续交付。AI 产品的价值不是简单聊天，而是在关键节点生成报告、计划、判断和下一步行动。",
          "我适合做方法论 + 工具链 + 产品化服务，不适合纯体力型外包。对开发者工具和 B 端 SaaS 冷启动打法，我有比较明确的独立判断。"
        ],
        cognition_tradeoff: [
          "最近一次基于这套判断做取舍，是我把很多看起来很酷但不直接形成闭环的功能砍掉了，优先保留资产盘点、档案页和报告生成这三段核心路径。",
          "我也压缩过泛社区、泛内容分发这类扩张型想法，因为我更想先验证用户会不会为清晰诊断和下一步方案付费。"
        ],
        relationship_core: [
          "关系资产上，我能接触到创业者、产品人、开发者、自由职业者和想做副业的人，可以先找熟人试用产品收集第一批真实反馈。",
          "我有 3 位前同事 CTO，其中一位前老板是潜在天使投资人，另外也有几位潜在合伙人保持月度交流节奏。"
        ],
        relationship_activation: [
          "关系真正能帮上忙的方式，不是泛泛聊天，而是请他们试一次流程、指出哪里不清楚，或者把我介绍给适合做首批测试的人。",
          "我现在更想把关系资产用在两个地方：找种子用户完成真实盘点，以及请更懂销售或 B 端落地的人帮我校准付费路径。",
          "最近一次真靠关系往前挪一步，是我把当前流程 demo 发给一位前同事 CTO，请他按真实用户路径走一遍。他不只给评价，还直接指出哪一步会让用户卡住，这让我当天就改了盘点和报告衔接。",
          "还有一次是一位朋友把我介绍给更适合做首批测试的人，对方不是泛泛聊想法，而是真的愿意走一遍流程、讲清自己卡在哪，这种转介绍比自己冷启动要快很多。"
        ],
        closing: [
          "我觉得四维线索已经比较完整了，如果你还差某个具体点我可以再补，但我也希望这轮能进入正式报告生成。",
          "如果现在结构已经够了，你可以开始生成资产报告，我更想看你最后会怎么判断我的核心资产和下一步。"
        ],
        fallback: [
          "我补一层真实证据：我不是只停留在想法，而是已经把产品、内容、流程和方法论都落成了可以继续验证的资产底座。",
          "我当前最想验证的是，这些能力、资源、认知和关系能不能组合成一个小而清楚的付费闭环。"
        ]
      }
    },
    {
      scenario: "sparse_inventory",
      label: "相对稀疏场景",
      opening: "我想认真盘一轮资产，但我更希望通过追问慢慢梳理清楚，而不是一开始就给一大段总结。",
      answers: {
        alignment_confirm: [
          "这层判断基本是准的，你可以继续往下一维走。后面我更想看你怎么判断我离真实付费还差哪一个动作。",
          "可以继续，这里的描述和我现在的状态大体一致。"
        ],
        ability_core: [
          "我能独立做小程序前端、后端和工作流接入，也能把一个产品从页面到接口再到用户流程一起串起来。",
          "我比较擅长把模糊想法拆成可执行步骤，能先把结构理清，再落代码和交互。"
        ],
        ability_proof: [
          "最近一次真实推进，是把一个创业者指导小程序从只能聊天推进到能输出结构化档案和报告。",
          "我也做过一个 OKR 平台，能证明我不只是会想，还能把东西真的做出来并推起来。"
        ],
        ability_adoption: [
          "OKR 平台能被用起来，是因为我把模板、流程和每周动作一起设计了，不只是扔一个系统给用户。",
          "我这类拆解能力最大的价值，是能减少返工，尤其在前后端联调和状态设计上。",
          "如果只说最关键的一步，就是我亲自把模板、填报动作和复盘节奏串成一个完整使用流程，让大家第一次用时就知道下一步该做什么。"
        ],
        resource_core: [
          "我已经有一个接近可运行的项目底座，也有完整开发环境、数据库、真实 key 和一套文档资料。",
          "我还有一点内容资产和一些能聊业务的人脉，但整体还在早期。",
          "更具体一点，我已经在实际用微信开发者工具、本地后端、数据库和 Dify workflow 做验证，很多改动我当天就能改完再跑一轮。",
          "如果说能立刻调用的支持，我有现成代码底座、可直接迭代的提示词和几位愿意帮我看流程的朋友，这些都算真实资源，不是抽象储备。"
        ],
        resource_conversion: [
          "我尝试过把内容用户导到产品验证，但目前还主要停留在试用和反馈，还没形成明确付费。",
          "资源的优势是我不需要从零开始，问题是还没把它们组织成稳定转化路径。",
          "至少已经有人愿意点进试用入口、加微信聊需求或回我长反馈，这说明资源不是死的，而是能带来真实互动。",
          "现在离付费最近的一步，不是继续搭功能，而是把这些已经互动的人收进一个更明确的验证动作里，比如预约体验或小额试用。"
        ],
        resource_case: [
          "最近一次继续聊的人，是一位想做副业的产品经理。他最想解决的问题很具体：自己经验不少，但不知道该把哪一项能力先包装成别人愿意付费尝试的服务。",
          "对方问得最直接的一句话是：如果我现在只想先试一单，你能不能帮我看清楚我该卖什么、先找谁、怎么开口？",
          "我当时往前推的一步，是先让他把现有经历和想卖的方向发给我，再按资产盘点的方式帮他收窄成一个更可验证的小切口。",
          "他反复提到自己有产品规划、跨团队推进和需求拆解三项能力，但最犹豫先卖哪一项，因为怕规划太虚、推进太像内部岗位经验、拆解又难被别人直接理解成可买服务。"
        ],
        cognition_core: [
          "我很相信先跑通闭环比做大系统重要，也认为 AI 产品应该在关键节点给出判断和行动，不只是聊天。",
          "我不太想做重外包，更想做方法、工具和可复用流程。"
        ],
        cognition_tradeoff: [
          "我最近压缩过一些看起来很热闹的功能，因为它们不直接帮助用户完成资产盘点和后续动作。",
          "我也会主动放弃那些需要大量协作、但短期又不能验证价值的方向。"
        ],
        relationship_core: [
          "我认识一些创业者、产品人和开发者，也有几位前同事愿意交流。",
          "这些关系能帮我拿到第一批反馈，但目前还没有完全转成合作。"
        ],
        relationship_activation: [
          "我更希望先把他们变成真实试用者或转介绍来源，而不是停留在泛泛认识。",
          "如果有一位人脉真的愿意带来一个种子客户，对我现在会非常关键。",
          "最近一次靠关系推进，是我找一位前同事看当前流程，他直接帮我指出哪个环节会让人听不懂，这种反馈比我自己猜快很多。",
          "如果朋友愿意把我介绍给一个真正想验证副业或产品方向的人，那就是我现在最有价值的关系激活动作。"
        ],
        closing: [
          "我感觉这轮已经把关键资产摸出来了，如果还差最后一个证据点我可以补，但也可以准备收口。",
          "你可以根据现有信息判断我是不是已经具备做出第一笔付费验证的基础。"
        ],
        fallback: [
          "我目前最大的差口不是有没有资产，而是这些资产离真实付费还有多远。",
          "如果你继续问，我更希望你帮我把“会做”和“能卖”之间的差距挖出来。",
          "我不是完全没东西可卖，而是不确定应该先拿哪一个最小切口去试。",
          "如果你要我更具体，我现在最缺的不是继续搭功能，而是把现有能力收成一个别人愿意先试一次的东西。",
          "我能感觉到自己有交付能力，但还说不清别人最先愿意为什么付钱。",
          "与其继续泛泛问优势，我更想知道：我现在离第一笔小额验证还差哪一个动作。",
          "如果要补一个更实在的点，就是我手里已经有能演示、能修改、能继续迭代的底座，只是还没把它翻译成明确的售卖入口。",
          "我现在的卡点很像：会做产品，也能讲方法，但还没把这两件事合成一个清楚的服务承诺。",
          "如果继续追问，我更希望你帮我判断我该先卖诊断、卖陪跑，还是卖更轻的试用版本。",
          "我不想一直停在“能力很多”这层，我更想知道哪一项能力最适合先变成第一笔验证。",
          "真要补一句的话，我现在不是缺资源，而是缺一个更窄、更敢拿出去收钱的入口。"
        ]
      }
    },
    {
      scenario: "rich_inventory",
      label: "信息较完整场景",
      opening: "我想做一轮高质量资产盘点，你可以按真实案例、资源、判断和关系一路往下问，我会尽量给到足够细的事实。",
      answers: {
        alignment_confirm: [
          "整体判断是准的，你继续往下问就行。如果要补一句，我最有价值的不是单点技术，而是把判断、产品和交付串成闭环。",
          "这层我认同，可以推进下一维。后面如果你要收口，我更希望你把商业化短板也一起点出来。"
        ],
        ability_core: [
          "我的能力不是单点技术，而是能把产品设计、交互、前端、后端、数据库和 Dify 工作流接成一个完整闭环。最近我从 0 到 1 做了创业者指导小程序，把路由对话、资产盘点、档案页和报告生成都串起来了。",
          "我还擅长把抽象需求拆成状态机和交付流程，例如把用户状态、触发条件、输出物和下一步动作都结构化，不靠灵感拍脑袋推进。"
        ],
        ability_proof: [
          "最近一次真实推进，是我把资产盘点从“只能聊”改成“聊完就能沉淀结构化档案并生成报告”，这让产品第一次具备了闭环演示价值。",
          "再早一点我还独立做过一个内部 OKR 平台，3 个月覆盖 200+ 员工；技术博客半年涨粉 5000，单篇阅读最高 8 万，这些都能证明我不是只会做 demo。"
        ],
        ability_adoption: [
          "OKR 平台真正落起来，关键不是代码，而是我设计了模板、填报流程、复盘节奏和负责人动作，让用户第一次使用时就知道下一步该做什么。",
          "在当前项目里，拆解能力直接减少了返工：我会先画清页面、接口、状态和数据，再开始实现，所以很多流程能一次打通。",
          "如果要压成一个最关键动作，就是我亲自把 OKR 平台的模板、填报路径、复盘节奏和负责人动作一并设计出来，再拉着团队试跑，边用边调。"
        ],
        resource_core: [
          "资源上，我已经有完整项目底座、微信开发者工具、本地后端、PostgreSQL、Dify 工作流和真实 API key，不需要从零搭环境。",
          "我还有产品文档、架构文档、资产盘点 DSL、提示词模板和测试脚本，这些不仅能复用，也可以包装成内容或服务交付的一部分。",
          "再具体一点，我有直接改 workflow、改数据库、改页面和重跑整条链路的权限，这让我能很快把反馈变成新版本，而不是等别人排期。",
          "支持层面上，也有几位懂产品、懂技术、懂创业的人愿意看 demo、提问题、帮我校准方向，这些关系能转成很具体的外部视角和首批试用支持。"
        ],
        resource_conversion: [
          "我最近导流时，会先用内容解释我为什么做这个工具、解决什么问题、适合谁，再把感兴趣的人导到试用、沟通或反馈动作里，而不是一上来就硬推。",
          "转化上我还处在验证阶段，但我已经能判断出哪些人愿意给认真反馈、哪些人对方法论和工具链有付费潜力。",
          "真实结果上，已经有人顺着内容过来加我、问体验方式、愿意详细讲自己的卡点，这说明内容到沟通再到验证的动作链已经开始转起来。",
          "虽然还没正式收款，但我已经看到一批高意向人群会主动追问价格、交付方式和适合谁用，这让我更能判断后续的小额验证入口该怎么设计。"
        ],
        resource_case: [
          "最近一次从内容过来继续聊的人，是一位准备做一人公司尝试的开发者。他最想解决的问题是：自己能力很多，但不知道该把哪条线先收成一个别人愿意付费验证的小产品。",
          "对方主动追问价格和交付方式时，原话接近：如果你能不是只给我聊天建议，而是帮我判断该先打哪一单、怎么验证，我愿意为这种更落地的陪跑付费。",
          "我当时的推进动作，是先让他把经历、目标用户和想卖的方向发给我，再根据资产盘点结果约一次更聚焦的讨论，看能不能先跑一个小额验证。",
          "他当时讲得最清楚的三项能力是：能独立做产品、能写能传播、能把复杂问题拆成清晰路径；但他最犹豫先卖哪一项，因为怕卖开发像接外包、卖内容像知识付费、卖判断又担心别人觉得太抽象。"
        ],
        cognition_core: [
          "认知上我很明确：一人公司的关键不是拼时间，而是把能力资产化、流程自动化、交付标准化。AI 产品真正有价值的地方，是在关键节点给出诊断、判断和下一步动作，而不是只陪聊。",
          "我也有比较清楚的取向：更适合做方法论 + 工具链 + 产品化服务，不适合做纯体力外包；对开发者工具和 B 端 SaaS 冷启动，我更关注低成本验证而不是大而全。"
        ],
        cognition_tradeoff: [
          "最近一次典型取舍，是我砍掉了很多看上去更热闹的分发和社区功能，先把资产盘点、结构化沉淀和报告生成打通，因为这三件事更接近真实价值闭环。",
          "我也放弃了过早做复杂平台化的冲动，先验证用户愿不愿意为清晰判断和落地建议买单，再决定要不要扩成更大系统。"
        ],
        relationship_core: [
          "关系上，我能接触到创业者、产品人、开发者、自由职业者和想做副业的人，也有几位前同事 CTO 和潜在合伙人保持交流。",
          "其中一位前老板是潜在天使投资人，另外几位关系更适合帮我做首批试用、问题校准和转介绍。"
        ],
        relationship_activation: [
          "关系能真正变成资产，关键是把交流变成动作：让他们试一次、介绍一个更合适的人，或者一起讨论一个明确业务问题，而不是停留在泛泛聊天。",
          "如果我现在要激活关系，我会优先约 3 个种子用户完成一次真实盘点，再找懂销售或企业落地的人帮我补上商业化短板。",
          "最近一次真靠关系推进，是我把 demo 和流程发给一位前同事 CTO，他不仅给了反馈，还明确指出哪一步对真实用户最容易卡壳，这让我很快修了关键环节。",
          "另一类更有效的关系动作，是让朋友把我介绍给更接近目标用户的人，对方愿意带着自己的真实问题来走流程，这比泛泛交换意见更像真实资产。"
        ],
        closing: [
          "我觉得四维事实已经相当充分了，如果还有一个关键证据点你可以继续追问；如果够了，也可以开始给我一份真正有判断力的资产报告。",
          "我不需要温和安慰，更想看你是否能指出我最值得放大的资产、最该纠偏的误判，以及第一步商业化动作。"
        ],
        fallback: [
          "如果你需要再补一层，我可以继续给更具体的动作和案例，但我希望最后的报告不要只是复述，而是真正帮我做判断。",
          "我现在最在意的是：这些资产是否已经能支撑一个小而清楚的付费验证路径。"
        ]
      }
    }
  ];
}

function log(line) {
  const ts = new Date().toISOString().slice(11, 19);
  // eslint-disable-next-line no-console
  console.log(`[${ts}] ${line}`);
}

async function request(method, urlPath, options = {}) {
  return axios({
    method,
    url: `${baseURL}${urlPath}`,
    timeout: options.timeout || 30000,
    validateStatus: () => true,
    ...options
  });
}

function assertOk(label, res, expected = [200, 201]) {
  if (!expected.includes(res.status)) {
    throw new Error(`${label} failed: HTTP ${res.status} ${JSON.stringify(res.data).slice(0, 500)}`);
  }
  return res;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickAnswerKey(aiMessage) {
  const source = String(aiMessage || "");
  const rule = QUESTION_PATTERNS.find((item) => item.patterns.some((pattern) => pattern.test(source)));
  return rule ? rule.key : "fallback";
}

function pickScenarioAnswer(scenario, aiMessage, usedCounts, turn) {
  let key = pickAnswerKey(aiMessage);
  if (
    key === "fallback" &&
    /(明确结果|结果是什么|推进出了什么|用户侧|你自己这边|拿到.*结果)/.test(String(aiMessage || ""))
  ) {
    key = "ability_adoption";
  } else if (
    key === "fallback" &&
    /(付费迹象|差一点付费|付出具体行动|真的让用户|最近一次.*付费|怎么引导)/.test(String(aiMessage || ""))
  ) {
    key = "resource_conversion";
  } else if (
    key === "fallback" &&
    /(亲自推动|真实发生过的事|具体动作是什么|拿到明确结果的事|最近 3 个月|真实片段|亲手做成|具体动作和结果|你亲手负责|哪一步是你亲手做的)/.test(
      String(aiMessage || "")
    )
  ) {
    key = "ability_proof";
  } else if (
    key === "ability_proof" &&
    /(最关键一步|亲手做成它的那一步|亲手动作|只补一个具体事实|只说一个|关键动作|具体动作|最小切口|那一步具体是什么)/.test(
      String(aiMessage || "")
    )
  ) {
    key = "ability_adoption";
  }
  const pool = Array.isArray(scenario.answers[key]) ? scenario.answers[key] : scenario.answers.fallback;
  const index = usedCounts[key] || 0;
  usedCounts[key] = index + 1;
  if (pool[index]) {
    return { key, text: pool[index] };
  }

  if (pool.length > 0 && key !== "fallback") {
    return { key, text: pool[pool.length - 1] };
  }

  if (turn >= minTurns && Array.isArray(scenario.answers.closing) && scenario.answers.closing.length) {
    const closingIndex = usedCounts.closing || 0;
    usedCounts.closing = closingIndex + 1;
    return {
      key: "closing",
      text: scenario.answers.closing[Math.min(closingIndex, scenario.answers.closing.length - 1)]
    };
  }

  const fallbackIndex = usedCounts.fallback || 0;
  usedCounts.fallback = fallbackIndex + 1;
  const fallbackPool = Array.isArray(scenario.answers.fallback) ? scenario.answers.fallback : [];
  return {
    key: "fallback",
    text: fallbackPool.length
      ? fallbackPool[fallbackIndex % fallbackPool.length]
      : ""
  };
}

function flattenScenarioFacts(scenario) {
  const sections = [
    "ability_core",
    "ability_proof",
    "ability_adoption",
    "resource_core",
    "resource_conversion",
    "resource_case",
    "cognition_core",
    "cognition_tradeoff",
    "relationship_core",
    "relationship_activation",
    "closing",
    "fallback"
  ];
  return sections.flatMap((key) =>
    Array.isArray(scenario.answers[key]) ? scenario.answers[key].map((item) => `- ${item}`) : []
  );
}

function buildUserSimulationPrompt({ scenario, transcript, aiMessage, turn }) {
  const scenarioStyle = {
    balanced_inventory: "信息中等完整，愿意配合，但不会一次性说太满。",
    sparse_inventory: "信息偏稀疏，经常先说卡点、意图或模糊判断，需要追问后才逐步给事实。",
    rich_inventory: "信息较完整，愿意给具体事实、例子、原话和细节。"
  };
  const factBank = flattenScenarioFacts(scenario).join("\n");
  const recentTranscript = transcript
    .slice(-8)
    .map((entry) => `${entry.role === "user" ? "用户" : "AI"}: ${String(entry.text || "").trim()}`)
    .join("\n");

  return [
    "你在模拟资产盘点流程里的“用户”。",
    `当前场景：${scenario.label}（${scenario.scenario}）`,
    `说话风格：${scenarioStyle[scenario.scenario] || "自然回答，尽量像真实用户。"} `,
    "",
    "你的目标：",
    "1. 只用用户口吻回答 AI 当前这一问，不要扮演 AI。",
    "2. 优先基于已知事实回答，保持前后自洽。",
    "3. 如果 AI 问得太泛，你可以先给半结构化、半模糊的自然回答，但不要完全逃避。",
    "4. 回答控制在 1 到 3 句，尽量短，不要写标题、列表、解释你在模拟。",
    "5. 不要输出 JSON、不要输出角色标签、不要复述系统规则。",
    "6. 如果问题超出已知事实，可以做最小幅度的合理补充，但要贴近场景，不要突然编出夸张经历。",
    "",
    "已知用户事实库：",
    factBank || "- 暂无",
    "",
    "最近对话：",
    recentTranscript || "暂无历史对话",
    "",
    `当前是第 ${turn} 轮，AI 刚刚问：`,
    aiMessage || "",
    "",
    "现在直接输出“用户下一句回复”正文。"
  ].join("\n");
}

async function generateUserAnswerWithZhipu({ scenario, transcript, aiMessage, turn }) {
  if (!zhipuApiKey) {
    throw new Error("ZHIPU_API_KEY is not configured for SMOKE_USER_MODE=llm");
  }

  const url = `${zhipuBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  const prompt = buildUserSimulationPrompt({ scenario, transcript, aiMessage, turn });
  const response = await axios.post(
    url,
    {
      model: userLlmModel,
      temperature: userLlmTemperature,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: "你只负责模拟用户侧回复。输出自然中文短句，不要输出 JSON，不要输出角色标签。"
        },
        {
          role: "user",
          content: prompt
        }
      ]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${zhipuApiKey}`
      },
      timeout: userLlmTimeoutMs
    }
  );

  const data = response.data || {};
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const content = String(choice?.message?.content || "").trim();
  if (!content) {
    throw new Error("simulated user LLM returned empty content");
  }

  return content
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function resolveUserAnswer({ scenario, aiMessage, usedCounts, turn, transcript }) {
  if (turn === 1) {
    return { key: "opening", text: scenario.opening, routeAction: "asset_radar", source: "scripted_opening" };
  }

  if (userMode === "llm") {
    try {
      if (userLlmProvider !== "zhipu") {
        throw new Error(`unsupported simulated user provider: ${userLlmProvider}`);
      }
      const text = await generateUserAnswerWithZhipu({ scenario, transcript, aiMessage, turn });
      return { key: "llm_user", text, routeAction: "", source: `llm:${userLlmProvider}:${userLlmModel}` };
    } catch (error) {
      const fallback = pickScenarioAnswer(scenario, aiMessage, usedCounts, turn);
      return {
        ...fallback,
        source: "script_fallback_after_llm_error",
        llmError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    ...pickScenarioAnswer(scenario, aiMessage, usedCounts, turn),
    source: "script"
  };
}

function pushStatus(statusTimeline, source, status, extra = {}) {
  const normalized = {
    source,
    at: new Date().toISOString(),
    reportStatus: String(status.reportStatus || "").trim().toLowerCase() || "idle",
    inventoryStage: String(status.inventoryStage || "").trim(),
    reportVersion: String(status.reportVersion || "").trim(),
    lastError: String(status.lastError || "").trim()
  };
  statusTimeline.push({
    ...normalized,
    ...extra
  });
  return normalized;
}

function summarizeStatusTimeline(statusTimeline) {
  return statusTimeline.map((item) => ({
    source: item.source,
    turn: item.turn || null,
    reportStatus: item.reportStatus,
    inventoryStage: item.inventoryStage,
    at: item.at
  }));
}

async function loginFreshUser(scenarioKey) {
  const res = await request("POST", "/auth/wechat-login", {
    data: { simulateFreshUser: true, nickname: `e2e_${scenarioKey}_${Date.now()}` }
  });
  assertOk("login", res);
  const payload = res.data && typeof res.data === "object" ? res.data : {};
  const accessToken = String(payload.accessToken || "").trim();
  const user = payload.user && typeof payload.user === "object" ? payload.user : {};
  if (!accessToken) {
    throw new Error("login: no accessToken");
  }
  return { accessToken, userId: String(user.id || "").trim() };
}

async function createSession(headers, scenarioKey) {
  const res = await request("POST", "/router/sessions", {
    headers,
    data: { source: `e2e_asset_report_${scenarioKey}`, forceNew: true }
  });
  assertOk("create session", res);
  const payload = res.data && typeof res.data === "object" ? res.data : {};
  const sessionId = String(payload.conversationStateId || payload.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("session: no sessionId");
  }
  return sessionId;
}

async function startStream(sessionId, headers, text, routeAction) {
  const inputPayload = {
    inputType: routeAction ? "system_event" : "text",
    text,
    ...(routeAction ? { routeAction } : {})
  };

  const res = await request("POST", `/router/sessions/${sessionId}/stream/start`, {
    headers,
    data: { input: inputPayload },
    timeout: streamTimeoutMs
  });
  assertOk("stream start", res);

  const payload = res.data && typeof res.data === "object" ? res.data : {};
  const streamId = String(payload.streamId || "").trim();
  if (!streamId) {
    throw new Error("stream start: no streamId");
  }

  return {
    streamId,
    initialAssetReportStatus: String(payload.assetReportStatus || "").trim().toLowerCase(),
    routeMode: String(payload.routeMode || "").trim(),
    chatflowId: String(payload.chatflowId || "").trim(),
    agentKey: String(payload.agentKey || "").trim()
  };
}

async function pollStream(streamId, headers) {
  const deadline = Date.now() + streamTimeoutMs;
  const allEvents = [];

  while (Date.now() < deadline) {
    const res = await request("GET", `/router/streams/${streamId}`, { headers });
    assertOk("stream poll", res);
    const chunk = Array.isArray(res.data) ? res.data : [];
    if (chunk.length) {
      allEvents.push(...chunk);
      if (chunk.some((event) => event && (event.type === "done" || event.type === "error"))) {
        break;
      }
    }
    await sleep(800);
  }

  const content = allEvents
    .filter((event) => event && event.type === "token")
    .map((event) => String(event.token || ""))
    .join("");
  const hasError = allEvents.some((event) => event && event.type === "error");

  return { content, events: allEvents, hasError };
}

async function sendAndReceive(sessionId, headers, text, routeAction) {
  const startPayload = await startStream(sessionId, headers, text, routeAction);
  const stream = await pollStream(startPayload.streamId, headers);
  return {
    ...startPayload,
    ...stream
  };
}

async function fetchReportStatus(sessionId, headers) {
  const res = await request("GET", `/router/sessions/${sessionId}/asset-report/status`, { headers });
  assertOk("report status", res);
  return res.data && typeof res.data === "object" ? res.data : {};
}

async function fetchProfile(headers) {
  const res = await request("GET", "/profile", { headers });
  assertOk("profile", res, [200]);
  return res.data && typeof res.data === "object" ? res.data : {};
}

async function runScenario(scenario) {
  const statusTimeline = [];
  const transcript = [];
  const usedCounts = {};
  const failures = [];
  let pendingTurn = null;
  let readyAt = 0;

  log(`\n=== 场景: ${scenario.label} (${scenario.scenario}) ===`);
  const health = await request("GET", "/health");
  assertOk("health check", health, [200]);

  const { accessToken, userId } = await loginFreshUser(scenario.scenario);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const sessionId = await createSession(headers, scenario.scenario);
  const scenarioStartedAt = Date.now();

  log(`userId=${userId}, sessionId=${sessionId}`);

  let lastAiText = "";
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const answer = await resolveUserAnswer({
      scenario,
      aiMessage: lastAiText,
      usedCounts,
      turn,
      transcript
    });

    log(`\n--- 第 ${turn} 轮 (${answer.key}) ---`);
    log(`用户: ${answer.text.slice(0, 100)}...`);
    if (answer.llmError) {
      log(`用户模拟回退: ${answer.llmError}`);
    }
    const streamResult = await sendAndReceive(sessionId, headers, answer.text, answer.routeAction || "");
    const aiText = String(streamResult.content || "").trim();
    lastAiText = aiText;
    log(`AI: ${aiText.slice(0, 120)}...`);

    transcript.push({
      turn,
      role: "user",
      category: answer.key,
      text: answer.text,
      routeAction: answer.routeAction || "",
      source: answer.source || ""
    });
    transcript.push({
      turn,
      role: "ai",
      text: aiText,
      routeMode: streamResult.routeMode,
      chatflowId: streamResult.chatflowId,
      agentKey: streamResult.agentKey
    });

    const status = await fetchReportStatus(sessionId, headers);
    const normalizedStatus = pushStatus(statusTimeline, "turn_status", status, { turn });
    if (normalizedStatus.reportStatus === "pending" && pendingTurn === null) {
      pendingTurn = turn;
    }
    if (normalizedStatus.reportStatus === "failed") {
      failures.push(`failed_during_turn_${turn}:${normalizedStatus.lastError || "unknown"}`);
      break;
    }
    if (normalizedStatus.reportStatus === "ready") {
      readyAt = Date.now();
      failures.push(`ready_without_pending_at_turn_${turn}`);
      break;
    }
    if (streamResult.hasError) {
      failures.push(`stream_error_turn_${turn}`);
      break;
    }
    if (pendingTurn !== null) {
      break;
    }
  }

  if (pendingTurn === null && failures.length === 0) {
    failures.push(`did_not_enter_pending_within_${maxTurns}_turns`);
  }
  if (pendingTurn !== null && pendingTurn < minTurns) {
    failures.push(`pending_too_early_${pendingTurn}`);
  }
  if (pendingTurn !== null && pendingTurn > maxTurns) {
    failures.push(`pending_too_late_${pendingTurn}`);
  }

  let finalStatus = statusTimeline[statusTimeline.length - 1] || null;
  if (pendingTurn !== null && failures.length === 0) {
    log("轮询等待报告 ready...");
    const deadline = Date.now() + reportTimeoutMs;
    while (Date.now() < deadline) {
      const status = await fetchReportStatus(sessionId, headers);
      finalStatus = pushStatus(statusTimeline, "wait_ready", status);
      if (finalStatus.reportStatus === "ready") {
        readyAt = Date.now();
        break;
      }
      if (finalStatus.reportStatus === "failed") {
        failures.push(`failed_after_pending:${finalStatus.lastError || "unknown"}`);
        break;
      }
      await sleep(3000);
    }
    if ((!finalStatus || finalStatus.reportStatus !== "ready") && failures.length === 0) {
      failures.push("ready_timeout");
    }
  }

  const profile = await fetchProfile(headers);
  const assetReport = profile.assetReport && typeof profile.assetReport === "object" ? profile.assetReport : {};
  const finalReport = String(assetReport.finalReport || "").trim();
  const reportBrief = String(assetReport.reportBrief || "").trim();
  const generatedAt = String(assetReport.generatedAt || "").trim();
  const assetReportSections = Array.isArray(assetReport.sections)
    ? assetReport.sections.map((section) => ({
        title: String(section && section.title ? section.title : "").trim(),
        lines: Array.isArray(section && section.lines)
          ? section.lines.map((line) => String(line || ""))
          : []
      }))
    : [];
  const reportSummary = summarizeReport(finalReport);
  const reportVersion = String(assetReport.reportVersion || finalStatus?.reportVersion || "").trim();
  const hasReport = !!assetReport.hasReport;

  if (!hasReport) {
    failures.push("profile_has_no_asset_report");
  }
  if (reportVersion !== "1") {
    failures.push(`unexpected_report_version_${reportVersion || "empty"}`);
  }
  if (reportSummary.sanitizedLength < minReportChars) {
    failures.push(`report_too_short_${reportSummary.sanitizedLength}`);
  }
  if (!reportSummary.coverage.ok) {
    failures.push(`missing_sections_${reportSummary.coverage.missing.join("_")}`);
  }
  if (reportSummary.emptySections.length > 0) {
    failures.push(`empty_sections_${reportSummary.emptySections.join("_")}`);
  }
  if (reportSummary.hasResidualThinkTag) {
    failures.push("profile_report_contains_think");
  }

  const readyLatencyMs = readyAt && scenarioStartedAt ? readyAt - scenarioStartedAt : 0;
  const result = {
    scenario: scenario.scenario,
    label: scenario.label,
    user_id: userId,
    session_id: sessionId,
    turn_count: transcript.filter((entry) => entry.role === "user").length,
    pending_turn: pendingTurn,
    ready_latency_ms: readyLatencyMs,
    report_length_chars: reportSummary.sanitizedLength,
    report_version: reportVersion,
    section_titles: reportSummary.sectionTitles,
    status_timeline: summarizeStatusTimeline(statusTimeline),
    profile_has_report: hasReport,
    asset_report: {
      has_report: hasReport,
      report_brief: reportBrief,
      final_report: finalReport,
      generated_at: generatedAt,
      report_version: reportVersion,
      is_review: !!assetReport.isReview,
      sections: assetReportSections
    },
    pass: failures.length === 0,
    failure_reason: failures.join(", "),
    transcript
  };

  if (result.turn_count < minTurns) {
    failures.push(`turn_count_too_low_${result.turn_count}`);
  }
  if (result.turn_count > maxTurns) {
    failures.push(`turn_count_too_high_${result.turn_count}`);
  }
  result.pass = failures.length === 0;
  result.failure_reason = failures.join(", ");

  if (result.pass) {
    log(`[PASS] ${scenario.label} — turns=${result.turn_count}, pending=${String(pendingTurn)}, readyLatency=${readyLatencyMs}ms, reportLength=${reportSummary.sanitizedLength}`);
  } else {
    log(`[FAIL] ${scenario.label} — ${result.failure_reason}`);
  }
  return result;
}

function writeMarkdownReport(results) {
  const lines = [
    "# Asset Report E2E Auto Test Report",
    "",
    `- Generated At: ${new Date().toISOString()}`,
    `- Base URL: \`${baseURL}\``,
    `- User Mode: \`${userMode}\``,
    `- User LLM Provider: \`${userLlmProvider}\``,
    `- User LLM Model: \`${userLlmModel}\``,
    `- Min Turns: \`${minTurns}\``,
    `- Max Turns: \`${maxTurns}\``,
    `- Min Report Length: \`${minReportChars}\` chars`,
    `- Scenarios: ${results.length}`,
    ""
  ];

  results.forEach((result) => {
    lines.push(`## ${result.label}`);
    lines.push(`- Scenario: \`${result.scenario}\``);
    lines.push(`- User ID: \`${result.user_id}\``);
    lines.push(`- Session ID: \`${result.session_id}\``);
    lines.push(`- Pass: \`${result.pass}\``);
    lines.push(`- Turn Count: \`${result.turn_count}\``);
    lines.push(`- Pending Turn: \`${result.pending_turn}\``);
    lines.push(`- Ready Latency: \`${result.ready_latency_ms}ms\``);
    lines.push(`- Report Length: \`${result.report_length_chars}\` chars`);
    lines.push(`- Report Version: \`${result.report_version}\``);
    lines.push(`- Failure Reason: \`${result.failure_reason || "n/a"}\``);
    lines.push("");
    lines.push("### Section Titles");
    lines.push("");
    result.section_titles.forEach((title) => {
      lines.push(`- ${title}`);
    });
    lines.push("");
    lines.push("### Status Timeline");
    lines.push("");
    result.status_timeline.forEach((item) => {
      lines.push(`- ${item.at} | ${item.source} | turn=${item.turn || "n/a"} | ${item.reportStatus} | ${item.inventoryStage || "-"}`);
    });
    lines.push("");
    lines.push("### Transcript");
    lines.push("");
    result.transcript.forEach((entry) => {
      const prefix = entry.role === "user" ? "**用户**" : "**AI**";
      const category = entry.category ? ` [${entry.category}]` : "";
      const routeAction = entry.routeAction ? ` (routeAction: ${entry.routeAction})` : "";
      const source = entry.source ? ` (source: ${entry.source})` : "";
      lines.push(`#### 第 ${entry.turn} 轮${category}${routeAction}${source}`);
      lines.push(`${prefix}:`);
      lines.push("");
      lines.push(String(entry.text || ""));
      lines.push("");
    });
    lines.push("");
    lines.push("### Final Asset Report");
    lines.push("");
    if (result.asset_report.report_brief) {
      lines.push("#### Report Brief");
      lines.push("");
      lines.push(result.asset_report.report_brief);
      lines.push("");
      lines.push("");
    }
    lines.push("#### Final Report");
    lines.push("");
    if (result.asset_report.final_report) {
      lines.push(result.asset_report.final_report);
    } else {
      lines.push("_No final report captured._");
    }
    lines.push("---");
    lines.push("");
  });

  fs.mkdirSync(path.dirname(markdownReportPath), { recursive: true });
  fs.writeFileSync(markdownReportPath, lines.join("\n"), "utf8");
}

async function main() {
  log("=== 资产报告多轮对话 E2E 回归 ===");
  log(`后端地址: ${baseURL}`);
  log(`用户模拟模式: ${userMode}${userMode === "llm" ? ` (${userLlmProvider}/${userLlmModel})` : ""}`);
  log(`轮次阈值: ${minTurns}-${maxTurns}`);
  log(`最小报告字数: ${minReportChars}`);

  const scenarios = buildScenarioSet();
  const selectedScenarios = scenarioFilter.length
    ? scenarios.filter((scenario) => scenarioFilter.includes(scenario.scenario))
    : scenarios;
  const results = [];
  let overallPass = true;

  for (const scenario of selectedScenarios) {
    try {
      const result = await runScenario(scenario);
      results.push(result);
      if (!result.pass) {
        overallPass = false;
      }
    } catch (error) {
      overallPass = false;
      const message = error instanceof Error ? error.message : String(error);
      log(`[FAIL] ${message}`);
      const partial = results.find((item) => item.scenario === scenario.scenario);
      if (!partial) {
        results.push({
          scenario: scenario.scenario,
          label: scenario.label,
          user_id: "",
          session_id: "",
          turn_count: 0,
          pending_turn: null,
          ready_latency_ms: 0,
          report_length_chars: 0,
          report_version: "",
          section_titles: [],
          status_timeline: [],
          profile_has_report: false,
          asset_report: {
            has_report: false,
            report_brief: "",
            final_report: "",
            generated_at: "",
            report_version: "",
            is_review: false,
            sections: []
          },
          pass: false,
          failure_reason: message,
          transcript: []
        });
      }
    }
  }

  writeMarkdownReport(results);
  writeJsonReport(jsonReportPath, {
    generatedAt: new Date().toISOString(),
    baseUrl: baseURL,
    userMode,
    userLlmProvider,
    userLlmModel,
    minTurns,
    maxTurns,
    minReportChars,
    scenarioFilter,
    pass: overallPass && results.every((item) => item.pass),
    scenarios: results.map((item) => ({
      scenario: item.scenario,
      label: item.label,
      user_id: item.user_id,
      session_id: item.session_id,
      turn_count: item.turn_count,
      pending_turn: item.pending_turn,
      ready_latency_ms: item.ready_latency_ms,
      report_length_chars: item.report_length_chars,
      report_version: item.report_version,
      section_titles: item.section_titles,
      status_timeline: item.status_timeline,
      asset_report: item.asset_report,
      transcript: item.transcript,
      pass: item.pass,
      failure_reason: item.failure_reason
    }))
  });

  log(`[REPORT] ${markdownReportPath}`);
  log(`[REPORT] ${jsonReportPath}`);

  if (!overallPass || results.some((item) => !item.pass)) {
    process.exitCode = 1;
    return;
  }

  log("[PASS] 所有场景通过");
}

main().catch((error) => {
  log(`\n[FAIL] ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
