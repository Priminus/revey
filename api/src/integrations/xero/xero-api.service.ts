import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../crypto/encryption.service';
import { XeroOAuthService } from './xero-oauth.service';

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
const REFRESH_BUFFER_MS = 60_000;

@Injectable()
export class XeroApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly oauth: XeroOAuthService,
  ) {}

  async getAccess(
    clientId: string,
  ): Promise<{ accessToken: string; tenantId: string }> {
    const conn = await this.prisma.xeroConnection.findUnique({
      where: { clientId },
    });
    if (!conn) {
      throw new NotFoundException('No Xero connection for this client');
    }
    const stale = conn.expiresAt.getTime() <= Date.now() + REFRESH_BUFFER_MS;
    if (!stale) {
      return {
        accessToken: this.encryption.decrypt(conn.accessTokenEnc),
        tenantId: conn.xeroTenantId,
      };
    }
    const refreshToken = this.encryption.decrypt(conn.refreshTokenEnc);
    const tokens = await this.oauth.refresh(refreshToken);
    await this.prisma.xeroConnection.update({
      where: { clientId },
      data: {
        accessTokenEnc: this.encryption.encrypt(tokens.accessToken),
        refreshTokenEnc: this.encryption.encrypt(tokens.refreshToken),
        expiresAt: new Date(Date.now() + tokens.expiresInSec * 1000),
      },
    });
    return { accessToken: tokens.accessToken, tenantId: conn.xeroTenantId };
  }

  async get<T>(clientId: string, path: string): Promise<T> {
    const { accessToken, tenantId } = await this.getAccess(clientId);
    const res = await fetch(`${XERO_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Xero API GET ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
