const { fetchProfile } = require("../../services/profile.service");
const { uploadCurrentUserAvatar } = require("../../services/user.service");
const { getAccessToken, logout } = require("../../services/auth.service");
const { ensureLoggedIn } = require("../../utils/auth-guard");
const { getNavMetrics } = require("../../utils/nav");
const { buildDisplayUser, normalizeAvatarUrl, resolveAvatarAfterError } = require("../../utils/user-display");
const { resolveAvatarRenderUrl } = require("../../utils/avatar-render");

function buildStageLabel(user = {}, fallback = "") {
  const stage = String(user.stage || "").trim();
  const streakDays = Number(user.streakDays);

  if (!stage) {
    return fallback;
  }

  if (Number.isFinite(streakDays) && streakDays > 0) {
    return `${stage} · 连续打卡 ${streakDays} 天`;
  }

  return stage;
}

function mergeProfileWithUser(profile = {}, user = {}) {
  const normalizedProfile = normalizeProfile(profile);
  const displayUser = buildDisplayUser(
    {
      ...normalizedProfile,
      ...user,
      name: String(user.nickname || user.name || normalizedProfile.name || "访客").trim() || "访客",
      avatarUrl: normalizeAvatarUrl(user.avatarUrl || normalizedProfile.avatarUrl)
    },
    {
      fallbackName: "访客",
      fallbackInitial: "访"
    }
  );

  return {
    ...normalizedProfile,
    name: displayUser.name,
    initial: displayUser.initial,
    avatarUrl: displayUser.avatarUrl,
    stageLabel: buildStageLabel(user, normalizedProfile.stageLabel || "")
  };
}

function normalizeProfile(profile = {}) {
  const safeProfile = profile && typeof profile === "object" ? profile : {};
  const safeMeta = safeProfile.profileMeta && typeof safeProfile.profileMeta === "object"
    ? safeProfile.profileMeta
    : {};
  const safeVisibility = safeMeta.visibility && typeof safeMeta.visibility === "object"
    ? safeMeta.visibility
    : {};
  const safeEvidence = safeMeta.evidence && typeof safeMeta.evidence === "object"
    ? safeMeta.evidence
    : {};
  const safeGeneration = safeMeta.generation && typeof safeMeta.generation === "object"
    ? safeMeta.generation
    : {};

  return {
    ...safeProfile,
    radar: Array.isArray(safeProfile.radar) ? safeProfile.radar : [],
    strengths: Array.isArray(safeProfile.strengths) ? safeProfile.strengths : [],
    traits: Array.isArray(safeProfile.traits) ? safeProfile.traits : [],
    profileMeta: {
      phase: String(safeMeta.phase || "").trim() || "empty",
      visibility: {
        radar: !!safeVisibility.radar,
        strengths: !!safeVisibility.strengths,
        traits: !!safeVisibility.traits,
        ikigai: !!safeVisibility.ikigai
      },
      evidence: {
        userFactCount: Number(safeEvidence.userFactCount || 0),
        factDimensions: Array.isArray(safeEvidence.factDimensions) ? safeEvidence.factDimensions : [],
        hasAssetFlowSnapshot: !!safeEvidence.hasAssetFlowSnapshot,
        hasAssetReport: !!safeEvidence.hasAssetReport
      },
      generation: {
        strengths: String(safeGeneration.strengths || "").trim() || "none",
        traits: String(safeGeneration.traits || "").trim() || "none",
        ikigai: String(safeGeneration.ikigai || "").trim() || "none"
      },
      hint: String(safeMeta.hint || "").trim() || "先聊几轮，档案还没开始积累。"
    }
  };
}

function normalizeStrengthItem(item) {
  if (item && typeof item === "object") {
    return { ...item };
  }

  return {
    label: String(item || "").trim()
  };
}

function normalizeTraitItem(item) {
  if (item && typeof item === "object") {
    return { ...item };
  }

  return {
    label: String(item || "").trim(),
    tone: "blue"
  };
}

function buildRuntimeState() {
  const app = typeof getApp === "function" ? getApp() : null;
  const runtimeConfig = (app && app.globalData && app.globalData.runtimeConfig) || {};
  const user = (app && app.globalData && app.globalData.user) || {};
  const accessToken = getAccessToken();
  const loginMode = String(user.loginMode || "").trim();
  const loggedIn = !!user.loggedIn;
  const isDevEnv = String(runtimeConfig.env || "").trim() !== "prod";
  const debugInfoVisible = isDevEnv && !loggedIn;

  return {
    useMock: false,
    baseURL: String(runtimeConfig.baseURL || ""),
    hasToken: !!accessToken,
    loggedIn,
    loginMode: loginMode || (loggedIn ? "active-session" : "guest"),
    userId: String(user.id || ""),
    userName: String(user.nickname || user.name || ""),
    modeLabel: "真实接口",
    authLabel: loggedIn ? "已登录" : "未登录",
    devPanelVisible: debugInfoVisible,
    debugInfoVisible,
    accountCardVisible: debugInfoVisible || loggedIn
  };
}

function syncAppUser(nextUser = {}) {
  const app = typeof getApp === "function" ? getApp() : null;

  if (app && app.globalData) {
    app.globalData.user = {
      ...app.globalData.user,
      ...nextUser
    };
  }

  return (app && app.globalData && app.globalData.user) || nextUser;
}

function bumpSidebarDataVersion() {
  const app = typeof getApp === "function" ? getApp() : null;
  if (!app || !app.globalData) {
    return;
  }

  app.globalData.sidebarDataVersion = Number(app.globalData.sidebarDataVersion || 0) + 1;
}

const AVATAR_COMPRESS_THRESHOLD_BYTES = 600 * 1024;
const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_COMPRESSION_QUALITIES = [82, 72, 62];

function selectAvatarSource() {
  return new Promise((resolve) => {
    if (typeof wx === "undefined" || typeof wx.showActionSheet !== "function") {
      resolve("");
      return;
    }

    wx.showActionSheet({
      itemList: ["从相册选择", "拍一张"],
      success(result) {
        resolve(result.tapIndex === 1 ? "camera" : "album");
      },
      fail(error) {
        const errMsg = String((error && error.errMsg) || "").toLowerCase();
        if (errMsg.includes("cancel")) {
          resolve("");
          return;
        }

        resolve("");
      }
    });
  });
}

function chooseAvatarImage(sourceType = "album") {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.chooseImage !== "function") {
      reject(new Error("chooseImage_unavailable"));
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: [sourceType],
      success(result) {
        const tempFile = Array.isArray(result.tempFiles) ? result.tempFiles[0] : null;
        const tempFilePath = String((tempFile && tempFile.path) || result.tempFilePaths?.[0] || "").trim();

        if (!tempFilePath) {
          reject(new Error("avatar_file_missing"));
          return;
        }

        resolve({
          tempFilePath,
          size: Number((tempFile && tempFile.size) || 0)
        });
      },
      fail(error) {
        const errMsg = String((error && error.errMsg) || "").toLowerCase();
        if (errMsg.includes("cancel")) {
          resolve(null);
          return;
        }

        reject(new Error(errMsg || "choose_avatar_failed"));
      }
    });
  });
}

function compressAvatar(tempFilePath = "", quality = 78) {
  return new Promise((resolve) => {
    if (!tempFilePath || typeof wx === "undefined" || typeof wx.compressImage !== "function") {
      resolve(tempFilePath);
      return;
    }

    wx.compressImage({
      src: tempFilePath,
      quality,
      success(result) {
        resolve(String((result && result.tempFilePath) || tempFilePath));
      },
      fail() {
        resolve(tempFilePath);
      }
    });
  });
}

function readAvatarFileSize(tempFilePath = "") {
  return new Promise((resolve) => {
    if (!tempFilePath || typeof wx === "undefined" || typeof wx.getFileSystemManager !== "function") {
      resolve(0);
      return;
    }

    wx.getFileSystemManager().getFileInfo({
      filePath: tempFilePath,
      success(result) {
        resolve(Number((result && result.size) || 0));
      },
      fail() {
        resolve(0);
      }
    });
  });
}

async function prepareAvatarForUpload(tempFilePath = "", fileSize = 0) {
  if (!tempFilePath) {
    throw new Error("avatar_file_missing");
  }

  let currentFilePath = tempFilePath;
  let currentFileSize = Number(fileSize || 0);

  if (!currentFileSize) {
    currentFileSize = await readAvatarFileSize(currentFilePath);
  }

  if (currentFileSize > AVATAR_COMPRESS_THRESHOLD_BYTES) {
    for (const quality of AVATAR_COMPRESSION_QUALITIES) {
      currentFilePath = await compressAvatar(currentFilePath, quality);
      currentFileSize = await readAvatarFileSize(currentFilePath);

      if (!currentFileSize || currentFileSize <= AVATAR_UPLOAD_MAX_BYTES) {
        break;
      }
    }
  }

  if (currentFileSize > AVATAR_UPLOAD_MAX_BYTES) {
    throw new Error("avatar_too_large");
  }

  return {
    tempFilePath: currentFilePath,
    size: currentFileSize
  };
}

function resolveAvatarMimeTypeFromPath(filePath = "") {
  const normalized = String(filePath || "").toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
}

function readAvatarMimeType(tempFilePath = "") {
  return new Promise((resolve) => {
    if (!tempFilePath || typeof wx === "undefined" || typeof wx.getImageInfo !== "function") {
      resolve(resolveAvatarMimeTypeFromPath(tempFilePath));
      return;
    }

    wx.getImageInfo({
      src: tempFilePath,
      success(result) {
        const type = String((result && result.type) || "").trim().toLowerCase();
        if (type === "png") {
          resolve("image/png");
          return;
        }
        if (type === "webp") {
          resolve("image/webp");
          return;
        }
        resolve("image/jpeg");
      },
      fail() {
        resolve(resolveAvatarMimeTypeFromPath(tempFilePath));
      }
    });
  });
}

function readAvatarAsDataUrl(tempFilePath = "", mimeType = "image/jpeg") {
  return new Promise((resolve, reject) => {
    if (!tempFilePath || typeof wx === "undefined" || typeof wx.getFileSystemManager !== "function") {
      reject(new Error("filesystem_unavailable"));
      return;
    }

    wx.getFileSystemManager().readFile({
      filePath: tempFilePath,
      encoding: "base64",
      success(result) {
        const base64 = String((result && result.data) || "").trim();
        if (!base64) {
          reject(new Error("avatar_base64_empty"));
          return;
        }

        resolve(`data:${mimeType};base64,${base64}`);
      },
      fail(error) {
        reject(new Error((error && error.errMsg) || "read_avatar_failed"));
      }
    });
  });
}

Page({
  data: {
    loading: true,
    error: false,
    hasRealProfile: false,
    accountBusy: false,
    avatarUploading: false,
    accountError: "",
    profileAvatarLoadFailed: false,
    profileDisplayAvatarUrl: "",
    navMetrics: getNavMetrics(),
    headerStyle: "",
    updateMode: false,
    profile: {
      initial: "\u5c0f",
      name: "\u5c0f\u660e",
      byline: "\u6765\u81ea \u4e00\u6811\u00b7\u6316\u5b9d",
      stageLabel: "",
      radar: [],
      strengths: [],
      traits: [],
      avatarUrl: "",
      assetReport: {
        hasReport: false,
        finalReport: "",
        reportBrief: "",
        reportVersion: "",
        generatedAt: "",
        isReview: false,
        sections: []
      },
      profileMeta: {
        phase: "empty",
        visibility: {
          radar: false,
          strengths: false,
          traits: false,
          ikigai: false
        },
        evidence: {
          userFactCount: 0,
          factDimensions: [],
          hasAssetFlowSnapshot: false,
          hasAssetReport: false
        },
        generation: {
          strengths: "none",
          traits: "none",
          ikigai: "none"
        },
        hint: "先聊几轮，档案还没开始积累。"
      }
    },
    runtime: {
      useMock: false,
      baseURL: "",
      hasToken: false,
      loggedIn: false,
      loginMode: "guest",
      userId: "",
      userName: "",
      modeLabel: "",
      authLabel: ""
    }
  },

  onLoad(options) {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    this.syncRuntimeState();

    if (options && options.mode === "update") {
      const pending = wx.getStorageSync("pendingAssetUpdates");
      if (pending) {
        this.setData({ updateMode: true, pendingUpdates: pending });
      }
    }

    this.loadProfile();
  },

  onShow() {
    if (!ensureLoggedIn()) {
      return;
    }

    this.syncLayout();
    this.syncRuntimeState();
  },

  handleBack() {
    wx.navigateBack({ fail: () => wx.switchTab && wx.switchTab({ url: "/pages/index/index" }) });
  },

  syncLayout() {
    const navMetrics = getNavMetrics(true);

    this.setData({
      navMetrics,
      headerStyle: `padding-top: ${navMetrics.headerTop}px; min-height: ${navMetrics.headerTop + navMetrics.menuHeight + 18}px;`
    });
  },

  syncProfileAvatarState(sourceAvatarUrl, preferredDisplayAvatarUrl = "") {
    const normalizedAvatarUrl = normalizeAvatarUrl(sourceAvatarUrl);
    const initialDisplayAvatarUrl = String(preferredDisplayAvatarUrl || normalizedAvatarUrl).trim() || normalizedAvatarUrl;
    this.avatarResolveToken = Number(this.avatarResolveToken || 0) + 1;
    const resolveToken = this.avatarResolveToken;

    this.setData({
      profileDisplayAvatarUrl: initialDisplayAvatarUrl,
      profileAvatarLoadFailed: false
    });

    resolveAvatarRenderUrl(normalizedAvatarUrl).then((resolvedAvatarUrl) => {
      const nextAvatarUrl = String(resolvedAvatarUrl || "").trim();
      if (!nextAvatarUrl || nextAvatarUrl === initialDisplayAvatarUrl || resolveToken !== this.avatarResolveToken) {
        return;
      }

      this.setData({
        profileDisplayAvatarUrl: nextAvatarUrl,
        profileAvatarLoadFailed: false
      });
    });
  },

  syncRuntimeState(extraUser = null) {
    const appUser = extraUser || ((typeof getApp === "function" && getApp().globalData && getApp().globalData.user) || {});
    const mergedProfile = mergeProfileWithUser(this.data.profile, appUser);

    this.setData({
      runtime: buildRuntimeState(),
      profile: mergedProfile,
      profileAvatarLoadFailed: false
    });
    this.syncProfileAvatarState(mergedProfile.avatarUrl);
  },

  loadProfile() {
    this.setData({
      loading: true,
      error: false
    });

    fetchProfile()
      .then((data) => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        let merged = mergeProfileWithUser(normalizeProfile(data || {}), user);
        
        if (this.data.updateMode && this.data.pendingUpdates) {
          const p = this.data.pendingUpdates;
          merged = {
            ...merged,
            radar: merged.radar.map(r => {
              const up = p.radar.find(ur => ur.label === r.label);
              return up ? { ...r, value: up.value, changed: up.changed } : r;
            }),
            strengths: [
              ...merged.strengths.map(normalizeStrengthItem),
              ...(p.strengths || []).map(s => ({ ...s }))
            ],
            traits: [
              ...merged.traits.map(normalizeTraitItem),
              ...(p.traits || []).map(t => ({ ...t }))
            ],
            ikigai: p.ikigai || merged.ikigai,
            ikigaiChanged: p.ikigaiChanged
          };
        }

        const hasRealProfile = !!(merged.profileMeta && merged.profileMeta.visibility && merged.profileMeta.visibility.radar);

        this.setData({
          loading: false,
          error: false,
          hasRealProfile,
          profile: merged,
          profileAvatarLoadFailed: false
        });
        this.syncProfileAvatarState(merged.avatarUrl);
      })
      .catch(() => {
        const app = typeof getApp === "function" ? getApp() : null;
        const user = (app && app.globalData && app.globalData.user) || {};

        const errorProfile = mergeProfileWithUser(normalizeProfile(this.data.profile), user);
        this.setData({
          loading: false,
          error: true,
          hasRealProfile: !!(errorProfile.profileMeta && errorProfile.profileMeta.visibility && errorProfile.profileMeta.visibility.radar),
          profile: errorProfile,
          profileAvatarLoadFailed: false
        });
        this.syncProfileAvatarState(errorProfile.avatarUrl);
      });
  },

  handleRetry() {
    this.loadProfile();
  },

  async handleAvatarTap() {
    if (this.data.avatarUploading) {
      return;
    }

    if (!this.data.runtime.loggedIn) {
      wx.showToast({
        title: "请先登录后再修改头像",
        icon: "none"
      });
      return;
    }

    const sourceType = await selectAvatarSource();
    if (!sourceType) {
      return;
    }

    try {
      const pickedFile = await chooseAvatarImage(sourceType);
      if (!pickedFile || !pickedFile.tempFilePath) {
        return;
      }

      this.setData({
        avatarUploading: true
      });

      wx.showLoading({
        title: "上传中",
        mask: true
      });

      const preparedAvatar = await prepareAvatarForUpload(pickedFile.tempFilePath, pickedFile.size);
      const uploadFilePath = preparedAvatar.tempFilePath;
      const mimeType = await readAvatarMimeType(uploadFilePath);
      const avatarDataUrl = await readAvatarAsDataUrl(uploadFilePath, mimeType);
      const nextUser = await uploadCurrentUserAvatar(avatarDataUrl);
      const mergedUser = syncAppUser(nextUser);

      bumpSidebarDataVersion();

      this.setData({
        profile: mergeProfileWithUser(this.data.profile, mergedUser),
        profileAvatarLoadFailed: false,
        avatarUploading: false
      });
      this.syncRuntimeState(mergedUser);
      this.syncProfileAvatarState(mergedUser.avatarUrl, uploadFilePath);

      wx.hideLoading();
      wx.showToast({
        title: "头像已更新",
        icon: "success"
      });
    } catch (error) {
      console.warn("[profile] avatar upload failed", error);
      this.setData({
        avatarUploading: false
      });

      wx.hideLoading();
      wx.showToast({
        title: "头像上传失败，请重试",
        icon: "none"
      });
    }
  },

  async handleLogout() {
    if (this.data.accountBusy) {
      return;
    }

    this.setData({
      accountBusy: true,
      accountError: ""
    });

    try {
      await logout();
      const app = typeof getApp === "function" ? getApp() : null;
      const currentUser = (app && app.globalData && app.globalData.user) || {};
      const nextUser = syncAppUser({
        ...currentUser,
        loggedIn: false,
        loginMode: "",
        openId: "",
        unionId: ""
      });
      bumpSidebarDataVersion();

      this.setData({
        accountBusy: false,
        accountError: "",
        profile: mergeProfileWithUser(this.data.profile, nextUser),
        profileAvatarLoadFailed: false
      });
      this.syncProfileAvatarState(nextUser.avatarUrl);

      this.syncRuntimeState(nextUser);

      wx.showToast({
        title: "已退出登录",
        icon: "none"
      });
    } catch (error) {
      this.setData({
        accountBusy: false,
        accountError: "退出失败，请稍后重试"
      });
    }
  },

  handleAcceptUpdate() {
    const p = this.data.profile;
    const cleanProfile = {
      ...p,
      radar: p.radar.map(r => ({ label: r.label, value: r.value })),
      strengths: p.strengths.map(s => s.label || s),
      traits: p.traits.map(t => ({ label: t.label, tone: t.tone })),
      ikigai: p.ikigai
    };

    // In a real app, send API request here
    this.setData({
      profile: cleanProfile,
      updateMode: false
    });

    wx.removeStorageSync("pendingAssetUpdates");
    wx.showToast({ title: "资产已合并更新", icon: "success" });
    
    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  handleRejectUpdate() {
    this.setData({ updateMode: false });
    wx.removeStorageSync("pendingAssetUpdates");
    wx.navigateBack();
  },

  handleProfileAvatarError() {
    const fallbackAvatarUrl = resolveAvatarAfterError(this.data.profileDisplayAvatarUrl);
    if (fallbackAvatarUrl) {
      this.setData({
        profileDisplayAvatarUrl: fallbackAvatarUrl,
        profileAvatarLoadFailed: false
      });
      return;
    }

    if (this.data.profileAvatarLoadFailed) {
      return;
    }

    this.setData({
      profileAvatarLoadFailed: true
    });
  }
});
