const { get, post, patch, remove } = require("./request");
const { clone, requestData } = require("./service-utils");
const { projects, projectDetails } = require("../mock/projects");
const PROJECT_CHAT_TIMEOUT_MS = 310000;

function getProjects() {
  return clone(projects);
}

function getProjectDetail(projectId = "media-service") {
  return clone(projectDetails[projectId] || projectDetails["media-service"]);
}

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

module.exports = {
  getProjects,
  getProjectDetail,
  fetchProjects,
  fetchProjectDetail,
  createProject,
  sendProjectMessage,
  updateProject,
  deleteProject
};
