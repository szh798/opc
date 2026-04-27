import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { CreateProjectDto, ProjectChatDto, ShareResultDto, UpdateProjectDto } from "./project.dto";
import { ProjectService } from "./project.service";
import { ShareService } from "./share.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly shareService: ShareService
  ) {}

  @Get("projects")
  getProjects(@CurrentUser() user: Record<string, unknown>) {
    return this.projectService.getProjects(String(user.id || ""));
  }

  @Post("projects")
  createProject(@CurrentUser() user: Record<string, unknown>, @Body() payload: CreateProjectDto) {
    return this.projectService.createProject(String(user.id || ""), { ...payload });
  }

  @Post("projects/:projectId/initiate")
  initiateProject(
    @CurrentUser() user: Record<string, unknown>,
    @Param("projectId") projectId: string,
    @Body() payload: Record<string, unknown>
  ) {
    return this.projectService.initiateProject(String(user.id || ""), projectId, { ...payload });
  }

  @Post("projects/:projectId/revoke-initiation")
  revokeProjectInitiation(@CurrentUser() user: Record<string, unknown>, @Param("projectId") projectId: string) {
    return this.projectService.revokeProjectInitiation(String(user.id || ""), projectId);
  }

  @Get("projects/:projectId")
  getProjectDetail(@CurrentUser() user: Record<string, unknown>, @Param("projectId") projectId: string) {
    return this.projectService.getProjectDetail(String(user.id || ""), projectId);
  }

  @Get("projects/:projectId/followup-cycle/current")
  getCurrentFollowupCycle(@CurrentUser() user: Record<string, unknown>, @Param("projectId") projectId: string) {
    return this.projectService.getCurrentFollowupCycle(String(user.id || ""), projectId);
  }

  @Patch("projects/:projectId")
  updateProject(
    @CurrentUser() user: Record<string, unknown>,
    @Param("projectId") projectId: string,
    @Body() payload: UpdateProjectDto
  ) {
    return this.projectService.updateProject(String(user.id || ""), projectId, { ...payload });
  }

  @Delete("projects/:projectId")
  deleteProject(@CurrentUser() user: Record<string, unknown>, @Param("projectId") projectId: string) {
    return this.projectService.deleteProject(String(user.id || ""), projectId);
  }

  @Get("projects/:projectId/results")
  getProjectResults(@CurrentUser() user: Record<string, unknown>, @Param("projectId") projectId: string) {
    return this.projectService.getProjectResults(String(user.id || ""), projectId);
  }

  @Post("projects/:projectId/chat")
  sendProjectMessage(
    @CurrentUser() user: Record<string, unknown>,
    @Param("projectId") projectId: string,
    @Body() payload: ProjectChatDto
  ) {
    return this.projectService.sendProjectMessage(String(user.id || ""), projectId, { ...payload });
  }

  @Get("results/:resultId")
  getResultDetail(@CurrentUser() user: Record<string, unknown>, @Param("resultId") resultId: string) {
    return this.projectService.getResultDetail(String(user.id || ""), resultId);
  }

  @Post("results/share")
  shareResult(@CurrentUser() user: Record<string, unknown>, @Body() payload: ShareResultDto) {
    return this.shareService.shareResult(String(user.id || ""), { ...payload });
  }
}
