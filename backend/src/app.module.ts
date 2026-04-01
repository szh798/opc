import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AccessTokenGuard } from "./auth/access-token.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { OptionalAccessTokenGuard } from "./auth/optional-access-token.guard";
import { WechatService } from "./auth/wechat.service";
import { BootstrapController } from "./bootstrap.controller";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CompanyController } from "./company.controller";
import { DifyService } from "./dify.service";
import { GrowthController } from "./growth.controller";
import { InMemoryDataService } from "./shared/in-memory-data.service";
import { ProjectController } from "./project.controller";
import { ProjectService } from "./project.service";
import { ReportController } from "./report.controller";
import { ShareController } from "./share.controller";
import { TaskController } from "./task.controller";
import { UserController } from "./user.controller";

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
    InMemoryDataService,
    WechatService,
    AuthService,
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    ChatService,
    ProjectService,
    DifyService
  ]
})
export class AppModule {}
