const projects = [
  {
    id: "media-service",
    name: "\u81ea\u5a92\u4f53\u5199\u4f5c\u670d\u52a1",
    phase: "\u673a\u4f1a\u9a8c\u8bc1\u4e2d",
    status: "2 \u5f85\u529e",
    statusTone: "alert",
    color: "#10A37F"
  },
  {
    id: "hangzhou-park",
    name: "\u56ed\u533a\u5165\u9a7b-\u676d\u5dde",
    phase: "\u8d44\u6599\u51c6\u5907\u4e2d",
    status: "\u8fdb\u884c\u4e2d",
    statusTone: "muted",
    color: "#378ADD"
  },
  {
    id: "ai-consulting",
    name: "AI\u54a8\u8be2\u526f\u4e1a",
    phase: "\u8d44\u4ea7\u76d8\u70b9\u4e2d",
    status: "\u63a2\u7d22\u4e2d",
    statusTone: "muted",
    color: "#534AB7"
  }
];

const projectDetails = {
  "media-service": {
    id: "media-service",
    name: "\u81ea\u5a92\u4f53\u5199\u4f5c\u670d\u52a1",
    agentLabel: "\u4e00\u6811\u00b7\u641e\u94b1",
    conversation: [
      {
        id: "pc-1",
        sender: "agent",
        text: "\u6211\u4eec\u7ee7\u7eed\u804a\u81ea\u5a92\u4f53\u5199\u4f5c\u670d\u52a1\u3002\u4e0a\u6b21\u4f60\u8bf4\u76ee\u6807\u5ba2\u6237\u662f\u4e2d\u5c0f\u4f01\u4e1a\u4e3b\uff0c\u6211\u4eec\u6765\u9a8c\u8bc1\u4e00\u4e0b\u8fd9\u4e2a\u65b9\u5411\u3002",
        agentKey: "execution"
      },
      {
        id: "pc-2",
        sender: "agent",
        text: "\u4f60\u4e0a\u5468\u89e6\u8fbe\u4e86 5 \u4e2a\u6f5c\u5728\u5ba2\u6237\uff0c\u7ed3\u679c\u600e\u4e48\u6837\uff1f",
        agentKey: "execution"
      }
    ],
    conversationReplies: [
      "\u67092\u4e2a\u611f\u5174\u8da3",
      "\u90fd\u6ca1\u56de\u5e94",
      "\u804a\u4e86\u4f46\u6ca1\u6210\u4ea4"
    ],
    artifacts: [
      {
        id: "pa-1",
        type: "structure",
        title: "\u4ea7\u54c1\u7ed3\u6784",
        body: [
          "\u76ee\u6807\u5ba2\u6237\uff1a\u4e2d\u5c0f\u4f01\u4e1a\u4e3b",
          "\u6838\u5fc3\u95ee\u9898\uff1a\u4e0d\u4f1a\u5199\u83b7\u5ba2\u5185\u5bb9",
          "\u670d\u52a1\uff1a\u4ee3\u5199+\u5185\u5bb9\u7b56\u7565",
          "\u5468\u671f\uff1a\u6309\u6708\u4ea4\u4ed8"
        ],
        meta: "3\u670829\u65e5\u751f\u6210 \u00b7 \u4e00\u6811\u00b7\u641e\u94b1",
        cta: {
          label: "\u8ddf\u4e00\u6811\u00b7\u641e\u94b1\u7ee7\u7eed\u6253\u78e8",
          scene: "project_execution_followup",
          userText: "\u5e2e\u6211\u628a\u4ea7\u54c1\u7ed3\u6784\u8f6c\u6210\u8bdd\u672f"
        }
      },
      {
        id: "pa-2",
        type: "pricing",
        title: "\u4e09\u5c42\u5b9a\u4ef7",
        tiers: [
          { label: "\u5165\u95e8", price: "999", active: false },
          { label: "\u6838\u5fc3", price: "2999", active: true },
          { label: "\u9ad8\u7aef", price: "6999", active: false }
        ],
        meta: "3\u670830\u65e5\u751f\u6210 \u00b7 \u4e00\u6811\u00b7\u641e\u94b1",
        cta: {
          label: "\u8ba9\u4e00\u6811\u5e2e\u6211\u6a21\u62df\u62a5\u4ef7",
          scene: "project_execution_followup",
          userText: "\u5e2e\u6211\u5199\u4e00\u6bb5 2999 \u7684\u62a5\u4ef7\u8bdd\u672f"
        }
      },
      {
        id: "pa-3",
        type: "score",
        title: "\u673a\u4f1a\u8bc4\u5206",
        scores: [
          { label: "\u75db\u70b9", value: 4.0, percent: 80, warn: false },
          { label: "\u9891\u7387", value: 4.5, percent: 90, warn: false },
          { label: "\u652f\u4ed8", value: 3.5, percent: 70, warn: false },
          { label: "\u7ade\u4e89", value: 2.5, percent: 50, warn: true },
          { label: "\u5339\u914d", value: 4.5, percent: 90, warn: false }
        ],
        summary: "\u603b\u5206 19/25 \u00b7 GO",
        meta: "3\u670828\u65e5\u751f\u6210 \u00b7 \u4e00\u6811\u00b7\u6316\u5b9d",
        cta: {
          label: "\u56de\u804a\u5929\u7ee7\u7eed\u9a8c\u8bc1",
          scene: "project_asset_followup",
          userText: "\u6211\u60f3\u5148\u628a\u7ade\u4e89\u9879\u7684\u98ce\u9669\u518d\u62c6\u4e00\u4e0b"
        }
      }
    ]
  },
  "hangzhou-park": {
    id: "hangzhou-park",
    name: "\u56ed\u533a\u5165\u9a7b-\u676d\u5dde",
    agentLabel: "\u4e00\u6811\u00b7\u7ba1\u5bb6",
    conversation: [
      {
        id: "hp-1",
        sender: "agent",
        text: "\u56ed\u533a\u5165\u9a7b\u8d44\u6599\u5df2\u7ecf\u5728\u5ba1\u6838\u4e2d\uff0c\u4eca\u5929\u6211\u4eec\u5148\u8865\u4e00\u9879\u7ecf\u8425\u573a\u666f\u8bf4\u660e\u3002",
        agentKey: "steward"
      }
    ],
    conversationReplies: [
      "\u597d\uff0c\u6211\u73b0\u5728\u8865",
      "\u4f60\u7ed9\u6211\u4e00\u4e2a\u6a21\u677f"
    ],
    artifacts: []
  },
  "ai-consulting": {
    id: "ai-consulting",
    name: "AI\u54a8\u8be2\u526f\u4e1a",
    agentLabel: "\u4e00\u6811\u00b7\u6316\u5b9d",
    conversation: [
      {
        id: "ai-1",
        sender: "agent",
        text: "\u5148\u628a\u4f60\u6700\u80fd\u6253\u52a8\u5ba2\u6237\u7684 1 \u4e2a\u6848\u4f8b\u8bb2\u6e05\u695a\uff0c\u6211\u6765\u5e2e\u4f60\u63d0\u70bc\u6210\u6807\u51c6\u53d9\u4e8b\u3002",
        agentKey: "asset"
      }
    ],
    conversationReplies: [
      "\u5148\u76d8\u8d44\u4ea7",
      "\u5148\u505a\u5b9a\u4f4d"
    ],
    artifacts: []
  }
};

module.exports = {
  projects,
  projectDetails
};
