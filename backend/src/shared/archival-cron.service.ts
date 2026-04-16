import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ArchivalCronService {
  private readonly logger = new Logger(ArchivalCronService.name);
  private static readonly RETENTION_DAYS = 90;

  constructor(private readonly prisma: PrismaService) {}

  /** 每周日凌晨 3 点执行：硬删除 deletedAt 超过 90 天的软删除记录 */
  @Cron("0 3 * * 0", { name: "archival-weekly" })
  async handleWeeklyArchival(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ArchivalCronService.RETENTION_DAYS);

    this.logger.log(`archival-weekly: purging records soft-deleted before ${cutoff.toISOString()}`);

    const models = [
      { name: "conversation", delegate: this.prisma.conversation },
      { name: "projectArtifact", delegate: this.prisma.projectArtifact },
      { name: "project", delegate: this.prisma.project }
    ] as const;

    for (const { name, delegate } of models) {
      try {
        const result = await (delegate as any).deleteMany({
          where: { deletedAt: { lt: cutoff } }
        });
        this.logger.log(`archival-weekly: purged ${result.count} ${name} records`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`archival-weekly: failed to purge ${name}: ${msg}`);
      }
    }

    this.logger.log("archival-weekly: finished");
  }
}
