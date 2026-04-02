let cachedMetrics = null;

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getSystemInfoSafe() {
  if (typeof wx === "undefined") {
    return {};
  }

  try {
    if (typeof wx.getWindowInfo === "function") {
      return wx.getWindowInfo() || {};
    }

    if (typeof wx.getSystemInfoSync === "function") {
      return wx.getSystemInfoSync() || {};
    }
  } catch (error) {
    return {};
  }

  return {};
}

function getMenuButtonRectSafe() {
  if (typeof wx === "undefined" || typeof wx.getMenuButtonBoundingClientRect !== "function") {
    return null;
  }

  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    if (!rect || !rect.top || !rect.height) {
      return null;
    }

    return rect;
  } catch (error) {
    return null;
  }
}

function buildNavMetrics() {
  const systemInfo = getSystemInfoSafe();
  const statusBarHeight = safeNumber(systemInfo.statusBarHeight, 0);
  const windowWidth = safeNumber(systemInfo.windowWidth, 375);
  const menuRect = getMenuButtonRectSafe();

  const menuHeight = safeNumber(menuRect && menuRect.height, 32);
  const menuTop = safeNumber(menuRect && menuRect.top, statusBarHeight + 8);
  const verticalGap = Math.max(menuTop - statusBarHeight, 8);
  const navBarHeight = menuHeight + verticalGap * 2;
  const headerTop = menuRect ? menuTop : statusBarHeight + verticalGap;
  const sideMinWidth = Math.max(56, Math.round(windowWidth * 0.18));
  const labelMaxWidth = Math.max(120, windowWidth - sideMinWidth * 2 - 88);

  return {
    statusBarHeight,
    windowWidth,
    menuHeight,
    menuTop,
    verticalGap,
    navBarHeight,
    headerTop,
    sideMinWidth,
    labelMaxWidth
  };
}

function getNavMetrics(forceRefresh = false) {
  if (!cachedMetrics || forceRefresh) {
    cachedMetrics = buildNavMetrics();
  }

  return cachedMetrics;
}

module.exports = {
  getNavMetrics
};
