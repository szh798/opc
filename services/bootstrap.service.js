const { get, getRequestConfig } = require("./request");
const { requestData, requestWithFallback } = require("./service-utils");
const { resolveMockResponse } = require("../mock/api-mock");

function shouldUseDevBootstrapFallback() {
  const runtimeConfig = getRequestConfig();
  return String((runtimeConfig && runtimeConfig.env) || "").trim() === "dev";
}

function buildBootstrapFallback() {
  return resolveMockResponse("GET", "/bootstrap");
}

function fetchBootstrap() {
  if (shouldUseDevBootstrapFallback()) {
    return requestWithFallback(
      () => get("/bootstrap"),
      buildBootstrapFallback
    );
  }

  return requestData(
    () => get("/bootstrap"),
    "获取启动数据失败"
  );
}

module.exports = {
  fetchBootstrap
};
