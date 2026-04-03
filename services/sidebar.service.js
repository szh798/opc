const { get } = require("./request");
const { clone, requestData } = require("./service-utils");
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
  return requestData(
    () => get("/sidebar"),
    "获取侧边栏失败"
  );
}

module.exports = {
  getSidebarData,
  getCompanyCards,
  fetchSidebarData
};
