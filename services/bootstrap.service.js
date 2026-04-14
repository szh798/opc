const { get, getRequestConfig } = require("./request");
const { requestData, requestWithFallback } = require("./service-utils");
const { resolveMockResponse } = require("../mock/api-mock");

const DEV_BOOTSTRAP_TIMEOUT_MS = 5000;
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 10000;

function shouldUseDevBootstrapFallback() {
  const runtimeConfig = getRequestConfig();
  return String((runtimeConfig && runtimeConfig.env) || "").trim() === "dev";
}

function buildBootstrapFallback() {
  return resolveMockResponse("GET", "/bootstrap");
}

function getBootstrapRequestOptions() {
  return {
    timeout: shouldUseDevBootstrapFallback() ? DEV_BOOTSTRAP_TIMEOUT_MS : DEFAULT_BOOTSTRAP_TIMEOUT_MS
  };
}

function fetchBootstrap() {
  const requestOptions = getBootstrapRequestOptions();

  if (shouldUseDevBootstrapFallback()) {
    return requestWithFallback(
      () => get("/bootstrap", requestOptions),
      buildBootstrapFallback
    );
  }

  return requestData(
    () => get("/bootstrap", requestOptions),
    "获取启动数据失败"
  );
}

module.exports = {
  fetchBootstrap
};
