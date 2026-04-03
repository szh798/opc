const { get } = require("./request");
const { requestData } = require("./service-utils");

function fetchBootstrap() {
  return requestData(
    () => get("/bootstrap"),
    "获取启动数据失败"
  );
}

module.exports = {
  fetchBootstrap
};
