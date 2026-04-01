const { get } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
const { profile } = require("../mock/profile");

function getProfile() {
  return clone(profile);
}

async function fetchProfile() {
  return requestWithFallback(
    () => get("/profile"),
    profile
  );
}

module.exports = {
  getProfile,
  fetchProfile
};
