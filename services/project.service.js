const { get, post, patch, remove } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
const { projects, projectDetails } = require("../mock/projects");

function getProjects() {
  return clone(projects);
}

function getProjectDetail(projectId = "media-service") {
  return clone(projectDetails[projectId] || projectDetails["media-service"]);
}

async function fetchProjects() {
  return requestWithFallback(
    () => get("/projects"),
    projects
  );
}

async function fetchProjectDetail(projectId = "media-service") {
  return requestWithFallback(
    () => get(`/projects/${projectId}`),
    projectDetails[projectId] || projectDetails["media-service"]
  );
}

async function createProject(payload = {}) {
  return requestWithFallback(
    () => post("/projects", payload),
    {
      id: `project-${Date.now()}`,
      name: payload.name || "新项目",
      phase: payload.phase || "探索中",
      status: payload.status || "进行中",
      statusTone: "muted",
      color: payload.color || "#378ADD"
    }
  );
}

async function updateProject(projectId, payload = {}) {
  if (!projectId) {
    return null;
  }

  return requestWithFallback(
    () => patch(`/projects/${projectId}`, payload),
    {
      ...(projectDetails[projectId] || {}),
      ...payload
    }
  );
}

async function deleteProject(projectId) {
  if (!projectId) {
    return { success: false };
  }

  return requestWithFallback(
    () => remove(`/projects/${projectId}`, {}),
    { success: true, id: projectId }
  );
}

module.exports = {
  getProjects,
  getProjectDetail,
  fetchProjects,
  fetchProjectDetail,
  createProject,
  updateProject,
  deleteProject
};
