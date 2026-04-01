function normalizeText(input) {
  return String(input || "").trim();
}

function resolveAgentByText(text, fallback = "master") {
  const source = normalizeText(text);

  if (!source) {
    return fallback;
  }

  if (/(税|财务|园区|注册|合规|报税|账户|利润|分配)/.test(source)) {
    return "steward";
  }

  if (/(卡住|拖延|焦虑|害怕|不敢|迷茫|没动力)/.test(source)) {
    return "mindset";
  }

  if (/(小红书|抖音|公众号|定位|内容|IP|流量)/i.test(source)) {
    return "asset";
  }

  if (/(客户|成交|报价|转化|跟进|销售|搞钱|定价)/.test(source)) {
    return "execution";
  }

  return fallback;
}

function getReplyByAgent(agentKey, text) {
  const source = normalizeText(text);

  switch (agentKey) {
    case "asset":
      return {
        text: `我先帮你把这句话拆成可持续输出的方向：${source}。先定一个平台和一个人群，我们再落到第一条内容。`,
        quickReplies: [
          { label: "先做小红书", action: "ip_rednote" },
          { label: "先写定位句", action: "ip_multi" }
        ]
      };
    case "execution":
      return {
        text: `收到。围绕“${source}”，我建议直接做一个今天可执行的动作：先触达 5 个潜在客户，再记录结果我们继续优化话术。`,
        quickReplies: [
          { label: "好，给我话术", action: "write_followup" },
          { label: "我先自己来", action: "self_handle" }
        ]
      };
    case "mindset":
      return {
        text: `我听见你的卡点了：${source}。我们不做大计划，只做一个 15 分钟就能完成的动作，先把状态拉起来。`,
        quickReplies: [
          { label: "好，给我一个动作", action: "social_primary" },
          { label: "先聊聊我的顾虑", action: "social_blocker" }
        ]
      };
    case "steward":
      return {
        text: `这类问题适合走“管家模式”：${source}。我会先帮你做一页简化体检，再给你一个可执行的合规/财税建议。`,
        quickReplies: [
          { label: "查看月度体检", action: "go_home" },
          { label: "看看公司面板", action: "open_projects" }
        ]
      };
    default:
      return {
        text: `收到：${source}。我先帮你把问题定清楚，再选最合适的角色继续推进。你更想先解决方向、成交，还是执行节奏？`,
        quickReplies: [
          { label: "先看方向", action: "route_explore" },
          { label: "先拿结果", action: "route_scale" }
        ]
      };
  }
}

module.exports = {
  resolveAgentByText,
  getReplyByAgent
};
