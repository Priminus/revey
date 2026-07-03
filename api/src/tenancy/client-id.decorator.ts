import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

// Reads the tenant `client_id` that TenantInterceptor attached to the request.
// Throws if it is missing (e.g. an unauthenticated or non-tenant-scoped route).
export const ClientId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ clientId?: string }>();
    if (!request.clientId) {
      throw new ForbiddenException('No tenant client_id on request');
    }
    return request.clientId;
  },
);
