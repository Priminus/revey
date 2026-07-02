import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';
import { TenantContextService } from '../../tenancy/tenant-context.service';

@Controller('integrations/xero')
export class XeroController {
  constructor(
    private readonly oauth: XeroOAuthService,
    private readonly connections: XeroConnectionService,
    private readonly tenant: TenantContextService,
  ) {}

  @Get('connect')
  connect(@Res() res: Response): void {
    const state = Buffer.from(this.tenant.clientId).toString('base64url');
    res.redirect(this.oauth.buildAuthorizeUrl(state));
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const clientId = Buffer.from(state, 'base64url').toString('utf8');
    if (clientId !== this.tenant.clientId) {
      throw new ForbiddenException('State does not match current tenant');
    }
    const tokens = await this.oauth.exchangeCode(code);
    const orgs = await this.oauth.getConnections(tokens.accessToken);
    await this.connections.saveConnection(clientId, orgs[0].tenantId, tokens);
    const uiUrl = process.env.UI_URL ?? 'http://localhost:3000';
    res.redirect(`${uiUrl}/connections?xero=connected`);
  }

  @Get('status')
  status(): Promise<{ connected: boolean; xeroTenantId?: string }> {
    return this.connections.getStatus(this.tenant.clientId);
  }
}
