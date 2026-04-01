export type RequestUser = Record<string, unknown>;

export type AuthenticatedRequest = {
  headers?: {
    authorization?: string | string[];
  };
  user?: RequestUser | null;
  authHeader?: string;
};

export function readAuthorizationHeader(request: AuthenticatedRequest) {
  const rawHeader = request.headers?.authorization;

  if (Array.isArray(rawHeader)) {
    return String(rawHeader[0] || "").trim();
  }

  return String(rawHeader || "").trim();
}
