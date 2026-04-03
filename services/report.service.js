const { get } = require("./request");
const { clone, requestData } = require("./service-utils");
const { treeOverview, treeMilestones, weeklyReport, monthlyCheck, socialProof, milestone } = require("../mock/reports");

function getTreeOverview() {
  return clone(treeOverview);
}

function getTreeMilestones() {
  return clone(treeMilestones);
}

function getWeeklyReport() {
  return clone(weeklyReport);
}

function getMonthlyCheck() {
  return clone(monthlyCheck);
}

function getSocialProof() {
  return clone(socialProof);
}

function getMilestone() {
  return clone(milestone);
}

async function fetchWeeklyReport() {
  return requestData(
    () => get("/reports/weekly"),
    "获取周报失败"
  );
}

async function fetchMonthlyCheck() {
  return requestData(
    () => get("/reports/monthly"),
    "获取月报失败"
  );
}

async function fetchSocialProof() {
  return requestData(
    () => get("/reports/social-proof"),
    "获取社会证明失败"
  );
}

async function fetchMilestone() {
  return requestData(
    () => get("/milestone/current"),
    "获取当前里程碑失败"
  );
}

async function fetchTreeMilestones() {
  return requestData(
    () => get("/tree/milestones"),
    "获取成长里程碑失败"
  );
}

module.exports = {
  getTreeOverview,
  getTreeMilestones,
  getWeeklyReport,
  getMonthlyCheck,
  getSocialProof,
  getMilestone,
  fetchWeeklyReport,
  fetchMonthlyCheck,
  fetchSocialProof,
  fetchMilestone,
  fetchTreeMilestones
};
