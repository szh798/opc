const { getToolGuideSeen } = require("../../services/session.service");

Page({
  onLoad() {
    const app = getApp();
    const guideSeen = getToolGuideSeen(app);
    const scene = guideSeen ? "ai_assistant" : "leverage_intro";

    wx.redirectTo({
      url: `/pages/conversation/conversation?scene=${scene}&target=ai`
    });
  }
});
