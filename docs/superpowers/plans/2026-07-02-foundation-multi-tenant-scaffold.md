# Foundation & Multi-Tenant Scaffold Implementation Plan

> ## ⛔ SUPERSEDED IN PART — TENANCY IS PER-USER, NOT CLERK ORGANIZATIONS
> This plan was originally executed with **Clerk Organizations as the tenant**. That was
> **reversed** on 2026-07-02 (migration `user_based_tenancy`). Tenancy is now **per Clerk
> user**: `clients.clerk_user_id` maps one Clerk user → one `client`; `TenantService`
> resolves `client_id` from `auth.userId`. **Ignore every `clerkOrgId` / `clerk_org_id` /
> `org_id` / `OrganizationSwitcher` / "Enable Organizations" reference below** — they are
> historical. **Do NOT reintroduce Clerk Organizations.** See the ⛔ banner in the design
> spec for the rationale.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Revey monorepo with a NestJS API and Next.js console, backed by Supabase Postgres, authenticated by Clerk with Organizations as tenants, and enforce per-client data isolation at both the application and database layers — deployable to Fly.io (`sin`).

**Architecture:** NestJS `api/` owns HTTP + DI + auth; Next.js `ui/` is the managed-service console shell. Clerk verifies sessions and supplies the active Organization, which maps to a `client_id`. A NestJS tenant guard resolves `client_id` from the Clerk session and every DB query is scoped to it; Supabase Row-Level Security (RLS) enforces the same isolation at the database as defense-in-depth. Prisma owns schema + migrations against the Supabase Postgres instance.

**Tech Stack:** TypeScript, NestJS, Next.js (App Router), Prisma, Supabase (Postgres + pgvector), Clerk (`@clerk/backend`, `@clerk/nextjs`), Fly.io, Jest.

## Global Constraints

- **Language:** TypeScript only, never JavaScript. Explicit param + return types.
- **Package manager:** npm. Both `api/` and `ui/` use `npm run dev`.
- **Naming:** files kebab-case; classes/components PascalCase; vars/functions camelCase; DB columns snake_case (Prisma `@map`); constants UPPER_SNAKE_CASE.
- **Tenancy invariant:** every domain table carries `client_id`; no query may cross `client_id` without an explicit, audited ops-admin path.
- **Region:** Supabase project and Fly.io apps in Singapore (`sin` / `ap-southeast-1`) — data residency requirement.
- **Secrets:** never commit `.env` / `.env.local` (already in `.gitignore`).
- **Roles:** `ops-admin` (spans orgs), `client-admin`, `client-user`.

---

### Task 1: Monorepo + NestJS API scaffold with health check

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/nest-cli.json`
- Create: `api/src/main.ts`, `api/src/app.module.ts`
- Create: `api/src/health/health.controller.ts`, `api/src/health/health.module.ts`
- Test: `api/src/health/health.controller.spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a bootable NestJS app on port `3001` with `GET /health` → `{ status: 'ok' }`; `AppModule` importing feature modules.

- [ ] **Step 1: Scaffold the NestJS app**

```bash
cd api
npx @nestjs/cli@latest new . --package-manager npm --skip-git
# When prompted to overwrite in a non-empty dir, allow it; keep existing files.
```

- [ ] **Step 2: Write the failing test**

`api/src/health/health.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const controller = moduleRef.get(HealthController);
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd api && npx jest src/health/health.controller.spec.ts`
Expected: FAIL — cannot find module `./health.controller`.

- [ ] **Step 4: Implement the health module**

`api/src/health/health.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

`api/src/health/health.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

- [ ] **Step 5: Wire into AppModule and set port**

`api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule] })
export class AppModule {}
```

`api/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && npx jest src/health/health.controller.spec.ts`
Expected: PASS.

- [ ] **Step 7: Verify the server boots**

Run: `cd api && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 8: Commit**

```bash
git add api
git commit -m "feat: scaffold NestJS api with health check"
```

---

### Task 2: Supabase + Prisma with the Client model

**Files:**
- Create: `api/prisma/schema.prisma`
- Create: `api/src/prisma/prisma.service.ts`, `api/src/prisma/prisma.module.ts`
- Create: `api/.env.example`
- Test: `api/src/prisma/prisma.service.spec.ts`

**Interfaces:**
- Consumes: `AppModule` from Task 1.
- Produces: `PrismaService` (injectable, extends `PrismaClient`, connects on module init); a `Client` table (`id`, `name`, `clerk_org_id`, timestamps) as the tenant anchor.

- [ ] **Step 1: Install Prisma and init**

```bash
cd api
npm install @prisma/client
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Define the schema**

`api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pgbouncer pooler (6543) for runtime queries
  directUrl = env("DIRECT_URL")     // direct connection (5432) for migrations
}

model Client {
  id         String   @id @default(uuid())
  name       String
  clerkOrgId String   @unique @map("clerk_org_id")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@map("clients")
}
```

- [ ] **Step 3: Record env template**

`api/.env.example`:
```bash
DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...pooler.supabase.com:5432/postgres"
PORT=3001
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

**Use the existing Supabase project** whose credentials are already in the repo-root
`.env` (project `ap-northeast-1` / Tokyo — *do not tear it down; tables may be
truncated/dropped*). The `api/` process reads these via the root `.env`; symlink or copy
the relevant vars into `api/.env`. `DATABASE_URL` is the pgbouncer pooler (runtime);
`DIRECT_URL` is the direct connection Prisma uses for migrations. **Region caveat:** this
is Tokyo, not Singapore — acceptable for the build; flagged in the spec to revisit for
SG-residency design partners.

- [ ] **Step 4: Create the migration**

Run: `cd api && npx prisma migrate dev --name init_clients`
Expected: migration created and applied; `clients` table exists.

- [ ] **Step 5: Write the failing test**

`api/src/prisma/prisma.service.spec.ts`:
```typescript
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('exposes the client delegate', () => {
    const service = new PrismaService();
    expect(service.client).toBeDefined();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd api && npx jest src/prisma/prisma.service.spec.ts`
Expected: FAIL — cannot find `./prisma.service`.

- [ ] **Step 7: Implement PrismaService and module**

`api/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
```

`api/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

Add `PrismaModule` to `AppModule` imports.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd api && npx jest src/prisma/prisma.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api/prisma api/src/prisma api/.env.example
git commit -m "feat: add Prisma + Supabase with Client tenant model"
```

---

### Task 3: Clerk authentication guard

**Files:**
- Create: `api/src/auth/clerk.guard.ts`, `api/src/auth/auth.module.ts`
- Create: `api/src/auth/auth-context.ts` (the request-scoped tenant context type)
- Test: `api/src/auth/clerk.guard.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2).
- Produces:
  - `type AuthContext = { userId: string; clerkOrgId: string | null; role: string | null }`
  - `ClerkGuard` (implements `CanActivate`) — verifies the Clerk session token, attaches `AuthContext` to `request.auth`, throws `UnauthorizedException` when the token is missing/invalid.

- [ ] **Step 1: Install Clerk backend SDK**

```bash
cd api
npm install @clerk/backend
```

- [ ] **Step 2: Define the auth context type**

`api/src/auth/auth-context.ts`:
```typescript
export interface AuthContext {
  userId: string;
  clerkOrgId: string | null;
  role: string | null;
}
```

- [ ] **Step 3: Write the failing test**

`api/src/auth/clerk.guard.spec.ts`:
```typescript
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ClerkGuard } from './clerk.guard';

function ctxWithHeader(header?: string): ExecutionContext {
  const request: { headers: Record<string, string>; auth?: unknown } = {
    headers: header ? { authorization: header } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ClerkGuard', () => {
  it('rejects a request with no bearer token', async () => {
    const verifier = { verify: jest.fn() };
    const guard = new ClerkGuard(verifier);
    await expect(guard.canActivate(ctxWithHeader())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches auth context on a valid token', async () => {
    const verifier = {
      verify: jest.fn().mockResolvedValue({
        sub: 'user_1',
        org_id: 'org_1',
        org_role: 'admin',
      }),
    };
    const guard = new ClerkGuard(verifier);
    const ctx = ctxWithHeader('Bearer good-token');
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    const request = ctx.switchToHttp().getRequest();
    expect(request.auth).toEqual({
      userId: 'user_1',
      clerkOrgId: 'org_1',
      role: 'admin',
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd api && npx jest src/auth/clerk.guard.spec.ts`
Expected: FAIL — cannot find `./clerk.guard`.

- [ ] **Step 5: Implement the guard**

`api/src/auth/clerk.guard.ts`:
```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthContext } from './auth-context';

export interface TokenVerifier {
  verify(token: string): Promise<{
    sub: string;
    org_id?: string;
    org_role?: string;
  }>;
}

export const TOKEN_VERIFIER = 'TOKEN_VERIFIER';

@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      auth?: AuthContext;
    }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let claims: { sub: string; org_id?: string; org_role?: string };
    try {
      claims = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    request.auth = {
      userId: claims.sub,
      clerkOrgId: claims.org_id ?? null,
      role: claims.org_role ?? null,
    };
    return true;
  }
}
```

- [ ] **Step 6: Wire the real Clerk verifier in the module**

`api/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { ClerkGuard, TOKEN_VERIFIER, TokenVerifier } from './clerk.guard';

const clerkVerifier: TokenVerifier = {
  verify: (token) =>
    verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY }),
};

@Module({
  providers: [
    { provide: TOKEN_VERIFIER, useValue: clerkVerifier },
    {
      provide: ClerkGuard,
      useFactory: (v: TokenVerifier) => new ClerkGuard(v),
      inject: [TOKEN_VERIFIER],
    },
  ],
  exports: [ClerkGuard],
})
export class AuthModule {}
```

Add `AuthModule` to `AppModule` imports.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd api && npx jest src/auth/clerk.guard.spec.ts`
Expected: PASS (both cases).

- [ ] **Step 8: Commit**

```bash
git add api/src/auth
git commit -m "feat: add Clerk auth guard with tenant context"
```

---

### Task 4: Tenant resolution + scoped Prisma access with isolation test

**Files:**
- Create: `api/src/tenancy/tenant.service.ts`, `api/src/tenancy/tenant.module.ts`
- Modify: `api/prisma/schema.prisma` (add a `Debtor` table carrying `client_id` to prove scoping)
- Test: `api/src/tenancy/tenant.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `AuthContext` (Task 3).
- Produces:
  - `TenantService.resolveClientId(auth: AuthContext): Promise<string>` — maps `clerkOrgId` → `Client.id`, throws `ForbiddenException` if the org has no client.
  - `TenantService.debtorsForClient(clientId: string): Promise<Debtor[]>` — returns only that client's debtors.

- [ ] **Step 1: Add a Debtor table to prove scoping**

Add to `api/prisma/schema.prisma`:
```prisma
model Debtor {
  id        String   @id @default(uuid())
  clientId  String   @map("client_id")
  name      String
  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([clientId])
  @@map("debtors")
}
```

Add the back-relation to `Client`: `debtors Debtor[]`.

- [ ] **Step 2: Migrate**

Run: `cd api && npx prisma migrate dev --name add_debtors`
Expected: `debtors` table created.

- [ ] **Step 3: Write the failing test**

`api/src/tenancy/tenant.service.spec.ts`:
```typescript
import { ForbiddenException } from '@nestjs/common';
import { TenantService } from './tenant.service';

describe('TenantService', () => {
  const prisma = {
    client: { findUnique: jest.fn() },
    debtor: { findMany: jest.fn() },
  };
  const service = new TenantService(prisma as never);

  afterEach(() => jest.clearAllMocks());

  it('resolves clientId from the clerk org', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client_a' });
    const id = await service.resolveClientId({
      userId: 'u',
      clerkOrgId: 'org_a',
      role: 'admin',
    });
    expect(id).toBe('client_a');
  });

  it('forbids when the org maps to no client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveClientId({ userId: 'u', clerkOrgId: 'org_x', role: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only the requested client\'s debtors', async () => {
    prisma.debtor.findMany.mockResolvedValue([{ id: 'd1', clientId: 'client_a' }]);
    await service.debtorsForClient('client_a');
    expect(prisma.debtor.findMany).toHaveBeenCalledWith({
      where: { clientId: 'client_a' },
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd api && npx jest src/tenancy/tenant.service.spec.ts`
Expected: FAIL — cannot find `./tenant.service`.

- [ ] **Step 5: Implement TenantService**

`api/src/tenancy/tenant.service.ts`:
```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthContext } from '../auth/auth-context';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveClientId(auth: AuthContext): Promise<string> {
    if (!auth.clerkOrgId) {
      throw new ForbiddenException('No active organization');
    }
    const client = await this.prisma.client.findUnique({
      where: { clerkOrgId: auth.clerkOrgId },
    });
    if (!client) {
      throw new ForbiddenException('Organization is not a Revey client');
    }
    return client.id;
  }

  async debtorsForClient(clientId: string) {
    return this.prisma.debtor.findMany({ where: { clientId } });
  }
}
```

`api/src/tenancy/tenant.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';

@Module({ providers: [TenantService], exports: [TenantService] })
export class TenantModule {}
```

Add `TenantModule` to `AppModule` imports.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd api && npx jest src/tenancy/tenant.service.spec.ts`
Expected: PASS (all three cases, including cross-tenant scoping).

- [ ] **Step 7: Enable RLS as DB-level defense-in-depth**

Create a raw-SQL migration:
```bash
cd api && npx prisma migrate dev --create-only --name enable_rls_debtors
```

In the generated migration file, add:
```sql
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;

CREATE POLICY debtors_tenant_isolation ON debtors
  USING (client_id = current_setting('app.current_client_id', true));
```

Apply: `cd api && npx prisma migrate dev`
Expected: RLS enabled on `debtors`. (App sets `app.current_client_id` per request in a later task when using RLS-scoped connections; app-level scoping via `TenantService` is the primary guard for MVP.)

- [ ] **Step 8: Commit**

```bash
git add api/prisma api/src/tenancy
git commit -m "feat: tenant resolution + scoped debtor access with RLS"
```

---

### Task 5: Next.js console shell with Clerk

**Files:**
- Create: `ui/package.json`, `ui/tsconfig.json`, `ui/next.config.ts`
- Create: `ui/app/layout.tsx`, `ui/app/page.tsx`, `ui/middleware.ts`
- Create: `ui/.env.local.example`
- Test: `ui/app/page.test.tsx`

**Interfaces:**
- Consumes: the running `api/` health endpoint (Task 1), Clerk publishable key.
- Produces: an authenticated console shell that renders a signed-in landing page and redirects unauthenticated users to sign-in.

- [ ] **Step 1: Scaffold Next.js**

```bash
cd ui
npx create-next-app@latest . --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*"
# Allow overwrite in the non-empty dir.
```

- [ ] **Step 2: Install Clerk + test tooling**

```bash
cd ui
npm install @clerk/nextjs
npm install -D jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom @types/jest
```

- [ ] **Step 3: Record env template**

`ui/.env.local.example`:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

Enable **Organizations** in the Clerk dashboard (this is the tenant model).

- [ ] **Step 4: Add Clerk middleware and provider**

`ui/middleware.ts`:
```typescript
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/'],
};
```

`ui/app/layout.tsx`:
```typescript
import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 5: Write the failing test**

`ui/app/page.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import Home from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  OrganizationSwitcher: () => <div>org-switcher</div>,
}));

describe('Home', () => {
  it('renders the console heading for signed-in users', () => {
    render(<Home />);
    expect(screen.getByText('Revey Console')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd ui && npx jest app/page.test.tsx`
Expected: FAIL — heading not found / module missing.

- [ ] **Step 7: Implement the console shell**

`ui/app/page.tsx`:
```typescript
import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  OrganizationSwitcher,
} from '@clerk/nextjs';

export default function Home() {
  return (
    <main className="p-8">
      <SignedIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Revey Console</h1>
          <OrganizationSwitcher />
        </div>
        <p className="text-gray-600">Select a client to manage collections.</p>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
```

Add a Jest config (`ui/jest.config.ts`) using `jest-environment-jsdom` and `@testing-library/jest-dom`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd ui && npx jest app/page.test.tsx`
Expected: PASS.

- [ ] **Step 9: Verify build**

Run: `cd ui && npm run build`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add ui
git commit -m "feat: scaffold Next.js console shell with Clerk orgs"
```

---

### Task 6: Fly.io deploy configuration (sin region)

**Files:**
- Create: `api/Dockerfile`, `api/fly.toml`
- Create: `ui/Dockerfile`, `ui/fly.toml`
- Create: `docs/deploy.md`

**Interfaces:**
- Consumes: buildable `api/` (Task 1–4) and `ui/` (Task 5).
- Produces: two deployable Fly apps in `sin`, each reading secrets from Fly, with the API reachable by the UI.

- [ ] **Step 1: Add the API Dockerfile**

`api/Dockerfile`:
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2: Add the API fly.toml**

`api/fly.toml`:
```toml
app = "revey-api"
primary_region = "sin"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  min_machines_running = 1

[[services.http_checks]]
  path = "/api/health"
```

- [ ] **Step 3: Add the UI Dockerfile and fly.toml**

`ui/Dockerfile`:
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

`ui/fly.toml`:
```toml
app = "revey-ui"
primary_region = "sin"

[http_service]
  internal_port = 3000
  force_https = true
  min_machines_running = 1
```

- [ ] **Step 4: Document deploy + secrets**

`docs/deploy.md` — record:
```bash
# One-time
fly apps create revey-api --region sin
fly apps create revey-ui --region sin

# Secrets (never commit these)
fly secrets set -a revey-api DATABASE_URL=... CLERK_SECRET_KEY=...
fly secrets set -a revey-ui NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=... CLERK_SECRET_KEY=... NEXT_PUBLIC_API_URL=https://revey-api.fly.dev/api

# Deploy
fly deploy -a revey-api -c api/fly.toml
fly deploy -a revey-ui -c ui/fly.toml
```

- [ ] **Step 5: Verify configs are valid**

Run: `fly config validate -c api/fly.toml && fly config validate -c ui/fly.toml`
Expected: both report valid. (Requires `flyctl` installed + authenticated. If not available in the execution environment, note it and defer the live deploy — the configs are still committed.)

- [ ] **Step 6: Commit**

```bash
git add api/Dockerfile api/fly.toml ui/Dockerfile ui/fly.toml docs/deploy.md
git commit -m "chore: add Fly.io deploy configs for api and ui (sin region)"
```

---

## Self-Review

**Spec coverage (against §3, §6 of the design):**
- Monorepo `api/` + `ui/` → Tasks 1, 5. ✓
- Supabase Postgres + Prisma migrations → Task 2. ✓
- Clerk auth, Orgs = tenants → Tasks 3, 5. ✓
- Tenant guard resolving `client_id`; `client_id` on every domain table; RLS defense-in-depth → Task 4. ✓
- Fly.io `sin` region deploy → Task 6. ✓
- pgvector extension (memory) → **deferred to Plan 3 (Memory)**, where it is first used — noted intentionally, not a gap.
- Domain modules (scoring, workflow, outreach, etc.) → later plans by design.

**Placeholder scan:** No TBD/TODO. Two conditional notes (RLS per-request connection setting; `flyctl` availability) are explicit deferrals with rationale, not vague placeholders.

**Type consistency:** `AuthContext` (Task 3) is consumed unchanged by `TenantService.resolveClientId` (Task 4). `TOKEN_VERIFIER`/`TokenVerifier` names match between guard and module. `Client.clerkOrgId` (Task 2) is the field `TenantService` queries by (Task 4). `Debtor.clientId` (Task 4) matches the `where: { clientId }` scoping. Consistent.

---

## Carried forward to Plan 2 (from Plan 1 final review)

These were surfaced by the whole-branch review as legitimately Plan-2 scope and must be
handled before tenant isolation is actually exercised end-to-end:

1. **Wire the guard + tenant interceptor.** `ClerkGuard` is implemented and exported but
   not yet applied. Plan 2 must register it (e.g. `APP_GUARD`, keeping `/api/health`
   public) and add a request-scoped interceptor that calls
   `TenantService.resolveClientId(auth)` and injects `client_id` into request context —
   otherwise `TenantService` is never invoked and isolation is not enforced on any route.
2. **Make RLS actually enforce.** Current RLS is inert: the app connects as the
   table-owning role (owner bypasses RLS without `FORCE ROW LEVEL SECURITY`), nothing
   executes `set_config('app.current_client_id', …)` per request, and `clients` has no
   policy. If RLS is to be real defense-in-depth, add a non-owner DB role, `FORCE ROW
   LEVEL SECURITY`, a per-request `set_config` on a transaction, and a `clients` policy.
   Otherwise treat RLS as documentation-only and rely on the app-layer guard.
3. **Integration test** driving `ClerkGuard → interceptor → TenantService` with a
   realistically-shaped (v2) Clerk token — unit tests currently mock the verifier and
   never see the real claim shape.
4. **`ui/fly.toml` has no health check** (the API one does) — add for operational parity.

**Env note (resolved during Plan 1):** the Supabase DB is a fresh empty project in
`ap-south-1` (Mumbai); Clerk keys were rotated. `DATABASE_URL`/`DIRECT_URL` in `.env`
point at the pooler (`:6543` runtime, `:5432` migrations). The guard now handles both
Clerk v1 (`org_id`/`org_role`) and v2 (`o.id`/`o.rol`) org claims.
