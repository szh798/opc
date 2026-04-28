const {
  loginBySms,
  sendSmsVerificationCode
} = require("../../services/auth.service");

const SMS_COUNTDOWN_SECONDS_FALLBACK = 60;

function normalizePhone(value) {
  return String(value || "").replace(/[\s-]/g, "");
}

function isValidMainlandPhone(value) {
  return /^1[3-9]\d{9}$/.test(normalizePhone(value));
}

function showToast(title) {
  wx.showToast({
    title,
    icon: "none"
  });
}

Page({
  data: {
    phone: "",
    code: "",
    agreementAccepted: false,
    sending: false,
    loginPending: false,
    cooldownSeconds: 0
  },

  onLoad() {
    this.eventChannel = this.getOpenerEventChannel ? this.getOpenerEventChannel() : null;
  },

  onUnload() {
    this.clearCountdown();
  },

  handlePhoneInput(event) {
    this.setData({
      phone: normalizePhone((event && event.detail && event.detail.value) || "")
    });
  },

  handleCodeInput(event) {
    this.setData({
      code: String((event && event.detail && event.detail.value) || "").replace(/\D/g, "").slice(0, 8)
    });
  },

  toggleAgreement() {
    this.setData({
      agreementAccepted: !this.data.agreementAccepted
    });
  },

  ensureAgreementAccepted() {
    if (this.data.agreementAccepted) {
      return true;
    }

    showToast("请先勾选服务协议和隐私政策");
    return false;
  },

  async handleSendCode() {
    if (this.data.sending || this.data.cooldownSeconds > 0) {
      return;
    }

    if (!this.ensureAgreementAccepted()) {
      return;
    }

    const phone = normalizePhone(this.data.phone);
    if (!isValidMainlandPhone(phone)) {
      showToast("请输入有效手机号");
      return;
    }

    this.setData({
      sending: true
    });

    try {
      const result = await sendSmsVerificationCode(phone, "login");
      const cooldownSeconds = Number(result && result.cooldownSeconds) || SMS_COUNTDOWN_SECONDS_FALLBACK;
      const devCode = String((result && result.devCode) || "").trim();

      this.setData({
        ...(devCode ? { code: devCode } : {})
      });
      this.startCountdown(cooldownSeconds);
      showToast(devCode ? "已填入测试验证码" : "验证码已发送");
    } catch (error) {
      showToast((error && error.message) || "验证码发送失败，请稍后重试");
    } finally {
      this.setData({
        sending: false
      });
    }
  },

  async handleLogin() {
    if (this.data.loginPending) {
      return;
    }

    if (!this.ensureAgreementAccepted()) {
      return;
    }

    const phone = normalizePhone(this.data.phone);
    const code = String(this.data.code || "").trim();

    if (!isValidMainlandPhone(phone)) {
      showToast("请输入有效手机号");
      return;
    }

    if (!/^\d{4,8}$/.test(code)) {
      showToast("请输入验证码");
      return;
    }

    this.setData({
      loginPending: true
    });

    try {
      const loginResult = await loginBySms(phone, code);
      if (this.eventChannel && typeof this.eventChannel.emit === "function") {
        this.eventChannel.emit("phoneLoginSuccess", {
          loginResult,
          loginMethod: "sms"
        });
      }
      showToast("登录成功");
      setTimeout(() => {
        wx.navigateBack({
          delta: 1,
          fail: () => {
            wx.redirectTo({
              url: "/pages/conversation/conversation"
            });
          }
        });
      }, 300);
    } catch (error) {
      showToast((error && error.message) || "手机号登录失败，请重新获取验证码后再试");
    } finally {
      this.setData({
        loginPending: false
      });
    }
  },

  handleLegalTap(event) {
    const type = event.currentTarget.dataset.type === "privacy" ? "privacy" : "terms";

    wx.navigateTo({
      url: `/pages/legal/legal?type=${type}`,
      fail: () => {
        showToast("法律文档打开失败");
      }
    });
  },

  startCountdown(seconds) {
    this.clearCountdown();
    const safeSeconds = Math.max(1, Number(seconds) || SMS_COUNTDOWN_SECONDS_FALLBACK);
    this.setData({
      cooldownSeconds: safeSeconds
    });

    this.countdownTimer = setInterval(() => {
      const nextSeconds = Math.max(0, Number(this.data.cooldownSeconds) - 1);
      this.setData({
        cooldownSeconds: nextSeconds
      });

      if (nextSeconds <= 0) {
        this.clearCountdown();
      }
    }, 1000);
  },

  clearCountdown() {
    if (!this.countdownTimer) {
      return;
    }

    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }
});
