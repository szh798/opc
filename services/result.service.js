const { get, post } = require("./request");
const { clone, requestData } = require("./service-utils");
const { projectDetails } = require("../mock/projects");

function getProjectResults(projectId = "media-service") {
  const detail = projectDetails[projectId] || projectDetails["media-service"];
  return clone(detail && detail.artifacts ? detail.artifacts : []);
}

function getResultDetail(resultId, projectId = "media-service") {
  const artifacts = getProjectResults(projectId);
  const target = artifacts.find((item) => item.id === resultId);
  return clone(target || null);
}

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
  getProjectResults,
  getResultDetail,
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
};
