function resolveInitialTypography() {
  let screenWidth = 375;

  try {
    if (typeof wx !== "undefined" && wx.getWindowInfo) {
      const info = wx.getWindowInfo();
      screenWidth = info && (info.screenWidth || info.windowWidth) ? (info.screenWidth || info.windowWidth) : 375;
    } else if (typeof wx !== "undefined" && wx.getSystemInfoSync) {
      const info = wx.getSystemInfoSync();
      screenWidth = info && (info.screenWidth || info.windowWidth) ? (info.screenWidth || info.windowWidth) : 375;
    }
  } catch (error) {
    screenWidth = 375;
  }

  if (screenWidth < 375) {
    return {
      brandSize: 44,
      valueSize: 28
    };
  }

  if (screenWidth >= 414) {
    return {
      brandSize: 56,
      valueSize: 36
    };
  }

  return {
    brandSize: 48,
    valueSize: 32
  };
}

const initialTypography = resolveInitialTypography();

Page({
  data: {
    founderCount: "2,847",
    brandSize: initialTypography.brandSize,
    valueSize: initialTypography.valueSize,
    taglineSize: 16,
    proofSize: 14,
    ctaDisabled: false
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
