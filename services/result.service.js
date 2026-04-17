const { get, post } = require("./request");
const { requestData } = require("./service-utils");

async function fetchProjectResults(projectId = "media-service") {
  return requestData(
    () => get(`/projects/${projectId}/results`),
    "获取项目成果失败"
  );
}

async function fetchResultDetail(resultId) {
  if (!resultId) {
    return null;
  }

  return requestData(
    () => get(`/results/${resultId}`),
    "获取成果详情失败"
  );
}

async function shareResultCard(payload = {}) {
  return requestData(
    () => post("/results/share", payload),
    "分享成果卡失败"
  );
}

module.exports = {
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
};
