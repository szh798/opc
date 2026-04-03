const {
  getSharePreview,
  fetchSharePreview,
  buildShareCaption: buildShareCaptionRemote,
  generateShareImage
} = require("../../services/share.service");

function composeShareCaption(preview, captionData = {}) {
  const caption = String(captionData.caption || preview.caption || "").trim();
  const sourceTags = Array.isArray(captionData.hashtags) && captionData.hashtags.length
    ? captionData.hashtags
    : (preview.hashtags || []);
  const tags = sourceTags.join(" ");

  return `${caption}\n${tags}`.trim();
}

function buildShareCaptionPayload(preview = {}) {
  return {
    title: preview.title || "",
    resultTitle: preview.title || "",
    quote: preview.quote || "",
    bars: preview.bars || []
  };
}

function buildLegacyShareCaption(preview) {
  const tags = (preview.hashtags || []).join(" ");
  return `${preview.caption}\n${tags}`.trim();
}

Page({
  data: {
    loading: true,
    error: false,
    captionBusy: false,
    posterBusy: false,
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

  async handleCopyCaption() {
    if (this.data.captionBusy) {
      return;
    }

    this.setData({
      captionBusy: true
    });

    const preview = this.data.preview || {};
    let captionData = {
      caption: preview.caption || "",
      hashtags: preview.hashtags || []
    };

    try {
      const remote = await buildShareCaptionRemote(buildShareCaptionPayload(preview));
      if (remote && typeof remote === "object") {
        captionData = {
          ...captionData,
          ...remote
        };
      }
    } catch (error) {
      captionData = {
        caption: buildLegacyShareCaption(preview),
        hashtags: []
      };
    }

    const text = composeShareCaption(preview, captionData);
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: "\u6587\u6848\u5df2\u590d\u5236",
          icon: "none"
        });
      },
      complete: () => {
        this.setData({
          captionBusy: false
        });
      }
    });
  },

  async handleSavePoster() {
    if (this.data.posterBusy) {
      return;
    }

    this.setData({
      posterBusy: true
    });

    const preview = this.data.preview || {};

    try {
      const result = await generateShareImage({
        title: preview.title || "",
        quote: preview.quote || "",
        bars: preview.bars || []
      });
      const imageUrl = result && result.imageUrl ? String(result.imageUrl) : "";

      wx.showToast({
        title: imageUrl ? "\u6d77\u62a5\u5df2\u751f\u6210" : "\u6d77\u62a5\u751f\u6210\u6210\u529f",
        icon: "none"
      });
    } catch (error) {
      wx.showToast({
        title: "\u6d77\u62a5\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5",
        icon: "none"
      });
    } finally {
      this.setData({
        posterBusy: false
      });
    }
  }
});
