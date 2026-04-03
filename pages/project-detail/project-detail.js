const { fetchProjectDetail, sendProjectMessage } = require("../../services/project.service");
const {
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
} = require("../../services/result.service");
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

function formatResultDetail(result = {}) {
  const lines = [];

  if (result.summary) {
    lines.push(result.summary);
  }

  if (Array.isArray(result.body) && result.body.length) {
    lines.push(...result.body);
  }

  if (Array.isArray(result.scores) && result.scores.length) {
    lines.push(...result.scores.map((score) => `${score.label}：${score.value || score.percent || ""}`));
  }

  if (Array.isArray(result.tiers) && result.tiers.length) {
    lines.push(...result.tiers.map((tier) => `${tier.label}：${tier.price}`));
  }

  if (result.meta) {
    lines.push(result.meta);
  }

  if (!lines.length) {
    return "这张成果卡已同步，但当前没有更多详情字段。";
  }

  return lines.join("\n").slice(0, 900);
}

function buildPendingConversation(messages = [], userText = "") {
  const seed = Date.now();
  return messages.concat([
    {
      id: `project-user-${seed}`,
      sender: "user",
      text: userText
    },
    {
      id: `project-agent-${seed + 1}`,
      sender: "agent",
      text: "一树正在思考中...",
      agentKey: "execution"
    }
  ]);
}

Page({
  data: {
    loading: true,
    error: false,
    sending: false,
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
        const safeProject = project || {
          conversation: [],
          artifacts: [],
          conversationReplies: []
        };
        this.setData({
          loading: false,
          error: false,
          project: safeProject,
          localConversation: withMessageMeta(safeProject.conversation || [])
        });

        this.loadProjectResults(true);
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          project: this.data.project,
          localConversation: withMessageMeta(this.data.project.conversation || [])
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
    const activeTab = event.currentTarget.dataset.tab;

    this.setData({
      activeTab
    });

    if (activeTab === "results") {
      this.loadProjectResults(true);
    }
  },

  loadProjectResults(silent = false) {
    fetchProjectResults(this.projectId)
      .then((artifacts) => {
        this.setData({
          project: {
            ...this.data.project,
            artifacts: Array.isArray(artifacts) ? artifacts : []
          }
        });
      })
      .catch(() => {
        if (!silent) {
          wx.showToast({
            title: "项目成果同步失败",
            icon: "none"
          });
        }
      });
  },

  handleQuickReplyTap(event) {
    const text = String(event.currentTarget.dataset.text || "").trim();
    if (!text) {
      return;
    }

    this.submitProjectMessage(text);
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

  async handleResultDetail(event) {
    const item = event && event.detail ? event.detail.item : null;
    if (!item || !item.id) {
      return;
    }

    try {
      const detail = await fetchResultDetail(item.id);
      wx.showModal({
        title: detail.title || item.title || "成果详情",
        content: formatResultDetail(detail || item),
        showCancel: false
      });
    } catch (_error) {
      wx.showToast({
        title: "成果详情获取失败",
        icon: "none"
      });
    }
  },

  async handleResultShare(event) {
    const item = event && event.detail ? event.detail.item : null;
    if (!item || !item.id) {
      return;
    }

    try {
      await shareResultCard({
        resultId: item.id,
        title: item.title,
        resultTitle: item.title
      });

      const title = encodeURIComponent(item.title || "");
      wx.navigateTo({
        url: `/pages/share-preview/share-preview?resultId=${item.id}&title=${title}`
      });
    } catch (_error) {
      wx.showToast({
        title: "成果分享初始化失败",
        icon: "none"
      });
    }
  },

  handleSend(event) {
    const value = event.detail && event.detail.value ? String(event.detail.value).trim() : "";
    if (!value) {
      return;
    }
    this.submitProjectMessage(value);
  },

  async submitProjectMessage(value) {
    const text = String(value || "").trim();
    if (!text) {
      return;
    }

    if (this.data.sending) {
      wx.showToast({
        title: "正在回复中，请稍等",
        icon: "none"
      });
      return;
    }

    const optimisticConversation = withMessageMeta(buildPendingConversation(this.data.localConversation, text));
    this.setData({
      sending: true,
      localConversation: optimisticConversation
    });

    try {
      const result = await sendProjectMessage(this.projectId, {
        message: text
      });

      const nextConversation = withMessageMeta(Array.isArray(result && result.conversation) ? result.conversation : []);
      const nextReplies = Array.isArray(result && result.conversationReplies)
        ? result.conversationReplies
        : this.data.project.conversationReplies;

      this.setData({
        sending: false,
        project: {
          ...this.data.project,
          conversation: Array.isArray(result && result.conversation) ? result.conversation : this.data.project.conversation,
          conversationReplies: nextReplies
        },
        localConversation: nextConversation
      });
    } catch (error) {
      const failedConversation = optimisticConversation.slice(0, -1).concat([withMessageMeta([{
        id: `project-error-${Date.now()}`,
        sender: "agent",
        text: String((error && error.message) || "项目对话发送失败，请稍后重试"),
        agentKey: "execution"
      }])[0]]);

      this.setData({
        sending: false,
        localConversation: failedConversation
      });
    }
  }
});
