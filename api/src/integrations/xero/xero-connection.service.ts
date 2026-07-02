import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../crypto/encryption.service';
import { XeroTokenSet } from './xero-oauth.service';

@Injectable()
export class XeroConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async saveConnection(
    clientId: string,
    xeroTenantId: string,
    tokens: XeroTokenSet,
  ): Promise<void> {
    const accessTokenEnc = this.encryption.encrypt(tokens.accessToken);
    const refreshTokenEnc = this.encryption.encrypt(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000);
    await this.prisma.xeroConnection.upsert({
      where: { clientId },
      update: { xeroTenantId, accessTokenEnc, refreshTokenEnc, expiresAt },
      create: { clientId, xeroTenantId, accessTokenEnc, refreshTokenEnc, expiresAt },
    });
  }

  async getStatus(
    clientId: string,
  ): Promise<{ connected: boolean; xeroTenantId?: string }> {
    const conn = await this.prisma.xeroConnection.findUnique({ where: { clientId } });
    return conn ? { connected: true, xeroTenantId: conn.xeroTenantId } : { connected: false };
  }
}
