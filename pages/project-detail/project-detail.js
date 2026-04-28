const { fetchProjectDetail, sendProjectMessage } = require("../../services/project.service");
const {
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
} = require("../../services/result.service");
const { requestProjectFollowupSubscription } = require("../../services/subscription.service");
const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");
const { ensureLoggedIn } = require("../../utils/auth-guard");

const PROJECT_SCENE_ROUTE_ACTION_MAP = {
  project_execution_followup: "project_execution_followup",
  project_asset_followup: "project_asset_followup",
  company_park_followup: "company_park_followup",
  company_tax_followup: "company_tax_followup",
  company_profit_followup: "company_profit_followup",
  company_payroll_followup: "company_payroll_followup"
};

const OPPORTUNITY_STAGE_LABELS = {
  capturing: "捕捉机会",
  structuring: "结构化梳理",
  scoring: "机会评分中",
  comparing: "机会比较中",
  validating: "验证推进中"
};

const DECISION_STATUS_LABELS = {
  none: "待判断",
  candidate: "候选中",
  selected: "已选中",
  parked: "已搁置",
  rejected: "已否掉"
};

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

function formatOpportunitySummary(summary = null) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const scoreObject =
    summary.opportunityScore && typeof summary.opportunityScore === "object"
      ? summary.opportunityScore
      : null;
  const totalScore = scoreObject ? Number(scoreObject.totalScore || 0) : 0;

  return {
    ...summary,
    opportunityStageLabel: OPPORTUNITY_STAGE_LABELS[summary.opportunityStage] || "待识别",
    decisionStatusLabel: DECISION_STATUS_LABELS[summary.decisionStatus] || "待判断",
    scoreText: totalScore > 0 ? `${totalScore}/100` : "待评分"
  };
}

function decorateProject(project = {}) {
  const source = project && typeof project === "object" ? project : {};
  return {
    ...source,
    opportunitySummary: formatOpportunitySummary(source.opportunitySummary || null)
  };
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
    if (!ensureLoggedIn()) {
      return;
    }

    this.projectId = options.id || "media-service";
    this.syncLayout();
    this.loadProjectDetail();
  },

  onShow() {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    if (this.projectId) {
      this.loadProjectDetail({
        silent: true
      });
    }
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 12}px;`
    });
  },

  loadProjectDetail(options = {}) {
    if (!options.silent) {
      this.setData({
        loading: true,
        error: false
      });
    }

    fetchProjectDetail(this.projectId)
      .then((project) => {
        const safeProject = decorateProject(project || {
          conversation: [],
          artifacts: [],
          conversationReplies: []
        });
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
      userText: cta.userText || "",
      routeAction: PROJECT_SCENE_ROUTE_ACTION_MAP[cta.scene] || ""
    };

    const opener = this.getOpenerEventChannel ? this.getOpenerEventChannel() : null;
    if (opener && opener.emit) {
      opener.emit("projectResultCta", payload);
      wx.navigateBack();
      return;
    }

    const userText = encodeURIComponent(payload.userText);
    const routeAction = encodeURIComponent(payload.routeAction || "");
    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=${payload.scene}&target=${target}&userText=${userText}&routeAction=${routeAction}`
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

  async handleProjectFollowupSubscribe(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const projectId = dataset.projectId || this.projectId || "";
    try {
      const result = await requestProjectFollowupSubscription({
        projectId
      });
      if (result && result.success) {
        wx.showToast({
          title: "已开启跟进提醒",
          icon: "success"
        });
        return;
      }

      const reason = String((result && result.reason) || "");
      wx.showToast({
        title: reason === "missing_template_id"
          ? "请先配置提醒模板"
          : reason === "unsupported"
            ? "当前微信版本不支持订阅"
            : "未开启提醒",
        icon: "none"
      });
    } catch (error) {
      wx.showToast({
        title: "开启提醒失败",
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
      const nextProject = decorateProject({
        ...this.data.project,
        conversation: Array.isArray(result && result.conversation) ? result.conversation : this.data.project.conversation,
        conversationReplies: nextReplies,
        opportunitySummary: result && result.opportunitySummary ? result.opportunitySummary : this.data.project.opportunitySummary
      });

      this.setData({
        sending: false,
        project: nextProject,
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
