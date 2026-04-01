const http = require("../utils/request");
const { getRuntimeConfig } = require("../utils/runtime");
const { getMockEnabled, setMockEnabled, toggleMockEnabled } = require("../utils/mock-switch");

function request(options = {}) {
  return http.request(options);
}

function get(url, options = {}) {
  return http.get(url, options);
}

function post(url, data = {}, options = {}) {
  return http.post(url, data, options);
}

function put(url, data = {}, options = {}) {
  return http.put(url, data, options);
}

function patch(url, data = {}, options = {}) {
  return http.patch(url, data, options);
}

function remove(url, data = {}, options = {}) {
  return http.remove(url, data, options);
}

function getRequestConfig() {
  return getRuntimeConfig();
}

function isMockMode() {
  return !!getMockEnabled();
}

function setRequestMockMode(enabled) {
  return setMockEnabled(enabled);
}

function toggleRequestMockMode() {
  return toggleMockEnabled();
}

module.exports = {
  request,
  get,
  post,
  put,
  patch,
  remove,
  getRequestConfig,
  isMockMode,
  setRequestMockMode,
  toggleRequestMockMode
};
