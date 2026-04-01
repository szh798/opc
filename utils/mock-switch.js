const { getRuntimeConfig, persistMockFlag } = require("./runtime");

function getMockEnabled() {
  return !!getRuntimeConfig().useMock;
}

function setMockEnabled(enabled) {
  const nextEnabled = !!enabled;
  persistMockFlag(nextEnabled);

  if (typeof getApp !== "function") {
    return nextEnabled;
  }

  try {
    const app = getApp();
    if (app && typeof app.setMockEnabled === "function") {
      app.setMockEnabled(nextEnabled);
      return app.isMockEnabled();
    }
  } catch (error) {
    // ignore getApp runtime errors
  }

  return nextEnabled;
}

function toggleMockEnabled() {
  return setMockEnabled(!getMockEnabled());
}

module.exports = {
  getMockEnabled,
  setMockEnabled,
  toggleMockEnabled
};
