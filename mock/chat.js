const conversations = {
  onboarding: {
    agentKey: "master",
    messages: [
      {
        id: "onboarding-1",
        sender: "agent",
        text: "\u563f\uff0c\u6211\u662f\u4e00\u6811\u3002\u5728\u5f00\u59cb\u4e4b\u524d\uff0c\u5148\u8ba9\u6211\u8ba4\u8bc6\u4e00\u4e0b\u4f60\u3002"
      },
      {
        id: "onboarding-2",
        sender: "login",
        title: "\u5fae\u4fe1\u4e00\u952e\u767b\u5f55",
        description: "\u767b\u5f55\u5361\u7247\u4f1a\u76f4\u63a5\u5d4c\u5728\u5bf9\u8bdd\u6d41\u91cc\uff0c\u4e0d\u6253\u65ad\u9996\u6b21\u8fdb\u5165\u3002"
      },
      {
        id: "onboarding-3",
        sender: "agent",
        text: "\u767b\u5f55\u4e4b\u540e\uff0c\u6211\u4f1a\u7ee7\u7eed\u786e\u8ba4\u4f60\u7684\u79f0\u547c\uff0c\u518d\u6309\u4f60\u5f53\u524d\u72b6\u6001\u5206\u5230\u4e0d\u540c\u8def\u5f84\u3002"
      }
    ],
    quickReplies: ["\u5c31\u53eb\u5c0f\u660e", "\u53eb\u6211\u522b\u7684\u540d\u5b57", "\u5148\u770b\u770b\u56ed\u533a\u673a\u4f1a"]
  },
  home: {
    agentKey: "master",
    messages: [
      {
        id: "home-1",
        sender: "agent",
        text: "\u65e9\u4e0a\u597d\u5c0f\u660e\uff0c\u4eca\u5929\u5148\u6293\u6700\u5173\u952e\u7684\u4e09\u4ef6\u4e8b\u3002"
      },
      {
        id: "home-2",
        sender: "task",
        title: "\u4eca\u65e5\u4efb\u52a1",
        items: [
          { label: "\u89e6\u8fbe 5 \u4e2a\u6f5c\u5728\u5ba2\u6237", tag: "\u81ea\u5a92\u4f53\u9879\u76ee" },
          { label: "\u53d1\u4e00\u6761\u5c0f\u7ea2\u4e66", tag: "IP \u6760\u6746" },
          { label: "\u8ddf\u8fdb\u6628\u5929\u7684\u610f\u5411\u5ba2\u6237", tag: "\u9879\u76ee\u590d\u76d8" }
        ]
      },
      {
        id: "home-3",
        sender: "agent",
        text: "\u5982\u679c\u4f60\u613f\u610f\uff0c\u6211\u4e5f\u53ef\u4ee5\u987a\u624b\u628a\u7b2c\u4e00\u6761\u89e6\u8fbe\u6d88\u606f\u5199\u597d\u3002"
      }
    ],
    quickReplies: ["\u597d\uff0c\u5e2e\u6211\u5199", "\u6211\u5148\u81ea\u5df1\u6765", "\u5148\u770b\u9879\u76ee"]
  },
  aiAssistant: {
    agentKey: "execution",
    messages: [
      {
        id: "ai-1",
        sender: "agent",
        text: "AI\u6760\u6746\u7684\u6838\u5fc3\u662f\uff1a\u8ba9 AI \u5e2e\u4f60\u505a\u91cd\u590d\u7684\u4e8b\uff0c\u4f60\u53ea\u505a\u9700\u8981\u5224\u65ad\u529b\u7684\u4e8b\u3002\u8bf4\u8bf4\u4f60\u5e73\u65f6\u6700\u8017\u65f6\u7684\u73af\u8282\u662f\u4ec0\u4e48\uff1f"
      },
      {
        id: "ai-2",
        sender: "user",
        text: "\u56de\u590d\u5ba2\u6237\u6d88\u606f"
      },
      {
        id: "ai-3",
        sender: "agent",
        text: "\u8fd9\u4e2a\u573a\u666f\u5f88\u9002\u5408\u81ea\u52a8\u5316\u3002\u6211\u53ef\u4ee5\u5148\u5e2e\u4f60\u642d\u4e00\u4e2a\u201c\u6d88\u606f\u5206\u7c7b + \u8349\u7a3f\u56de\u590d\u201d\u7684\u5bf9\u8bdd\u5de5\u4f5c\u6d41\u3002"
      }
    ],
    quickReplies: ["\u5fae\u4fe1", "\u90ae\u4ef6", "\u591a\u4e2a\u6e20\u9053\u90fd\u6709"]
  },
  ipAssistant: {
    agentKey: "asset",
    messages: [
      {
        id: "ip-1",
        sender: "agent",
        text: "IP\u6760\u6746\u7684\u6838\u5fc3\u662f\u6301\u7eed\u8f93\u51fa\u4f60\u7684\u72ec\u7279\u8ba4\u77e5\uff0c\u8ba9\u4e00\u4e07\u4eba\u8ba4\u8bc6\u4f60\u3002\u4f60\u6700\u60f3\u5148\u5728\u54ea\u4e2a\u5e73\u53f0\u505a\uff1f"
      },
      {
        id: "ip-2",
        sender: "user",
        text: "\u5c0f\u7ea2\u4e66"
      },
      {
        id: "ip-3",
        sender: "artifact",
        title: "\u5c0f\u7ea2\u4e66\u6587\u6848 #1",
        description: "\u300c\u8001\u677f\u62cd\u8111\u888b\u51b3\u7b56\u7684\u65f6\u4ee3\u8fc7\u53bb\u4e86\u300d\n\u4e0a\u5468\u5e2e\u4e00\u5bb6\u5976\u8336\u5e97\u770b\u4e86\u4e0b\u5916\u5356\u6570\u636e\uff0c\u53d1\u73b0 70% \u7684\u5dee\u8bc4\u96c6\u4e2d\u5728\u5468\u4e09..."
      }
    ],
    quickReplies: ["\u5c0f\u7ea2\u4e66", "\u6296\u97f3", "\u516c\u4f17\u53f7", "\u591a\u5e73\u53f0\u90fd\u60f3\u505a"]
  }
};

module.exports = {
  conversations
};
