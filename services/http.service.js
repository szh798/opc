const http = require("./request");

module.exports = {
  request: http.request,
  get: http.get,
  post: http.post,
  put: http.put,
  patch: http.patch,
  remove: http.remove
};
