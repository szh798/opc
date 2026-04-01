const { get } = require("./request");

function fetchBootstrap() {
  return get("/bootstrap");
}

module.exports = {
  fetchBootstrap
};
