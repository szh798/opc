import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./shared/prisma.service";
import { ChatService } from "./chat.service";

@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService
  ) {}

  async getProjects(userId: string) {
    return this.prisma.project.findMany({
      where: {
        userId,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        phase: true,
        status: true,
        statusTone: true,
        color: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async createProject(userId: string, payload: Record<string, unknown>) {
    const projectId = String(payload.id || `project-${Date.now()}`).trim();

    const project = await this.prisma.project.create({
      data: {
        id: projectId,
        userId,
        name: readString(payload.name, 120) || "新项目",
        phase: readString(payload.phase, 80) || "探索中",
        status: readString(payload.status, 80) || "进行中",
        statusTone: readString(payload.statusTone, 80) || "muted",
        color: readString(payload.color, 32) || "#378ADD",
        agentLabel: readString(payload.agentLabel, 80),
        conversation: [],
        conversationReplies: []
      }
    });

    return {
      id: project.id,
      name: project.name,
      phase: project.phase || "",
      status: project.status || "",
      statusTone: project.statusTone || "",
      color: project.color || ""
    };
  }

  async getProjectDetail(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null
      },
      include: {
        artifacts: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    return {
      id: project.id,
      name: project.name,
      phase: project.phase || "",
      status: project.status || "",
      statusTone: project.statusTone || "",
      color: project.color || "",
      agentLabel: project.agentLabel || "",
      conversation: Array.isArray(project.conversation) ? project.conversation : [],
      conversationReplies: Array.isArray(project.conversationReplies) ? project.conversationReplies : [],
      artifacts: project.artifacts.map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        ...(artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data) ? artifact.data as Record<string, unknown> : {}),
        ...(artifact.summary ? { summary: artifact.summary } : {}),
        ...(artifact.meta ? { meta: artifact.meta } : {}),
        ...(artifact.cta && typeof artifact.cta === "object" && !Array.isArray(artifact.cta) ? { cta: artifact.cta } : {})
      }))
    };
  }

  async updateProject(userId: string, projectId: string, payload: Record<string, unknown>) {
    await this.assertProjectOwnership(userId, projectId);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        name: readString(payload.name, 120),
        phase: readString(payload.phase, 80),
        status: readString(payload.status, 80),
        statusTone: readString(payload.statusTone, 80),
        color: readString(payload.color, 32),
        agentLabel: readString(payload.agentLabel, 80)
      }
    });

    return this.getProjectDetail(userId, projectId);
  }

  async deleteProject(userId: string, projectId: string) {
    await this.assertProjectOwnership(userId, projectId);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        deletedAt: new Date()
      }
    });

    return {
      success: true,
      id: projectId
    };
  }

  async getProjectResults(userId: string, projectId: string) {
    const project = await this.getProjectDetail(userId, projectId);
    return Array.isArray(project.artifacts) ? project.artifacts : [];
  }

  async sendProjectMessage(userId: string, projectId: string, payload: Record<string, unknown>) {
    const text = readString(payload.message || payload.content, 5000);
    if (!text) {
      throw new BadRequestException("Project message is required");
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    const sceneKey = resolveProjectSceneKey(project);
    const chatResult = await this.chatService.sendMessage(
      {
        conversationId: `project-chat-${projectId}`,
        sceneKey,
        message: text
      },
      {
        id: userId
      }
    );

    const nextConversation = readConversation(project.conversation).concat([
      {
        id: chatResult.userMessageId,
        sender: "user",
        text
      },
      {
        id: chatResult.assistantMessage.id,
        sender: "agent",
        text: chatResult.assistantMessage.text,
        agentKey: chatResult.agentKey || inferAgentKeyFromProject(project)
      }
    ]);

    const nextConversationReplies = normalizeQuickReplies(chatResult.quickReplies, project.conversationReplies);

    await this.prisma.project.update({
      where: {
        id: projectId
      },
      data: {
        conversation: nextConversation,
        conversationReplies: nextConversationReplies
      }
    });

    return {
      projectId,
      sceneKey,
      conversation: nextConversation,
      conversationReplies: nextConversationReplies,
      assistantMessage: chatResult.assistantMessage,
      userMessageId: chatResult.userMessageId
    };
  }

  async getResultDetail(userId: string, resultId: string) {
    const artifact = await this.prisma.projectArtifact.findFirst({
      where: {
        id: resultId,
        deletedAt: null,
        project: {
          userId,
          deletedAt: null
        }
      }
    });

    if (!artifact) {
      throw new NotFoundException(`Result not found: ${resultId}`);
    }

    return {
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      ...(artifact.data && typeof artifact.data === "object" && !Array.isArray(artifact.data) ? artifact.data as Record<string, unknown> : {}),
      ...(artifact.summary ? { summary: artifact.summary } : {}),
      ...(artifact.meta ? { meta: artifact.meta } : {}),
      ...(artifact.cta && typeof artifact.cta === "object" && !Array.isArray(artifact.cta) ? { cta: artifact.cta } : {})
    };
  }

  private async assertProjectOwnership(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
        deletedAt: null
      },
      select: {
        id: true
      }
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }
  }
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function readConversation(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function inferAgentKeyFromProject(project: { agentLabel?: string | null; name?: string | null }) {
  const label = String(project.agentLabel || "").trim();
  const name = String(project.name || "").trim();

  if (label.includes("挖宝")) {
    return "asset";
  }

  if (label.includes("搞钱")) {
    return "execution";
  }

  if (label.includes("扎心")) {
    return "mindset";
  }

  if (label.includes("管家") || /(园区|财税|薪资|profit)/i.test(name)) {
    return "steward";
  }

  return "execution";
}

function resolveProjectSceneKey(project: { agentLabel?: string | null; name?: string | null }) {
  const agentKey = inferAgentKeyFromProject(project);

  if (agentKey === "asset") {
    return "project_asset_followup";
  }

  if (agentKey === "steward") {
    return "company_park_followup";
  }

  if (agentKey === "mindset") {
    return "social_proof";
  }

  return "project_execution_followup";
}

function normalizeQuickReplies(quickReplies: unknown, fallback: unknown) {
  const labels = Array.isArray(quickReplies)
    ? quickReplies
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (item && typeof item === "object") {
          return String(item.label || item.text || "").trim();
        }

        return "";
      })
      .filter(Boolean)
    : [];

  if (labels.length) {
    return labels.slice(0, 6);
  }

  return Array.isArray(fallback) ? fallback : [];
}
