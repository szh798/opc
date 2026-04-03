const { get, patch } = require("./request");
const { requestData, clone } = require("./service-utils");
const { user } = require("../mock/user");
const { projects } = require("../mock/projects");
const { tools, recentChats } = require("../mock/sidebar");

function getCurrentUserSync() {
  return clone(user);
}

async function fetchCurrentUser() {
  return requestData(
    () => get("/user"),
    "获取当前用户失败"
  );
}

async function updateCurrentUser(payload = {}) {
  return requestData(
    () => patch("/user/profile", payload),
    "更新用户资料失败"
  );
}

async function fetchUserSidebar() {
  return requestData(
    () => get("/user/sidebar"),
    "获取侧边栏数据失败"
  );
}

module.exports = {
  getCurrentUserSync,
  fetchCurrentUser,
  updateCurrentUser,
  fetchUserSidebar
};
