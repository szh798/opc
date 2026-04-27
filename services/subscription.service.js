const { post } = require("./request");
const { requestData } = require("./service-utils");
const { getRuntimeConfig } = require("../utils/runtime");

async function saveProjectFollowupSubscription(payload = {}) {
  return requestData(
    () => post("/subscriptions/project-followup", payload),
    "保存项目提醒授权失败"
  );
}

async function requestProjectFollowupSubscription(payload = {}) {
  const templateId = resolveProjectFollowupTemplateId();
  if (!templateId) {
    return {
      success: false,
      reason: "missing_template_id"
    };
  }

  if (typeof wx === "undefined" || typeof wx.requestSubscribeMessage !== "function") {
    return {
      success: false,
      reason: "unsupported"
    };
  }

  const subscriptionResult = await new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: resolve,
      fail: reject
    });
  });

  const decision = subscriptionResult && subscriptionResult[templateId];
  if (decision !== "accept") {
    return {
      success: false,
      reason: decision || "not_accept"
    };
  }

  return saveProjectFollowupSubscription({
    templateId,
    projectId: payload.projectId || "",
    scene: "followup"
  });
}

function resolveProjectFollowupTemplateId() {
  const config = getRuntimeConfig();
  return String(
    config.projectFollowupTemplateId ||
    config.wechatProjectFollowupTemplateId ||
    ""
  ).trim();
}

module.exports = {
  requestProjectFollowupSubscription,
  saveProjectFollowupSubscription
};
