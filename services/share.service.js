const { get, post } = require("./request");
const { requestData } = require("./service-utils");

async function fetchSharePreview() {
  return requestData(
    () => get("/share/preview"),
    "获取分享预览失败"
  );
}

async function generateShareImage(payload = {}) {
  return requestData(
    () => post("/share/generate-image", payload),
    "生成分享海报失败"
  );
}

async function buildShareCaption(payload = {}) {
  return requestData(
    () => post("/share/caption", payload),
    "生成分享文案失败"
  );
}

module.exports = {
  fetchSharePreview,
  generateShareImage,
  buildShareCaption
};
