import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';

function ctx(auth: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  it('resolves and stores client_id from request.auth', async () => {
    const tenantService = { resolveClientId: jest.fn().mockResolvedValue('client_a') };
    const tenantContext = { set: jest.fn(), get clientId() { return 'client_a'; } };
    const interceptor = new TenantInterceptor(
      tenantService as never,
      tenantContext as never,
    );
    const next: CallHandler = { handle: () => of('ok') };
    const auth = { userId: 'u', clerkOrgId: 'org_a', role: 'admin' };
    const result = await lastValueFrom(await interceptor.intercept(ctx(auth), next));
    expect(tenantService.resolveClientId).toHaveBeenCalledWith(auth);
    expect(tenantContext.set).toHaveBeenCalledWith('client_a');
    expect(result).toBe('ok');
  });
});
