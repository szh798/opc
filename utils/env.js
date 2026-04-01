const STORAGE_KEYS = {
  USE_MOCK: "opc_use_mock",
  TOKEN: "opc_access_token"
};

const DEFAULT_RUNTIME_CONFIG = {
  env: "dev",
  baseURL: "http://127.0.0.1:3000",
  timeout: 10000,
  mockDelay: 180,
  useMock: false
};

const DEFAULT_HEADERS = {
  "content-type": "application/json"
};

module.exports = {
  STORAGE_KEYS,
  DEFAULT_RUNTIME_CONFIG,
  DEFAULT_HEADERS
};
