Page({
  data: {
    founderCount: "2,847",
    brandSize: 48,
    valueSize: 32,
    taglineSize: 16,
    proofSize: 14,
    ctaDisabled: false
  },

  onLoad() {
    this.applyResponsiveTypography();
  },

  applyResponsiveTypography() {
    let screenWidth = 375;

    try {
      if (wx.getWindowInfo) {
        const info = wx.getWindowInfo();
        screenWidth = info && (info.screenWidth || info.windowWidth) ? (info.screenWidth || info.windowWidth) : 375;
      } else if (wx.getSystemInfoSync) {
        const info = wx.getSystemInfoSync();
        screenWidth = info && (info.screenWidth || info.windowWidth) ? (info.screenWidth || info.windowWidth) : 375;
      }
    } catch (error) {
      screenWidth = 375;
    }

    let brandSize = 48;
    let valueSize = 32;

    if (screenWidth < 375) {
      brandSize = 44;
      valueSize = 28;
    } else if (screenWidth >= 414) {
      brandSize = 56;
      valueSize = 36;
    }

    this.setData({
      brandSize,
      valueSize
    });
  },

  handleJoin() {
    if (this.data.ctaDisabled) {
      return;
    }

    wx.navigateTo({
      url: "/pages/conversation/conversation?scene=onboarding_intro"
    });
  }
});
