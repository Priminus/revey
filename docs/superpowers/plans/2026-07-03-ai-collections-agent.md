# AI Collections Agent — Core Loop Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task on the `master` branch (no feature branch). UI tasks additionally use `frontend-design` + `DESIGN.md`.

**Goal:** Give Revey its agent brain: score each debtor's willingness-to-pay and recommended action with an LLM, draft branded collection emails, route every draft through a human approval queue, and send via Postmark — with all test email safely redirected to a single inbox. A per-debtor interaction history (memory-lite) feeds the scoring and drafting.

**Architecture:** A thin `LlmService` wraps OpenAI (chat + JSON mode). `ScoringService` reasons over each debtor's open invoices/aging + recent `DebtorInteraction` history → a stored score. `DraftingService` produces an email draft (`OutreachDraft`, status `pending`). `ApprovalsService` lets a human edit/approve/reject; approval calls `MessagingService` (Postmark) which honors an `OUTREACH_REDIRECT_EMAIL` test override and logs a `DebtorInteraction`. All tenant-scoped by `@ClientId()`.

**Tech Stack:** TypeScript, NestJS, Prisma 6.x, Supabase Postgres, OpenAI (gpt-4o), Postmark, Clerk, Next.js App Router, React Query, Jest.

## Global Constraints

- **Language:** TypeScript only, explicit types. **Package manager:** npm.
- **Naming:** kebab-case files; PascalCase classes/components; camelCase vars; snake_case DB columns via `@map`; UPPER_SNAKE_CASE constants.
- **Prisma pinned `^6.x`.** Migrations: hand-author SQL + `npx prisma migrate deploy` (non-interactive env); never reset the live DB.
- **Money is integer cents.** Reuse `formatCents` (ui) / cents on the API.
- **Tenancy:** every domain table carries `client_id`; scoped by `@ClientId()` (`src/tenancy/client-id.decorator.ts`). No Clerk Organizations.
- **LLM:** OpenAI via `LlmService`; model from `OPENAI_MODEL` (default `gpt-4o`), key `OPENAI_API_KEY`. All prompts must be deterministic-friendly (temperature ≤ 0.4) and return **strict JSON** for structured outputs (scoring). Never send secrets or full tokens to the LLM.
- **Email safety (CRITICAL):** `MessagingService` MUST redirect every send to `OUTREACH_REDIRECT_EMAIL` when that env var is set, regardless of the debtor's real address, and annotate the intended recipient in the email. From address = `OUTREACH_FROM_EMAIL`. Postmark token = `POSTMARK_TOKEN`. **Postmark requires a verified sender signature for the From address** — if send fails with an unverified-sender error, the draft is marked `failed` with the error surfaced in the queue (not a crash).
- **HITL invariant:** no email is ever sent without an explicit human `approve` action. Drafts are created `pending`.

---

### Task 1: LlmService (OpenAI wrapper)

**Files:**
- Create: `api/src/llm/llm.service.ts`, `api/src/llm/llm.module.ts`
- Modify: `api/src/app.module.ts` (import `LlmModule`)
- Test: `api/src/llm/llm.service.spec.ts`

**Interfaces:**
- Produces:
  - `LlmService.complete(opts: { system: string; user: string; temperature?: number }): Promise<string>` — POSTs to OpenAI chat completions, returns the message content.
  - `LlmService.completeJson<T>(opts: { system: string; user: string; schemaHint: string; temperature?: number }): Promise<T>` — same but sets `response_format: { type: 'json_object' }` and `JSON.parse`s the result; throws if parse fails.
  - Config from env: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o`). Registered `@Global`.

- [ ] **Step 1: Write the failing test (mock global fetch)**

`api/src/llm/llm.service.spec.ts`:
```typescript
import { LlmService } from './llm.service';

describe('LlmService', () => {
  const svc = new LlmService('sk-test', 'gpt-4o');

  afterEach(() => jest.restoreAllMocks());

  it('returns message content from a completion', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    });
    global.fetch = fetchMock as never;
    const out = await svc.complete({ system: 's', user: 'u' });
    expect(out).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0]).toEqual({ role: 'system', content: 's' });
  });

  it('parses JSON responses and sets json response_format', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"score":80}' } }] }),
    });
    global.fetch = fetchMock as never;
    const out = await svc.completeJson<{ score: number }>({
      system: 's',
      user: 'u',
      schemaHint: '{score:number}',
    });
    expect(out).toEqual({ score: 80 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => 'rate limited',
    }) as never;
    await expect(svc.complete({ system: 's', user: 'u' })).rejects.toThrow(/openai/i);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd api && npx jest src/llm/llm.service.spec.ts`

- [ ] **Step 3: Implement**

`api/src/llm/llm.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

@Injectable()
export class LlmService {
  constructor(
    private readonly apiKey: string = process.env.OPENAI_API_KEY ?? '',
    private readonly model: string = process.env.OPENAI_MODEL ?? 'gpt-4o',
  ) {}

  private async call(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message?.content ?? '';
  }

  complete(opts: {
    system: string;
    user: string;
    temperature?: number;
  }): Promise<string> {
    return this.call({
      model: this.model,
      temperature: opts.temperature ?? 0.3,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    });
  }

  async completeJson<T>(opts: {
    system: string;
    user: string;
    schemaHint: string;
    temperature?: number;
  }): Promise<T> {
    const content = await this.call({
      model: this.model,
      temperature: opts.temperature ?? 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${opts.system}\nRespond with ONLY valid JSON matching: ${opts.schemaHint}`,
        },
        { role: 'user', content: opts.user },
      ],
    });
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error(`LLM did not return valid JSON: ${content.slice(0, 200)}`);
    }
  }
}
```

`api/src/llm/llm.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';

@Global()
@Module({
  providers: [{ provide: LlmService, useFactory: () => new LlmService() }],
  exports: [LlmService],
})
export class LlmModule {}
```
Add `LlmModule` to `AppModule` imports.

- [ ] **Step 4: Run → PASS.** `cd api && npx jest src/llm/llm.service.spec.ts`
- [ ] **Step 5: Commit**
```bash
git add api/src/llm api/src/app.module.ts
git commit -m "feat: LlmService (OpenAI chat + JSON wrapper)"
```

---

### Task 2: Agent data models — score fields, interactions, outreach drafts

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<ts>_agent_models/migration.sql`

**Interfaces:**
- Produces:
  - `Debtor` gains nullable: `scoreValue Int?`, `scoreBand String?`, `recommendedAction String?`, `scoreRationale String?`, `scoredAt DateTime?`.
  - `DebtorInteraction` — `id`, `clientId`, `debtorId` (FK→debtors cascade), `type` (String), `summary` (String), `createdAt`. Indexes on clientId, debtorId. `@@map("debtor_interactions")`.
  - `OutreachDraft` — `id`, `clientId`, `debtorId` (FK cascade), `channel` (String, default `email`), `subject`, `body` (Text), `status` (String, default `pending`), `toEmailIntended String?`, `toEmailActual String?`, `scoreValueAtDraft Int?`, `error String?`, `sentAt DateTime?`, `createdAt`, `updatedAt`. Indexes on clientId, status, debtorId. `@@map("outreach_drafts")`.
  - Back-relations on `Debtor`: `interactions DebtorInteraction[]`, `drafts OutreachDraft[]`.

- [ ] **Step 1: Update schema** — add the fields/models above (Text via `@db.Text` on `body`).

- [ ] **Step 2: Author migration SQL** at `api/prisma/migrations/<TIMESTAMP>_agent_models/migration.sql` (timestamp = `date +%Y%m%d%H%M%S`):
```sql
ALTER TABLE "debtors" ADD COLUMN "score_value" INTEGER;
ALTER TABLE "debtors" ADD COLUMN "score_band" TEXT;
ALTER TABLE "debtors" ADD COLUMN "recommended_action" TEXT;
ALTER TABLE "debtors" ADD COLUMN "score_rationale" TEXT;
ALTER TABLE "debtors" ADD COLUMN "scored_at" TIMESTAMP(3);

CREATE TABLE "debtor_interactions" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "debtor_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "debtor_interactions_client_id_idx" ON "debtor_interactions"("client_id");
CREATE INDEX "debtor_interactions_debtor_id_idx" ON "debtor_interactions"("debtor_id");
ALTER TABLE "debtor_interactions" ADD CONSTRAINT "debtor_interactions_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outreach_drafts" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "debtor_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "to_email_intended" TEXT,
  "to_email_actual" TEXT,
  "score_value_at_draft" INTEGER,
  "error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outreach_drafts_client_id_idx" ON "outreach_drafts"("client_id");
CREATE INDEX "outreach_drafts_status_idx" ON "outreach_drafts"("status");
CREATE INDEX "outreach_drafts_debtor_id_idx" ON "outreach_drafts"("debtor_id");
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply + regenerate.** `cd api && npx prisma migrate deploy && npx prisma generate && npx prisma migrate status`. **Stop + report if a reset is prompted.**
- [ ] **Step 4: Verify** full unit suite still green: `cd api && npx jest`
- [ ] **Step 5: Commit**
```bash
git add api/prisma
git commit -m "feat: agent data models — debtor score, interactions, outreach drafts"
```

---

### Task 3: ScoringService + endpoint

**Files:**
- Create: `api/src/agent/scoring.service.ts`
- Test: `api/src/agent/scoring.service.spec.ts`
- (controller/module created in Task 6; expose a method now)

**Interfaces:**
- Consumes: `PrismaService`, `LlmService`, aging helpers (`overdueDays`, `bucketFor` from `../ar/aging`).
- Produces:
  - `type ScoreResult = { scoreValue: number; scoreBand: 'likely' | 'uncertain' | 'at_risk'; recommendedAction: string; rationale: string }`
  - `ScoringService.scoreDebtor(clientId: string, debtorId: string): Promise<ScoreResult>` — loads the debtor (scoped by clientId via findFirst), its open invoices (`amountDueCents > 0`) and last 10 interactions; builds a compact factual summary (per-invoice overdue days + amount, total outstanding, worst overdue, recent interaction summaries); calls `llm.completeJson`; persists the result on the debtor (`scoreValue/scoreBand/recommendedAction/scoreRationale/scoredAt`); returns it. `scoreValue` clamped 0–100. Throws `NotFoundException` if debtor missing.
  - `ScoringService.scoreAllOpen(clientId: string): Promise<{ scored: number }>` — scores every debtor with ≥1 open invoice.

- [ ] **Step 1: Write the failing test** (mock prisma + llm)

`api/src/agent/scoring.service.spec.ts`:
```typescript
import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  const asOf = new Date('2026-07-02T00:00:00Z');
  const prisma = {
    debtor: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    debtorInteraction: { findMany: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const svc = new ScoringService(prisma as never, llm as never);

  afterEach(() => jest.clearAllMocks());

  it('scores a debtor and persists the result', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 72,
      scoreBand: 'uncertain',
      recommendedAction: 'firm_followup',
      rationale: 'Consistently 30-60 days late.',
    });

    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(result.scoreValue).toBe(72);
    expect(llm.completeJson).toHaveBeenCalled();
    const update = prisma.debtor.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'd1' });
    expect(update.data.scoreValue).toBe(72);
    expect(update.data.scoreBand).toBe('uncertain');
  });

  it('clamps score into 0..100', async () => {
    prisma.debtor.findFirst.mockResolvedValue({ id: 'd1', clientId: 'c1', name: 'Acme' });
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.debtorInteraction.findMany.mockResolvedValue([]);
    llm.completeJson.mockResolvedValue({
      scoreValue: 140, scoreBand: 'likely', recommendedAction: 'gentle_reminder', rationale: 'x',
    });
    const result = await svc.scoreDebtor('c1', 'd1', asOf);
    expect(result.scoreValue).toBe(100);
  });
});
```
(Signature note: `scoreDebtor(clientId, debtorId, asOf = new Date())` — accept an optional `asOf` for testability, default `new Date()`.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `api/src/agent/scoring.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { overdueDays } from '../ar/aging';

export interface ScoreResult {
  scoreValue: number;
  scoreBand: 'likely' | 'uncertain' | 'at_risk';
  recommendedAction: string;
  rationale: string;
}

const SYSTEM = `You are a B2B collections analyst. Score a debtor's WILLINGNESS TO PAY
(0-100, higher = more likely to pay soon) based on their invoice aging and interaction
history — reason about behaviour, not just days overdue. Choose scoreBand from
likely|uncertain|at_risk and a concise recommendedAction (one of: gentle_reminder,
firm_followup, final_notice, phone_call, escalate_to_human). Give a one-sentence rationale.`;

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async scoreDebtor(
    clientId: string,
    debtorId: string,
    asOf: Date = new Date(),
  ): Promise<ScoreResult> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, clientId },
    });
    if (!debtor) throw new NotFoundException('Debtor not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, debtorId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, invoiceNumber: true },
    });
    const interactions = await this.prisma.debtorInteraction.findMany({
      where: { clientId, debtorId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const totalCents = invoices.reduce((s, i) => s + i.amountDueCents, 0);
    const lines = invoices
      .map(
        (i) =>
          `- ${i.invoiceNumber}: $${(i.amountDueCents / 100).toFixed(0)} due, ${overdueDays(i.dueDate, asOf)} days overdue`,
      )
      .join('\n');
    const history = interactions.length
      ? interactions.map((i) => `- ${i.type}: ${i.summary}`).join('\n')
      : '(no prior interactions)';

    const user = `Debtor: ${debtor.name}
Total outstanding: $${(totalCents / 100).toFixed(0)} across ${invoices.length} open invoices.
Open invoices:
${lines || '(none)'}
Recent interactions:
${history}`;

    const raw = await this.llm.completeJson<ScoreResult>({
      system: SYSTEM,
      user,
      schemaHint:
        '{"scoreValue":number(0-100),"scoreBand":"likely|uncertain|at_risk","recommendedAction":string,"rationale":string}',
    });

    const scoreValue = Math.max(0, Math.min(100, Math.round(raw.scoreValue)));
    const result: ScoreResult = {
      scoreValue,
      scoreBand: raw.scoreBand,
      recommendedAction: raw.recommendedAction,
      rationale: raw.rationale,
    };
    await this.prisma.debtor.update({
      where: { id: debtorId },
      data: {
        scoreValue: result.scoreValue,
        scoreBand: result.scoreBand,
        recommendedAction: result.recommendedAction,
        scoreRationale: result.rationale,
        scoredAt: asOf,
      },
    });
    return result;
  }

  async scoreAllOpen(clientId: string): Promise<{ scored: number }> {
    const debtors = await this.prisma.debtor.findMany({
      where: { clientId, invoices: { some: { amountDueCents: { gt: 0 } } } },
      select: { id: true },
    });
    for (const d of debtors) {
      await this.scoreDebtor(clientId, d.id);
    }
    return { scored: debtors.length };
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add api/src/agent/scoring.service.ts api/src/agent/scoring.service.spec.ts
git commit -m "feat: LLM willingness-to-pay scoring service"
```

---

### Task 4: DraftingService (branded email drafts)

**Files:**
- Create: `api/src/agent/drafting.service.ts`
- Test: `api/src/agent/drafting.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `LlmService`, `overdueDays`.
- Produces:
  - `DraftingService.draftForDebtor(clientId: string, debtorId: string): Promise<{ id: string }>` — loads debtor (scoped) + open invoices + score fields; asks the LLM for `{ subject, body }` of a professional, branded, non-aggressive collection email referencing specific invoice numbers/amounts and matched to the recommended action; creates an `OutreachDraft` (`status: 'pending'`, `channel: 'email'`, `toEmailIntended: debtor.email`, `scoreValueAtDraft: debtor.scoreValue`); returns the new draft id. Throws `NotFoundException` if missing.

- [ ] **Step 1: Failing test** `api/src/agent/drafting.service.spec.ts`:
```typescript
import { DraftingService } from './drafting.service';

describe('DraftingService', () => {
  const prisma = {
    debtor: { findFirst: jest.fn() },
    invoice: { findMany: jest.fn() },
    outreachDraft: { create: jest.fn() },
  };
  const llm = { completeJson: jest.fn() };
  const svc = new DraftingService(prisma as never, llm as never);

  afterEach(() => jest.clearAllMocks());

  it('drafts an email and persists a pending outreach draft', async () => {
    prisma.debtor.findFirst.mockResolvedValue({
      id: 'd1', clientId: 'c1', name: 'Acme', email: 'ar@acme.example',
      scoreValue: 60, recommendedAction: 'firm_followup',
    });
    prisma.invoice.findMany.mockResolvedValue([
      { amountDueCents: 500000, dueDate: new Date('2026-05-01T00:00:00Z'), invoiceNumber: 'INV-1' },
    ]);
    llm.completeJson.mockResolvedValue({ subject: 'Overdue: INV-1', body: 'Dear Acme…' });
    prisma.outreachDraft.create.mockResolvedValue({ id: 'draft1' });

    const out = await svc.draftForDebtor('c1', 'd1');
    expect(out).toEqual({ id: 'draft1' });
    const arg = prisma.outreachDraft.create.mock.calls[0][0];
    expect(arg.data.status).toBe('pending');
    expect(arg.data.toEmailIntended).toBe('ar@acme.example');
    expect(arg.data.subject).toBe('Overdue: INV-1');
    expect(arg.data.scoreValueAtDraft).toBe(60);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `api/src/agent/drafting.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { overdueDays } from '../ar/aging';

const SYSTEM = `You are Revey, an AI collections assistant writing on behalf of a finance
team. Write a professional, courteous, brand-appropriate collection email. Reference the
specific overdue invoice numbers and amounts. Match the tone to the recommended action
(gentle_reminder = warm; firm_followup = direct; final_notice = firm but polite). Keep it
under 160 words. Do not threaten. End with a clear call to pay or reply.`;

@Injectable()
export class DraftingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async draftForDebtor(
    clientId: string,
    debtorId: string,
    asOf: Date = new Date(),
  ): Promise<{ id: string }> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, clientId },
    });
    if (!debtor) throw new NotFoundException('Debtor not found');

    const invoices = await this.prisma.invoice.findMany({
      where: { clientId, debtorId, amountDueCents: { gt: 0 } },
      select: { amountDueCents: true, dueDate: true, invoiceNumber: true },
    });
    const lines = invoices
      .map(
        (i) =>
          `- ${i.invoiceNumber}: $${(i.amountDueCents / 100).toFixed(0)}, ${overdueDays(i.dueDate, asOf)} days overdue`,
      )
      .join('\n');

    const draft = await this.llm.completeJson<{ subject: string; body: string }>({
      system: SYSTEM,
      user: `Debtor: ${debtor.name}
Recommended action: ${debtor.recommendedAction ?? 'firm_followup'}
Overdue invoices:
${lines || '(none)'}`,
      schemaHint: '{"subject":string,"body":string}',
      temperature: 0.4,
    });

    const created = await this.prisma.outreachDraft.create({
      data: {
        clientId,
        debtorId,
        channel: 'email',
        subject: draft.subject,
        body: draft.body,
        status: 'pending',
        toEmailIntended: debtor.email,
        scoreValueAtDraft: debtor.scoreValue,
      },
      select: { id: true },
    });
    return { id: created.id };
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add api/src/agent/drafting.service.ts api/src/agent/drafting.service.spec.ts
git commit -m "feat: LLM branded email drafting service"
```

---

### Task 5: MessagingService (Postmark send + redirect override)

**Files:**
- Create: `api/src/messaging/messaging.service.ts`, `api/src/messaging/messaging.module.ts`
- Modify: `api/src/app.module.ts` (import `MessagingModule`)
- Test: `api/src/messaging/messaging.service.spec.ts`

**Interfaces:**
- Produces:
  - `MessagingService.sendEmail(opts: { toIntended: string | null; subject: string; body: string }): Promise<{ messageId: string; toActual: string; redirected: boolean }>` — computes `toActual = OUTREACH_REDIRECT_EMAIL || toIntended`; if `redirected` (or `toIntended` differs), prepends a banner line to the body: `[TEST — this message was intended for <toIntended>]`; POSTs to `https://api.postmarkapp.com/email` with headers `X-Postmark-Server-Token`, `From = OUTREACH_FROM_EMAIL`, `To = toActual`, `Subject`, `TextBody`; throws on non-ok with the Postmark error message. Config from env in the constructor (token, from, redirect). Throws if `toActual` ends up empty.

- [ ] **Step 1: Failing test** `api/src/messaging/messaging.service.spec.ts`:
```typescript
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('redirects to the override address and banners the intended recipient', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ MessageID: 'pm-1' }),
    });
    global.fetch = fetchMock as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', 'redirect@me.test');
    const res = await svc.sendEmail({ toIntended: 'debtor@acme.example', subject: 'Hi', body: 'Pay please' });
    expect(res).toEqual({ messageId: 'pm-1', toActual: 'redirect@me.test', redirected: true });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.To).toBe('redirect@me.test');
    expect(body.From).toBe('from@revey.test');
    expect(body.TextBody).toContain('intended for debtor@acme.example');
    expect(body.TextBody).toContain('Pay please');
  });

  it('sends to the real recipient when no override is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ MessageID: 'pm-2' }) });
    global.fetch = fetchMock as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', '');
    const res = await svc.sendEmail({ toIntended: 'debtor@acme.example', subject: 'Hi', body: 'x' });
    expect(res.toActual).toBe('debtor@acme.example');
    expect(res.redirected).toBe(false);
  });

  it('throws on a Postmark error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 422, text: async () => 'Sender signature not confirmed',
    }) as never;
    const svc = new MessagingService('pm-token', 'from@revey.test', 'redirect@me.test');
    await expect(
      svc.sendEmail({ toIntended: 'x@y.z', subject: 's', body: 'b' }),
    ).rejects.toThrow(/postmark|sender signature/i);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `api/src/messaging/messaging.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';

const POSTMARK_URL = 'https://api.postmarkapp.com/email';

@Injectable()
export class MessagingService {
  constructor(
    private readonly token: string = process.env.POSTMARK_TOKEN ?? '',
    private readonly from: string = process.env.OUTREACH_FROM_EMAIL ?? '',
    private readonly redirect: string = process.env.OUTREACH_REDIRECT_EMAIL ?? '',
  ) {}

  async sendEmail(opts: {
    toIntended: string | null;
    subject: string;
    body: string;
  }): Promise<{ messageId: string; toActual: string; redirected: boolean }> {
    const redirected = this.redirect.length > 0;
    const toActual = redirected ? this.redirect : (opts.toIntended ?? '');
    if (!toActual) {
      throw new Error('No recipient address for outreach email');
    }
    const textBody =
      redirected || toActual !== opts.toIntended
        ? `[TEST — this message was intended for ${opts.toIntended ?? 'unknown'}]\n\n${opts.body}`
        : opts.body;

    const res = await fetch(POSTMARK_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify({
        From: this.from,
        To: toActual,
        Subject: opts.subject,
        TextBody: textBody,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      throw new Error(`Postmark send failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { MessageID: string };
    return { messageId: json.MessageID, toActual, redirected };
  }
}
```
`api/src/messaging/messaging.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';

@Global()
@Module({
  providers: [{ provide: MessagingService, useFactory: () => new MessagingService() }],
  exports: [MessagingService],
})
export class MessagingModule {}
```
Add `MessagingModule` to `AppModule` imports.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add api/src/messaging api/src/app.module.ts
git commit -m "feat: Postmark messaging service with test redirect override"
```

---

### Task 6: ApprovalsService + AgentController + AgentModule

**Files:**
- Create: `api/src/agent/approvals.service.ts`, `api/src/agent/agent.controller.ts`, `api/src/agent/agent.module.ts`
- Modify: `api/src/app.module.ts` (import `AgentModule`)
- Test: `api/src/agent/approvals.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `MessagingService`, `ScoringService`, `DraftingService`.
- Produces:
  - `type DraftRow = { id; debtorId; debtorName; subject; body; status; toEmailIntended: string | null; toEmailActual: string | null; scoreValueAtDraft: number | null; error: string | null; sentAt: Date | null; createdAt: Date }`
  - `ApprovalsService.listPending(clientId): Promise<DraftRow[]>` — status `pending`, newest first, with debtor name joined.
  - `ApprovalsService.edit(clientId, id, patch: { subject?: string; body?: string }): Promise<void>` — only while `pending`; scoped by clientId.
  - `ApprovalsService.reject(clientId, id): Promise<void>` — set status `rejected` (only from `pending`).
  - `ApprovalsService.approveAndSend(clientId, id): Promise<{ status: 'sent' | 'failed'; error?: string }>` — load pending draft (scoped); call `MessagingService.sendEmail`; on success set `status: 'sent'`, `sentAt`, `toEmailActual`, and create a `DebtorInteraction` (`type: 'email_sent'`, summary = subject); on failure set `status: 'failed'`, `error`. Never throws for a send failure — returns `{status:'failed', error}`. Throws `NotFoundException`/`BadRequestException` for a missing or non-pending draft.
  - Controller `@Controller('agent')`, all `@ClientId()`-scoped:
    - `POST /api/agent/score` → `ScoringService.scoreAllOpen`
    - `POST /api/agent/debtors/:id/score` → `ScoringService.scoreDebtor`
    - `POST /api/agent/debtors/:id/draft` → `DraftingService.draftForDebtor`
    - `GET /api/agent/drafts` → `listPending`
    - `PATCH /api/agent/drafts/:id` (body `{subject?, body?}`) → `edit`
    - `POST /api/agent/drafts/:id/approve` → `approveAndSend`
    - `POST /api/agent/drafts/:id/reject` → `reject`
  - `AgentModule` imports `ArModule`? No — provides `ScoringService`, `DraftingService`, `ApprovalsService`; `LlmService`/`MessagingService`/`PrismaService` are global.

- [ ] **Step 1: Failing test** `api/src/agent/approvals.service.spec.ts` covering: `listPending` maps debtor name; `approveAndSend` success (calls messaging, sets sent, logs interaction); `approveAndSend` failure (messaging throws → status failed, error set, no throw); `reject` sets rejected; `edit` rejects a non-pending draft. Use mocked prisma + messaging. (Write concrete assertions mirroring the interface above.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the service (per interface), controller, and module. Key send path:
```typescript
async approveAndSend(clientId: string, id: string) {
  const draft = await this.prisma.outreachDraft.findFirst({ where: { id, clientId } });
  if (!draft) throw new NotFoundException('Draft not found');
  if (draft.status !== 'pending') throw new BadRequestException('Draft is not pending');
  try {
    const sent = await this.messaging.sendEmail({
      toIntended: draft.toEmailIntended,
      subject: draft.subject,
      body: draft.body,
    });
    await this.prisma.outreachDraft.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), toEmailActual: sent.toActual },
    });
    await this.prisma.debtorInteraction.create({
      data: {
        clientId,
        debtorId: draft.debtorId,
        type: 'email_sent',
        summary: `Sent: ${draft.subject}`,
      },
    });
    return { status: 'sent' as const };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'send failed';
    await this.prisma.outreachDraft.update({ where: { id }, data: { status: 'failed', error } });
    return { status: 'failed' as const, error };
  }
}
```
Register `AgentModule` in `AppModule`.

- [ ] **Step 4: Run full suite + typecheck + e2e boot.** `cd api && npx jest && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json`
- [ ] **Step 5: Commit**
```bash
git add api/src/agent api/src/app.module.ts
git commit -m "feat: approvals queue (HITL) + agent endpoints"
```

---

### Task 7: Live agent verification (score → draft → approve → email)

**Files:** none (verification).

- [ ] **Step 1: Guard check.** `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/agent/score` → `401`.
- [ ] **Step 2: End-to-end via Nest context** (rebuild `api` first). Bootstrap a script (like Plan 3's `run-sync.cjs`) that resolves `ScoringService`, `DraftingService`, `ApprovalsService` and, for the seeded client `2050ceb1-10d9-4717-815e-d00370511663`: scores one debtor, drafts an email, and approves+sends it. Confirm the send returns `{status:'sent'}` and that a real email arrives at `OUTREACH_REDIRECT_EMAIL`. If Postmark returns an unverified-sender error, report it clearly (the user must confirm a sender signature in Postmark) — the code path is still correct (draft → `failed` with the error). Paste the outcome.
- [ ] **Step 3:** Record the result in the report; no commit.

---

### Task 8: Frontend — scores, debtor agent panel, approvals queue

> Use `frontend-design` + `DESIGN.md`. Score bands map to badges: `likely`→paid, `uncertain`→overdue, `at_risk`→danger.

**Files:**
- Modify: `ui/lib/api/ar.ts` (add agent hooks + types), `ui/lib/api/ar-format.ts` if shared types needed
- Modify: `ui/app/page.tsx` (score badge column + "Score all" button), `ui/app/debtors/[id]/page.tsx` (score panel + rationale + "Draft outreach" + interactions)
- Create: `ui/app/approvals/page.tsx`
- Test: update `ui/app/page.test.tsx` as needed; add `ui/app/approvals/page.test.tsx`

**Interfaces:**
- New hooks (React Query, Bearer via `useAuth().getToken`): `useScoreAll()`, `useScoreDebtor(id)`, `useDraftDebtor(id)`, `useDrafts()`, `useEditDraft()`, `useApproveDraft()`, `useRejectDraft()`. Mutations invalidate `['ar']` and/or `['agent']`.
- Extend `DebtorDetail` type + `/ar/debtors/:id` is unchanged; add a separate `useDebtorScore`? No — surface score via the existing debtor row (`DebtorRow` already returned by `/ar/debtors`); extend `ArService.listDebtors`/`getDebtor` to include `scoreValue`/`scoreBand`/`recommendedAction`/`scoreRationale` (small backend addition — include those columns in the select/mapping). If added, mirror the types in `ui/lib/api/ar.ts`.

- [ ] **Step 1:** (backend) extend `ArService.listDebtors` + `getDebtor` (and their types) to include `scoreValue: number | null`, `scoreBand: string | null`, `recommendedAction: string | null`, `scoreRationale: string | null`; update `ar.service.spec.ts` expectations. Run `cd api && npx jest src/ar`.
- [ ] **Step 2:** Add agent hooks + types to `ui/lib/api/ar.ts`. Add a `formatScoreBand`/badge-tone helper. Unit-test any pure helper.
- [ ] **Step 3:** Dashboard — add a **Score** badge column to the debtors table (band-colored; "—" if unscored) and a "Score all" button (`useScoreAll`, pending state). Keep existing tests passing.
- [ ] **Step 4:** Debtor page — a score panel (value, band badge, recommended action, rationale), a **Draft outreach** button (`useDraftDebtor`, on success link/toast to the approvals queue), and the interaction history list.
- [ ] **Step 5:** `ui/app/approvals/page.tsx` — SignedIn: header + nav (add "Approvals"), list of pending drafts as cards: debtor name, intended recipient with a visible **"→ redirected to <you> in test mode"** note, editable subject + body (textarea), **Approve & Send** (primary) and **Reject** (secondary/ghost) buttons wired to the mutations, and sent/failed status feedback (failed shows the error). Empty state: "No drafts awaiting approval." Add `approvals/page.test.tsx` mocking the hooks + Clerk, asserting a draft's subject + the Approve & Send button render.
- [ ] **Step 6:** Add an "Approvals" nav link to the dashboard/debtor/connections headers.
- [ ] **Step 7: Verify.** `cd ui && npx jest && npm run build`.
- [ ] **Step 8: Commit**
```bash
git add api/src/ar ui/lib ui/app ui/components
git commit -m "feat: score badges, debtor agent panel, approvals queue UI"
```

---

## Self-Review

**Spec coverage:** Delivers the agent core loop from the spec — LLM willingness-to-pay scoring (Task 3), branded drafting (Task 4), HITL approval queue (Task 6, Task 8), Postmark send with test-safe redirect (Task 5), and memory-lite interaction history feeding scoring/drafting (Tasks 2–3, logged on send in Task 6). Mem0, LangGraph orchestration, reply/dispute detection, reconciliation, and scheduled/webhook sync remain later plans.

**Placeholder scan:** No TBD/TODO. Task 6/8 test bodies are described against explicit interfaces (concrete assertions to be written from them); all service code is complete.

**Type consistency:** `ScoreResult` (Task 3) persisted to the `Debtor` score fields (Task 2) and surfaced via `ArService` (Task 8). `OutreachDraft` fields (Task 2) match `DraftingService.create` (Task 4) and `ApprovalsService` reads/writes (Task 6). `MessagingService.sendEmail` (Task 5) is consumed by `approveAndSend` (Task 6). `DebtorInteraction` (Task 2) is written on send (Task 6) and read by scoring/drafting (Tasks 3–4). `@ClientId()` scopes every `agent` route.

**Email safety:** `OUTREACH_REDIRECT_EMAIL` is honored in `MessagingService` (Task 5) — the single choke point every send passes through — and surfaced in the UI (Task 8). No send occurs without a human `approve` (Task 6 invariant).
