import { XeroConnectionService } from './xero-connection.service';

describe('XeroConnectionService', () => {
  const prisma = { xeroConnection: { upsert: jest.fn(), findUnique: jest.fn() } };
  const encryption = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
    decrypt: jest.fn((s: string) => s),
  };
  const service = new XeroConnectionService(prisma as never, encryption as never);

  afterEach(() => jest.clearAllMocks());

  it('encrypts tokens and upserts the connection', async () => {
    await service.saveConnection('client_a', 'xero_org_1', {
      accessToken: 'at', refreshToken: 'rt', expiresInSec: 1800,
    });
    expect(encryption.encrypt).toHaveBeenCalledWith('at');
    expect(encryption.encrypt).toHaveBeenCalledWith('rt');
    const arg = prisma.xeroConnection.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ clientId: 'client_a' });
    expect(arg.create.accessTokenEnc).toBe('enc(at)');
    expect(arg.create.xeroTenantId).toBe('xero_org_1');
  });

  it('reports connected status', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue({ xeroTenantId: 'xero_org_1' });
    expect(await service.getStatus('client_a')).toEqual({
      connected: true, xeroTenantId: 'xero_org_1',
    });
  });

  it('reports disconnected when no row', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue(null);
    expect(await service.getStatus('client_a')).toEqual({ connected: false });
  });
});
