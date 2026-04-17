const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");
const { normalizeAvatarUrl, resolveDisplayInitial } = require("../../utils/user-display");

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
    userAvatarUrl: {
      type: String,
      value: ""
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
    displayInitial: "\u5c0f",
    displayAvatarUrl: "",
    avatarLoadFailed: false
  },

  lifetimes: {
    attached() {
      this.syncAgentMeta(this.properties.agentKey);
      this.syncLayout();
      this.syncAvatarState(this.properties.userInitial, this.properties.userAvatarUrl);
    }
  },

  observers: {
    "userInitial, userAvatarUrl": function (userInitial, userAvatarUrl) {
      this.syncAvatarState(userInitial, userAvatarUrl);
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

    syncAvatarState(userInitial, userAvatarUrl) {
      this.setData({
        displayInitial: resolveDisplayInitial({ initial: userInitial }, "\u5c0f"),
        displayAvatarUrl: normalizeAvatarUrl(userAvatarUrl),
        avatarLoadFailed: false
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

    handleAvatarError() {
      if (this.data.avatarLoadFailed) {
        return;
      }

      this.setData({
        avatarLoadFailed: true
      });
    }
  }
});
