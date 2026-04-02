const { getProjectDetail, fetchProjectDetail } = require("../../services/project.service");
const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");

function withMessageMeta(messages = []) {
  return messages.map((message) => {
    if (message.sender !== "agent") {
      return message;
    }

    const agentMeta = getAgentMeta(message.agentKey);
    return {
      ...message,
      bubbleColor: agentMeta.bubbleBorder
    };
  });
}

Page({
  data: {
    loading: true,
    error: false,
    activeTab: "conversation",
    navMetrics: getNavMetrics(),
    headerStyle: "",
    project: {
      conversation: [],
      artifacts: [],
      conversationReplies: []
    },
    localConversation: []
  },

  onLoad(options) {
    this.projectId = options.id || "media-service";
    this.syncLayout();
    this.loadProjectDetail();
  },

  onShow() {
    this.syncLayout();
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 12}px;`
    });
  },

  loadProjectDetail() {
    this.setData({
      loading: true,
      error: false
    });

    fetchProjectDetail(this.projectId)
      .then((project) => {
        const safeProject = project || getProjectDetail(this.projectId);
        this.setData({
          loading: false,
          error: false,
          project: safeProject,
          localConversation: withMessageMeta(safeProject.conversation || [])
        });
      })
      .catch(() => {
        const project = getProjectDetail(this.projectId);
        this.setData({
          loading: false,
          error: true,
          project,
          localConversation: withMessageMeta(project.conversation || [])
        });
      });
  },

  handleRetry() {
    this.loadProjectDetail();
  },

  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: "/pages/conversation/conversation"
        });
      }
    });
  },

  switchTab(event) {
    this.setData({
      activeTab: event.currentTarget.dataset.tab
    });
  },

  handleQuickReplyTap(event) {
    const text = event.currentTarget.dataset.text;
    const nextMessages = this.data.localConversation.concat([
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text
      },
      {
        id: `agent-${Date.now() + 1}`,
        sender: "agent",
        text: "\u6536\u5230\uff0c\u6211\u5df2\u7ecf\u628a\u8fd9\u6761\u53cd\u9988\u8bb0\u8fdb\u9879\u76ee\u8fdb\u5ea6\uff0c\u4e0b\u4e00\u6b65\u6211\u4f1a\u7ed9\u4f60\u5177\u4f53\u6267\u884c\u8bdd\u672f\u3002",
        bubbleColor: getAgentMeta("execution").bubbleBorder
      }
    ]);

    this.setData({
      localConversation: nextMessages
    });
  },

  handleResultCta(event) {
    const { item } = event.detail || {};
    const cta = item && item.cta ? item.cta : null;

    if (!cta || !cta.scene) {
      return;
    }

    const target = this.data.project.id || "";
    const payload = {
      scene: cta.scene,
      target,
      userText: cta.userText || ""
    };

    const opener = this.getOpenerEventChannel ? this.getOpenerEventChannel() : null;
    if (opener && opener.emit) {
      opener.emit("projectResultCta", payload);
      wx.navigateBack();
      return;
    }

    const userText = encodeURIComponent(payload.userText);
    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=${payload.scene}&target=${target}&userText=${userText}`
    });
  },

  handleSend(event) {
    const value = event.detail && event.detail.value ? String(event.detail.value).trim() : "";
    if (!value) {
      return;
    }

    const nextMessages = this.data.localConversation.concat([
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text: value
      },
      {
        id: `agent-${Date.now() + 1}`,
        sender: "agent",
        text: "\u6211\u8bb0\u4e0b\u4e86\uff0c\u8fd9\u6bb5\u6211\u4f1a\u5e2e\u4f60\u6c89\u6dc0\u6210\u53ef\u590d\u7528\u7684\u6210\u679c\u5361\u7247\u3002",
        bubbleColor: getAgentMeta("execution").bubbleBorder
      }
    ]);

    this.setData({
      localConversation: nextMessages
    });
  }
});
