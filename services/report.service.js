const { get } = require("./request");
const { requestData } = require("./service-utils");

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
  fetchWeeklyReport,
  fetchMonthlyCheck,
  fetchSocialProof,
  fetchMilestone,
  fetchTreeMilestones
};
