const { getWeeklyReport, fetchWeeklyReport } = require("../../services/report.service");

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
        const safeReport = report || getWeeklyReport();
        this.setData({
          loading: false,
          error: false,
          report: safeReport,
          reportTitle: `\u672c\u5468\u62a5\u544a \u00b7 ${safeReport.period || ""}`
        });
      })
      .catch(() => {
        const report = getWeeklyReport();
        this.setData({
          loading: false,
          error: true,
          report,
          reportTitle: `\u672c\u5468\u62a5\u544a \u00b7 ${report.period || ""}`
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
