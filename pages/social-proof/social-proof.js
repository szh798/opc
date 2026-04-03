const { fetchSocialProof } = require("../../services/report.service");

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {
    loading: true,
    error: false,
    socialProof: {},
    userInitial: "\u5c0f"
  },

  onLoad() {
    const app = getApp();
    const user = (app && app.globalData && app.globalData.user) || {};

    this.setData({
      userInitial: user.initial || "\u5c0f"
    });

    this.loadSocialProof();
  },

  loadSocialProof() {
    this.setData({
      loading: true,
      error: false
    });

    fetchSocialProof()
      .then((socialProof) => {
        this.setData({
          loading: false,
          error: false,
          socialProof: socialProof || {}
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          socialProof: this.data.socialProof
        });
      });
  },

  handleRetry() {
    this.loadSocialProof();
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

  handlePrimary() {
    const text = this.data.socialProof.primaryText || "\u597d\uff0c\u7ed9\u6211\u4e00\u4e2a\u4efb\u52a1";

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=home&userText=${safeEncode(text)}`
    });
  },

  handleSecondary() {
    const text = this.data.socialProof.secondaryText || "\u6211\u786e\u5b9e\u6709\u56f0\u96be\uff0c\u804a\u804a";

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=social_proof&userText=${safeEncode(text)}`
    });
  },

  handlePlusTap() {
    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=social_proof"
    });
  },

  handleSend(event) {
    const text = event.detail && event.detail.value;

    if (!text) {
      return;
    }

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=social_proof&userText=${safeEncode(text)}`
    });
  }
});
