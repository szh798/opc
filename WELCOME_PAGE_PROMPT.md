# 前端编码 Prompt — Welcome 欢迎页

## 快速需求清单

### 🎯 目标
实现欢迎页面 (`pages/welcome/welcome`)，隐藏状态栏，全屏展示品牌 + 核心文案 + CTA。

### ❌ 不要包含
- 时间显示（9:41）
- 信号 / 电量 icon
- 微信导航栏 / tabbar
- 滚动条或超出屏幕的内容

### ✅ 必须包含
```
顶部安全区 (safe-area)
  ↓
品牌名称：一树OPC（黑色 #0D0D0D，56px粗体）
  ↓ 16px gap
副标题：你的一人公司搚子（灰色 #999999，16px）
  ↓ 48px gap（大留白）
核心文案：你负责跟我聊天，我负责帮你赚钱。（黑色 #0D0D0D，32px粗体，多行）
  ↓ 64px gap（超大留白）
CTA按钮：跟一树聊聊？（黑色背景 #0D0D0D，白字，56px高，圆角28px）
  ↓ 80px gap（撑开到底部）
社会证明：2,847位一人公司创业者正在这里精钱（浅灰 #CCCCCC，14px）

底部安全区 (safe-area)
```

### 📱 响应式规则
```js
// 根据屏幕宽度调整字号
if (screenWidth < 375) {
  brandSize = 44px;     // 小屏手机
  valueSize = 28px;
} else if (screenWidth < 414) {
  brandSize = 48px;     // 标准size
  valueSize = 32px;
} else {
  brandSize = 56px;     // 大屏手机
  valueSize = 36px;
}
```

### 🎨 色值速记
```
黑色文字: #0D0D0D
灰色文字: #999999
浅灰文字: #CCCCCC
背景: #FAFAFA（接近白）
按钮hover: #333333
按钮pressed: #111111
```

### 🔘 按钮行为
- 点击 → `wx.navigateTo('/pages/conversation/conversation?scene=onboarding_intro')`
- 支持 hover 态（背景变深）
- 支持 disabled 态（变浅灰）
- 不能超过 100% 宽度（应该 auto width，min 200px）

### ⚙️ 技术要点
```js
// app.json - 隐藏导航栏
{
  "pages": ["pages/welcome/welcome", "..."],
  "window": {
    "navigationStyle": "custom"  // 关键！隐藏顶部
  }
}

// pages/welcome/welcome.wxml
<view class="welcome">
  <view class="brand">一树OPC</view>
  <view class="tagline">你的一人公司搚子</view>
  <view class="value-prop">你负责跟我聊天，<br>我负责帮你赚钱。</view>
  <button class="cta-btn" bindtap="handleJoin">跟一树聊聊？</button>
  <view class="social-proof">2,847位一人公司创业者正在这里精钱</view>
</view>

// pages/welcome/welcome.page
page {
  background: #FAFAFA;
}
.welcome {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 0 32px;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
.brand {
  font-size: 48px;
  font-weight: 700;
  color: #0D0D0D;
}
.tagline {
  margin-top: 16px;
  font-size: 16px;
  color: #999999;
}
.value-prop {
  margin-top: 48px;
  font-size: 32px;
  font-weight: 700;
  color: #0D0D0D;
  line-height: 1.4;
}
.cta-btn {
  margin-top: 64px;
  background: #0D0D0D;
  color: white;
  border-radius: 28px;
  padding: 0 48px;
  height: 56px;
  width: auto;
  min-width: 200px;
  font-size: 18px;
  font-weight: 600;
}
.cta-btn:active {
  background: #111111;
}
.social-proof {
  margin-top: 80px;
  font-size: 14px;
  color: #CCCCCC;
  position: absolute;
  bottom: 32px + env(safe-area-inset-bottom);
  left: 32px;
}
```

### ✅ 验收检查
- [ ] 页面加载不显示时间 / 信号 / 电池
- [ ] 品牌名称清晰，至少 48px
- [ ] 四个元素(品牌/标语/文案/按钮)垂直排列，留白充足
- [ ] 按钮可点击，按下去颜色变深
- [ ] 点击按钮能跳转到 conversation 页面
- [ ] iPhone 刘海屏不被遮挡（使用 safe-area-inset）
- [ ] Android 全屏正常（无系统导航栏遮挡）
- [ ] 社会证明不被键盘遮挡

### 🐛 常见错误
- ❌ 忘记加 `navigationStyle: "custom"` → 顶部还是有导航条
- ❌ 按钮宽度 100% → 显得很丑
- ❌ 忘记 `safe-area-inset` → 被刘海遮挡或显示不全
- ❌ 字号太小 → 品牌名看不清
- ❌ 没有足够 gap → 看起来拥挤

---

**文件位置**: 
- `pages/welcome/welcome.js` / `.wxml` / `.wxss` / `.json`

**参考**: 
- 完整spec: `WELCOME_PAGE_SPEC.md`
- 原型图: `screen_01.png`

**优先级**: P1 - 必须完成
