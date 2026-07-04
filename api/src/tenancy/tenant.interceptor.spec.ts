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

  it('resolves client_id from request.auth and attaches it to the request when there is no x-client-id header', async () => {
    const tenantService = {
      resolveClientIdFor: jest.fn().mockResolvedValue('client_a'),
    };
    const interceptor = new TenantInterceptor(tenantService as never);
    const request: Record<string, unknown> = {
      auth: { userId: 'user_a', clerkOrgId: null, role: null },
      headers: {},
    };
    const result = await lastValueFrom(
      await interceptor.intercept(ctx(request), next),
    );
    expect(tenantService.resolveClientIdFor).toHaveBeenCalledWith(
      request.auth,
      undefined,
    );
    expect(request.clientId).toBe('client_a');
    expect(result).toBe('ok');
  });

  it('passes the x-client-id header through to resolveClientIdFor when present', async () => {
    const tenantService = {
      resolveClientIdFor: jest.fn().mockResolvedValue('client_b'),
    };
    const interceptor = new TenantInterceptor(tenantService as never);
    const request: Record<string, unknown> = {
      auth: { userId: 'user_a', clerkOrgId: null, role: null },
      headers: { 'x-client-id': 'client_b' },
    };
    const result = await lastValueFrom(
      await interceptor.intercept(ctx(request), next),
    );
    expect(tenantService.resolveClientIdFor).toHaveBeenCalledWith(
      request.auth,
      'client_b',
    );
    expect(request.clientId).toBe('client_b');
    expect(result).toBe('ok');
  });

  it('passes through when there is no auth (public route)', async () => {
    const tenantService = { resolveClientIdFor: jest.fn() };
    const interceptor = new TenantInterceptor(tenantService as never);
    const request: Record<string, unknown> = { headers: {} };
    const result = await lastValueFrom(
      await interceptor.intercept(ctx(request), next),
    );
    expect(tenantService.resolveClientIdFor).not.toHaveBeenCalled();
    expect(request.clientId).toBeUndefined();
    expect(result).toBe('ok');
  });
});
