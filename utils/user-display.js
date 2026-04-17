function resolveDisplayName(source = {}, fallback = "访客") {
  const safeSource = source && typeof source === "object" ? source : {};
  const name = String(safeSource.nickname || safeSource.name || "").trim();
  return name || fallback;
}

function resolveDisplayInitial(source = {}, fallback = "访") {
  const safeSource = source && typeof source === "object" ? source : {};
  const explicitInitial = String(safeSource.initial || "").trim();
  if (explicitInitial) {
    return explicitInitial.slice(0, 1);
  }

  const displayName = resolveDisplayName(safeSource, "");
  if (displayName) {
    return displayName.slice(0, 1);
  }

  return fallback;
}

function normalizeAvatarUrl(value = "") {
  const avatarUrl = String(value || "").trim();
  if (!avatarUrl || avatarUrl === "null" || avatarUrl === "undefined") {
    return "";
  }

  return avatarUrl;
}

function buildDisplayUser(source = {}, options = {}) {
  const safeSource = source && typeof source === "object" ? source : {};
  const fallbackName = String(options.fallbackName || "访客").trim() || "访客";
  const fallbackInitial = String(options.fallbackInitial || fallbackName.slice(0, 1) || "访").trim() || "访";
  const name = resolveDisplayName(safeSource, fallbackName);
  const initial = resolveDisplayInitial(
    {
      ...safeSource,
      name
    },
    fallbackInitial
  );

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
  normalizeAvatarUrl,
  resolveDisplayInitial,
  resolveDisplayName
};
