const { get } = require("./request");
const { clone, requestData } = require("./service-utils");
const { treeOverview, treeMilestones, milestone } = require("../mock/reports");

function getGrowthTreeSync() {
  return clone({
    overview: treeOverview,
    milestones: treeMilestones
  });
}

function getCurrentGrowthMilestoneSync() {
  return clone(milestone);
}

function getGrowthMilestoneByIdSync(milestoneId) {
  if (!milestoneId) {
    return null;
  }

  const target = treeMilestones.find((item) => item.id === milestoneId) || null;
  return clone(target);
}

async function fetchGrowthTree() {
  return requestData(
    () => get("/growth/tree"),
    "获取成长树失败"
  );
}

async function fetchCurrentGrowthMilestone() {
  return requestData(
    () => get("/growth/milestones/current"),
    "获取当前里程碑失败"
  );
}

async function fetchGrowthMilestoneById(milestoneId) {
  if (!milestoneId) {
    return null;
  }

  return requestData(
    () => get(`/growth/milestones/${milestoneId}`),
    "获取里程碑详情失败"
  );
}

module.exports = {
  getGrowthTreeSync,
  getCurrentGrowthMilestoneSync,
  getGrowthMilestoneByIdSync,
  fetchGrowthTree,
  fetchCurrentGrowthMilestone,
  fetchGrowthMilestoneById
};
