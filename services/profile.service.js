const { get } = require("./request");
const { requestData } = require("./service-utils");

async function fetchProfile() {
  return requestData(
    () => get("/profile"),
    "获取档案失败"
  );
}

module.exports = {
  fetchProfile
};
