const { get, patch, post } = require("./request");
const { requestData } = require("./service-utils");

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

async function uploadCurrentUserAvatar(avatarDataUrl = "") {
  return requestData(
    () => post("/user/avatar", { avatarDataUrl }, { timeout: 30000 }),
    "鏇存柊澶村儚澶辫触"
  );
}

async function fetchUserSidebar() {
  return requestData(
    () => get("/user/sidebar"),
    "获取侧边栏数据失败"
  );
}

module.exports = {
  fetchCurrentUser,
  updateCurrentUser,
  uploadCurrentUserAvatar,
  fetchUserSidebar
};
