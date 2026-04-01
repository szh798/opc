import { Injectable } from "@nestjs/common";
import { InMemoryDataService } from "./shared/in-memory-data.service";

@Injectable()
export class ProjectService {
  constructor(private readonly store: InMemoryDataService) {}

  getProjects() {
    return this.store.getProjects();
  }

  createProject(payload: Record<string, unknown>) {
    return this.store.createProject(payload);
  }

  getProjectDetail(projectId: string) {
    return this.store.getProjectDetail(projectId);
  }

  updateProject(projectId: string, payload: Record<string, unknown>) {
    return this.store.updateProject(projectId, payload);
  }

  deleteProject(projectId: string) {
    return this.store.deleteProject(projectId);
  }

  getProjectResults(projectId: string) {
    return this.store.getProjectResults(projectId);
  }

  getResultDetail(resultId: string) {
    return this.store.getResultDetail(resultId);
  }

  shareResult(payload: Record<string, unknown>) {
    return this.store.shareResult(payload);
  }
}
