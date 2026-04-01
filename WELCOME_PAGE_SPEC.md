# 欢迎页面（Welcome Page）设计规范

**Base on**: screen_01.png  
**Status**: Ready for Frontend  
**Priority**: P1 - Landing Page

---

## 📐 **设计关键点**

### 隐藏的元素
- ❌ 手机状态栏（时间 9:41、信号、电量）— **不要渲染**
- ❌ 顶部底部导航栏 — **使用全屏容器，app.json设置 navigationStyle: "custom"**

### 保留的内容
✅ 品牌名称：**一树OPC**（黑色，超大粗体）  
✅ 副标题：**你的一人公司搚子**（灰色#999，中等size）  
✅ 核心文案：**你负责跟我聊天，我负责帮你赚钱。**（黑色，Large）  
✅ CTA按钮：**跟一树聊聊？**（黑色背景，白色文字，圆角）  
✅ 社会证明：**2,847位一人公司创业者正在这里精钱**（浅灰 #CCC，小号）

---

## 📏 **尺寸和布局**

### 整体容器
```
- 宽度：100% viewport
- 高度：100vh（全屏）
- 背景：#FAFAFA（接近白色）
- 内边距：左右各 32px，上下各 safe-area
- Flex垂直居中布局
```

### 各元素间距（从上到下）
```
顶部留白：120px (safe-area + 额外留白)
├─ 品牌名称 "一树OPC"
├─ gap: 16px
├─ 副标题 "你的一人公司搚子"
├─ gap: 48px（大间距）
├─ 核心文案 "你负责跟我聊天..."
├─ gap: 64px（超大间距，让按钮突出）
├─ 按钮 "跟一树聊聊？"
├─ gap: 80px（撑开到底部）
└─ 社会证明文本
```

### 品牌名称
```
字体: 粗体（font-weight: 700）
大小: 48px-56px
行高: 1.2
颜色: #0D0D0D（黑色）
文本对齐: 左对齐
```

### 副标题
```
字体: 中等（500）
大小: 16px
颜色: #999
文本对齐: 左对齐
行高: 1.5
```

### 核心文案
```
字体: 粗体（700）
大小: 32px
颜色: #0D0D0D
行高: 1.4
最大宽度: 根据内容自适应（不要强制换行）
文本对齐: 左对齐

示例文案:
"你负责跟我聊天，
我负责帮你赚钱。"
```

### CTA 按钮
```
背景色: #0D0D0D（黑色）
文字色: #FFFFFF（白色）
文字大小: 18px
文字粗细: 600
圆角: 28px（椭圆形）
高度: 56px
宽度: 根据文案长度自适应（最小 200px）
内边距: 0 48px（水平padding）
间距: 上下各 16px

按钮文案: "跟一树聊聊？"

悬停态:
- 背景色: #333（深灰）
- 按压态: 背景色 #111（更深）

禁用态:
- 背景色: #DDD
- 文字色: #999
```

### 社会证明
```
字体: 中等（500）
大小: 14px
颜色: #CCC
文本对齐: 左对齐
行高: 1.5

示例文案:
"2,847 位一人公司创业者正在这里精钱"
```

---

## 🎯 **响应式适配**

### iOS 安全区（Safe Area）
```js
// app.json
{
  "window": {
    "navigationStyle": "custom",  // 自定义导航，隐藏顶部
    "statusBarStyle": "dark"
  }
}
```

### 不同屏幕适配
```
手机宽度 < 375px：
  - 品牌名称: 40px → 44px
  - 核心文案: 28px → 30px
  - 按钮高度: 48px → 56px

手机宽度 >= 375px & < 414px：
  - 品牌名称: 48px
  - 核心文案: 32px
  - 按钮高度: 56px

手机宽度 >= 414px：
  - 品牌名称: 56px
  - 核心文案: 36px
  - 按钮高度: 56px
```

---

## ⚙️ **技术实现要点**

### 页面结构
```
pages/welcome/welcome.wxml
├─ status bar （custom app-header）
├─ main-container （flex-center）
│  ├─ brand-section
│  │  ├─ logo text "一树OPC"
│  │  └─ tagline "你的一人公司搚子"
│  ├─ value-prop "你负责跟我聊天，我负责帮你赚钱。"
│  ├─ cta-button "跟一树聊聊？" → navigate to conversation
│  └─ social-proof "2,847位一人公司创业者..."
```

### CSS 关键
```css
/* 禁用默认滚动，防止弹簧效果 */
page {
  overflow: hidden;
}

/* 高度撑满 */
.welcome-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 0 32px;
  background: #FAFAFA;
}

/* 按钮不要拉满宽度 */
.cta-button {
  width: auto;
  min-width: 200px;
  padding: 0 48px;
}
```

### 点击交互
```js
// welcome.js
handleJoinClick() {
  wx.navigateTo({
    url: '/pages/conversation/conversation?scene=onboarding_intro'
  });
}
```

---

## 🚫 **常见错误**（不要做）

- ❌ 把屏幕分成上中下三等份，显得很呆板
- ❌ 用过多颜色（应该全黑白灰）
- ❌ 按钮宽度 100%（应该自适应文字宽度）
- ❌ 字体太小（品牌名至少 48px）
- ❌ 社会证明文案太小或太浅（会看不清）
- ❌ 留白不足（上下左右都要有足够breathing room）
- ❌ 在 iPhone 刘海屏上，时间/信号条覆盖内容

---

## ✅ **验收标准**

页面加载后，必须满足：

1. [ ] 顶部不显示时间、信号、电量（状态栏隐藏）
2. [ ] 品牌名 "一树OPC" 清晰可见，50+ size
3. [ ] 核心文案在中间偏上位置，易读
4. [ ] 黑色 CTA 按钮在文案下方，可点击
5. [ ] 社会证明在底部，不被键盘遮挡
6. [ ] iPhone 刘海屏正常显示（不被刘海遮挡）
7. [ ] Android 全屏正常（不被系统导航栏遮挡）
8. [ ] 点击按钮 → 顺利跳转到 conversation 页面

---

## 🎨 **Design Token 参考**

```js
// theme/tokens.js - 补充
export const welcomePageTokens = {
  // 颜色
  bgColor: '#FAFAFA',
  brandColor: '#0D0D0D',
  textLight: '#999999',
  textLighter: '#CCCCCC',
  buttonBgHover: '#333333',
  buttonBgActive: '#111111',

  // 尺寸
  brandFontSize: '48px', // 动态根据设备调整
  taglineFontSize: '16px',
  valuePropFontSize: '32px',
  ctaFontSize: '18px',
  socialProofFontSize: '14px',

  // 间距
  pagePadding: '32px',
  elementGapSmall: '16px',
  elementGapMedium: '48px',
  elementGapLarge: '64px',
  elementGapXLarge: '80px',

  // 圆角
  buttonRadius: '28px',

  // 动画
  buttonTransition: 'all 0.2s ease'
};
```

---

## 📝 **文案**

| 位置 | 文案 | 语气 |
|------|------|------|
| 品牌 | 一树OPC | 直接、有力 |
| 副标题 | 你的一人公司搚子 | 友好、亲近 |
| 核心 | 你负责跟我聊天，我负责帮你赚钱。| 承诺、真诚 |
| 按钮 | 跟一树聊聊？ | 轻松、邀请 |
| 社证 | 2,847位一人公司创业者正在这里精钱 | 信任、FOMO |

---

## 🔗 **关联页面**

- 前一页: `app.js` 首屏
- 后一页: `pages/conversation/conversation?scene=onboarding_intro`
- 涉及文件:
  - `pages/welcome/welcome.wxml`
  - `pages/welcome/welcome.js`
  - `pages/welcome/welcome.wxss`
  - `theme/tokens.js` (可选，用于统一design tokens)

---

**Status: Ready for Implementation** ✅  
**Last Updated**: 2026-03-31
