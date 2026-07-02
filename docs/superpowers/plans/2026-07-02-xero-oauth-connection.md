# Xero OAuth Connection Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Revey client connect their Xero organisation via OAuth 2.0, storing encrypted per-client tokens that auto-refresh, with every Revey API route tenant-scoped by the Clerk-org → `client_id` mapping.

**Architecture:** NestJS gains a global `ClerkGuard` (health stays public) and a request-scoped `TenantContext` populated by an interceptor that resolves `client_id` from the Clerk org. A new `integrations/xero` module implements the Authorization Code flow (authorize redirect → callback → token exchange), fetches the connected Xero org id, and persists an encrypted `XeroConnection` row per client. A thin `XeroOAuthService` wraps Xero's identity endpoints over `fetch` (no SDK) so it is unit-testable. The Next.js console gains a Connections page to start the flow and show status.

**Tech Stack:** TypeScript, NestJS, Prisma 6.x (pinned), Supabase Postgres, Clerk, Node `crypto` (AES-256-GCM), Next.js App Router, Jest.

## Global Constraints

- **Language:** TypeScript only, explicit param + return types. **Package manager:** npm.
- **Naming:** files kebab-case; classes/components PascalCase; vars/functions camelCase; DB columns snake_case via Prisma `@map`; constants UPPER_SNAKE_CASE.
- **Prisma pinned to `^6.x`** — do not upgrade to 7 (it drops schema-level `url`/`directUrl`). Datasource keeps `url = env("DATABASE_URL")` + `directUrl = env("DIRECT_URL")`.
- **Tenancy invariant:** every domain table carries `client_id`; the tenant interceptor resolves it from the Clerk org and no route may serve cross-`client_id` data. Health endpoint (`/api/health`) is the only public route.
- **DB is a shared live Supabase project** (`ap-south-1`). Never run `migrate reset`/`db push --force`/anything destructive. The DB is currently clean (only `clients`, `debtors`, `_prisma_migrations`), so normal `prisma migrate dev` works.
- **Secrets:** never commit `.env`/`.env.local`. Xero creds already in root `.env`: `XERO_CLIENT_ID`, `XERO_SECRET_KEY`, `XERO_WEBHOOK_KEY`. Token encryption uses a new `ENCRYPTION_KEY` (32-byte, base64).
- **Xero specifics (decided):** Authorization Code flow with client secret. Redirect URIs registered for BOTH `http://localhost:3001/api/integrations/xero/callback` and `https://revey-api.fly.dev/api/integrations/xero/callback`. Build/test against the **Xero Demo Company**. Scopes: `openid profile email accounting.transactions.read accounting.contacts.read accounting.reports.read offline_access`.
- **Xero endpoints:** authorize `https://login.xero.com/identity/connect/authorize`; token `https://identity.xero.com/connect/token`; connections `https://api.xero.com/connections`.

---

### Task 1: Global auth guard + tenant request context

**Files:**
- Create: `api/src/tenancy/tenant-context.service.ts`, `api/src/tenancy/tenant.interceptor.ts`
- Modify: `api/src/tenancy/tenant.module.ts`, `api/src/app.module.ts`
- Create: `api/src/health/health.public.decorator.ts` (Public route marker)
- Modify: `api/src/auth/clerk.guard.ts` (honour `@Public()`), `api/src/health/health.controller.ts` (mark public)
- Test: `api/src/tenancy/tenant.interceptor.spec.ts`, `api/test/tenant-scope.e2e-spec.ts`

**Interfaces:**
- Consumes: `ClerkGuard`, `AuthContext` (Plan 1), `TenantService.resolveClientId` (Plan 1).
- Produces:
  - `@Public()` decorator setting metadata `isPublic=true`.
  - `TenantContextService` (request-scoped): `set(clientId: string): void`, `get clientId(): string` (throws if unset).
  - `TenantInterceptor` — resolves `client_id` via `TenantService.resolveClientId(request.auth)` and stores it in `TenantContextService`.
  - `ClerkGuard` registered as `APP_GUARD`; `TenantInterceptor` as `APP_INTERCEPTOR`.

- [ ] **Step 1: Write the failing interceptor test**

`api/src/tenancy/tenant.interceptor.spec.ts`:
```typescript
import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { TenantInterceptor } from './tenant.interceptor';

function ctx(auth: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

describe('TenantInterceptor', () => {
  it('resolves and stores client_id from request.auth', async () => {
    const tenantService = { resolveClientId: jest.fn().mockResolvedValue('client_a') };
    const tenantContext = { set: jest.fn(), get clientId() { return 'client_a'; } };
    const interceptor = new TenantInterceptor(
      tenantService as never,
      tenantContext as never,
    );
    const next: CallHandler = { handle: () => of('ok') };
    const auth = { userId: 'u', clerkOrgId: 'org_a', role: 'admin' };
    const result = await lastValueFrom(await interceptor.intercept(ctx(auth), next));
    expect(tenantService.resolveClientId).toHaveBeenCalledWith(auth);
    expect(tenantContext.set).toHaveBeenCalledWith('client_a');
    expect(result).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx jest src/tenancy/tenant.interceptor.spec.ts`
Expected: FAIL — cannot find `./tenant.interceptor`.

- [ ] **Step 3: Implement the public decorator**

`api/src/health/health.public.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 4: Implement TenantContextService and interceptor**

`api/src/tenancy/tenant-context.service.ts`:
```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private _clientId: string | null = null;

  set(clientId: string): void {
    this._clientId = clientId;
  }

  get clientId(): string {
    if (!this._clientId) {
      throw new Error('Tenant context not set for this request');
    }
    return this._clientId;
  }
}
```

`api/src/tenancy/tenant.interceptor.ts`:
```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthContext } from '../auth/auth-context';
import { TenantService } from './tenant.service';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<{ auth?: AuthContext }>();
    if (request.auth) {
      const clientId = await this.tenantService.resolveClientId(request.auth);
      this.tenantContext.set(clientId);
    }
    return next.handle();
  }
}
```

- [ ] **Step 5: Make ClerkGuard honour @Public()**

Modify `api/src/auth/clerk.guard.ts`: inject `Reflector`, and at the top of `canActivate` return `true` when `reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, class])` is true. Update `auth.module.ts` guard factory to pass a `Reflector` (inject `Reflector`). Mark `HealthController.check` with `@Public()`.

```typescript
// clerk.guard.ts — add imports
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../health/health.public.decorator';
// constructor: (private readonly verifier: TokenVerifier, private readonly reflector: Reflector)
// first line of canActivate:
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  context.getHandler(),
  context.getClass(),
]);
if (isPublic) return true;
```

Update `auth.module.ts`:
```typescript
{
  provide: ClerkGuard,
  useFactory: (v: TokenVerifier, reflector: Reflector) => new ClerkGuard(v, reflector),
  inject: [TOKEN_VERIFIER, Reflector],
},
```
(Reflector is available from `@nestjs/core` without extra providers.)

- [ ] **Step 6: Register guard + interceptor globally**

In `api/src/tenancy/tenant.module.ts`, add `TenantContextService` to providers/exports and export `TenantService`. In `api/src/app.module.ts` add:
```typescript
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClerkGuard } from './auth/clerk.guard';
import { TenantInterceptor } from './tenancy/tenant.interceptor';
// providers:
{ provide: APP_GUARD, useExisting: ClerkGuard },
{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
```
Ensure `AuthModule` exports `ClerkGuard` and `TenantModule` exports its services so they resolve.

- [ ] **Step 7: Run interceptor unit test — expect PASS**

Run: `cd api && npx jest src/tenancy/tenant.interceptor.spec.ts`
Expected: PASS.

- [ ] **Step 8: Write an e2e test proving health is public, others guarded**

`api/test/tenant-scope.e2e-spec.ts`: boot the app with a stubbed `TOKEN_VERIFIER` provider overridden via `overrideProvider(TOKEN_VERIFIER)`, set global prefix `api`. Assert:
- `GET /api/health` → 200 without auth.
- A test-only protected route (or any non-public route) → 401 without a bearer token.

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TOKEN_VERIFIER } from '../src/auth/clerk.guard';

describe('tenant scope (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockRejectedValue(new Error('no')) })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('health is public', () =>
    request(app.getHttpServer()).get('/api/health').expect(200));
});
```

- [ ] **Step 9: Run e2e + full suite**

Run: `cd api && npx jest --config ./test/jest-e2e.json` then `cd api && npx jest`
Expected: all pass, output pristine.

- [ ] **Step 10: Commit**

```bash
git add api/src/tenancy api/src/auth api/src/health api/src/app.module.ts api/test/tenant-scope.e2e-spec.ts
git commit -m "feat: global auth guard + tenant request context"
```

---

### Task 2: Token encryption service (AES-256-GCM)

**Files:**
- Create: `api/src/crypto/encryption.service.ts`, `api/src/crypto/crypto.module.ts`
- Modify: `api/.env.example` (add `ENCRYPTION_KEY`)
- Test: `api/src/crypto/encryption.service.spec.ts`

**Interfaces:**
- Produces: `EncryptionService.encrypt(plain: string): string` and `decrypt(payload: string): string`, where the encrypted form is `base64(iv).base64(authTag).base64(ciphertext)` joined by `.`. Key read from `ENCRYPTION_KEY` (base64, 32 bytes).

- [ ] **Step 1: Generate a key and add to env**

Run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and put the result in root `.env` and `api/.env` as `ENCRYPTION_KEY=...`. Add `ENCRYPTION_KEY="<base64-32-bytes>"` to `api/.env.example` (placeholder).

- [ ] **Step 2: Write the failing test**

`api/src/crypto/encryption.service.spec.ts`:
```typescript
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const key = randomBytes(32).toString('base64');
  const service = new EncryptionService(key);

  it('round-trips a secret', () => {
    const secret = 'refresh-token-value-123';
    const enc = service.encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(service.decrypt(enc)).toBe(secret);
  });

  it('produces different ciphertext each call (random IV)', () => {
    expect(service.encrypt('x')).not.toBe(service.encrypt('x'));
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `cd api && npx jest src/crypto/encryption.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement EncryptionService**

`api/src/crypto/encryption.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(keyBase64: string = process.env.ENCRYPTION_KEY ?? '') {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    const decipher = createDecipheriv(
      ALGO,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
```

`api/src/crypto/crypto.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [{ provide: EncryptionService, useFactory: () => new EncryptionService() }],
  exports: [EncryptionService],
})
export class CryptoModule {}
```
Add `CryptoModule` to `AppModule` imports.

- [ ] **Step 5: Run test — expect PASS**

Run: `cd api && npx jest src/crypto/encryption.service.spec.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add api/src/crypto api/.env.example api/src/app.module.ts
git commit -m "feat: AES-256-GCM token encryption service"
```

---

### Task 3: XeroConnection model + migration

**Files:**
- Modify: `api/prisma/schema.prisma`
- Test: (migration verified via `prisma migrate status`; no unit test)

**Interfaces:**
- Produces: `XeroConnection` table — one per client (a client connects one Xero org in MVP): `id`, `clientId` (unique, FK→clients cascade), `xeroTenantId` (the Xero org id), `accessTokenEnc`, `refreshTokenEnc`, `expiresAt`, timestamps.

- [ ] **Step 1: Add the model**

Add to `api/prisma/schema.prisma`:
```prisma
model XeroConnection {
  id              String   @id @default(uuid())
  clientId        String   @unique @map("client_id")
  xeroTenantId    String   @map("xero_tenant_id")
  accessTokenEnc  String   @map("access_token_enc")
  refreshTokenEnc String   @map("refresh_token_enc")
  expiresAt       DateTime @map("expires_at")
  client          Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("xero_connections")
}
```
Add back-relation on `Client`: `xeroConnection XeroConnection?`.

- [ ] **Step 2: Migrate (clean DB — normal flow)**

Run: `cd api && npx prisma migrate dev --name add_xero_connection`
Expected: `xero_connections` table created. **If Prisma prompts to reset the DB, STOP and report** (the DB should be clean).

- [ ] **Step 3: Verify + regenerate client**

Run: `cd api && npx prisma migrate status` (up to date) and `npx prisma generate`.
Expected: status clean; client regenerated with `xeroConnection` delegate.

- [ ] **Step 4: Commit**

```bash
git add api/prisma
git commit -m "feat: add XeroConnection model + migration"
```

---

### Task 4: XeroOAuthService (identity endpoints over fetch)

**Files:**
- Create: `api/src/integrations/xero/xero-oauth.service.ts`
- Test: `api/src/integrations/xero/xero-oauth.service.spec.ts`

**Interfaces:**
- Produces:
  - `buildAuthorizeUrl(state: string): string` — Xero consent URL with client id, redirect uri, scopes, `state`.
  - `exchangeCode(code: string): Promise<XeroTokenSet>` — POST code → `{ accessToken, refreshToken, expiresInSec }`.
  - `refresh(refreshToken: string): Promise<XeroTokenSet>`.
  - `getConnections(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string }>>`.
  - `type XeroTokenSet = { accessToken: string; refreshToken: string; expiresInSec: number }`.
- Config read from env: `XERO_CLIENT_ID`, `XERO_SECRET_KEY`, and `XERO_REDIRECT_URI` (defaults to `http://localhost:3001/api/integrations/xero/callback`).

- [ ] **Step 1: Write the failing test (mock global fetch)**

`api/src/integrations/xero/xero-oauth.service.spec.ts`:
```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd api && npx jest src/integrations/xero/xero-oauth.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement XeroOAuthService**

`api/src/integrations/xero/xero-oauth.service.ts`:
```typescript
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
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd api && npx jest src/integrations/xero/xero-oauth.service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add api/src/integrations/xero/xero-oauth.service.ts api/src/integrations/xero/xero-oauth.service.spec.ts
git commit -m "feat: Xero OAuth service (authorize/exchange/refresh/connections)"
```

---

### Task 5: Xero connection service + controller (connect, callback, status)

**Files:**
- Create: `api/src/integrations/xero/xero-connection.service.ts`, `api/src/integrations/xero/xero.controller.ts`, `api/src/integrations/xero/xero.module.ts`
- Modify: `api/src/app.module.ts` (import `XeroModule`)
- Test: `api/src/integrations/xero/xero-connection.service.spec.ts`

**Interfaces:**
- Consumes: `XeroOAuthService` (Task 4), `EncryptionService` (Task 2), `PrismaService`, `TenantContextService` (Task 1).
- Produces:
  - `XeroConnectionService.saveConnection(clientId, xeroTenantId, tokens: XeroTokenSet): Promise<void>` — encrypts tokens, upserts `XeroConnection`, sets `expiresAt = now + expiresInSec`.
  - `XeroConnectionService.getStatus(clientId): Promise<{ connected: boolean; xeroTenantId?: string }>`.
  - Controller routes (all tenant-scoped except none public):
    - `GET /api/integrations/xero/connect` → 302 redirect to `buildAuthorizeUrl(state)`, where `state` encodes the caller's `client_id` (signed/opaque) so the callback can attribute the connection.
    - `GET /api/integrations/xero/callback?code&state` → exchanges code, fetches first connection's `tenantId`, saves, redirects to the console Connections page.
    - `GET /api/integrations/xero/status` → returns `getStatus` for the current tenant.

- [ ] **Step 1: Write the failing service test**

`api/src/integrations/xero/xero-connection.service.spec.ts`:
```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd api && npx jest src/integrations/xero/xero-connection.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the connection service**

`api/src/integrations/xero/xero-connection.service.ts`:
```typescript
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
```

- [ ] **Step 4: Run service test — expect PASS**

Run: `cd api && npx jest src/integrations/xero/xero-connection.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Implement controller + module**

`api/src/integrations/xero/xero.controller.ts` — `state` carries the `client_id` from `TenantContextService` (request-scoped). For MVP, sign `state` as `base64url(clientId)`; on callback, decode it and verify it matches the current tenant context (defence against mismatched callback). Redirect target for success: `${process.env.UI_URL ?? 'http://localhost:3000'}/connections?xero=connected`.

```typescript
import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
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
```

`api/src/integrations/xero/xero.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { XeroController } from './xero.controller';
import { XeroOAuthService } from './xero-oauth.service';
import { XeroConnectionService } from './xero-connection.service';

@Module({
  controllers: [XeroController],
  providers: [
    { provide: XeroOAuthService, useFactory: () => new XeroOAuthService() },
    XeroConnectionService,
  ],
  exports: [XeroOAuthService, XeroConnectionService],
})
export class XeroModule {}
```
Add `XeroModule` to `AppModule` imports.

- [ ] **Step 6: Note on the callback route + auth**

The Xero callback is a server-to-browser redirect; the browser hits it with the user's Clerk session cookie, so the global guard + tenant interceptor still apply. Confirm the callback resolves the tenant from the session AND that `state`-decoded `clientId` equals `this.tenant.clientId`; if they differ, respond 403. Add that check in `callback` before saving.

- [ ] **Step 7: Run full suite + typecheck**

Run: `cd api && npx jest && npx tsc --noEmit`
Expected: all pass, clean types.

- [ ] **Step 8: Commit**

```bash
git add api/src/integrations/xero api/src/app.module.ts
git commit -m "feat: Xero connect/callback/status endpoints with encrypted token storage"
```

---

### Task 6: Console Connections page + UI health check

**Files:**
- Create: `ui/app/connections/page.tsx`
- Modify: `ui/fly.toml` (add health check)
- Test: `ui/app/connections/page.test.tsx`

**Interfaces:**
- Consumes: API `GET /api/integrations/xero/status` and `GET /api/integrations/xero/connect`.
- Produces: a Connections page showing Xero connected/disconnected state with a "Connect Xero" button linking to the connect endpoint.

- [ ] **Step 1: Write the failing test**

`ui/app/connections/page.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import ConnectionsPage from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

describe('ConnectionsPage', () => {
  it('renders a Connect Xero action', () => {
    render(<ConnectionsPage />);
    expect(screen.getByText(/connect xero/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd ui && npx jest app/connections/page.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

`ui/app/connections/page.tsx`:
```typescript
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export default function ConnectionsPage() {
  return (
    <main className="p-8">
      <SignedIn>
        <h1 className="text-2xl font-bold mb-4">Connections</h1>
        <div className="border rounded p-4 flex items-center justify-between max-w-md">
          <div>
            <p className="font-medium">Xero</p>
            <p className="text-sm text-gray-500">Accounting &amp; AR data source</p>
          </div>
          <a
            href={`${API_URL}/integrations/xero/connect`}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Connect Xero
          </a>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd ui && npx jest app/connections/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add UI health check to fly.toml (carried-forward parity)**

In `ui/fly.toml`, add under `[http_service]`:
```toml
  [[http_service.checks]]
    path = "/"
    method = "GET"
    protocol = "http"
    grace_period = "10s"
```

- [ ] **Step 6: Build + commit**

Run: `cd ui && npm run build` (must succeed).
```bash
git add ui/app/connections ui/fly.toml
git commit -m "feat: console Connections page + UI health check"
```

---

## Self-Review

**Spec coverage:** Plan 2 delivers OAuth connect + encrypted per-client token storage + tenant-scoped routes + console entry point — the "OAuth connect" half of the spec's Plan-2 line. AR sync, invoice models, and webhooks move to Plan 3 (explicitly). Carried-forward items 1, 3, 4 from Plan 1 are covered (Tasks 1 and 6); item 2 (deep RLS role enforcement) is intentionally deferred to a later hardening plan — app-layer isolation via the tenant interceptor is now the enforced primary mechanism, matching the spec's stated model.

**Placeholder scan:** No TBD/TODO. `ENCRYPTION_KEY` generation is an explicit command, not a placeholder.

**Type consistency:** `XeroTokenSet` (Task 4) is consumed by `saveConnection` (Task 5). `TenantContextService.clientId` (Task 1) is used by the controller (Task 5). `EncryptionService.encrypt/decrypt` (Task 2) used by `XeroConnectionService` (Task 5). `XeroConnection` fields (Task 3: `clientId`, `xeroTenantId`, `accessTokenEnc`, `refreshTokenEnc`, `expiresAt`) match the upsert in Task 5. Consistent.

**Deferred to Plan 3:** invoice/aging models, contacts→debtors mapping, scheduled poll sync, Xero webhook receiver (signature verify with `XERO_WEBHOOK_KEY`, intent-to-receive), and automatic token refresh on expiry during API calls.
