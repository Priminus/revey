import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthContext } from './auth-context';

export interface TokenVerifier {
  verify(token: string): Promise<{
    sub: string;
    org_id?: string;
    org_role?: string;
    o?: { id?: string; rol?: string; slg?: string };
  }>;
}

export const TOKEN_VERIFIER = 'TOKEN_VERIFIER';

@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      auth?: AuthContext;
    }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let claims: {
      sub: string;
      org_id?: string;
      org_role?: string;
      o?: { id?: string; rol?: string; slg?: string };
    };
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    const clerkOrgId = claims.org_id ?? claims.o?.id ?? null;
    const role = claims.org_role ?? claims.o?.rol ?? null;
    request.auth = {
      userId: claims.sub,
      clerkOrgId,
      role,
    };
    return true;
  }
}
