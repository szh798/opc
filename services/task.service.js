const { get, post } = require("./request");
const { requestData } = require("./service-utils");

const dailyTaskFallback = {
  title: "\u4eca\u65e5\u4efb\u52a1",
  items: [
    {
      id: "task-1",
      label: "\u89e6\u8fbe5\u4e2a\u6f5c\u5728\u5ba2\u6237",
      tag: "\u81ea\u5a92\u4f53\u9879\u76ee"
    },
    {
      id: "task-2",
      label: "\u53d1\u4e00\u6761\u5c0f\u7ea2\u4e66",
      tag: "IP\u6760\u6746"
    },
    {
      id: "task-3",
      label: "\u8ddf\u8fdb\u6628\u5929\u7684\u610f\u5411\u5ba2\u6237",
      tag: "\u81ea\u5a92\u4f53\u9879\u76ee"
    }
  ]
};

function buildFeedbackMessages() {
  return [
    {
      id: "feedback-1",
      type: "status_chip",
      label: "\u89e6\u8fbe5\u4e2a\u6f5c\u5728\u5ba2\u6237",
      status: "done"
    },
    {
      id: "feedback-2",
      type: "agent",
      text: "5 \u4e2a\u5ba2\u6237\u90fd\u89e6\u8fbe\u4e86\uff0c\u4e0d\u9519\u3002\u7ed3\u679c\u600e\u4e48\u6837\uff1f\u4f60\u60f3\u804a\u804a\u5417\uff1f"
    }
  ];
}

function getFeedbackReplies() {
  return [
    {
      label: "\u597d\uff0c\u5e2e\u6211\u5199",
      action: "write_followup"
    },
    {
      label: "\u6211\u81ea\u5df1\u6765",
      action: "self_handle"
    }
  ];
}

function buildFeedbackPrompt(taskLabel) {
  const label = String(taskLabel || "\u8fd9\u9879\u4efb\u52a1");
  return `${label}\u5df2\u5b8c\u6210\uff0c\u4e0d\u9519\u3002\u7ed3\u679c\u600e\u4e48\u6837\uff1f\u4f60\u60f3\u804a\u804a\u5417\uff1f`;
}

function buildFeedbackAdvice(userText, taskLabel) {
  const text = String(userText || "").trim();
  const label = String(taskLabel || "\u4efb\u52a1");

  if (!text) {
    return `\u5148\u4ece${label}\u91cc\u6311\u4e00\u4e2a\u6700\u6709\u5e0c\u671b\u7684\u7ebf\u7d22\uff0c\u6211\u4eec\u628a\u4ed6\u53d8\u6210\u4eca\u5929\u7684\u552f\u4e00\u4f18\u5148\u7ea7\u3002`;
  }

  if (/(\u95ee\u4e86\u4ef7\u683c|\u8c08\u4ef7|\u8d35|\u9884\u7b97|\u8003\u8651)/.test(text)) {
    return "\u8fd9\u7c7b\u56de\u590d\u901a\u5e38\u4e0d\u662f\u62d2\u7edd\uff0c\u800c\u662f\u98ce\u9669\u62c5\u5fc3\u3002\u4f60\u53ef\u4ee5\u5148\u7ed9\u4ed6\u4e00\u4e2a\u5c0f\u8303\u56f4\u8bd5\u8fd0\u884c\u65b9\u6848\uff0c\u628a\u51b3\u7b56\u6210\u672c\u964d\u5230\u6700\u4f4e\uff0c\u8f6c\u5316\u7387\u4f1a\u66f4\u9ad8\u3002";
  }

  if (/(\u6ca1\u56de\u590d|\u6ca1\u56de\u5e94|\u5df2\u8bfb\u4e0d\u56de|\u77f3\u6c89\u5927\u6d77|\u4e0d\u7406)/.test(text)) {
    return "\u8fd9\u79cd\u60c5\u51b5\u5148\u4e0d\u8981\u8ffd\u957f\u6d88\u606f\u3002\u5efa\u8bae 24 \u5c0f\u65f6\u540e\u53d1\u4e00\u6761\u201c\u4f60\u662f\u66f4\u503e\u5411 A \u8fd8\u662f B\uff1f\u6211\u53ef\u4ee5\u6309\u4f60\u65b9\u5411\u51c6\u5907\u201d\u7684\u4e8c\u9009\u4e00\u8ddf\u8fdb\u3002";
  }

  if (/(\u611f\u5174\u8da3|\u610f\u5411|\u613f\u610f|\u60f3\u4e86\u89e3)/.test(text)) {
    return "\u8fd9\u662f\u9ad8\u8d28\u91cf\u4fe1\u53f7\u3002\u4e0b\u4e00\u6b65\u522b\u8bb2\u5168\u5957\uff0c\u53ea\u805a\u7126\u4e00\u4e2a\u7ed3\u679c\u573a\u666f\uff0c\u76f4\u63a5\u7ea6 15 \u5206\u949f\u5feb\u901f\u6f14\u793a\u6216\u7b54\u7591\uff0c\u6210\u4ea4\u6982\u7387\u4f1a\u66f4\u7a33\u3002";
  }

  if (/(\u62d2\u7edd|\u4e0d\u9700\u8981|\u6ca1\u9700\u6c42|\u7b97\u4e86)/.test(text)) {
    return "\u8fd9\u6761\u5148\u6536\u53e3\uff0c\u4e0d\u8981\u786c\u63a8\u3002\u4f46\u8bb0\u4e0b\u4ed6\u62d2\u7edd\u7684\u5173\u952e\u8bcd\uff0c\u4e0b\u6b21\u5f00\u573a\u5148\u56de\u5e94\u8fd9\u4e2a\u987e\u8651\uff0c\u4f60\u7684\u5bf9\u8bdd\u8d28\u91cf\u4f1a\u5347\u4e00\u6863\u3002";
  }

  return "\u8fd9\u6b21\u53cd\u9988\u5f88\u6709\u4ef7\u503c\u3002\u6211\u5efa\u8bae\u4f60\u9a6c\u4e0a\u505a\u4e00\u4ef6\u4e8b\uff1a\u628a\u5bf9\u65b9\u7684\u5173\u952e\u987e\u8651\u590d\u8ff0\u4e00\u53e5\uff0c\u518d\u7ed9\u4e00\u4e2a\u53ef\u6267\u884c\u7684\u4e0b\u4e00\u6b65\u9009\u9879\uff0c\u8ba9\u5bf9\u65b9\u66f4\u5bb9\u6613\u70b9\u5934\u3002";
}

async function fetchDailyTasks() {
  return requestData(
    () => get("/tasks/daily"),
    "获取今日任务失败"
  );
}

async function completeTask(taskId, payload = {}) {
  if (!taskId) {
    return { success: false };
  }

  return requestData(
    () => post(`/tasks/${taskId}/complete`, payload),
    "提交任务完成状态失败"
  );
}

async function fetchTaskFeedback(payload = {}) {
  return requestData(
    () => post("/tasks/feedback", payload),
    "获取任务反馈失败"
  );
}

module.exports = {
  buildFeedbackMessages,
  getFeedbackReplies,
  buildFeedbackPrompt,
  buildFeedbackAdvice,
  fetchDailyTasks,
  completeTask,
  fetchTaskFeedback
};
