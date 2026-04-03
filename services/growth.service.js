const { get } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
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
  return requestWithFallback(
    () => get("/growth/tree"),
    {
      overview: treeOverview,
      milestones: treeMilestones
    }
  );
}

async function fetchCurrentGrowthMilestone() {
  return requestWithFallback(
    () => get("/growth/milestones/current"),
    milestone
  );
}

async function fetchGrowthMilestoneById(milestoneId) {
  if (!milestoneId) {
    return null;
  }

  const local = treeMilestones.find((item) => item.id === milestoneId) || null;

  return requestWithFallback(
    () => get(`/growth/milestones/${milestoneId}`),
    local
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
