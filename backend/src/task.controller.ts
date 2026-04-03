import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { CurrentUser } from "./auth/current-user.decorator";
import { CompleteTaskDto, TaskFeedbackDto } from "./task.dto";
import { TaskService } from "./task.service";

@Controller()
@UseGuards(AccessTokenGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get("tasks/daily")
  getDailyTasks(@CurrentUser() user: Record<string, unknown>) {
    return this.taskService.getDailyTasks(String(user.id || ""));
  }

  @Post("tasks/:taskId/complete")
  completeTask(
    @CurrentUser() user: Record<string, unknown>,
    @Param("taskId") taskId: string,
    @Body() payload: CompleteTaskDto
  ) {
    return this.taskService.completeTask(String(user.id || ""), taskId, { ...payload });
  }

  @Post("tasks/feedback")
  getTaskFeedback(@CurrentUser() user: Record<string, unknown>, @Body() payload: TaskFeedbackDto) {
    return this.taskService.buildTaskFeedback(String(user.id || ""), { ...payload });
  }
}
