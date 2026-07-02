import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';
import { EncryptionService } from '../../crypto/encryption.service';
import { Public } from '../../health/health.public.decorator';

@Controller('integrations/xero')
export class XeroController {
  constructor(
    private readonly oauth: XeroOAuthService,
    private readonly connections: XeroConnectionService,
    private readonly tenant: TenantContextService,
    private readonly encryption: EncryptionService,
  ) {}

  @Get('connect')
  connect(): { authorizeUrl: string } {
    const state = this.encryption.encrypt(this.tenant.clientId);
    return { authorizeUrl: this.oauth.buildAuthorizeUrl(state) };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const uiUrl = process.env.UI_URL ?? 'http://localhost:3000';
    if (error || !code || !state) {
      res.redirect(`${uiUrl}/connections?xero=error`);
      return;
    }
    let clientId: string;
    try {
      clientId = this.encryption.decrypt(state);
    } catch {
      res.redirect(`${uiUrl}/connections?xero=error`);
      return;
    }
    const tokens = await this.oauth.exchangeCode(code);
    const orgs = await this.oauth.getConnections(tokens.accessToken);
    if (orgs.length === 0) {
      res.redirect(`${uiUrl}/connections?xero=error`);
      return;
    }
    await this.connections.saveConnection(clientId, orgs[0].tenantId, tokens);
    res.redirect(`${uiUrl}/connections?xero=connected`);
  }

  @Get('status')
  status(): Promise<{ connected: boolean; xeroTenantId?: string }> {
    return this.connections.getStatus(this.tenant.clientId);
  }
}
