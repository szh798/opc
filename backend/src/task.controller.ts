import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";
import { CompleteTaskDto, TaskFeedbackDto } from "./task.dto";

@Controller()
export class TaskController {
  constructor(private readonly store: InMemoryDataService) {}

  @Get("tasks/daily")
  getDailyTasks() {
    return this.store.getDailyTasks();
  }

  @Post("tasks/:taskId/complete")
  completeTask(
    @Param("taskId") taskId: string,
    @Body() payload: CompleteTaskDto
  ) {
    return this.store.completeTask(taskId, { ...payload });
  }

  @Post("tasks/feedback")
  getTaskFeedback(@Body() payload: TaskFeedbackDto) {
    return this.store.buildTaskFeedback({ ...payload });
  }
}
