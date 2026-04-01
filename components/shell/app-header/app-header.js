const { getAgentMeta } = require("../../../theme/roles");

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
    agentMeta: getAgentMeta("master")
  },

  lifetimes: {
    attached() {
      this.syncAgentMeta(this.properties.agentKey);
    }
  },

  methods: {
    syncAgentMeta(agentKey) {
      this.setData({
        agentMeta: getAgentMeta(agentKey)
      });
    },

    handleAvatarTap() {
      this.triggerEvent("avatartap");
    },

    handleTreeTap() {
      this.triggerEvent("treetap");
    }
  }
});
