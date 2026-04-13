const { getConversationScene } = require("../../services/chat.service");
const { getSidebarData, getCompanyCards } = require("../../services/sidebar.service");

Page({
  data: {
    agentKey: "master",
    agentColor: "#0D0D0D",
    user: {},
    projects: [],
    tools: [],
    recentChats: [],
    companyCards: [],
    messages: [],
    quickReplies: [],
    sidebarVisible: false,
    projectSheetVisible: false,
    companyPanelVisible: false,
    assetSheetVisible: false,
    assetSheetMode: "view",
    profile: {},
    report: null,
    inputPlaceholder: "输入消息..."
  },

  onLoad() {
    const scene = getConversationScene("home");
    const sidebarData = getSidebarData();

    getApp().setCurrentAgent(scene.agentKey);

    this.setData({
      agentKey: scene.agentKey,
      agentColor: scene.agent.color,
      messages: scene.messages,
      quickReplies: scene.quickReplies,
      companyCards: getCompanyCards(),
      profile: {
        name: "Lu",
        initial: "L",
        stageLabel: "探索期个人开发者",
        radar: [
          { label: "设计", value: 45 },
          { label: "开发", value: 85 },
          { label: "运营", value: 20 },
          { label: "商业", value: 30 }
        ],
        strengths: ["代码实现", "系统架构"],
        traits: [{ label: "专注", tone: "purple" }],
        ikigai: "用代码构建有趣的产品"
      },
      ...sidebarData
    });
  },

  handleAvatarTap() {
    this.setData({ sidebarVisible: true });
  },

  handleSidebarClose() {
    this.setData({ sidebarVisible: false });
  },

  handleTreeTap() {
    wx.navigateTo({ url: "/pages/tree/tree" });
  },

  handlePlusTap() {
    this.setData({ projectSheetVisible: true });
  },

  handleProjectSheetClose() {
    this.setData({ projectSheetVisible: false });
  },

  handleCompanyClose() {
    this.setData({ companyPanelVisible: false });
  },

  handleProfileTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  handleProjectTap(event) {
    const { id } = event.detail;

    this.setData({
      sidebarVisible: false,
      projectSheetVisible: false
    });

    wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${id}` });
  },

  handleToolTap(event) {
    const { key } = event.detail;

    this.setData({ sidebarVisible: false });

    if (key === "company") {
      this.setData({ companyPanelVisible: true });
      return;
    }

    const pageMap = {
      ai: "/pages/ai-assistant/ai-assistant",
      ip: "/pages/ip-assistant/ip-assistant"
    };

    wx.navigateTo({ url: pageMap[key] || "/pages/chat/chat" });
  },

  handleQuickReply(event) {
    const { label } = event.currentTarget.dataset;
    const messages = this.data.messages.concat({
      id: `reply-${Date.now()}`,
      sender: "user",
      text: label
    });

    this.setData({
      messages,
      quickReplies: []
    });
  },

  handleSend(event) {
    const { value } = event.detail;
    const isUpdateSim = value.includes("更新资产");
    const isReportSim = value.includes("生成报告");
    const isAbilityReport = value.includes("能力资产");
    const isResourceReport = value.includes("资源资产");
    const isCognitionReport = value.includes("认知资产");
    const isRelationshipReport = value.includes("关系资产");
    let newMessages = [
      {
        id: `input-${Date.now()}`,
        sender: "user",
        text: value
      }
    ];

    if (isUpdateSim) {
      newMessages.push({
        id: `update-${Date.now()}`,
        sender: "system",
        type: "asset_update",
        payload: {
          radar: [
             { label: "设计", value: 60, changed: true },
             { label: "开发", value: 90, changed: true },
             { label: "运营", value: 20 },
             { label: "商业", value: 50, changed: true }
          ],
          strengths: [
             { label: "代码实现" },
             { label: "系统架构" },
             { label: "全栈思维", isNew: true }
          ],
          traits: [
             { label: "专注", tone: "purple" },
             { label: "行动导向", tone: "mint", isNew: true }
          ],
          ikigai: "用代码和全栈能力构建有商业潜力的产品",
          ikigaiChanged: true
        }
      });
    } else if (isReportSim) {
      // 模拟生成报告数据
      const report = {
        version: "1",
        date: "2026-04-10",
        summary: "您的资产整体表现良好，技术能力突出，具有较强的全栈开发能力和系统架构思维。",
        dimensions: "能力资产：全栈开发能力强，系统架构思维清晰；资源资产：有一定的项目经验和技术积累；认知资产：对技术趋势有较好的把握；关系资产：需要进一步建立行业网络。",
        ikigai: "您的热爱、擅长、世界需要和愿付费的交汇点在于技术驱动的产品开发。",
        strengthType: "主类型：执行力；次类型：战略思维",
        coreAssets: "1. 全栈开发能力 - 可重复使用，被市场需求验证；2. 系统架构思维 - 可重复使用，不完全依赖时间；3. 问题解决能力 - 被市场需求验证，可转化为收入",
        monetization: "强：技术咨询；潜力：产品开发；弱：内容创作",
        paths: "1. 技术咨询：目标客户为中小企业，解决技术难题，第一单入口为朋友推荐；2. 产品开发：目标客户为创业公司，解决产品落地问题，第一单入口为网络平台",
        avoid: "1. 纯内容创作：与核心能力匹配度低；2. 传统行业销售：与技术背景不相关",
        correction: "您的技术能力被充分认可，但商业思维需要加强，建议学习基本的商业模式和市场分析方法。",
        suggestions: "1. 建立个人技术品牌，分享技术见解；2. 寻找合作伙伴互补商业能力；3. 从小规模项目开始，积累商业经验"
      };
      
      newMessages.push({
        id: `report-${Date.now()}`,
        sender: "agent",
        text: "您的资产盘点报告已生成，请查看。"
      });
      
      this.setData({ report });
      setTimeout(() => {
        this.setData({
          assetSheetVisible: true,
          assetSheetMode: "view"
        });
      }, 1000);
    } else if (isAbilityReport) {
      // 模拟能力资产小报告
      newMessages.push({
        id: `ability-${Date.now()}`,
        sender: "agent",
        type: "asset_report",
        text: "【能力资产小报告】\n\n已识别资产：全栈开发能力、系统架构设计、问题解决能力\n\n证据案例：曾主导开发过多个企业级应用，解决了复杂的技术难题\n\n可迁移性：技术能力高度可迁移，适用于不同行业的软件开发\n\n变现性初判：强 - 可提供技术咨询、产品开发等服务",
        payload: {
          type: "ability",
          status: "completed"
        }
      });
    } else if (isResourceReport) {
      // 模拟资源资产小报告
      newMessages.push({
        id: `resource-${Date.now()}`,
        sender: "agent",
        type: "asset_report",
        text: "【资源资产小报告】\n\n已识别资产：技术社区资源、项目经验、技术工具栈\n\n可调用资源：拥有丰富的开源项目经验和技术文档\n\n稀缺性：具备独特的技术组合和项目管理经验\n\n变现性初判：潜力 - 可通过技术服务和项目合作实现变现",
        payload: {
          type: "resource",
          status: "completed"
        }
      });
    } else if (isCognitionReport) {
      // 模拟认知资产小报告
      newMessages.push({
        id: `cognition-${Date.now()}`,
        sender: "agent",
        type: "asset_report",
        text: "【认知资产小报告】\n\n已识别资产：技术趋势判断、产品思维、问题分析能力\n\n独特判断：对技术发展方向有清晰的认知，能够预见行业趋势\n\n组合优势：技术能力与产品思维的结合，形成独特的竞争力\n\n变现性初判：强 - 可提供技术咨询和战略规划服务",
        payload: {
          type: "cognition",
          status: "completed"
        }
      });
    } else if (isRelationshipReport) {
      // 模拟关系资产小报告
      newMessages.push({
        id: `relationship-${Date.now()}`,
        sender: "agent",
        type: "asset_report",
        text: "【关系资产小报告】\n\n已识别资产：技术社区人脉、客户关系、合作伙伴网络\n\n信任网络：在技术社区中建立了良好的声誉和信任关系\n\n第一单可能性：通过现有网络可以快速获取第一个客户\n\n变现性初判：潜力 - 需要进一步拓展商业网络，提升变现能力",
        payload: {
          type: "relationship",
          status: "completed"
        }
      });
    }

    this.setData({ messages: this.data.messages.concat(newMessages) });
  },

  handleCreateProject() {
    wx.showToast({
      title: "\u65b0\u9879\u76ee\u6d41\u7a0b\u4e0b\u4e00\u6b65\u8865",
      icon: "none"
    });
  },

  handleCompanyAction() {
    this.setData({ companyPanelVisible: false });

    wx.showToast({
      title: "\u5df2\u9884\u7559\u516c\u53f8\u7ba1\u7406\u5165\u53e3",
      icon: "none"
    });
  },

  handleNewChat() {
    this.setData({ sidebarVisible: false });
  },

  handleRecentTap() {
    wx.showToast({
      title: "\u5386\u53f2\u4f1a\u8bdd\u9aa8\u67b6\u5df2\u9884\u7559",
      icon: "none"
    });
  },

  handleSettingTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  handleHelpTap() {
    this.setData({ sidebarVisible: false });
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  handleHeaderPullDown() {
    wx.navigateTo({ url: "/pages/tree/tree" });
  },

  handleChatAvatarTap() {
    this.setData({
      assetSheetVisible: true,
      assetSheetMode: "view"
    });
  },

  handleAssetSheetClose() {
    this.setData({ assetSheetVisible: false });
  },

  handleReviewAssetUpdate(event) {
    const { payload } = event.currentTarget.dataset;
    this.setData({
      assetSheetVisible: true,
      assetSheetMode: "update",
      profile: { ...this.data.profile, ...payload },
      pendingUpdates: payload
    });
  },

  handleRejectAssetUpdate() {
    this.setData({ assetSheetVisible: false });
    wx.showToast({ title: "已暂缓更新", icon: "none" });
  },

  handleAcceptAssetUpdate() {
    // In a real app, send api request here to save updates format back to normal arrays
    const p = this.data.profile;
    const cleanProfile = {
      ...p,
      radar: p.radar.map(r => ({ label: r.label, value: r.value })),
      strengths: p.strengths.map(s => s.label || s),
      traits: p.traits.map(t => ({ label: t.label, tone: t.tone }))
    };

    this.setData({
      assetSheetVisible: false,
      profile: cleanProfile
    });

    const messages = this.data.messages.concat({
      id: `sys-${Date.now()}`,
      sender: "agent",
      text: "太棒了，您的资产雷达已更新！这会让我为您提供更精准的建议。"
    });
    this.setData({ messages });
    wx.showToast({ title: "资产更新成功", icon: "success" });
  }
});
