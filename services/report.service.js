const { get } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
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
  return requestWithFallback(
    () => get("/reports/weekly"),
    weeklyReport
  );
}

async function fetchMonthlyCheck() {
  return requestWithFallback(
    () => get("/reports/monthly"),
    monthlyCheck
  );
}

async function fetchSocialProof() {
  return requestWithFallback(
    () => get("/reports/social-proof"),
    socialProof
  );
}

async function fetchMilestone() {
  return requestWithFallback(
    () => get("/milestone/current"),
    milestone
  );
}

async function fetchTreeMilestones() {
  return requestWithFallback(
    () => get("/tree/milestones"),
    treeMilestones
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
