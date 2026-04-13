const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    agentKey: {
      type: String,
      value: "master",
      observer: "syncAgentMeta"
    },
    userInitial: {
      type: String,
      value: "\u5c0f"
    },
    showMenu: {
      type: Boolean,
      value: true
    },
    showTree: {
      type: Boolean,
      value: true
    }
  },

  data: {
    agentMeta: getAgentMeta("master"),
    navMetrics: getNavMetrics(),
    headerStyle: "",
    sideStyle: "",
    centerStyle: "",
    labelStyle: "",
    startY: 0,
    currentY: 0,
    pullDistance: 0,
    isPulling: false
  },

  lifetimes: {
    attached() {
      this.syncAgentMeta(this.properties.agentKey);
      this.syncLayout();
    }
  },

  pageLifetimes: {
    show() {
      this.syncLayout();
    }
  },

  methods: {
    syncAgentMeta(agentKey) {
      const agentMeta = getAgentMeta(agentKey);
      const labelMaxWidth = (this.data.navMetrics && this.data.navMetrics.labelMaxWidth) || getNavMetrics().labelMaxWidth;

      this.setData({
        agentMeta,
        labelStyle: `max-width: ${labelMaxWidth}px; color: ${agentMeta.color};`
      });
    },

    syncLayout() {
      const navMetrics = getNavMetrics(true);

      this.setData({
        navMetrics,
        headerStyle: `padding: ${navMetrics.headerTop}px 14px 10px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 10}px;`,
        sideStyle: `min-width: ${navMetrics.sideMinWidth}px;`,
        centerStyle: `max-width: ${navMetrics.labelMaxWidth}px;`,
        labelStyle: `max-width: ${navMetrics.labelMaxWidth}px; color: ${this.data.agentMeta.color};`
      });
    },

    handleAvatarTap() {
      this.triggerEvent("avatartap");
    },

    handleProfileTap() {
      this.triggerEvent("profiletap");
    },

    handleAgentTap() {
      this.triggerEvent("agenttap");
    },

    handleTreeTap() {
      this.triggerEvent("treetap");
    },

    handleTouchStart(e) {
      this.setData({
        startY: e.touches[0].clientY,
        currentY: e.touches[0].clientY,
        isPulling: true
      });
    },

    handleTouchMove(e) {
      if (!this.data.isPulling) return;
      
      const currentY = e.touches[0].clientY;
      const pullDistance = currentY - this.data.startY;
      
      if (pullDistance > 0) {
        this.setData({
          currentY,
          pullDistance: Math.min(pullDistance, 100)
        });
      }
    },

    handleTouchEnd() {
      if (this.data.pullDistance > 50) {
        this.triggerEvent("pulldown");
      }
      
      this.setData({
        startY: 0,
        currentY: 0,
        pullDistance: 0,
        isPulling: false
      });
    }
  }
});
