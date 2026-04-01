import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CreateProjectDto, ShareResultDto, UpdateProjectDto } from "./project.dto";
import { ProjectService } from "./project.service";

@Controller()
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get("projects")
  getProjects() {
    return this.projectService.getProjects();
  }

  @Post("projects")
  createProject(@Body() payload: CreateProjectDto) {
    return this.projectService.createProject({ ...payload });
  }

  @Get("projects/:projectId")
  getProjectDetail(@Param("projectId") projectId: string) {
    return this.projectService.getProjectDetail(projectId);
  }

  @Patch("projects/:projectId")
  updateProject(
    @Param("projectId") projectId: string,
    @Body() payload: UpdateProjectDto
  ) {
    return this.projectService.updateProject(projectId, { ...payload });
  }

  @Delete("projects/:projectId")
  deleteProject(@Param("projectId") projectId: string) {
    return this.projectService.deleteProject(projectId);
  }

  @Get("projects/:projectId/results")
  getProjectResults(@Param("projectId") projectId: string) {
    return this.projectService.getProjectResults(projectId);
  }

  @Get("results/:resultId")
  getResultDetail(@Param("resultId") resultId: string) {
    return this.projectService.getResultDetail(resultId);
  }

  @Post("results/share")
  shareResult(@Body() payload: ShareResultDto) {
    return this.projectService.shareResult({ ...payload });
  }
}
