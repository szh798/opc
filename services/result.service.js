const { get, post } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
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
  return requestWithFallback(
    () => get(`/projects/${projectId}/results`),
    getProjectResults(projectId)
  );
}

async function fetchResultDetail(resultId) {
  if (!resultId) {
    return null;
  }

  return requestWithFallback(
    () => get(`/results/${resultId}`),
    getResultDetail(resultId)
  );
}

async function shareResultCard(payload = {}) {
  return requestWithFallback(
    () => post("/results/share", payload),
    {
      success: true,
      shareId: `share-${Date.now()}`
    }
  );
}

module.exports = {
  getProjectResults,
  getResultDetail,
  fetchProjectResults,
  fetchResultDetail,
  shareResultCard
};
