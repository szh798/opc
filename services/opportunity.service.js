const { post } = require("./request");
const { requestData } = require("./service-utils");

async function refreshBusinessDirections(payload = {}) {
  return requestData(
    () => post("/opportunity/directions/refresh", payload),
    "生成商业方向失败"
  );
}

async function selectBusinessDirection(payload = {}) {
  return requestData(
    () => post("/opportunity/directions/select", payload),
    "选择商业方向失败"
  );
}

async function sendOpportunityDeepDiveMessage(payload = {}) {
  return requestData(
    () => post("/opportunity/deep-dive/message", payload),
    "发送深聊消息失败"
  );
}

module.exports = {
  refreshBusinessDirections,
  selectBusinessDirection,
  sendOpportunityDeepDiveMessage
};
