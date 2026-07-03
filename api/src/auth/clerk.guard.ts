import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthContext } from './auth-context';
import { IS_PUBLIC_KEY } from '../health/health.public.decorator';

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
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
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
