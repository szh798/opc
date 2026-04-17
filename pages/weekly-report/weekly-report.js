const { fetchWeeklyReport } = require("../../services/report.service");
const COMING_SOON_TIP = "一树正在开发";

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {
    loading: true,
    error: false,
    report: {
      stats: []
    },
    reportTitle: "",
    userInitial: "\u5c0f"
  },

  onLoad() {
    const app = getApp();
    const user = (app && app.globalData && app.globalData.user) || {};

    this.setData({
      userInitial: user.initial || "\u5c0f"
    });

    this.loadWeeklyReport();
  },

  loadWeeklyReport() {
    this.setData({
      loading: true,
      error: false
    });

    fetchWeeklyReport()
      .then((report) => {
        const safeReport = report || { stats: [] };
        this.setData({
          loading: false,
          error: false,
          report: safeReport,
          reportTitle: `\u672c\u5468\u62a5\u544a \u00b7 ${safeReport.period || ""}`
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          report: this.data.report,
          reportTitle: this.data.reportTitle
        });
      });
  },

  handleRetry() {
    this.loadWeeklyReport();
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
      url: "/pages/conversation/conversation?scene=weekly_report"
    });
  },

  handleSend(event) {
    const text = event.detail && event.detail.value;

    if (!text) {
      return;
    }

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=weekly_report&userText=${safeEncode(text)}`
    });
  }
});
