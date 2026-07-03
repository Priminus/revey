import { XeroApiService } from './xero-api.service';

describe('XeroApiService', () => {
  const now = Date.now();
  const prisma = { xeroConnection: { findUnique: jest.fn(), update: jest.fn() } };
  const encryption = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
    decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
  };
  const oauth = { refresh: jest.fn() };
  const svc = new XeroApiService(prisma as never, encryption as never, oauth as never);

  afterEach(() => jest.clearAllMocks());

  it('returns the stored token when not expired', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue({
      clientId: 'c1',
      xeroTenantId: 't1',
      accessTokenEnc: 'enc(at-stored)',
      refreshTokenEnc: 'enc(rt)',
      expiresAt: new Date(now + 10 * 60_000),
    });
    const res = await svc.getAccess('c1');
    expect(res).toEqual({ accessToken: 'at-stored', tenantId: 't1' });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes, persists, and returns a new token when expired', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue({
      clientId: 'c1',
      xeroTenantId: 't1',
      accessTokenEnc: 'enc(at-old)',
      refreshTokenEnc: 'enc(rt-old)',
      expiresAt: new Date(now - 1000),
    });
    oauth.refresh.mockResolvedValue({
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      expiresInSec: 1800,
    });
    const res = await svc.getAccess('c1');
    expect(oauth.refresh).toHaveBeenCalledWith('rt-old');
    expect(res.accessToken).toBe('at-new');
    const update = prisma.xeroConnection.update.mock.calls[0][0];
    expect(update.where).toEqual({ clientId: 'c1' });
    expect(update.data.accessTokenEnc).toBe('enc(at-new)');
    expect(update.data.refreshTokenEnc).toBe('enc(rt-new)');
  });
});
