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
const SCOPES =
  'openid profile email accounting.transactions.read accounting.contacts.read accounting.reports.read offline_access';

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
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    return url.toString();
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
