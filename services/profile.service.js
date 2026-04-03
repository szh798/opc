const { get } = require("./request");
const { clone, requestData } = require("./service-utils");
const { profile } = require("../mock/profile");

function getProfile() {
  return clone(profile);
}

async function fetchProfile() {
  return requestData(
    () => get("/profile"),
    "获取档案失败"
  );
}

module.exports = {
  getProfile,
  fetchProfile
};
