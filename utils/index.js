const request = require("./request");
const runtime = require("./runtime");
const env = require("./env");
const mockSwitch = require("./mock-switch");

module.exports = {
  ...request,
  ...runtime,
  ...env,
  ...mockSwitch
};
