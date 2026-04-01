const { getProfile, fetchProfile } = require("../../services/profile.service");

Page({
  data: {
    loading: true,
    error: false,
    profile: {
      initial: "\u5c0f",
      name: "\u5c0f\u660e",
      byline: "by \u4e00\u6811\u00b7\u6316\u5b9d",
      stageLabel: "",
      radar: [],
      strengths: [],
      traits: []
    }
  },

  onLoad() {
    this.loadProfile();
  },

  loadProfile() {
    this.setData({
      loading: true,
      error: false
    });

    fetchProfile()
      .then((data) => {
        this.setData({
          loading: false,
          error: false,
          profile: data || getProfile()
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          profile: getProfile()
        });
      });
  },

  handleRetry() {
    this.loadProfile();
  },

  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({
          url: "/pages/welcome/welcome"
        });
      }
    });
  }
});
