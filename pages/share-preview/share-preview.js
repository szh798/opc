const {
  getSharePreview,
  fetchSharePreview,
  generateShareImage,
  buildShareCaption
} = require("../../services/share.service");
const { fetchResultDetail } = require("../../services/result.service");

function composeShareCaption(preview, captionData = {}) {
  const caption = String(captionData.caption || preview.caption || "").trim();
  const sourceTags = Array.isArray(captionData.hashtags) && captionData.hashtags.length
    ? captionData.hashtags
    : (preview.hashtags || []);
  const tags = sourceTags.join(" ");

  return `${caption}\n${tags}`.trim();
}

function buildShareCaptionPayload(preview = {}, resultId = "") {
  return {
    resultId,
    title: preview.title || "",
    resultTitle: preview.title || "",
    quote: preview.quote || "",
    bars: preview.bars || []
  };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return String(value || "");
  }
}

function normalizePosterUrl(url = "") {
  return String(url || "").replace("http://localhost:", "http://127.0.0.1:");
}

function buildPreviewFromResult(resultDetail = {}, preview = {}) {
  const nextPreview = {
    ...preview
  };

  if (resultDetail.title) {
    nextPreview.title = resultDetail.title;
  }

  if (resultDetail.summary) {
    nextPreview.quote = resultDetail.summary;
  } else if (resultDetail.meta) {
    nextPreview.quote = resultDetail.meta;
  }

  if (Array.isArray(resultDetail.scores) && resultDetail.scores.length) {
    nextPreview.bars = resultDetail.scores.map((score) => ({
      label: score.label,
      value: Number(score.percent || 0)
    }));
  }

  if (resultDetail.meta) {
    nextPreview.createdAt = resultDetail.meta;
  }

  return nextPreview;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300 && result.tempFilePath) {
          resolve(result.tempFilePath);
          return;
        }

        reject(new Error("海报下载失败"));
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function saveImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

Page({
  data: {
    loading: true,
    error: false,
    captionBusy: false,
    posterBusy: false,
    posterImageUrl: "",
    preview: {
      bars: [],
      hashtags: []
    }
  },

  onLoad(options = {}) {
    this.resultId = String(options.resultId || "").trim();
    this.resultTitle = safeDecode(options.title || "");
    this.loadPreview();
  },

  loadPreview() {
    this.setData({
      loading: true,
      error: false
    });

    Promise.all([
      fetchSharePreview().catch(() => null),
      this.resultId ? fetchResultDetail(this.resultId).catch(() => null) : Promise.resolve(null)
    ])
      .then(async ([preview, resultDetail]) => {
        const safePreview = preview || getSharePreview();
        const mergedPreview = resultDetail
          ? buildPreviewFromResult(resultDetail, safePreview)
          : safePreview;

        const captionResult = await buildShareCaption({
          ...buildShareCaptionPayload(mergedPreview, this.resultId),
          title: this.resultTitle || mergedPreview.title || "",
          resultTitle: this.resultTitle || mergedPreview.title || ""
        }).catch(() => null);

        this.setData({
          loading: false,
          error: !preview,
          posterImageUrl: "",
          preview: {
            ...mergedPreview,
            resultId: this.resultId,
            caption: captionResult && captionResult.caption ? captionResult.caption : mergedPreview.caption,
            hashtags: Array.isArray(captionResult && captionResult.hashtags)
              ? captionResult.hashtags
              : (mergedPreview.hashtags || [])
          }
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
      title: "原来我的隐藏资产比想象中多得多",
      path: "/pages/welcome/welcome"
    };
  },

  onShareTimeline() {
    return {
      title: "我的一人公司资产盘点完成了"
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
      const remote = await buildShareCaption(buildShareCaptionPayload(preview, this.resultId));
      if (remote && typeof remote === "object") {
        captionData = {
          ...captionData,
          ...remote
        };
      }
    } catch (_error) {
      // noop: keep preview fallback
    }

    const text = composeShareCaption(preview, captionData);
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: "文案已复制",
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
    wx.showLoading({
      title: "生成海报中..."
    });

    try {
      const preview = this.data.preview || {};
      const posterResult = await generateShareImage({
        resultId: this.resultId,
        title: this.resultTitle || preview.title || "",
        resultTitle: this.resultTitle || preview.title || "",
        quote: preview.quote || "",
        caption: preview.caption || "",
        hashtags: preview.hashtags || [],
        bars: preview.bars || []
      });

      const imageUrl = normalizePosterUrl(posterResult && posterResult.imageUrl);
      const tempFilePath = await downloadFile(imageUrl);
      await saveImage(tempFilePath);

      this.setData({
        posterImageUrl: imageUrl
      });

      wx.showToast({
        title: "海报已保存到相册",
        icon: "none"
      });
    } catch (error) {
      wx.showToast({
        title: String((error && error.message) || "海报保存失败，请检查权限"),
        icon: "none"
      });
    } finally {
      wx.hideLoading();
      this.setData({
        posterBusy: false
      });
    }
  }
});
