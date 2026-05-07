const DEFAULT_AVATAR_URL = "/assets/images/default-avatar-atree.svg";
const WECHAT_AVATAR_HOSTS = [
  "thirdwx.qlogo.cn",
  "wx.qlogo.cn",
  "mmbiz.qpic.cn",
  "mmhead.qpic.cn"
];

function resolveDisplayName(source = {}, fallback = "\u8bbf\u5ba2") {
  const safeSource = source && typeof source === "object" ? source : {};
  const name = String(safeSource.nickname || safeSource.name || "").trim();
  return name || fallback;
}

function getDefaultAvatarUrl() {
  return DEFAULT_AVATAR_URL;
}

function normalizeAvatarUrl(value = "") {
  const avatarUrl = String(value || "").trim();
  if (!avatarUrl || avatarUrl === "null" || avatarUrl === "undefined") {
    return DEFAULT_AVATAR_URL;
  }

  if (isWechatAvatarUrl(avatarUrl)) {
    return DEFAULT_AVATAR_URL;
  }

  return avatarUrl;
}

function isWechatAvatarUrl(value = "") {
  const avatarUrl = String(value || "").trim();
  if (!/^https?:\/\//i.test(avatarUrl)) {
    return false;
  }

  const match = avatarUrl.match(/^https?:\/\/([^/?#:]+)/i);
  const host = String((match && match[1]) || "").toLowerCase();
  return WECHAT_AVATAR_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

function resolveAvatarAfterError(currentAvatarUrl = "") {
  const avatarUrl = String(currentAvatarUrl || "").trim();
  if (!avatarUrl || avatarUrl === DEFAULT_AVATAR_URL) {
    return "";
  }

  return DEFAULT_AVATAR_URL;
}

function buildDisplayUser(source = {}, options = {}) {
  const safeSource = source && typeof source === "object" ? source : {};
  const fallbackName = String(options.fallbackName || "\u8bbf\u5ba2").trim() || "\u8bbf\u5ba2";
  const fallbackInitial = String(options.fallbackInitial || fallbackName.slice(0, 1) || "\u8bbf").trim() || "\u8bbf";
  const name = resolveDisplayName(safeSource, fallbackName);
  const explicitInitial = String(safeSource.initial || "").trim();
  const initial = explicitInitial || name.slice(0, 1) || fallbackInitial;

  return {
    ...safeSource,
    name,
    nickname: String(safeSource.nickname || name).trim() || name,
    initial,
    avatarUrl: normalizeAvatarUrl(safeSource.avatarUrl),
    subtitle: String(safeSource.subtitle || options.subtitle || "").trim()
  };
}

module.exports = {
  buildDisplayUser,
  getDefaultAvatarUrl,
  isWechatAvatarUrl,
  normalizeAvatarUrl,
  resolveAvatarAfterError,
  resolveDisplayName
};
