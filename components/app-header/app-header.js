const { getAgentMeta } = require("../../theme/roles");
const { getNavMetrics } = require("../../utils/nav");
const { normalizeAvatarUrl, resolveAvatarAfterError } = require("../../utils/user-display");
const { resolveAvatarRenderUrl } = require("../../utils/avatar-render");

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
    displayAvatarUrl: "",
    avatarLoadFailed: false
  },

  lifetimes: {
    attached() {
      this.syncAgentMeta(this.properties.agentKey);
      this.syncLayout();
      this.syncAvatarState(this.properties.userAvatarUrl);
    }
  },

  observers: {
    userAvatarUrl(userAvatarUrl) {
      this.syncAvatarState(userAvatarUrl);
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

    syncAvatarState(userAvatarUrl) {
      const normalizedAvatarUrl = normalizeAvatarUrl(userAvatarUrl);
      this.avatarResolveToken = Number(this.avatarResolveToken || 0) + 1;
      const resolveToken = this.avatarResolveToken;

      this.setData({
        displayAvatarUrl: normalizedAvatarUrl,
        avatarLoadFailed: false
      });

      resolveAvatarRenderUrl(normalizedAvatarUrl).then((resolvedAvatarUrl) => {
        const nextAvatarUrl = String(resolvedAvatarUrl || "").trim();
        if (!nextAvatarUrl || nextAvatarUrl === normalizedAvatarUrl || resolveToken !== this.avatarResolveToken) {
          return;
        }

        this.setData({
          displayAvatarUrl: nextAvatarUrl,
          avatarLoadFailed: false
        });
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
      const fallbackAvatarUrl = resolveAvatarAfterError(this.data.displayAvatarUrl);
      if (fallbackAvatarUrl) {
        this.setData({
          displayAvatarUrl: fallbackAvatarUrl,
          avatarLoadFailed: false
        });
        return;
      }

      if (this.data.avatarLoadFailed) {
        return;
      }

      this.setData({
        avatarLoadFailed: true
      });
    }
  }
});
