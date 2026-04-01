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
      label: "\u60f3\u505a\u4e00\u4eba\u516c\u53f8\uff0c\u6ca1\u65b9\u5411",
      action: "route_explore"
    },
    {
      label: "\u6709\u60f3\u6cd5\uff0c\u8fc8\u4e0d\u51fa\u7b2c\u4e00\u6b65",
      action: "route_stuck"
    },
    {
      label: "\u5728\u505a\u4e86\uff0c\u60f3\u7528AI\u653e\u5927\u89c4\u6a21",
      action: "route_scale"
    }
  ];
}

module.exports = {
  getNicknameReplies,
  getRoutingReplies
};
