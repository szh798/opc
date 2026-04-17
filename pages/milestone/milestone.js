const COMING_SOON_TIP = "一树正在开发";

function redirectToConversation() {
  const pages = getCurrentPages();
  if (Array.isArray(pages) && pages.length > 1) {
    wx.navigateBack({
      delta: 1
    });
    return;
  }

  wx.redirectTo({
    url: "/pages/conversation/conversation?scene=home"
  });
}

function safeEncode(text = "") {
  return encodeURIComponent(String(text || ""));
}

Page({
  data: {},

  onLoad() {
    wx.showToast({
      title: COMING_SOON_TIP,
      icon: "none"
    });
    setTimeout(redirectToConversation, 120);
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

  handleMilestonePrimary() {
    wx.showToast({
      title: COMING_SOON_TIP,
      icon: "none"
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
