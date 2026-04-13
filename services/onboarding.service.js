function getNicknameReplies(user) {
  const name = (user && user.nickname) || "\u5c0f\u660e";

  return [
    {
      label: `\u5c31\u53eb${name}`,
      action: "confirm_nickname"
    },
    {
      label: "\u53eb\u6211\u522b\u7684\u540d\u5b57",
      action: "rename"
    }
  ];
}

function getRoutingReplies() {
  return [
    {
      label: "\u5728\u4e0a\u73ed\uff0c\u6ca1\u60f3\u8fc7",
      action: "route_working"
    },
    {
      label: "\u6709\u60f3\u6cd5\uff0c\u5f00\u59cb\u5c1d\u8bd5\u4e86",
      action: "route_trying"
    },
    {
      label: "\u5df2\u7ecf\u5168\u804c\u5728\u505a\u4e86",
      action: "route_fulltime"
    }
  ];
}

// \u65e7 action key \u5230\u65b0 key \u7684\u5165\u53e3\u522b\u540d\uff0c\u4fdd\u62a4 mock / \u65e7\u7248\u672c\u5ba2\u6237\u7aef / \u8def\u7531\u8868\u4e0d\u4e00\u6b21\u6027\u7206\u70b8
const ROUTE_ACTION_ALIASES = {
  route_explore: "route_working",
  route_stuck: "route_trying",
  route_scale: "route_fulltime"
};

function resolveRouteAction(action) {
  if (!action) return action;
  return ROUTE_ACTION_ALIASES[action] || action;
}

module.exports = {
  getNicknameReplies,
  getRoutingReplies,
  ROUTE_ACTION_ALIASES,
  resolveRouteAction
};
