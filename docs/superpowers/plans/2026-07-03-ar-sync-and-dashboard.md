# AR Sync + Dashboard UI Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task on the `master` branch (no feature branch). Steps use checkbox (`- [ ]`) syntax. UI tasks MUST additionally use the `frontend-design` and `dataviz` skills.

**Goal:** Sync a client's Xero AR (contacts + ACCREC invoices) into Revey's own database with automatic token refresh, and surface it in a dashboard UI — KPI tiles, an aging chart, and a debtors table — plus a per-debtor invoice view.

**Architecture:** A `XeroApiService` wraps Xero calls with transparent access-token refresh (re-encrypting + persisting new tokens). An `ArSyncService` pulls contacts + invoices and upserts `debtors`/`invoices`. An `ArService` computes aging + aggregates for read endpoints, all tenant-scoped by the `@ClientId()` request value. The Next.js console gains a React-Query-backed dashboard and debtor-detail page.

**Tech Stack:** TypeScript, NestJS, Prisma 6.x, Supabase Postgres, Clerk, Next.js App Router, TanStack React Query, Jest.

## Global Constraints

- **Language:** TypeScript only, explicit param + return types. **Package manager:** npm.
- **Naming:** files kebab-case; classes/components PascalCase; vars/functions camelCase; DB columns snake_case via Prisma `@map`; constants UPPER_SNAKE_CASE.
- **Prisma pinned `^6.x`** — datasource keeps `url`/`directUrl`.
- **Money is stored as integer cents** (`Int`), never floats. Convert on ingest (`Math.round(amount * 100)`) and divide by 100 for display.
- **Tenancy:** every domain table carries `client_id`. Read/write scoped by the `@ClientId()` param decorator (from `src/tenancy/client-id.decorator.ts`) which reads the request value the global `TenantInterceptor` set. **No Clerk Organizations** (tenancy is per Clerk user via `clients.clerk_user_id`).
- **DB is a shared live Supabase project** (`ap-south-1`); never run destructive migrations. `prisma migrate dev` is non-interactive here — author migration SQL and apply with `prisma migrate deploy` (see Task 1).
- **Xero is read-only** (scopes: contacts.read, invoices.read, payments.read, reports.aged.read). Dates come from Xero as `DateString`/`DueDateString` (`"2026-03-04T00:00:00"`).
- **UI:** dashboard must look production-grade (use `frontend-design`); the aging chart must follow `dataviz` (no external chart lib — inline SVG/CSS, brand-neutral accessible palette).

---

### Task 1: Invoice model + Debtor extension + migration

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<ts>_ar_models/migration.sql`

**Interfaces:**
- Produces:
  - `Debtor` gains `xeroContactId` (unique per client), `email?`, `updatedAt`, `invoices Invoice[]`.
  - `Invoice` — `id`, `clientId`, `debtorId` (FK→debtors cascade), `xeroInvoiceId` (unique per client), `invoiceNumber`, `issueDate`, `dueDate`, `totalCents`, `amountDueCents`, `amountPaidCents`, `status`, `currencyCode`, timestamps.

- [ ] **Step 1: Update the schema**

Replace the `Debtor` model in `api/prisma/schema.prisma` with:
```prisma
model Debtor {
  id            String    @id @default(uuid())
  clientId      String    @map("client_id")
  xeroContactId String    @map("xero_contact_id")
  name          String
  email         String?
  client        Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  invoices      Invoice[]
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@unique([clientId, xeroContactId])
  @@index([clientId])
  @@map("debtors")
}

model Invoice {
  id             String   @id @default(uuid())
  clientId       String   @map("client_id")
  debtorId       String   @map("debtor_id")
  xeroInvoiceId  String   @map("xero_invoice_id")
  invoiceNumber  String   @map("invoice_number")
  issueDate      DateTime @map("issue_date")
  dueDate        DateTime @map("due_date")
  totalCents     Int      @map("total_cents")
  amountDueCents Int      @map("amount_due_cents")
  amountPaidCents Int     @map("amount_paid_cents")
  status         String
  currencyCode   String   @map("currency_code")
  debtor         Debtor   @relation(fields: [debtorId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([clientId, xeroInvoiceId])
  @@index([clientId])
  @@index([debtorId])
  @@map("invoices")
}
```

- [ ] **Step 2: Author the migration SQL**

The existing `debtors` table is empty, so a rebuild is safe. Create `api/prisma/migrations/<TIMESTAMP>_ar_models/migration.sql` (use `date +%Y%m%d%H%M%S` for the timestamp) with:
```sql
-- Debtor: add Xero linkage + email + updated_at
ALTER TABLE "debtors" ADD COLUMN "xero_contact_id" TEXT;
ALTER TABLE "debtors" ADD COLUMN "email" TEXT;
ALTER TABLE "debtors" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "debtors" SET "xero_contact_id" = "id" WHERE "xero_contact_id" IS NULL;
ALTER TABLE "debtors" ALTER COLUMN "xero_contact_id" SET NOT NULL;
CREATE UNIQUE INDEX "debtors_client_id_xero_contact_id_key" ON "debtors"("client_id", "xero_contact_id");

-- Invoice
CREATE TABLE "invoices" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "xero_invoice_id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "issue_date" TIMESTAMP(3) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "amount_due_cents" INTEGER NOT NULL,
  "amount_paid_cents" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "currency_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_client_id_xero_invoice_id_key" ON "invoices"("client_id", "xero_invoice_id");
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");
CREATE INDEX "invoices_debtor_id_idx" ON "invoices"("debtor_id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply + regenerate**

Run: `cd api && npx prisma migrate deploy && npx prisma generate`
Expected: migration applied, client regenerated with `invoice` delegate. **If it reports drift or wants a reset, STOP and report.**
Verify: `npx prisma migrate status` → up to date.

- [ ] **Step 4: Commit**

```bash
git add api/prisma
git commit -m "feat: add Invoice model + Debtor Xero linkage (Plan 3)"
```

---

### Task 2: Aging calculation (pure functions)

**Files:**
- Create: `api/src/ar/aging.ts`
- Test: `api/src/ar/aging.spec.ts`

**Interfaces:**
- Produces:
  - `type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'`
  - `AGING_BUCKETS: AgingBucket[]` (ordered)
  - `overdueDays(dueDate: Date, asOf: Date): number` — whole days `asOf - dueDate` (negative if not yet due).
  - `bucketFor(dueDate: Date, asOf: Date): AgingBucket`
  - `summarizeAging(items: { dueDate: Date; amountDueCents: number }[], asOf: Date): Record<AgingBucket, { count: number; amountCents: number }>`

- [ ] **Step 1: Write the failing test**

`api/src/ar/aging.spec.ts`:
```typescript
import { overdueDays, bucketFor, summarizeAging } from './aging';

const asOf = new Date('2026-07-02T00:00:00Z');

describe('aging', () => {
  it('computes overdue days (positive when past due)', () => {
    expect(overdueDays(new Date('2026-06-22T00:00:00Z'), asOf)).toBe(10);
    expect(overdueDays(new Date('2026-07-12T00:00:00Z'), asOf)).toBe(-10);
  });

  it('buckets by overdue days', () => {
    expect(bucketFor(new Date('2026-07-20T00:00:00Z'), asOf)).toBe('current');
    expect(bucketFor(new Date('2026-06-20T00:00:00Z'), asOf)).toBe('1-30');
    expect(bucketFor(new Date('2026-05-20T00:00:00Z'), asOf)).toBe('31-60');
    expect(bucketFor(new Date('2026-04-20T00:00:00Z'), asOf)).toBe('61-90');
    expect(bucketFor(new Date('2026-02-20T00:00:00Z'), asOf)).toBe('90+');
  });

  it('summarizes counts and amounts per bucket', () => {
    const summary = summarizeAging(
      [
        { dueDate: new Date('2026-07-20T00:00:00Z'), amountDueCents: 1000 },
        { dueDate: new Date('2026-06-20T00:00:00Z'), amountDueCents: 2000 },
        { dueDate: new Date('2026-06-10T00:00:00Z'), amountDueCents: 500 },
      ],
      asOf,
    );
    expect(summary.current).toEqual({ count: 1, amountCents: 1000 });
    expect(summary['1-30']).toEqual({ count: 2, amountCents: 2500 });
    expect(summary['31-60']).toEqual({ count: 0, amountCents: 0 });
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd api && npx jest src/ar/aging.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`api/src/ar/aging.ts`:
```typescript
export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: AgingBucket[] = [
  'current',
  '1-30',
  '31-60',
  '61-90',
  '90+',
];

const DAY_MS = 86_400_000;

export function overdueDays(dueDate: Date, asOf: Date): number {
  return Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);
}

export function bucketFor(dueDate: Date, asOf: Date): AgingBucket {
  const days = overdueDays(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function summarizeAging(
  items: { dueDate: Date; amountDueCents: number }[],
  asOf: Date,
): Record<AgingBucket, { count: number; amountCents: number }> {
  const out = {} as Record<AgingBucket, { count: number; amountCents: number }>;
  for (const b of AGING_BUCKETS) out[b] = { count: 0, amountCents: 0 };
  for (const item of items) {
    const b = bucketFor(item.dueDate, asOf);
    out[b].count += 1;
    out[b].amountCents += item.amountDueCents;
  }
  return out;
}
```

- [ ] **Step 4: Run test → PASS**

Run: `cd api && npx jest src/ar/aging.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/ar/aging.ts api/src/ar/aging.spec.ts
git commit -m "feat: AR aging bucket calculation"
```

---

### Task 3: XeroApiService — token refresh + authenticated GET

**Files:**
- Create: `api/src/integrations/xero/xero-api.service.ts`
- Modify: `api/src/integrations/xero/xero.module.ts` (provide + export `XeroApiService`)
- Test: `api/src/integrations/xero/xero-api.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `EncryptionService`, `XeroOAuthService` (`refresh`, `XeroTokenSet`).
- Produces:
  - `XeroApiService.getAccess(clientId: string): Promise<{ accessToken: string; tenantId: string }>` — reads the client's `XeroConnection`; if `expiresAt <= now + 60s`, calls `oauth.refresh`, re-encrypts, persists new `accessTokenEnc`/`refreshTokenEnc`/`expiresAt`, and returns the fresh token; otherwise decrypts and returns the stored token. Throws `NotFoundException` if no connection.
  - `XeroApiService.get<T>(clientId: string, path: string): Promise<T>` — GETs `https://api.xero.com/api.xro/2.0{path}` with `Authorization: Bearer` + `Xero-tenant-id` + `Accept: application/json`; throws on non-ok.

- [ ] **Step 1: Write the failing test**

`api/src/integrations/xero/xero-api.service.spec.ts`:
```typescript
import { XeroApiService } from './xero-api.service';

describe('XeroApiService', () => {
  const now = Date.now();
  const prisma = { xeroConnection: { findUnique: jest.fn(), update: jest.fn() } };
  const encryption = {
    encrypt: jest.fn((s: string) => `enc(${s})`),
    decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
  };
  const oauth = { refresh: jest.fn() };
  const svc = new XeroApiService(prisma as never, encryption as never, oauth as never);

  afterEach(() => jest.clearAllMocks());

  it('returns the stored token when not expired', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue({
      clientId: 'c1',
      xeroTenantId: 't1',
      accessTokenEnc: 'enc(at-stored)',
      refreshTokenEnc: 'enc(rt)',
      expiresAt: new Date(now + 10 * 60_000),
    });
    const res = await svc.getAccess('c1');
    expect(res).toEqual({ accessToken: 'at-stored', tenantId: 't1' });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes, persists, and returns a new token when expired', async () => {
    prisma.xeroConnection.findUnique.mockResolvedValue({
      clientId: 'c1',
      xeroTenantId: 't1',
      accessTokenEnc: 'enc(at-old)',
      refreshTokenEnc: 'enc(rt-old)',
      expiresAt: new Date(now - 1000),
    });
    oauth.refresh.mockResolvedValue({
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      expiresInSec: 1800,
    });
    const res = await svc.getAccess('c1');
    expect(oauth.refresh).toHaveBeenCalledWith('rt-old');
    expect(res.accessToken).toBe('at-new');
    const update = prisma.xeroConnection.update.mock.calls[0][0];
    expect(update.where).toEqual({ clientId: 'c1' });
    expect(update.data.accessTokenEnc).toBe('enc(at-new)');
    expect(update.data.refreshTokenEnc).toBe('enc(rt-new)');
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd api && npx jest src/integrations/xero/xero-api.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`api/src/integrations/xero/xero-api.service.ts`:
```typescript
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
```

In `api/src/integrations/xero/xero.module.ts`, add `XeroApiService` to `providers` and `exports`.

- [ ] **Step 4: Run test → PASS**

Run: `cd api && npx jest src/integrations/xero/xero-api.service.spec.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add api/src/integrations/xero
git commit -m "feat: XeroApiService with auto token refresh"
```

---

### Task 4: ArSyncService — pull contacts + invoices into the DB

**Files:**
- Create: `api/src/ar/ar-sync.service.ts`
- Test: `api/src/ar/ar-sync.service.spec.ts`

**Interfaces:**
- Consumes: `XeroApiService.get`, `PrismaService`.
- Produces:
  - `ArSyncService.sync(clientId: string): Promise<{ debtors: number; invoices: number }>` — pulls all Contacts (upserts `debtors` by `clientId`+`xeroContactId`), then all ACCREC Invoices (upserts `invoices` by `clientId`+`xeroInvoiceId`, linked to the debtor via the invoice's `Contact.ContactID`). Amounts converted to cents. Invoices whose contact isn't found are skipped.
  - Exposes `toCents(n: number): number = Math.round(n * 100)` (exported helper).

- [ ] **Step 1: Write the failing test**

`api/src/ar/ar-sync.service.spec.ts`:
```typescript
import { ArSyncService, toCents } from './ar-sync.service';

describe('toCents', () => {
  it('converts dollars to integer cents', () => {
    expect(toCents(45000)).toBe(4500000);
    expect(toCents(1200.5)).toBe(120050);
  });
});

describe('ArSyncService', () => {
  it('upserts debtors then invoices and returns counts', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce({
        Contacts: [
          { ContactID: 'x-con-1', Name: 'Acme', EmailAddress: 'ar@acme.example' },
        ],
      })
      .mockResolvedValueOnce({ Contacts: [] }) // contacts page 2 empty
      .mockResolvedValueOnce({
        Invoices: [
          {
            InvoiceID: 'x-inv-1',
            InvoiceNumber: 'INV-1',
            Contact: { ContactID: 'x-con-1' },
            DateString: '2026-05-01T00:00:00',
            DueDateString: '2026-06-01T00:00:00',
            Total: 1000,
            AmountDue: 400,
            AmountPaid: 600,
            Status: 'AUTHORISED',
            CurrencyCode: 'SGD',
          },
        ],
      })
      .mockResolvedValueOnce({ Invoices: [] }); // invoices page 2 empty
    const xeroApi = { get };
    const prisma = {
      debtor: {
        upsert: jest.fn().mockResolvedValue({ id: 'd1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'd1' }),
      },
      invoice: { upsert: jest.fn() },
    };
    const svc = new ArSyncService(xeroApi as never, prisma as never);
    const result = await svc.sync('c1');

    expect(result).toEqual({ debtors: 1, invoices: 1 });
    const dUp = prisma.debtor.upsert.mock.calls[0][0];
    expect(dUp.where).toEqual({ clientId_xeroContactId: { clientId: 'c1', xeroContactId: 'x-con-1' } });
    expect(dUp.create.email).toBe('ar@acme.example');
    const iUp = prisma.invoice.upsert.mock.calls[0][0];
    expect(iUp.where).toEqual({ clientId_xeroInvoiceId: { clientId: 'c1', xeroInvoiceId: 'x-inv-1' } });
    expect(iUp.create.amountDueCents).toBe(40000);
    expect(iUp.create.debtorId).toBe('d1');
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd api && npx jest src/ar/ar-sync.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`api/src/ar/ar-sync.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XeroApiService } from '../integrations/xero/xero-api.service';

export function toCents(n: number): number {
  return Math.round(n * 100);
}

interface XeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
}
interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Contact: { ContactID: string };
  DateString: string;
  DueDateString: string;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  Status: string;
  CurrencyCode: string;
}

@Injectable()
export class ArSyncService {
  constructor(
    private readonly xeroApi: XeroApiService,
    private readonly prisma: PrismaService,
  ) {}

  async sync(clientId: string): Promise<{ debtors: number; invoices: number }> {
    let debtorCount = 0;
    let invoiceCount = 0;

    // Contacts (paginated)
    for (let page = 1; ; page++) {
      const res = await this.xeroApi.get<{ Contacts?: XeroContact[] }>(
        clientId,
        `/Contacts?page=${page}`,
      );
      const contacts = res.Contacts ?? [];
      if (contacts.length === 0) break;
      for (const c of contacts) {
        await this.prisma.debtor.upsert({
          where: {
            clientId_xeroContactId: { clientId, xeroContactId: c.ContactID },
          },
          update: { name: c.Name, email: c.EmailAddress ?? null },
          create: {
            clientId,
            xeroContactId: c.ContactID,
            name: c.Name,
            email: c.EmailAddress ?? null,
          },
        });
        debtorCount++;
      }
    }

    // ACCREC invoices (paginated)
    for (let page = 1; ; page++) {
      const res = await this.xeroApi.get<{ Invoices?: XeroInvoice[] }>(
        clientId,
        `/Invoices?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}`,
      );
      const invoices = res.Invoices ?? [];
      if (invoices.length === 0) break;
      for (const inv of invoices) {
        const debtor = await this.prisma.debtor.findUnique({
          where: {
            clientId_xeroContactId: {
              clientId,
              xeroContactId: inv.Contact?.ContactID,
            },
          },
        });
        if (!debtor) continue;
        await this.prisma.invoice.upsert({
          where: {
            clientId_xeroInvoiceId: { clientId, xeroInvoiceId: inv.InvoiceID },
          },
          update: {
            debtorId: debtor.id,
            invoiceNumber: inv.InvoiceNumber,
            issueDate: new Date(inv.DateString),
            dueDate: new Date(inv.DueDateString),
            totalCents: toCents(inv.Total),
            amountDueCents: toCents(inv.AmountDue),
            amountPaidCents: toCents(inv.AmountPaid),
            status: inv.Status,
            currencyCode: inv.CurrencyCode,
          },
          create: {
            clientId,
            debtorId: debtor.id,
            xeroInvoiceId: inv.InvoiceID,
            invoiceNumber: inv.InvoiceNumber,
            issueDate: new Date(inv.DateString),
            dueDate: new Date(inv.DueDateString),
            totalCents: toCents(inv.Total),
            amountDueCents: toCents(inv.AmountDue),
            amountPaidCents: toCents(inv.AmountPaid),
            status: inv.Status,
            currencyCode: inv.CurrencyCode,
          },
        });
        invoiceCount++;
      }
    }

    return { debtors: debtorCount, invoices: invoiceCount };
  }
}
```

- [ ] **Step 4: Run test → PASS**

Run: `cd api && npx jest src/ar/ar-sync.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/ar/ar-sync.service.ts api/src/ar/ar-sync.service.spec.ts
git commit -m "feat: ArSyncService pulls Xero contacts + invoices into DB"
```

---

### Task 5: ArService (summary + debtors) + controller + module

**Files:**
- Create: `api/src/ar/ar.service.ts`, `api/src/ar/ar.controller.ts`, `api/src/ar/ar.module.ts`
- Modify: `api/src/app.module.ts` (import `ArModule`)
- Test: `api/src/ar/ar.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ArSyncService`, aging helpers.
- Produces:
  - `ArService.summary(clientId, asOf): Promise<ArSummary>` where
    `ArSummary = { totalOutstandingCents: number; overdueCents: number; debtorCount: number; openInvoiceCount: number; aging: Record<AgingBucket, { count: number; amountCents: number }> }`. Only invoices with `amountDueCents > 0` count as open; `overdueCents` = open invoices past due.
  - `ArService.listDebtors(clientId, asOf): Promise<DebtorRow[]>` where
    `DebtorRow = { id: string; name: string; email: string | null; outstandingCents: number; worstOverdueDays: number; openInvoiceCount: number }` (only debtors with ≥1 open invoice), sorted by `outstandingCents` desc.
  - `ArService.getDebtor(clientId, id, asOf): Promise<DebtorDetail>` where
    `DebtorDetail = { id; name; email; invoices: InvoiceRow[] }` and
    `InvoiceRow = { id; invoiceNumber; issueDate; dueDate; totalCents; amountDueCents; status; overdueDays; bucket }`, sorted by `dueDate` asc. Throws `NotFoundException` if the debtor isn't in this client.
  - Controller `@Controller('ar')`, all routes tenant-scoped via `@ClientId()`:
    - `POST /api/ar/sync` → `ArSyncService.sync(clientId)`
    - `GET /api/ar/summary` → `summary`
    - `GET /api/ar/debtors` → `listDebtors`
    - `GET /api/ar/debtors/:id` → `getDebtor`
  - `asOf` is `new Date()` at request time.

- [ ] **Step 1: Write the failing test**

`api/src/ar/ar.service.spec.ts`:
```typescript
import { NotFoundException } from '@nestjs/common';
import { ArService } from './ar.service';

const asOf = new Date('2026-07-02T00:00:00Z');

function inv(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'i',
    invoiceNumber: 'INV',
    issueDate: new Date('2026-01-01T00:00:00Z'),
    dueDate: new Date('2026-06-01T00:00:00Z'),
    totalCents: 10000,
    amountDueCents: 10000,
    amountPaidCents: 0,
    status: 'AUTHORISED',
    ...over,
  };
}

describe('ArService', () => {
  it('summarizes outstanding, overdue and aging over open invoices', async () => {
    const prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          inv({ amountDueCents: 5000, dueDate: new Date('2026-06-20T00:00:00Z') }), // 1-30
          inv({ amountDueCents: 3000, dueDate: new Date('2026-07-20T00:00:00Z') }), // current
          inv({ amountDueCents: 0 }), // paid — excluded
        ]),
      },
      debtor: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const s = await svc.summary('c1', asOf);
    expect(s.totalOutstandingCents).toBe(8000);
    expect(s.overdueCents).toBe(5000);
    expect(s.openInvoiceCount).toBe(2);
    expect(s.aging.current.amountCents).toBe(3000);
    expect(s.aging['1-30'].amountCents).toBe(5000);
  });

  it('lists debtors with outstanding + worst overdue, open only, sorted desc', async () => {
    const prisma = {
      debtor: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'd1', name: 'Small', email: null, invoices: [inv({ amountDueCents: 1000, dueDate: new Date('2026-06-25T00:00:00Z') })] },
          { id: 'd2', name: 'Big', email: 'b@x.co', invoices: [
            inv({ amountDueCents: 20000, dueDate: new Date('2026-03-01T00:00:00Z') }),
            inv({ amountDueCents: 0 }),
          ] },
        ]),
      },
      invoice: { findMany: jest.fn() },
    };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    const rows = await svc.listDebtors('c1', asOf);
    expect(rows.map((r) => r.name)).toEqual(['Big', 'Small']);
    expect(rows[0].outstandingCents).toBe(20000);
    expect(rows[0].openInvoiceCount).toBe(1);
    expect(rows[0].worstOverdueDays).toBeGreaterThan(90);
  });

  it('throws when a debtor is not in the client', async () => {
    const prisma = { debtor: { findFirst: jest.fn().mockResolvedValue(null) }, invoice: { findMany: jest.fn() } };
    const svc = new ArService(prisma as never, { sync: jest.fn() } as never);
    await expect(svc.getDebtor('c1', 'nope', asOf)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd api && npx jest src/ar/ar.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

`api/src/ar/ar.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArSyncService } from './ar-sync.service';
import {
  AgingBucket,
  bucketFor,
  overdueDays,
  summarizeAging,
} from './aging';

export interface ArSummary {
  totalOutstandingCents: number;
  overdueCents: number;
  debtorCount: number;
  openInvoiceCount: number;
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}

export interface DebtorRow {
  id: string;
  name: string;
  email: string | null;
  outstandingCents: number;
  worstOverdueDays: number;
  openInvoiceCount: number;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalCents: number;
  amountDueCents: number;
  status: string;
  overdueDays: number;
  bucket: AgingBucket;
}

export interface DebtorDetail {
  id: string;
  name: string;
  email: string | null;
  invoices: InvoiceRow[];
}

@Injectable()
export class ArService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ArSyncService,
  ) {}

  syncFromXero(clientId: string): Promise<{ debtors: number; invoices: number }> {
    return this.sync.sync(clientId);
  }

  async summary(clientId: string, asOf: Date): Promise<ArSummary> {
    const open = await this.prisma.invoice.findMany({
      where: { clientId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, debtorId: true },
    });
    const totalOutstandingCents = open.reduce((s, i) => s + i.amountDueCents, 0);
    const overdueCents = open
      .filter((i) => overdueDays(i.dueDate, asOf) > 0)
      .reduce((s, i) => s + i.amountDueCents, 0);
    const aging = summarizeAging(open, asOf);
    const debtorCount = new Set(open.map((i) => i.debtorId)).size;
    return {
      totalOutstandingCents,
      overdueCents,
      debtorCount,
      openInvoiceCount: open.length,
      aging,
    };
  }

  async listDebtors(clientId: string, asOf: Date): Promise<DebtorRow[]> {
    const debtors = await this.prisma.debtor.findMany({
      where: { clientId },
      include: { invoices: { where: { amountDueCents: { gt: 0 } } } },
    });
    return debtors
      .map((d) => {
        const open = d.invoices;
        const outstandingCents = open.reduce((s, i) => s + i.amountDueCents, 0);
        const worstOverdueDays = open.reduce(
          (m, i) => Math.max(m, overdueDays(i.dueDate, asOf)),
          Number.NEGATIVE_INFINITY,
        );
        return {
          id: d.id,
          name: d.name,
          email: d.email,
          outstandingCents,
          worstOverdueDays: open.length ? worstOverdueDays : 0,
          openInvoiceCount: open.length,
        };
      })
      .filter((r) => r.openInvoiceCount > 0)
      .sort((a, b) => b.outstandingCents - a.outstandingCents);
  }

  async getDebtor(
    clientId: string,
    id: string,
    asOf: Date,
  ): Promise<DebtorDetail> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id, clientId },
      include: { invoices: { orderBy: { dueDate: 'asc' } } },
    });
    if (!debtor) {
      throw new NotFoundException('Debtor not found');
    }
    return {
      id: debtor.id,
      name: debtor.name,
      email: debtor.email,
      invoices: debtor.invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        totalCents: i.totalCents,
        amountDueCents: i.amountDueCents,
        status: i.status,
        overdueDays: overdueDays(i.dueDate, asOf),
        bucket: bucketFor(i.dueDate, asOf),
      })),
    };
  }
}
```

- [ ] **Step 4: Run test → PASS**

Run: `cd api && npx jest src/ar/ar.service.spec.ts`
Expected: PASS (all three).

- [ ] **Step 5: Implement controller + module**

`api/src/ar/ar.controller.ts`:
```typescript
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ClientId } from '../tenancy/client-id.decorator';
import { ArService, ArSummary, DebtorDetail, DebtorRow } from './ar.service';

@Controller('ar')
export class ArController {
  constructor(private readonly ar: ArService) {}

  @Post('sync')
  sync(@ClientId() clientId: string): Promise<{ debtors: number; invoices: number }> {
    return this.ar.syncFromXero(clientId);
  }

  @Get('summary')
  summary(@ClientId() clientId: string): Promise<ArSummary> {
    return this.ar.summary(clientId, new Date());
  }

  @Get('debtors')
  debtors(@ClientId() clientId: string): Promise<DebtorRow[]> {
    return this.ar.listDebtors(clientId, new Date());
  }

  @Get('debtors/:id')
  debtor(
    @ClientId() clientId: string,
    @Param('id') id: string,
  ): Promise<DebtorDetail> {
    return this.ar.getDebtor(clientId, id, new Date());
  }
}
```

`api/src/ar/ar.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ArController } from './ar.controller';
import { ArService } from './ar.service';
import { ArSyncService } from './ar-sync.service';
import { XeroModule } from '../integrations/xero/xero.module';

@Module({
  imports: [XeroModule],
  controllers: [ArController],
  providers: [ArService, ArSyncService],
  exports: [ArService],
})
export class ArModule {}
```

Add `ArModule` to `AppModule` imports. Ensure `XeroModule` exports `XeroApiService` (Task 3).

- [ ] **Step 6: Run full suite + typecheck + e2e boot**

Run: `cd api && npx jest && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json`
Expected: all green (the app boots with the new module).

- [ ] **Step 7: Commit**

```bash
git add api/src/ar api/src/app.module.ts
git commit -m "feat: AR summary/debtors endpoints + sync trigger"
```

---

### Task 6: Live sync verification (manual, against Demo Company)

**Files:** none (verification task).

- [ ] **Step 1: Trigger a sync and confirm rows land**

With the API running, obtain a Clerk token for the seeded user and POST the sync (or drive via the UI in Task 8). To verify server-side without a browser token, run against the DB after a UI sync in Task 8. For now, confirm the endpoints exist:
Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/ar/sync` → expect `401` (guarded).

- [ ] **Step 2: Commit** (nothing to commit; note verification deferred to Task 8's live UI sync).

---

### Task 7: React Query setup + AR API hooks

**Files:**
- Modify: `ui/package.json` (add `@tanstack/react-query`)
- Create: `ui/app/providers.tsx`, `ui/lib/api/client.ts`, `ui/lib/api/ar.ts`
- Modify: `ui/app/layout.tsx` (wrap in providers)
- Test: `ui/lib/api/ar.test.tsx`

**Interfaces:**
- Produces:
  - `apiFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T>` — prefixes `NEXT_PUBLIC_API_URL`, adds `Authorization: Bearer`, throws on non-ok.
  - Hooks (using `useAuth().getToken`): `useArSummary()`, `useDebtors()`, `useDebtor(id)`, `useSyncAr()` (mutation invalidating `['ar']`).
  - Cents formatter `formatCents(cents: number): string` → e.g. `$45,000`.

- [ ] **Step 1: Install React Query**

```bash
cd ui && npm install @tanstack/react-query
```

- [ ] **Step 2: Write the failing test (formatCents is pure, easy to unit test)**

`ui/lib/api/ar.test.tsx`:
```typescript
import { formatCents } from './ar';

describe('formatCents', () => {
  it('formats integer cents as whole-dollar currency', () => {
    expect(formatCents(4500000)).toBe('$45,000');
    expect(formatCents(120050)).toBe('$1,201');
    expect(formatCents(0)).toBe('$0');
  });
});
```

- [ ] **Step 3: Run test → FAIL**

Run: `cd ui && npx jest lib/api/ar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement client + hooks + provider**

`ui/lib/api/client.ts`:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function apiFetch<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}
```

`ui/lib/api/ar.ts`:
```typescript
'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

export interface ArSummary {
  totalOutstandingCents: number;
  overdueCents: number;
  debtorCount: number;
  openInvoiceCount: number;
  aging: Record<AgingBucket, { count: number; amountCents: number }>;
}
export interface DebtorRow {
  id: string;
  name: string;
  email: string | null;
  outstandingCents: number;
  worstOverdueDays: number;
  openInvoiceCount: number;
}
export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalCents: number;
  amountDueCents: number;
  status: string;
  overdueDays: number;
  bucket: AgingBucket;
}
export interface DebtorDetail {
  id: string;
  name: string;
  email: string | null;
  invoices: InvoiceRow[];
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function useArSummary() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'summary'],
    queryFn: async () => apiFetch<ArSummary>('/ar/summary', await getToken()),
  });
}

export function useDebtors() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'debtors'],
    queryFn: async () => apiFetch<DebtorRow[]>('/ar/debtors', await getToken()),
  });
}

export function useDebtor(id: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['ar', 'debtor', id],
    queryFn: async () => apiFetch<DebtorDetail>(`/ar/debtors/${id}`, await getToken()),
    enabled: !!id,
  });
}

export function useSyncAr() {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch<{ debtors: number; invoices: number }>('/ar/sync', await getToken(), {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ar'] }),
  });
}
```

`ui/app/providers.tsx`:
```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Wrap the app in `ui/app/layout.tsx`: inside `<ClerkProvider>`, wrap `{children}` with `<Providers>`.

- [ ] **Step 5: Run test → PASS + build**

Run: `cd ui && npx jest lib/api/ar.test.tsx && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add ui/lib ui/app/providers.tsx ui/app/layout.tsx ui/package.json ui/package-lock.json
git commit -m "feat: React Query provider + AR API hooks"
```

---

### Task 8: Dashboard + debtor detail pages

> **Use the `frontend-design` skill** for layout/visual quality and the `dataviz` skill for the aging chart (inline SVG/CSS, accessible palette — no external chart lib). The dashboard should read as a polished finance product, not a generic admin template.

**Files:**
- Modify: `ui/app/page.tsx` (dashboard — replace the console shell)
- Create: `ui/app/debtors/[id]/page.tsx`
- Create: `ui/components/aging-chart.tsx`, `ui/components/kpi-tile.tsx`
- Test: `ui/app/page.test.tsx` (update), `ui/components/aging-chart.test.tsx`

**Interfaces:**
- Consumes: hooks from Task 7.
- Produces: dashboard at `/` with a **Sync from Xero** button, KPI tiles (total outstanding, overdue, debtors, open invoices), an **aging bar chart**, and a **debtors table** (name → links to `/debtors/[id]`, email, outstanding, worst overdue, open count). Debtor page lists that debtor's invoices with aging + a back link. `/connections` stays reachable via a header link.

- [ ] **Step 1: Write a failing component test for the aging chart**

`ui/components/aging-chart.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import { AgingChart } from './aging-chart';

describe('AgingChart', () => {
  it('renders a labelled bar per non-empty bucket with accessible amounts', () => {
    render(
      <AgingChart
        aging={{
          current: { count: 1, amountCents: 300000 },
          '1-30': { count: 2, amountCents: 500000 },
          '31-60': { count: 0, amountCents: 0 },
          '61-90': { count: 0, amountCents: 0 },
          '90+': { count: 1, amountCents: 900000 },
        }}
      />,
    );
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('90+')).toBeInTheDocument();
    // largest bucket amount rendered
    expect(screen.getByText('$9,000')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd ui && npx jest components/aging-chart.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the components + pages**

Build (following `frontend-design` + `dataviz`):
- `ui/components/kpi-tile.tsx` — a titled stat tile (`label`, `value`, optional `tone`).
- `ui/components/aging-chart.tsx` — horizontal or vertical bar chart over the 5 buckets, each bar width/height proportional to `amountCents`, bucket label + `formatCents(amountCents)` shown, accessible (`role`/`aria-label` per bar), sequential palette by severity (current → 90+). `export function AgingChart({ aging }: { aging: Record<AgingBucket, { count: number; amountCents: number }> })`.
- `ui/app/page.tsx` — `'use client'`; `SignedIn`: header ("Revey" + links to Dashboard / Connections), a **Sync from Xero** button wired to `useSyncAr()` (disabled + "Syncing…" while pending, shows result count / error), KPI tiles from `useArSummary()`, `<AgingChart>`, and the debtors table from `useDebtors()` (loading + empty states — empty state says "No AR yet — connect Xero and Sync"). Names link to `/debtors/[id]`. `SignedOut`: `RedirectToSignIn`.
- `ui/app/debtors/[id]/page.tsx` — `'use client'`; reads `params.id` (Next 16: `params` is a Promise — use `React.use(params)` or the `useParams()` hook), `useDebtor(id)`, shows debtor name/email + invoices table (number, issue, due, total, amount due, status, overdue days, bucket) with a back link to `/`.
- Update `ui/app/page.test.tsx` to mock the hooks (`@/lib/api/ar`) and `@clerk/nextjs`, and assert the dashboard heading + Sync button render.

Keep money display via `formatCents`. Read `AGENTS.md` in `ui/` before writing (Next.js is a modified build — check `node_modules/next/dist/docs/` for any changed conventions, e.g. async `params`).

- [ ] **Step 4: Run tests → PASS + build**

Run: `cd ui && npx jest && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 5: Live end-to-end verification**

Ensure API (`node dist/main.js` after `npm run build` in `api/`) and UI (`npm run dev` in `ui/`) are running. In the browser: sign in → open `/` → click **Sync from Xero** → confirm KPIs populate (~$245k+ outstanding), the aging chart shows the buckets, and the debtors table lists Harbour Logistics / Vertex / Delta etc. Click a debtor → see their invoices. Then confirm rows landed:
```bash
psql "$DIRECT_URL" -tAc "select count(*) from invoices; select count(*) from debtors;"
```

- [ ] **Step 6: Commit**

```bash
git add ui/app ui/components
git commit -m "feat: AR dashboard (KPIs, aging chart, debtors table) + debtor detail"
```

---

## Self-Review

**Spec coverage:** Delivers the "get AR data into Revey and make it visible" increment — sync with token refresh (Tasks 3–4), aging + aggregates (Tasks 2, 5), and a production-grade dashboard + debtor view (Tasks 7–8). Scoring, outreach, memory, scheduled/webhook sync are explicitly Plan 4+.

**Placeholder scan:** No TBD/TODO. Task 8's visual detail is delegated to the `frontend-design`/`dataviz` skills by design, with concrete required elements + tests enumerated.

**Type consistency:** `ArSummary`/`DebtorRow`/`InvoiceRow`/`DebtorDetail` are defined in `ar.service.ts` (Task 5) and mirrored in `ui/lib/api/ar.ts` (Task 7). `toCents` (Task 4) and `formatCents` (Task 7) are the ingest/display pair. `XeroApiService.get` (Task 3) is consumed by `ArSyncService` (Task 4). The `clientId_xeroContactId` / `clientId_xeroInvoiceId` compound unique keys (Task 1) match the `upsert` `where` clauses (Task 4). `@ClientId()` (existing) scopes every `ar` route (Task 5).

**Deferred to Plan 4:** willingness-to-pay scoring (LLM over AR + memory), outreach + HITL approvals, the memory layer, scheduled poll + Xero webhook receiver (`XERO_WEBHOOK_KEY`), and a 401-retry inside `XeroApiService.get` (currently refresh is proactive on expiry only).
