import { XeroOAuthService } from './xero-oauth.service';

describe('XeroOAuthService', () => {
  const svc = new XeroOAuthService({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'http://localhost:3001/api/integrations/xero/callback',
  });

  it('builds an authorize url with state and granular scopes', () => {
    const raw = svc.buildAuthorizeUrl('state123');
    const url = new URL(raw);
    expect(url.origin + url.pathname).toBe(
      'https://login.xero.com/identity/connect/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('response_type')).toBe('code');
    // Granular Xero scopes (not the deprecated broad accounting.transactions/reports).
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope).toContain('accounting.invoices.read');
    expect(scope).toContain('accounting.contacts.read');
    expect(scope).toContain('accounting.reports.aged.read');
    expect(scope).toContain('offline_access');
    expect(scope).not.toContain('accounting.transactions.read');
    // Scope separators must be %20, not `+` — Xero rejects `+` as invalid_scope.
    expect(raw).toContain('scope=openid%20profile%20email');
    expect(raw).not.toMatch(/scope=[^&]*\+/);
  });

  it('exchanges an auth code for tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 1800,
      }),
    });
    global.fetch = fetchMock as never;
    const tokens = await svc.exchangeCode('the-code');
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresInSec: 1800 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://identity.xero.com/connect/token');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=authorization_code');
  });

  it('throws on a non-ok token response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => 'invalid_grant',
    }) as never;
    await expect(svc.exchangeCode('bad')).rejects.toThrow(/xero token exchange failed/i);
  });

  it('maps connections including updatedDateUtc', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tenantId: 't1', tenantName: 'Org One', updatedDateUtc: '2026-01-01T00:00:00Z', extra: 'ignored' },
      ],
    }) as never;
    const conns = await svc.getConnections('at');
    expect(conns).toEqual([
      { tenantId: 't1', tenantName: 'Org One', updatedDateUtc: '2026-01-01T00:00:00Z' },
    ]);
  });
});
