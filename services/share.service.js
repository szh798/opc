const { get, post } = require("./request");
const { clone, requestData } = require("./service-utils");

const sharePreviewFallback = {
  subtitle: "\u4e00\u6811OPC / \u6211\u7684\u8d44\u4ea7\u96f7\u8fbe",
  title: "\u539f\u6765\u6211\u7684\u9690\u85cf\u8d44\u4ea7\n\u6bd4\u6211\u60f3\u7684\u591a\u5f97\u591a\u3002",
  quote: "\u626b\u7801\u53d1\u73b0\u4f60\u7684\u9690\u85cf\u8d44\u4ea7",
  brand: "\u4e00\u6811OPC",
  createdAt: "3\u670831\u65e5\u751f\u6210",
  bars: [
    { label: "\u80fd\u529b", value: 78 },
    { label: "\u8d44\u6e90", value: 42 },
    { label: "\u8ba4\u77e5", value: 86 },
    { label: "\u5173\u7cfb", value: 55 }
  ],
  caption: "\u4eca\u5929\u7528\u4e00\u6811OPC\u628a\u8d44\u4ea7\u76d8\u70b9\u4e86\u4e00\u904d\uff0c\u53d1\u73b0\u4e86\u4e4b\u524d\u6ca1\u610f\u8bc6\u5230\u7684\u53d8\u73b0\u8def\u5f84\u3002",
  hashtags: ["#\u4e00\u4eba\u516c\u53f8", "#AI\u641e\u94b1", "#\u751f\u610f\u590d\u76d8"]
};

function getSharePreview() {
  return clone(sharePreviewFallback);
}

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
  getSharePreview,
  fetchSharePreview,
  generateShareImage,
  buildShareCaption
};
