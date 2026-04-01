const { get } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
const { user } = require("../mock/user");
const { recentChats, tools } = require("../mock/sidebar");
const { projects } = require("../mock/projects");
const { companyCards } = require("../mock/company");

function getSidebarData() {
  return {
    user: clone(user),
    recentChats: clone(recentChats),
    tools: clone(tools),
    projects: clone(projects)
  };
}

function getCompanyCards() {
  return clone(companyCards);
}

async function fetchSidebarData() {
  return requestWithFallback(
    () => get("/sidebar"),
    getSidebarData()
  );
}

module.exports = {
  getSidebarData,
  getCompanyCards,
  fetchSidebarData
};
