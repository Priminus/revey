import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthContext } from './auth-context';

// Reads the `auth` context that ClerkGuard attached to the request.
// Throws if it is missing (e.g. a public route with no bearer token).
export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<{ auth?: AuthContext }>();
    if (!request.auth) {
      throw new UnauthorizedException('No auth context on request');
    }
    return request.auth;
  },
);
