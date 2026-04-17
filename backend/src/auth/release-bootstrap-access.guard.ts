import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { getAppConfig } from "../shared/app-config";
import { AuthenticatedRequest } from "./request-context";

@Injectable()
export class ReleaseBootstrapAccessGuard implements CanActivate {
  private readonly config = getAppConfig();

  canActivate(context: ExecutionContext) {
    if (!this.config.enforceReleaseGuards) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const userId = String((user && user.id) || "").trim();
    if (!userId) {
      throw new UnauthorizedException("Unauthorized");
    }
    return true;
  }
}
