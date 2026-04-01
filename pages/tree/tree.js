const { getTreeOverview, getTreeMilestones } = require("../../services/report.service");
const { fetchGrowthTree } = require("../../services/growth.service");

function decorateMilestones(list = []) {
  return list.map((item, index) => ({
    ...item,
    index,
    isLast: index === list.length - 1
  }));
}

Page({
  data: {
    loading: true,
    error: false,
    overview: {},
    milestones: []
  },

  onLoad() {
    this.loadTreeData();
  },

  loadTreeData() {
    this.setData({
      loading: true,
      error: false
    });

    fetchGrowthTree()
      .then((payload) => {
        const fallbackOverview = getTreeOverview();
        const fallbackMilestones = getTreeMilestones();
        this.setData({
          loading: false,
          error: false,
          overview: (payload && payload.overview) || fallbackOverview,
          milestones: decorateMilestones((payload && payload.milestones) || fallbackMilestones)
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          error: true,
          overview: getTreeOverview(),
          milestones: decorateMilestones(getTreeMilestones())
        });
      });
  },

  handleRetry() {
    this.loadTreeData();
  },

  handleClose() {
    const pages = getCurrentPages();

    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }

    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=home"
    });
  },

  handleMilestoneTap(event) {
    const { index } = event.currentTarget.dataset;
    const item = this.data.milestones[index];

    if (!item || item.status === "todo" || !item.artifactTitle) {
      return;
    }

    wx.showToast({
      title: `${item.artifactTitle}\u5df2\u540c\u6b65\u5230\u804a\u5929`,
      icon: "none"
    });
  },

  handleContinue() {
    wx.redirectTo({
      url: "/pages/conversation/conversation?scene=home"
    });
  }
});
