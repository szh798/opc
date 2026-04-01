import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest, readAuthorizationHeader } from "./request-context";

@Injectable()
export class OptionalAccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = readAuthorizationHeader(request);

    request.authHeader = authHeader;
    request.user = authHeader ? this.authService.resolveUserFromAuthorization(authHeader) : null;

    return true;
  }
}
