module.exports = {
  common: {
    timeout: 15000
  },
  dev: {
    baseURL: "http://127.0.0.1:3000",
    allowLoopbackOnDevice: false,
    devFreshLoginSecret: "replace-with-your-dev-fresh-login-secret"
  },
  trial: {
    baseURL: "https://trial-api.your-domain.com"
  },
  release: {
    baseURL: "https://api.your-domain.com"
  }
};
