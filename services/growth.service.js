const { get } = require("./request");
const { requestWithFallback } = require("./service-utils");
const { treeOverview, treeMilestones, milestone } = require("../mock/reports");

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
  fetchGrowthTree,
  fetchCurrentGrowthMilestone,
  fetchGrowthMilestoneById
};
