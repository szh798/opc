const { getAgentMeta } = require("../../../theme/roles");
const { getNavMetrics } = require("../../../utils/nav");

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
    wrapStyle: "",
    headerStyle: "",
    sideStyle: "",
    centerStyle: "",
    labelStyle: "",
    pulling: false
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
        wrapStyle: `padding: ${navMetrics.headerTop}px 10px 6px;`,
        headerStyle: `min-height: ${navMetrics.menuHeight}px; padding: 0 12px;`,
        sideStyle: `min-width: ${navMetrics.sideMinWidth}px;`,
        centerStyle: `max-width: ${navMetrics.labelMaxWidth}px;`,
        labelStyle: `max-width: ${navMetrics.labelMaxWidth}px; color: ${this.data.agentMeta.color};`
      });
    },

    handleAvatarTap() {
      this.triggerEvent("avatartap");
    },

    handleAgentTap() {
      this.triggerEvent("agenttap");
    },

    handleTreeTap() {
      this.triggerEvent("treetap");
    },

    handlePullStart(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) {
        return;
      }

      this._pullStartX = touch.clientX;
      this._pullStartY = touch.clientY;
      this._pullTriggered = false;

      this.setData({
        pulling: true
      });
    },

    handlePullMove(event) {
      if (!this.data.pulling || this._pullTriggered) {
        return;
      }

      const touch = event.touches && event.touches[0];
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - (this._pullStartX || 0);
      const deltaY = touch.clientY - (this._pullStartY || 0);
      const isVerticalPull = deltaY > 48 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3;

      if (!isVerticalPull) {
        return;
      }

      this._pullTriggered = true;
      this.triggerEvent("treepulldown");
    },

    handlePullEnd() {
      this._pullStartX = 0;
      this._pullStartY = 0;
      this._pullTriggered = false;

      if (this.data.pulling) {
        this.setData({
          pulling: false
        });
      }
    }
  }
});
