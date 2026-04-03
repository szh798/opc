import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { WechatService } from "./auth/wechat.service";
import { BootstrapController } from "./bootstrap.controller";
import { BootstrapService } from "./bootstrap.service";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CompanyController } from "./company.controller";
import { CompanyService } from "./company.service";
import { DifyService } from "./dify.service";
import { GrowthController } from "./growth.controller";
import { GrowthService } from "./growth.service";
import { PrismaService } from "./shared/prisma.service";
import { ProfileService } from "./profile.service";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { TaskController } from "./task.controller";
import { TaskService } from "./task.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

@Module({
  imports: [JwtModule.register({})],
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
    ShareController
  ],
  providers: [
    PrismaService,
    WechatService,
    AuthService,
    AccessTokenGuard,
    OptionalAccessTokenGuard,
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
    DifyService
  ]
})
export class AppModule {}
