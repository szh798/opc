const { fetchMonthlyCheck } = require("../../services/report.service");

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {
    loading: true,
    error: false,
    report: {
      metrics: []
    },
    userInitial: "\u5c0f"
  },

  onLoad() {
    const app = getApp();
    const user = (app && app.globalData && app.globalData.user) || {};

    this.setData({
      userInitial: user.initial || "\u5c0f"
    });

    this.loadMonthlyCheck();
  },

  loadMonthlyCheck() {
    this.setData({
      loading: true,
      error: false
    });

    fetchMonthlyCheck()
      .then((report) => {
        this.setData({
          loading: false,
          error: false,
          report: report || { metrics: [] }
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          report: this.data.report
        });
      });
  },

  handleRetry() {
    this.loadMonthlyCheck();
  },

  handleAvatarTap() {
    wx.navigateTo({
      url: "/pages/profile/profile"
    });
  },

  handleTreeTap() {
    wx.navigateTo({
      url: "/pages/tree/tree"
    });
  },

  handleShare() {
    wx.navigateTo({
      url: "/pages/share-preview/share-preview"
    });
  },

  handlePlusTap() {
    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=monthly_check"
    });
  },

  handleSend(event) {
    const text = event.detail && event.detail.value;

    if (!text) {
      return;
    }

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=monthly_check&userText=${safeEncode(text)}`
    });
  }
});
