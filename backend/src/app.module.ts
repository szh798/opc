import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { RolesGuard } from "./auth/roles.guard";
import { WechatService } from "./auth/wechat.service";
import { BootstrapController } from "./bootstrap.controller";
import { BootstrapService } from "./bootstrap.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { DifySnapshotContextService } from "./dify-snapshot-context.service";
import { DifyService } from "./dify.service";
import { ChatflowSummaryService } from "./memory/chatflow-summary.service";
import { DigestCronService } from "./memory/digest-cron.service";
import { ConversationTitleService } from "./memory/conversation-title.service";
import { MemoryExtractionService } from "./memory/memory-extraction.service";
import { SessionWindowService } from "./memory/session-window.service";
import { UserProfileService } from "./memory/user-profile.service";
import { ZhipuClientService } from "./memory/zhipu-client.service";
import { GrowthController } from "./growth.controller";
import { GrowthService } from "./growth.service";
import { ArchivalCronService } from "./shared/archival-cron.service";
import { PrismaService } from "./shared/prisma.service";
import { PolicyOpportunityService } from "./policy/policy-opportunity.service";
import { ProfileService } from "./profile.service";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";
import { RouterController } from "./router/router.controller";
import { RouterService } from "./router/router.service";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { TaskController } from "./task.controller";
import { TaskService } from "./task.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  imports: [JwtModule.register({}), ScheduleModule.forRoot()],
  controllers: [
    AuthController,
    BootstrapController,
    UserController,
    ChatController,
    ProjectController,
    CompanyController,
    TaskController,
    GrowthController,
    ReportController,
    ShareController,
    RouterController
  ],
  providers: [
    PrismaService,
    WechatService,
    AuthService,
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    RolesGuard,
    BootstrapService,
    UserService,
    ProfileService,
    ChatService,
    ProjectService,
    CompanyService,
    TaskService,
    GrowthService,
    ReportService,
    ShareService,
    DifySnapshotContextService,
    DifyService,
    PolicyOpportunityService,
    ZhipuClientService,
    SessionWindowService,
    UserProfileService,
    ChatflowSummaryService,
    DigestCronService,
    ConversationTitleService,
    MemoryExtractionService,
    RouterService,
    ArchivalCronService
  ]
})
export class AppModule {}
