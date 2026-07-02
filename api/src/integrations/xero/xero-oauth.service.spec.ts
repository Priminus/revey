import { XeroOAuthService } from './xero-oauth.service';

describe('XeroOAuthService', () => {
  const svc = new XeroOAuthService({
    clientId: 'cid',
    clientSecret: 'secret',
    redirectUri: 'http://localhost:3001/api/integrations/xero/callback',
  });

  it('builds an authorize url with state and scopes', () => {
    const url = new URL(svc.buildAuthorizeUrl('state123'));
    expect(url.origin + url.pathname).toBe(
      'https://login.xero.com/identity/connect/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('accounting.transactions.read');
    expect(url.searchParams.get('scope')).toContain('offline_access');
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
});
