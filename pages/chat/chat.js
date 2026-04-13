const { getConversationScene } = require("../../services/chat.service");
const { getSidebarData, getCompanyCards } = require("../../services/sidebar.service");

Page({
  data: {
    agentKey: "master",
    agentColor: "#0D0D0D",
    user: {},
    projects: [],
    tools: [],
    recentChats: [],
    companyCards: [],
    messages: [],
    quickReplies: [],
    sidebarVisible: false,
    projectSheetVisible: false,
    companyPanelVisible: false,
    assetSheetVisible: false,
    assetSheetMode: "view",
    profile: {},
    inputPlaceholder: "\u8f93\u5165\u6d88\u606f..."
  },

  onLoad() {
    const scene = getConversationScene("home");
    const sidebarData = getSidebarData();

    getApp().setCurrentAgent(scene.agentKey);

    this.setData({
      agentKey: scene.agentKey,
      agentColor: scene.agent.color,
      messages: scene.messages,
      quickReplies: scene.quickReplies,
      companyCards: getCompanyCards(),
      profile: {
        name: "Lu",
        initial: "L",
        stageLabel: "探索期个人开发者",
        radar: [
          { label: "设计", value: 45 },
          { label: "开发", value: 85 },
          { label: "运营", value: 20 },
          { label: "商业", value: 30 }
        ],
        strengths: ["代码实现", "系统架构"],
        traits: [{ label: "专注", tone: "purple" }],
        ikigai: "用代码构建有趣的产品"
      },
      ...sidebarData
    });
  },

  handleAvatarTap() {
    this.setData({ sidebarVisible: true });
  },

  handleSidebarClose() {
    this.setData({ sidebarVisible: false });
  },

  handleTreeTap() {
    wx.navigateTo({ url: "/pages/tree/tree" });
  },

  handlePlusTap() {
    this.setData({ projectSheetVisible: true });
  },

  handleProjectSheetClose() {
    this.setData({ projectSheetVisible: false });
  },

  handleCompanyClose() {
    this.setData({ companyPanelVisible: false });
  },

  handleProfileTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  handleProjectTap(event) {
    const { id } = event.detail;

    this.setData({
      sidebarVisible: false,
      projectSheetVisible: false
    });

    wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${id}` });
  },

  handleToolTap(event) {
    const { key } = event.detail;

    this.setData({ sidebarVisible: false });

    if (key === "company") {
      this.setData({ companyPanelVisible: true });
      return;
    }

    const pageMap = {
      ai: "/pages/ai-assistant/ai-assistant",
      ip: "/pages/ip-assistant/ip-assistant"
    };

    wx.navigateTo({ url: pageMap[key] || "/pages/chat/chat" });
  },

  handleQuickReply(event) {
    const { label } = event.currentTarget.dataset;
    const messages = this.data.messages.concat({
      id: `reply-${Date.now()}`,
      sender: "user",
      text: label
    });

    this.setData({
      messages,
      quickReplies: []
    });
  },

  handleSend(event) {
    const { value } = event.detail;
    const isUpdateSim = value.includes("更新资产");
    let newMessages = [
      {
        id: `input-${Date.now()}`,
        sender: "user",
        text: value
      }
    ];

    if (isUpdateSim) {
      newMessages.push({
        id: `update-${Date.now()}`,
        sender: "system",
        type: "asset_update",
        payload: {
          radar: [
             { label: "设计", value: 60, changed: true },
             { label: "开发", value: 90, changed: true },
             { label: "运营", value: 20 },
             { label: "商业", value: 50, changed: true }
          ],
          strengths: [
             { label: "代码实现" },
             { label: "系统架构" },
             { label: "全栈思维", isNew: true }
          ],
          traits: [
             { label: "专注", tone: "purple" },
             { label: "行动导向", tone: "mint", isNew: true }
          ],
          ikigai: "用代码和全栈能力构建有商业潜力的产品",
          ikigaiChanged: true
        }
      });
    }

    this.setData({ messages: this.data.messages.concat(newMessages) });
  },

  handleCreateProject() {
    wx.showToast({
      title: "\u65b0\u9879\u76ee\u6d41\u7a0b\u4e0b\u4e00\u6b65\u8865",
      icon: "none"
    });
  },

  handleCompanyAction() {
    this.setData({ companyPanelVisible: false });

    wx.showToast({
      title: "\u5df2\u9884\u7559\u516c\u53f8\u7ba1\u7406\u5165\u53e3",
      icon: "none"
    });
  },

  handleNewChat() {
    this.setData({ sidebarVisible: false });
  },

  handleRecentTap() {
    wx.showToast({
      title: "\u5386\u53f2\u4f1a\u8bdd\u9aa8\u67b6\u5df2\u9884\u7559",
      icon: "none"
    });
  },

  handleSettingTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  handleHelpTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  handleChatAvatarTap() {
    this.setData({
      assetSheetVisible: true,
      assetSheetMode: "view"
    });
  },

  handleAssetSheetClose() {
    this.setData({ assetSheetVisible: false });
  },

  handleReviewAssetUpdate(event) {
    const { payload } = event.currentTarget.dataset;
    this.setData({
      assetSheetVisible: true,
      assetSheetMode: "update",
      profile: { ...this.data.profile, ...payload },
      pendingUpdates: payload
    });
  },

  handleRejectAssetUpdate() {
    this.setData({ assetSheetVisible: false });
    wx.showToast({ title: "已暂缓更新", icon: "none" });
  },

  handleAcceptAssetUpdate() {
    // In a real app, send api request here to save updates format back to normal arrays
    const p = this.data.profile;
    const cleanProfile = {
      ...p,
      radar: p.radar.map(r => ({ label: r.label, value: r.value })),
      strengths: p.strengths.map(s => s.label || s),
      traits: p.traits.map(t => ({ label: t.label, tone: t.tone }))
    };

    this.setData({
      assetSheetVisible: false,
      profile: cleanProfile
    });

    const messages = this.data.messages.concat({
      id: `sys-${Date.now()}`,
      sender: "agent",
      text: "太棒了，您的资产雷达已更新！这会让我为您提供更精准的建议。"
    });
    this.setData({ messages });
    wx.showToast({ title: "资产更新成功", icon: "success" });
  }
});
