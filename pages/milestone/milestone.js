const { getMilestone, fetchMilestone } = require("../../services/report.service");

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {
    loading: true,
    error: false,
    milestone: {},
    userInitial: "\u5c0f"
  },

  onLoad() {
    const app = getApp();
    const user = (app && app.globalData && app.globalData.user) || {};

    this.setData({
      userInitial: user.initial || "\u5c0f"
    });

    this.loadMilestone();
  },

  loadMilestone() {
    this.setData({
      loading: true,
      error: false
    });

    fetchMilestone()
      .then((milestone) => {
        this.setData({
          loading: false,
          error: false,
          milestone: milestone || getMilestone()
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          milestone: getMilestone()
        });
      });
  },

  handleRetry() {
    this.loadMilestone();
  },

  handleAvatarTap() {
    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  },

  handleTreeTap() {
    wx.redirectTo({
      url: "/pages/tree/tree"
    });
  },

  handleMilestonePrimary() {
    wx.redirectTo({
      url: "/pages/tree/tree"
    });
  },

  handleMilestoneSecondary() {
    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handlePlusTap() {
    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=home"
    });
  },

  handleSend(event) {
    const text = event.detail && event.detail.value;

    if (!text) {
      return;
    }

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=home&userText=${safeEncode(text)}`
    });
  }
});
