import { randomUUID } from "node:crypto";
import type { RouterSkillDefinition } from "./router.skills";

export const SKILL_SESSION_DONE_MARKER = "[SKILL_DONE]";

export type RouterSkillInvocation = {
  invocationId: string;
  skillKey: string;
  skillTitle: string;
  routeAction: string;
  executionMode: RouterSkillDefinition["executionMode"];
  executor: RouterSkillDefinition["executor"];
  status: "running" | "completed" | "cancelled";
  startedAt: string;
  updatedAt: string;
};

export function createSkillInvocation(skill: RouterSkillDefinition): RouterSkillInvocation {
  const now = new Date().toISOString();
  return {
    invocationId: `skill-inv-${randomUUID()}`,
    skillKey: skill.key,
    skillTitle: skill.title,
    routeAction: skill.routeAction,
    executionMode: skill.executionMode,
    executor: skill.executor,
    status: "running",
    startedAt: now,
    updatedAt: now
  };
}

export function cleanSkillSessionAnswer(value: string) {
  return String(value || "")
    .replace(/<skill_result\b[^>]*>[\s\S]*?<\/skill_result>/gi, "")
    .replace(/\[SKILL_DONE\]/gi, "")
    .trim();
}

export function isSkillSessionDone(value: string) {
  return String(value || "").includes(SKILL_SESSION_DONE_MARKER);
}

export function buildSkillInvocationMethodologyBlock(input: {
  invocation: RouterSkillInvocation;
  skill: RouterSkillDefinition;
  latestUserText: string;
}) {
  const userText = String(input.latestUserText || "").trim();
  return [
    "[Skill Invocation]",
    `invocation_id: ${input.invocation.invocationId}`,
    `skill_key: ${input.skill.key}`,
    `skill_title: ${input.skill.title}`,
    `route_action: ${input.skill.routeAction}`,
    `execution_mode: ${input.skill.executionMode}`,
    `executor: ${input.skill.executor}`,
    `input_hint: ${input.skill.inputHint}`,
    `methodology: ${input.skill.methodology}`,
    userText ? `latest_user_text: ${userText}` : "",
    "instruction: 这是一次 one-turn current-router Skill 调用。不要切换页面、不要切换会话、不要提及 Dify/API Key/workflow/internal config。只在当前这一轮应用该 Skill 的方法论；信息不足时先追问；回答结束后默认回到普通当前对话。"
  ]
    .filter(Boolean)
    .join("\n");
}

export function appendSkillInvocationMethodology(input: {
  memoryBlock: string;
  invocation: RouterSkillInvocation;
  skill: RouterSkillDefinition;
  latestUserText: string;
}) {
  return [
    String(input.memoryBlock || "").trim(),
    buildSkillInvocationMethodologyBlock({
      invocation: input.invocation,
      skill: input.skill,
      latestUserText: input.latestUserText
    })
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildSkillAwareSpecialFlowQuery(userText: string, memoryBlock: string) {
  const text = String(userText || "").trim() || "[empty]";
  const skillMemory = String(memoryBlock || "").trim();
  if (!skillMemory || !skillMemory.includes("[Skill Invocation]")) {
    return text;
  }

  return [
    skillMemory,
    `User: ${text}`
  ].join("\n\n");
}

export function buildSkillFallbackReply(skill: RouterSkillDefinition, latestUserText: string) {
  const userText = String(latestUserText || "").trim();
  const quoted = userText ? `你刚才说的是：「${userText}」。` : "我先帮你把这个能力开起来。";

  if (skill.key === "brand_voice") {
    return [
      "好，我们先抓你的文风。",
      quoted,
      "请直接贴 3-5 段你以前写过的文字，可以是朋友圈、小红书、聊天开场白、工作总结或日记片段。",
      "我会帮你提炼：语气、常用词、句式节奏、禁用表达，以及适合发朋友圈/小红书/触达客户的改写模板。"
    ].join("\n\n");
  }

  if (skill.key === "offer_positioning") {
    return [
      "好，我们开始做产品定位。",
      quoted,
      "现在先不要停在“我能提供什么”，要把它翻译成“谁为什么愿意买”。请你补 4 个信息：",
      "1. 你主要想卖给哪一类人？",
      "2. 他们在什么场景下会需要这个产品或服务？",
      "3. 你解决的是省时间、增收入、降风险、提效率、变轻松，还是别的痛点？",
      "4. 你能稳定交付的形式是什么：单品、套餐、团购、订阅、定制，还是渠道供货？"
    ].join("\n\n");
  }

  if (skill.key === "customer_persona") {
    return [
      "好，我们先收敛第一批客户。",
      quoted,
      "不要先写“所有人都能买”。请你补充：谁最容易先买、他们通常在哪出现、一次愿意花多少钱、现在用什么替代方案、为什么会换成你。",
      "我会帮你筛出第一批最该触达的人，并列出不该优先卖的人。"
    ].join("\n\n");
  }

  if (skill.key === "pricing_page") {
    return [
      "好，我们来做定价文案。",
      quoted,
      "请补充你的成本区间、交付内容、单次/周期服务边界，以及你希望客户选择的主推档位。",
      "我会帮你整理三层定价、每档适合谁、包含什么、不包含什么，以及报价时怎么说更容易成交。"
    ].join("\n\n");
  }

  if (skill.key === "partnership_outreach") {
    return [
      "好，我们来写触达话术。",
      quoted,
      "请告诉我你要联系谁：潜在客户、渠道方、园区、熟人、企业行政，还是合作伙伴。",
      "再补一句你的目标：约聊、试吃、报价、进群、铺货、团购或复购跟进。我会给你一版短、具体、低压力的开口。"
    ].join("\n\n");
  }

  if (skill.key === "landing_page_copy") {
    return [
      "好，我们把它整理成能发出去的介绍页文案。",
      quoted,
      "请补充：卖给谁、核心卖点、交付内容、价格或购买方式、有没有案例/资质/用户反馈。",
      "我会按标题、痛点、结果、服务内容、证据和行动入口来写。"
    ].join("\n\n");
  }

  if (skill.key === "market_research") {
    return [
      "好，我们做市场调研，但先不编数据。",
      quoted,
      "请贴你已有的材料、竞品链接/截图、用户反馈，或者明确告诉我你的假设。",
      "材料不足时，我会先帮你列验证清单，而不是直接下市场结论。"
    ].join("\n\n");
  }

  if (skill.key === "survey_question") {
    return [
      "好，我们来设计用户访谈问题。",
      quoted,
      "请告诉我你想验证的方向，以及你准备访谈的人是谁。",
      "我会给你 5-8 个 Mom Test 风格问题，重点问过去行为、替代方案、付费记录和真实损失，避免问“你愿不愿意买”。"
    ].join("\n\n");
  }

  return [
    `好，我们开始使用「${skill.title}」。`,
    quoted,
    "请继续补充目标、对象、场景和你已经有的材料，我会按这个能力帮你往下拆。"
  ].join("\n\n");
}
