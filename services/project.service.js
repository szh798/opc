const { get, post, patch, remove } = require("./request");
const { requestData } = require("./service-utils");
const { startProjectMessageStream } = require("./chat-stream.service");
const PROJECT_CHAT_TIMEOUT_MS = 310000;

async function fetchProjects() {
  return requestData(
    () => get("/projects"),
    "获取项目列表失败"
  );
}

async function fetchProjectDetail(projectId = "media-service") {
  return requestData(
    () => get(`/projects/${projectId}`),
    "获取项目详情失败"
  );
}

async function createProject(payload = {}) {
  return requestData(
    () => post("/projects", payload),
    "创建项目失败"
  );
}

async function sendProjectMessage(projectId, payload = {}) {
  if (!projectId) {
    return null;
  }

  return requestData(
    () => post(`/projects/${projectId}/chat`, payload, {
      timeout: PROJECT_CHAT_TIMEOUT_MS
    }),
    "发送项目消息失败"
  );
}

async function updateProject(projectId, payload = {}) {
  if (!projectId) {
    return null;
  }

  return requestData(
    () => patch(`/projects/${projectId}`, payload),
    "更新项目失败"
  );
}

async function deleteProject(projectId) {
  if (!projectId) {
    return { success: false };
  }

  return requestData(
    () => remove(`/projects/${projectId}`, {}),
    "删除项目失败"
  );
}

async function initiateProject(projectId, payload = {}) {
  if (!projectId) {
    return null;
  }

  return requestData(
    () => post(`/projects/${projectId}/initiate`, payload),
    "项目立项失败"
  );
}

async function revokeProjectInitiation(projectId) {
  if (!projectId) {
    return null;
  }

  return requestData(
    () => post(`/projects/${projectId}/revoke-initiation`, {}),
    "撤销立项失败"
  );
}

module.exports = {
  fetchProjects,
  fetchProjectDetail,
  createProject,
  sendProjectMessage,
  startProjectMessageStream,
  updateProject,
  deleteProject,
  initiateProject,
  revokeProjectInitiation
};
