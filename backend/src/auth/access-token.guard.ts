import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest, readAuthorizationHeader } from "./request-context";

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = readAuthorizationHeader(request);
    const user = this.authService.resolveUserFromAuthorization(authHeader);

    if (!user) {
      throw new UnauthorizedException("Unauthorized");
    }

    request.authHeader = authHeader;
    request.user = user;
    return true;
  }
}
