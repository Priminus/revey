import { Injectable } from '@nestjs/common';

export interface XeroOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface XeroTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
// Xero granular read scopes for AR collections. `accounting.transactions.read`
// and `accounting.reports.read` are the deprecated broad scopes and are NOT
// enabled on modern Xero apps — use the granular ones (invoices, payments,
// aged-receivables report) instead. openid/profile/email/offline_access are
// standard OIDC scopes and do not appear in the app's scope config list.
const SCOPES =
  'openid profile email accounting.contacts.read accounting.invoices.read accounting.payments.read accounting.reports.aged.read offline_access';

@Injectable()
export class XeroOAuthService {
  constructor(
    private readonly config: XeroOAuthConfig = {
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_SECRET_KEY ?? '',
      redirectUri:
        process.env.XERO_REDIRECT_URI ??
        'http://localhost:3001/api/integrations/xero/callback',
    },
  ) {}

  buildAuthorizeUrl(state: string): string {
    // Build the query manually with encodeURIComponent so scope separators are
    // `%20`, not `+`. Xero's authorize endpoint percent-decodes strictly and
    // rejects `+`-separated scopes as a single invalid scope (invalid_scope).
    const query = [
      ['response_type', 'code'],
      ['client_id', this.config.clientId],
      ['redirect_uri', this.config.redirectUri],
      ['scope', SCOPES],
      ['state', state],
    ]
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return `${AUTHORIZE_URL}?${query}`;
  }

  private basicAuthHeader(): string {
    const raw = `${this.config.clientId}:${this.config.clientSecret}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
  }

  private async token(body: URLSearchParams): Promise<XeroTokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: this.basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Xero token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresInSec: json.expires_in,
    };
  }

  exchangeCode(code: string): Promise<XeroTokenSet> {
    return this.token(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    );
  }

  refresh(refreshToken: string): Promise<XeroTokenSet> {
    return this.token(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
  }

  async getConnections(
    accessToken: string,
  ): Promise<Array<{ tenantId: string; tenantName: string }>> {
    const res = await fetch(CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Xero connections fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as Array<{ tenantId: string; tenantName: string }>;
    return json.map((c) => ({ tenantId: c.tenantId, tenantName: c.tenantName }));
  }
}
