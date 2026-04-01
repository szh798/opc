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
    const messages = this.data.messages.concat({
      id: `input-${Date.now()}`,
      sender: "user",
      text: value
    });

    this.setData({ messages });
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
  }
});
