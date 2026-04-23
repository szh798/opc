const { fetchMonthlyCheck } = require("../../services/report.service");
const COMING_SOON_TIP = "一树正在开发";

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {
    loading: true,
    error: false,
    report: {
      metrics: []
    }
  },

  onLoad() {
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
    wx.showToast({
      title: COMING_SOON_TIP,
      icon: "none"
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
