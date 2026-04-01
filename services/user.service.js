const { get, patch } = require("./request");
const { requestWithFallback, clone } = require("./service-utils");
const { user } = require("../mock/user");
const { projects } = require("../mock/projects");
const { tools, recentChats } = require("../mock/sidebar");

function getCurrentUserSync() {
  return clone(user);
}

async function fetchCurrentUser() {
  return requestWithFallback(
    () => get("/user"),
    user
  );
}

async function updateCurrentUser(payload = {}) {
  return requestWithFallback(
    () => patch("/user/profile", payload),
    {
      ...user,
      ...payload
    }
  );
}

async function fetchUserSidebar() {
  return requestWithFallback(
    () => get("/user/sidebar"),
    {
      user,
      projects,
      tools,
      recentChats
    }
  );
}

module.exports = {
  getCurrentUserSync,
  fetchCurrentUser,
  updateCurrentUser,
  fetchUserSidebar
};
