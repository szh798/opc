const { user } = require("./user");
const { projects, projectDetails } = require("./projects");
const { recentChats, tools } = require("./sidebar");
const { companyCards } = require("./company");
const { profile } = require("./profile");
const { conversations } = require("./chat");
const { treeMilestones, weeklyReport, monthlyCheck, socialProof, milestone } = require("./reports");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizePath(url) {
  if (!url) {
    return "/";
  }

  const withoutOrigin = String(url).replace(/^https?:\/\/[^/]+/i, "");
  const path = withoutOrigin.split("?")[0];
  return path.startsWith("/") ? path : `/${path}`;
}

function buildBootstrapPayload() {
  return {
    user,
    projects,
    tools,
    recentChats
  };
}

const staticRoutes = {
  "GET /bootstrap": () => buildBootstrapPayload(),
  "GET /user": () => user,
  "GET /sidebar": () => ({ user, projects, tools, recentChats }),
  "GET /projects": () => projects,
  "GET /company/cards": () => companyCards,
  "GET /profile": () => profile,
  "GET /reports/weekly": () => weeklyReport,
  "GET /reports/monthly": () => monthlyCheck,
  "GET /reports/social-proof": () => socialProof,
  "GET /milestone/current": () => milestone,


  
  "GET /tree/milestones": () => treeMilestones,
  "GET /conversation/home": () => conversations.home,
  "GET /conversation/onboarding": () => conversations.onboarding,
  "GET /conversation/ai": () => conversations.aiAssistant,
  "GET /conversation/ip": () => conversations.ipAssistant
};

function resolveDynamicRoute(method, path) {
  if (method === "GET") {
    const projectMatch = path.match(/^\/projects\/([^/]+)$/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      return projectDetails[projectId] || null;
    }
  }

  return null;
}

function resolveMockResponse(method, url, data = {}) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = normalizePath(url);
  const routeKey = `${normalizedMethod} ${normalizedPath}`;

  if (staticRoutes[routeKey]) {
    const payload = staticRoutes[routeKey](data);
    return clone(payload);
  }

  const dynamicPayload = resolveDynamicRoute(normalizedMethod, normalizedPath);
  if (dynamicPayload) {
    return clone(dynamicPayload);
  }

  throw new Error(`Mock route not found: ${routeKey}`);
}

module.exports = {
  resolveMockResponse
};
