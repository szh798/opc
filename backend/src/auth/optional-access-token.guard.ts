import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest, readAuthorizationHeader } from "./request-context";

@Injectable()
export class OptionalAccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = readAuthorizationHeader(request);

    request.authHeader = authHeader;
    if (!authHeader) {
      request.user = null;
      return true;
    }

    try {
      request.user = await this.authService.resolveUserFromAuthorization(authHeader);
    } catch (_error) {
      request.user = null;
    }

    return true;
  }
}
