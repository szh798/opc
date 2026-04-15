import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { deepClone } from "./clone";
import { loadRootModule } from "./root-loader";
import { getAppConfig } from "./app-config";

type ConversationFactoryModule = {
  getConversationScene: (sceneKey: string, context?: Record<string, unknown>) => Record<string, unknown>;
};

type MockChatFlowModule = {
  resolveAgentByText: (text: string, fallback?: string) => string;
  getReplyByAgent: (agentKey: string, text: string) => {
    text: string;
    quickReplies: Array<Record<string, unknown>>;
  };
};

type TaskHelpersModule = {
  getFeedbackReplies: () => Array<Record<string, unknown>>;
  buildFeedbackPrompt: (taskLabel?: string) => string;
  buildFeedbackAdvice: (userText?: string, taskLabel?: string) => string;
};

type ChatHelpersModule = {
  createMockStreamEvents: (text?: string) => Array<Record<string, unknown>>;
};

type ShareHelpersModule = {
  getSharePreview: () => Record<string, unknown>;
};

type ProjectRecord = {
  id: string;
  name: string;
  phase?: string;
  status?: string;
  statusTone?: string;
  color?: string;
};

type ProjectDetailRecord = ProjectRecord & {
  conversation?: Array<Record<string, unknown>>;
  conversationReplies?: Array<unknown>;
  artifacts?: Array<Record<string, unknown>>;
};

type TaskRecord = {
  id: string;
  label: string;
  tag?: string;
  done?: boolean;
};

@Injectable()
export class InMemoryDataService {
  private readonly conversationFactory = loadRootModule<ConversationFactoryModule>("services/conversation.service.js");
  private readonly mockChatFlow = loadRootModule<MockChatFlowModule>("services/mock-chat-flow.service.js");
  private readonly taskHelpers = loadRootModule<TaskHelpersModule>("services/task.service.js");
  private readonly chatHelpers = loadRootModule<ChatHelpersModule>("services/chat.service.js");
  private readonly shareHelpers = loadRootModule<ShareHelpersModule>("services/share.service.js");
  private readonly mockConversations = loadRootModule<{ conversations: Record<string, unknown> }>("mock/chat.js");

  private user = this.loadUser();
  private projects = this.loadProjects();
  private projectDetails = this.loadProjectDetails();
  private recentChats = this.loadSidebar().recentChats;
  private tools = this.loadSidebar().tools;
  private companyCards = this.loadCompanyCards();
  private profile = this.loadProfile();
  private reports = this.loadReports();
  private sharePreview = this.loadSharePreview();
  private dailyTasks = this.loadDailyTasks();

  private loadUser() {
    return deepClone(loadRootModule<{ user: Record<string, unknown> }>("mock/user.js").user);
  }

  private loadProjects() {
    return deepClone(loadRootModule<{ projects: ProjectRecord[] }>("mock/projects.js").projects);
  }

  private loadProjectDetails() {
    return deepClone(loadRootModule<{ projectDetails: Record<string, ProjectDetailRecord> }>("mock/projects.js").projectDetails);
  }

  private loadSidebar() {
    return deepClone(loadRootModule<{ recentChats: Array<Record<string, unknown>>; tools: Array<Record<string, unknown>> }>("mock/sidebar.js"));
  }

  private loadCompanyCards() {
    return deepClone(loadRootModule<{ companyCards: Array<Record<string, unknown>> }>("mock/company.js").companyCards);
  }

  private loadProfile() {
    return deepClone(loadRootModule<{ profile: Record<string, unknown> }>("mock/profile.js").profile);
  }

  private loadReports() {
    return deepClone(loadRootModule<Record<string, unknown>>("mock/reports.js"));
  }

  private loadSharePreview() {
    return deepClone(this.shareHelpers.getSharePreview());
  }

  private loadDailyTasks() {
    return {
      title: "今日任务",
      items: [
        { id: "task-1", label: "触达5个潜在客户", tag: "自媒体项目", done: false },
        { id: "task-2", label: "发一条小红书", tag: "IP杠杆", done: false },
        { id: "task-3", label: "跟进昨天的意向客户", tag: "自媒体项目", done: false }
      ] satisfies TaskRecord[]
    };
  }

  getUser() {
    return deepClone(this.user);
  }

  updateUser(payload: Record<string, unknown>) {
    this.user = {
      ...this.user,
      ...payload
    };

    const nextName = String(this.user.nickname || this.user.name || "访客");
    this.profile = {
      ...this.profile,
      name: nextName,
      initial: nextName.slice(0, 1) || "访"
    };

    return this.getUser();
  }

  getBootstrapPayload() {
    return {
      user: this.getUser(),
      projects: this.getProjects(),
      tools: this.getTools(),
      recentChats: this.getRecentChats()
    };
  }

  getSidebarPayload() {
    return {
      user: this.getUser(),
      projects: this.getProjects(),
      tools: this.getTools(),
      recentChats: this.getRecentChats()
    };
  }

  getProfile() {
    return deepClone(this.profile);
  }

  getRecentChats() {
    return deepClone(this.recentChats);
  }

  getTools() {
    return deepClone(this.tools);
  }

  getProjects() {
    return deepClone(this.projects);
  }

  createProject(payload: Partial<ProjectRecord>) {
    const project: ProjectRecord = {
      id: payload.id || `project-${Date.now()}`,
      name: payload.name || "新项目",
      phase: payload.phase || "探索中",
      status: payload.status || "进行中",
      statusTone: payload.statusTone || "muted",
      color: payload.color || "#378ADD"
    };

    this.projects.unshift(project);
    this.projectDetails[project.id] = {
      ...project,
      conversation: [],
      conversationReplies: [],
      artifacts: []
    };

    return deepClone(project);
  }

  getProjectDetail(projectId: string) {
    const detail = this.projectDetails[projectId];
    if (!detail) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    return deepClone(detail);
  }

  updateProject(projectId: string, payload: Partial<ProjectRecord>) {
    const target = this.projects.find((project) => project.id === projectId);
    const detail = this.projectDetails[projectId];

    if (!target || !detail) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    Object.assign(target, payload);
    this.projectDetails[projectId] = {
      ...detail,
      ...payload
    };

    return this.getProjectDetail(projectId);
  }

  deleteProject(projectId: string) {
    this.projects = this.projects.filter((project) => project.id !== projectId);
    delete this.projectDetails[projectId];

    return {
      success: true,
      id: projectId
    };
  }

  getProjectResults(projectId: string) {
    return deepClone(this.getProjectDetail(projectId).artifacts || []);
  }

  getResultDetail(resultId: string) {
    for (const detail of Object.values(this.projectDetails)) {
      const target = (detail.artifacts || []).find((artifact) => artifact.id === resultId);
      if (target) {
        return deepClone(target);
      }
    }

    throw new NotFoundException(`Result not found: ${resultId}`);
  }

  shareResult(payload: Record<string, unknown>) {
    return {
      success: true,
      shareId: `share-${Date.now()}`,
      resultId: payload.resultId || null
    };
  }

  getCompanyCards() {
    return deepClone(this.companyCards);
  }

  getCompanyPanel() {
    return {
      title: "我的公司",
      cards: this.getCompanyCards()
    };
  }

  executeCompanyAction(actionId: string, payload: Record<string, unknown>) {
    return {
      success: true,
      actionId,
      payload,
      executedAt: new Date().toISOString()
    };
  }

  getDailyTasks() {
    return deepClone(this.dailyTasks);
  }

  completeTask(taskId: string, payload: Record<string, unknown>) {
    const items = this.dailyTasks.items as TaskRecord[];
    const target = items.find((task) => task.id === taskId);

    if (!target) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    target.done = true;

    return {
      success: true,
      taskId,
      done: true,
      payload
    };
  }

  buildTaskFeedback(payload: Record<string, unknown>) {
    const taskLabel = String(payload.taskLabel || payload.label || "这项任务");
    const summary = String(payload.summary || payload.userText || payload.text || "");

    return {
      messages: [
        {
          id: `feedback-status-${Date.now()}`,
          type: "status_chip",
          label: taskLabel,
          status: "done"
        },
        {
          id: `feedback-prompt-${Date.now()}`,
          type: "agent",
          text: this.taskHelpers.buildFeedbackPrompt(taskLabel)
        },
        {
          id: `feedback-advice-${Date.now()}`,
          type: "agent",
          text: this.taskHelpers.buildFeedbackAdvice(summary, taskLabel)
        }
      ],
      quickReplies: this.taskHelpers.getFeedbackReplies()
    };
  }

  getGrowthTree() {
    return {
      overview: deepClone(this.reports.treeOverview),
      milestones: deepClone(this.reports.treeMilestones)
    };
  }

  getCurrentGrowthMilestone() {
    return deepClone(this.reports.milestone);
  }

  getGrowthMilestoneById(milestoneId: string) {
    const milestones = this.reports.treeMilestones as Array<Record<string, unknown>>;
    const target = milestones.find((item) => item.id === milestoneId);

    if (!target) {
      throw new NotFoundException(`Milestone not found: ${milestoneId}`);
    }

    return deepClone(target);
  }

  getWeeklyReport() {
    return deepClone(this.reports.weeklyReport);
  }

  getMonthlyReport() {
    return deepClone(this.reports.monthlyCheck);
  }

  getSocialProof() {
    return deepClone(this.reports.socialProof);
  }

  getCurrentMilestone() {
    return deepClone(this.reports.milestone);
  }

  getTreeMilestones() {
    return deepClone(this.reports.treeMilestones);
  }

  getSharePreview() {
    return deepClone(this.sharePreview);
  }

  generateShareImage() {
    const config = getAppConfig();
    const posterId = `poster-${Date.now()}`;

    return {
      posterId,
      imageUrl: `${config.publicBaseUrl.replace(/\/$/, "")}/share/posters/${posterId}.png`
    };
  }

  buildShareCaption(payload: Record<string, unknown>) {
    const preview = this.getSharePreview() as Record<string, unknown>;
    const title = String(payload.title || payload.resultTitle || "").trim();

    return {
      caption: title ? `今天用一树OPC整理了「${title}」，顺手把下一步动作也拆清楚了。` : preview.caption,
      hashtags: preview.hashtags
    };
  }

  getConversationScene(sceneKey: string, user?: Record<string, unknown>) {
    const aliasMap: Record<string, string> = {
      onboarding: "onboarding_intro",
      ai: "ai_assistant",
      ip: "ip_assistant"
    };

    const resolvedSceneKey = aliasMap[sceneKey] || sceneKey;
    return deepClone(
      this.conversationFactory.getConversationScene(resolvedSceneKey, {
        user: user || this.user
      })
    );
  }

  getLegacyConversation(sceneKey: "home" | "onboarding" | "ai" | "ip") {
    const aliasMap = {
      home: "home",
      onboarding: "onboarding",
      ai: "aiAssistant",
      ip: "ipAssistant"
    } as const;

    return deepClone(this.mockConversations.conversations[aliasMap[sceneKey]]);
  }

  resolveChatReply(text: string, fallbackAgentKey = "master") {
    const agentKey = this.mockChatFlow.resolveAgentByText(text, fallbackAgentKey);
    const reply = this.mockChatFlow.getReplyByAgent(agentKey, text);

    return {
      agentKey,
      text: reply.text,
      quickReplies: reply.quickReplies || []
    };
  }

  createStreamEvents(text: string) {
    return deepClone(this.chatHelpers.createMockStreamEvents(text));
  }

  appendRecentChat(label: string) {
    if (!label.trim()) {
      return;
    }

    this.recentChats.unshift({
      id: `recent-${randomUUID()}`,
      label
    });
    this.recentChats = this.recentChats.slice(0, 10);
  }
}
