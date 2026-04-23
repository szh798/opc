const { getDefaultAvatarUrl, normalizeAvatarUrl } = require("./user-display");

const DEFAULT_AVATAR_URL = getDefaultAvatarUrl();
const resolvedAvatarUrlCache = Object.create(null);
const pendingAvatarUrlResolution = Object.create(null);
const AVATAR_CACHE_DIR_NAME = "avatar-cache";

function isHttpAvatarUrl(value = "") {
  return /^http:\/\//i.test(String(value || "").trim());
}

function safeGetWechatApi() {
  return typeof wx === "undefined" ? null : wx;
}

function resolveAvatarRenderUrl(sourceUrl = "") {
  const normalizedAvatarUrl = normalizeAvatarUrl(sourceUrl);
  if (!normalizedAvatarUrl || normalizedAvatarUrl === DEFAULT_AVATAR_URL || !isHttpAvatarUrl(normalizedAvatarUrl)) {
    return Promise.resolve(normalizedAvatarUrl);
  }

  if (resolvedAvatarUrlCache[normalizedAvatarUrl]) {
    return Promise.resolve(resolvedAvatarUrlCache[normalizedAvatarUrl]);
  }

  if (pendingAvatarUrlResolution[normalizedAvatarUrl]) {
    return pendingAvatarUrlResolution[normalizedAvatarUrl];
  }

  const pendingTask = tryResolveAvatarByImageInfo(normalizedAvatarUrl)
    .then((resolvedPath) => resolvedPath || tryResolveAvatarByRequest(normalizedAvatarUrl))
    .then((resolvedPath) => {
      const finalAvatarUrl = String(resolvedPath || normalizedAvatarUrl).trim() || normalizedAvatarUrl;
      resolvedAvatarUrlCache[normalizedAvatarUrl] = finalAvatarUrl;
      return finalAvatarUrl;
    })
    .catch(() => normalizedAvatarUrl)
    .finally(() => {
      delete pendingAvatarUrlResolution[normalizedAvatarUrl];
    });

  pendingAvatarUrlResolution[normalizedAvatarUrl] = pendingTask;
  return pendingTask;
}

function tryResolveAvatarByImageInfo(sourceUrl = "") {
  return new Promise((resolve) => {
    const wxApi = safeGetWechatApi();
    if (!wxApi || typeof wxApi.getImageInfo !== "function") {
      resolve("");
      return;
    }

    wxApi.getImageInfo({
      src: sourceUrl,
      success(result) {
        const resolvedPath = String((result && (result.path || result.tempFilePath)) || "").trim();
        resolve(resolvedPath);
      },
      fail() {
        resolve("");
      }
    });
  });
}

function tryResolveAvatarByRequest(sourceUrl = "") {
  return new Promise((resolve) => {
    const wxApi = safeGetWechatApi();
    if (
      !wxApi ||
      typeof wxApi.request !== "function" ||
      typeof wxApi.getFileSystemManager !== "function" ||
      !wxApi.env ||
      !wxApi.env.USER_DATA_PATH
    ) {
      resolve("");
      return;
    }

    wxApi.request({
      url: sourceUrl,
      method: "GET",
      responseType: "arraybuffer",
      success(response) {
        const statusCode = Number(response && response.statusCode);
        const arrayBuffer = response && response.data;
        if (
          !Number.isFinite(statusCode) ||
          statusCode < 200 ||
          statusCode >= 300 ||
          !arrayBuffer ||
          !arrayBuffer.byteLength
        ) {
          resolve("");
          return;
        }

        const extension = resolveAvatarExtension(sourceUrl, response && response.header);
        const cacheDir = `${wxApi.env.USER_DATA_PATH}/${AVATAR_CACHE_DIR_NAME}`;
        const filePath = `${cacheDir}/${hashAvatarUrl(sourceUrl)}.${extension}`;
        const fileSystemManager = wxApi.getFileSystemManager();

        ensureAvatarCacheDir(fileSystemManager, cacheDir)
          .then(() => writeAvatarCacheFile(fileSystemManager, filePath, arrayBuffer))
          .then(() => resolve(filePath))
          .catch(() => resolve(""));
      },
      fail() {
        resolve("");
      }
    });
  });
}

function ensureAvatarCacheDir(fileSystemManager, dirPath) {
  return new Promise((resolve) => {
    fileSystemManager.mkdir({
      dirPath,
      recursive: true,
      success() {
        resolve();
      },
      fail(error) {
        const errMsg = String((error && error.errMsg) || "").toLowerCase();
        if (errMsg.includes("file already exists")) {
          resolve();
          return;
        }

        resolve();
      }
    });
  });
}

function writeAvatarCacheFile(fileSystemManager, filePath, arrayBuffer) {
  return new Promise((resolve, reject) => {
    fileSystemManager.writeFile({
      filePath,
      data: arrayBuffer,
      success() {
        resolve(filePath);
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function resolveAvatarExtension(sourceUrl = "", headers = {}) {
  const contentType = resolveHeaderValue(headers, "content-type").toLowerCase();
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }

  const normalizedUrl = String(sourceUrl || "").trim().toLowerCase();
  if (/\.png(?:$|[?#])/.test(normalizedUrl)) {
    return "png";
  }
  if (/\.webp(?:$|[?#])/.test(normalizedUrl)) {
    return "webp";
  }

  return "jpg";
}

function resolveHeaderValue(headers = {}, headerName = "") {
  const safeHeaders = headers && typeof headers === "object" ? headers : {};
  const targetName = String(headerName || "").trim().toLowerCase();
  const matchedKey = Object.keys(safeHeaders).find((key) => String(key || "").trim().toLowerCase() === targetName);
  return matchedKey ? String(safeHeaders[matchedKey] || "").trim() : "";
}

function hashAvatarUrl(value = "") {
  const source = String(value || "");
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

module.exports = {
  resolveAvatarRenderUrl
};
