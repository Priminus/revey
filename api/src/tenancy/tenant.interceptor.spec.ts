import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';

function ctx(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  const next: CallHandler = { handle: () => of('ok') };

  it('resolves client_id from request.auth and attaches it to the request', async () => {
    const tenantService = {
      resolveClientId: jest.fn().mockResolvedValue('client_a'),
    };
    const interceptor = new TenantInterceptor(tenantService as never);
    const request: Record<string, unknown> = {
      auth: { userId: 'user_a', clerkOrgId: null, role: null },
    };
    const result = await lastValueFrom(
      await interceptor.intercept(ctx(request), next),
    );
    expect(tenantService.resolveClientId).toHaveBeenCalledWith(request.auth);
    expect(request.clientId).toBe('client_a');
    expect(result).toBe('ok');
  });

  it('passes through when there is no auth (public route)', async () => {
    const tenantService = { resolveClientId: jest.fn() };
    const interceptor = new TenantInterceptor(tenantService as never);
    const request: Record<string, unknown> = {};
    const result = await lastValueFrom(
      await interceptor.intercept(ctx(request), next),
    );
    expect(tenantService.resolveClientId).not.toHaveBeenCalled();
    expect(request.clientId).toBeUndefined();
    expect(result).toBe('ok');
  });
});
