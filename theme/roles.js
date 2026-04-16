const agents = {
  master: {
    key: "master",
    label: "\u4e00\u6811\u00b7OPC",
    shortLabel: "\u4e00\u6811",
    color: "#0D0D0D",
    chipBackground: "#F3F1EC",
    bubbleBorder: "#D8D2C7"
  },
  asset: {
    key: "asset",
    label: "\u4e00\u6811\u00b7\u6316\u5b9d",
    shortLabel: "\u6316\u5b9d",
    color: "#534AB7",
    chipBackground: "#F0ECFF",
    bubbleBorder: "#6A5BE7"
  },
  execution: {
    key: "execution",
    label: "\u4e00\u6811\u00b7\u641e\u94b1",
    shortLabel: "\u641e\u94b1",
    color: "#10A37F",
    chipBackground: "#E9F8F3",
    bubbleBorder: "#10A37F"
  },
  mindset: {
    key: "mindset",
    label: "\u4e00\u6811\u00b7\u624e\u5fc3",
    shortLabel: "\u624e\u5fc3",
    color: "#E24B4A",
    chipBackground: "#FDEDEC",
    bubbleBorder: "#EF4444"
  },
  steward: {
    key: "steward",
    label: "\u4e00\u6811\u00b7\u7ba1\u5bb6",
    shortLabel: "\u7ba1\u5bb6",
    color: "#378ADD",
    chipBackground: "#EBF4FF",
    bubbleBorder: "#378ADD"
  }
};

function getAgentMeta(agentKey) {
  return agents[agentKey] || agents.master;
}

module.exports = {
  agents,
  getAgentMeta
};
