import { Test, TestingModule } from '@nestjs/testing';
import { XeroController } from './xero.controller';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';
import { EncryptionService } from '../../crypto/encryption.service';

describe('XeroController', () => {
  let controller: XeroController;
  let oauth: jest.Mocked<Pick<XeroOAuthService, 'buildAuthorizeUrl' | 'exchangeCode' | 'getConnections'>>;
  let connections: jest.Mocked<Pick<XeroConnectionService, 'saveConnection' | 'getStatus'>>;
  let encryption: jest.Mocked<Pick<EncryptionService, 'encrypt' | 'decrypt'>>;
  let res: { redirect: jest.Mock };

  beforeEach(async () => {
    oauth = {
      buildAuthorizeUrl: jest.fn().mockReturnValue('https://login.xero.com/authorize?state=enc-state'),
      exchangeCode: jest.fn(),
      getConnections: jest.fn(),
    };
    connections = {
      saveConnection: jest.fn(),
      getStatus: jest.fn(),
    };
    encryption = {
      encrypt: jest.fn().mockReturnValue('enc-state'),
      decrypt: jest.fn().mockReturnValue('client-123'),
    };
    res = { redirect: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [XeroController],
      providers: [
        { provide: XeroOAuthService, useValue: oauth },
        { provide: XeroConnectionService, useValue: connections },
        { provide: EncryptionService, useValue: encryption },
      ],
    }).compile();

    controller = module.get<XeroController>(XeroController);
  });

  describe('connect', () => {
    it('encrypts the tenant clientId into state and returns the authorize URL', () => {
      const result = controller.connect('client-123');

      expect(encryption.encrypt).toHaveBeenCalledWith('client-123');
      expect(oauth.buildAuthorizeUrl).toHaveBeenCalledWith('enc-state');
      expect(result).toEqual({ authorizeUrl: 'https://login.xero.com/authorize?state=enc-state' });
    });
  });

  describe('callback', () => {
    it('redirects to an error page when Xero reports an error', async () => {
      await controller.callback(undefined, undefined, 'access_denied', res as never);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/connections?xero=error');
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
      expect(connections.saveConnection).not.toHaveBeenCalled();
    });

    it('redirects to an error page when code or state is missing', async () => {
      await controller.callback(undefined, 'some-state', undefined, res as never);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/connections?xero=error');
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('redirects to an error page when state fails to decrypt', async () => {
      encryption.decrypt.mockImplementation(() => {
        throw new Error('bad auth tag');
      });

      await controller.callback('a-code', 'tampered-state', undefined, res as never);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/connections?xero=error');
      expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });

    it('exchanges the code, saves the connection, and redirects on success', async () => {
      oauth.exchangeCode.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresInSec: 1800,
      });
      oauth.getConnections.mockResolvedValue([
        { tenantId: 'xero-tenant-1', tenantName: 'Acme', updatedDateUtc: '2026-01-01T00:00:00Z' },
      ]);

      await controller.callback('a-code', 'enc-state', undefined, res as never);

      expect(encryption.decrypt).toHaveBeenCalledWith('enc-state');
      expect(oauth.exchangeCode).toHaveBeenCalledWith('a-code');
      expect(oauth.getConnections).toHaveBeenCalledWith('at');
      expect(connections.saveConnection).toHaveBeenCalledWith(
        'client-123',
        'xero-tenant-1',
        { accessToken: 'at', refreshToken: 'rt', expiresInSec: 1800 },
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/connections?xero=connected');
    });

    it('saves the most recently authorized org, not orgs[0]', async () => {
      oauth.exchangeCode.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresInSec: 1800,
      });
      // orgs[0] is an older org; the freshly-authorized one has a newer updatedDateUtc.
      oauth.getConnections.mockResolvedValue([
        { tenantId: 'old-org', tenantName: 'Old', updatedDateUtc: '2026-01-01T00:00:00Z' },
        { tenantId: 'just-authorized', tenantName: 'Fresh', updatedDateUtc: '2026-07-03T00:00:00Z' },
      ]);

      await controller.callback('a-code', 'enc-state', undefined, res as never);

      expect(connections.saveConnection).toHaveBeenCalledWith(
        'client-123',
        'just-authorized',
        expect.anything(),
      );
    });

    it('redirects to an error page when Xero returns no orgs', async () => {
      oauth.exchangeCode.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresInSec: 1800,
      });
      oauth.getConnections.mockResolvedValue([]);

      await controller.callback('a-code', 'enc-state', undefined, res as never);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/connections?xero=error');
      expect(connections.saveConnection).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('returns the connection status for the current tenant', async () => {
      connections.getStatus.mockResolvedValue({ connected: true, xeroTenantId: 'xero-tenant-1' });

      const result = await controller.status('client-123');

      expect(connections.getStatus).toHaveBeenCalledWith('client-123');
      expect(result).toEqual({ connected: true, xeroTenantId: 'xero-tenant-1' });
    });
  });
});
