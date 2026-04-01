const { getSharePreview, fetchSharePreview } = require("../../services/share.service");

function buildShareCaption(preview) {
  const tags = (preview.hashtags || []).join(" ");
  return `${preview.caption}\n${tags}`.trim();
}

Page({
  data: {
    loading: true,
    error: false,
    preview: {
      bars: [],
      hashtags: []
    }
  },

  onLoad() {
    this.loadPreview();
  },

  loadPreview() {
    this.setData({
      loading: true,
      error: false
    });

    fetchSharePreview()
      .then((preview) => {
        this.setData({
          loading: false,
          error: false,
          preview: preview || getSharePreview()
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          preview: getSharePreview()
        });
      });
  },

  handleRetry() {
    this.loadPreview();
  },

  onShareAppMessage() {
    return {
      title: "\u539f\u6765\u6211\u7684\u9690\u85cf\u8d44\u4ea7\u6bd4\u60f3\u8c61\u4e2d\u591a\u5f97\u591a",
      path: "/pages/welcome/welcome"
    };
  },

  onShareTimeline() {
    return {
      title: "\u6211\u7684\u4e00\u4eba\u516c\u53f8\u8d44\u4ea7\u76d8\u70b9\u5b8c\u6210\u4e86"
    };
  },

  handleCopyCaption() {
    const text = buildShareCaption(this.data.preview);
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: "\u6587\u6848\u5df2\u590d\u5236",
          icon: "none"
        });
      }
    });
  },

  handleSavePoster() {
    wx.showToast({
      title: "\u6d77\u62a5\u4fdd\u5b58\u529f\u80fd\u5373\u5c06\u63a5\u5165",
      icon: "none"
    });
  }
});
