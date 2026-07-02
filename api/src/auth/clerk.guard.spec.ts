import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ClerkGuard } from './clerk.guard';

function ctxWithHeader(header?: string): ExecutionContext {
  const request: { headers: Record<string, string>; auth?: unknown } = {
    headers: header ? { authorization: header } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ClerkGuard', () => {
  it('rejects a request with no bearer token', async () => {
    const verifier = { verify: jest.fn() };
    const guard = new ClerkGuard(verifier);
    await expect(guard.canActivate(ctxWithHeader())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches auth context on a valid token', async () => {
    const verifier = {
      verify: jest.fn().mockResolvedValue({
        sub: 'user_1',
        org_id: 'org_1',
        org_role: 'admin',
      }),
    };
    const guard = new ClerkGuard(verifier);
    const ctx = ctxWithHeader('Bearer good-token');
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    const request = ctx.switchToHttp().getRequest();
    expect(request.auth).toEqual({
      userId: 'user_1',
      clerkOrgId: 'org_1',
      role: 'admin',
    });
  });
});
