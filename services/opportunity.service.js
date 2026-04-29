const { post } = require("./request");
const { requestData } = require("./service-utils");
const { startSsePostStream } = require("./chat-stream.service");

const OPPORTUNITY_DIRECTIONS_TIMEOUT_MS = 45000;
const OPPORTUNITY_DEEP_DIVE_TIMEOUT_MS = 90000;

async function refreshBusinessDirections(payload = {}) {
  return requestData(
    () => post("/opportunity/directions/refresh", payload, {
      timeout: OPPORTUNITY_DIRECTIONS_TIMEOUT_MS
    }),
    "生成商业方向失败"
  );
}

async function selectBusinessDirection(payload = {}) {
  return requestData(
    () => post("/opportunity/directions/select", payload, {
      timeout: OPPORTUNITY_DEEP_DIVE_TIMEOUT_MS
    }),
    "选择商业方向失败"
  );
}

async function sendOpportunityDeepDiveMessage(payload = {}) {
  return requestData(
    () => post("/opportunity/deep-dive/message", payload, {
      timeout: OPPORTUNITY_DEEP_DIVE_TIMEOUT_MS
    }),
    "发送深聊消息失败"
  );
}

function sendOpportunityDeepDiveMessageStream(payload = {}, handlers = {}) {
  return startSsePostStream("/opportunity/deep-dive/message/stream", payload, handlers);
}

module.exports = {
  refreshBusinessDirections,
  selectBusinessDirection,
  sendOpportunityDeepDiveMessage,
  sendOpportunityDeepDiveMessageStream
};
