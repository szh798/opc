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

Page({
  data: {},

  onLoad() {
    wx.showToast({
      title: COMING_SOON_TIP,
      icon: "none"
    });
    setTimeout(redirectToConversation, 120);
  }
});
