# Reminder Flows + Template Editor Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development on the `master` branch (no feature branch). UI tasks additionally use `frontend-design` + `DESIGN.md`.

**Goal:** A drag-and-drop reminder-cadence builder (global default + per-client override) and a reusable email template editor, with the agent personalizing the cadence-appropriate template when it drafts outreach.

**Architecture:** New `EmailTemplate`, `ReminderFlow`, `ReminderStep` models. `TemplateService` (CRUD + `{{variable}}` render) and `FlowService` (resolve override-else-global, customize, reset, replace-steps, select-step-for-overdue-days) power a `ConfigController`. `DraftingService` is rewired to resolve the effective flow, pick the due step, render its template, and have the LLM personalize it (falling back to from-scratch if unresolved). Two Next.js pages — a `@dnd-kit` timeline and a template editor.

**Tech Stack:** TypeScript, NestJS, Prisma 6.x, Supabase Postgres, OpenAI, Next.js App Router, React Query, `@dnd-kit/core` + `@dnd-kit/sortable`, Jest.

## Global Constraints

- **Language:** TypeScript only, explicit types. **Package manager:** npm.
- **Naming:** kebab-case files; PascalCase classes/components; snake_case DB columns via `@map`; UPPER_SNAKE_CASE constants.
- **Prisma pinned `^6.x`.** Migrations: hand-author SQL + `npx prisma migrate deploy` (non-interactive); never reset the live DB.
- **Tenancy:** every domain row carries `client_id` EXCEPT global-scope rows where `client_id IS NULL`. Endpoints scoped by `@ClientId()`; a query for a client's config must return that client's rows **and** global (`client_id IS NULL`) rows, never another client's.
- **Scope param:** `scope` query param is `global | client`, default `client`. Global rows have `clientId = null`.
- **Offsets:** `offsetDays` is an integer relative to invoice **due date** (negative = before due).
- **Template variables:** `{{debtor_name}}`, `{{outstanding_amount}}`, `{{invoice_count}}`, `{{oldest_days_overdue}}`, `{{invoice_list}}`. Unknown `{{x}}` renders as empty string.
- **Design:** UI uses `DESIGN.md` tokens + existing primitives (`Card`/`Button`/`Badge`); money via `formatCents`.
- **Agent safety unchanged:** drafts are still `pending`; HITL + email redirect from Plan 4 are untouched.

---

### Task 1: Models — EmailTemplate, ReminderFlow, ReminderStep + draft provenance

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<ts>_reminder_config/migration.sql`

**Interfaces:**
- Produces:
  - `EmailTemplate` — `id`, `clientId String?` (`@map("client_id")`), `name`, `subject`, `body @db.Text`, `createdAt`, `updatedAt`. `@@index([clientId])`. `@@map("email_templates")`.
  - `ReminderFlow` — `id`, `clientId String? @unique @map("client_id")`, `createdAt`, `updatedAt`, `steps ReminderStep[]`. `@@map("reminder_flows")`.
  - `ReminderStep` — `id`, `flowId @map("flow_id")` (FK→reminder_flows cascade), `offsetDays Int @map("offset_days")`, `templateId @map("template_id")` (FK→email_templates, `onDelete: Restrict`), `order Int`, `createdAt`. `@@index([flowId])`. `@@map("reminder_steps")`.
  - `OutreachDraft` gains nullable `templateId String? @map("template_id")`, `stepOffsetDays Int? @map("step_offset_days")`.

- [ ] **Step 1: Update schema** — add the three models + the two `OutreachDraft` columns. `EmailTemplate` gets back-relation `steps ReminderStep[]`.

- [ ] **Step 2: Author migration SQL** at `api/prisma/migrations/<TIMESTAMP>_reminder_config/migration.sql` (`date +%Y%m%d%H%M%S`):
```sql
CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "client_id" TEXT,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_templates_client_id_idx" ON "email_templates"("client_id");

CREATE TABLE "reminder_flows" (
  "id" TEXT NOT NULL,
  "client_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminder_flows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reminder_flows_client_id_key" ON "reminder_flows"("client_id");

CREATE TABLE "reminder_steps" (
  "id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "offset_days" INTEGER NOT NULL,
  "template_id" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reminder_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reminder_steps_flow_id_idx" ON "reminder_steps"("flow_id");
ALTER TABLE "reminder_steps" ADD CONSTRAINT "reminder_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "reminder_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_steps" ADD CONSTRAINT "reminder_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outreach_drafts" ADD COLUMN "template_id" TEXT;
ALTER TABLE "outreach_drafts" ADD COLUMN "step_offset_days" INTEGER;
```

- [ ] **Step 3: Apply + regenerate.** `cd api && npx prisma migrate deploy && npx prisma generate && npx prisma migrate status`. **Stop + report if a reset is prompted.** Confirm existing data intact.
- [ ] **Step 4: Verify** `cd api && npx jest` (full suite still green).
- [ ] **Step 5: Commit**
```bash
git add api/prisma
git commit -m "feat: reminder config models (templates, flows, steps) + draft provenance"
```

---

### Task 2: TemplateService — render + CRUD

**Files:**
- Create: `api/src/config/template.service.ts`
- Test: `api/src/config/template.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces:
  - `renderTemplate(text: string, vars: TemplateVars): string` (module-level export) — replaces `{{key}}` with `vars[key]`, unknown keys → `''`. `type TemplateVars = Record<string, string>`.
  - `buildVars(debtorName, outstandingCents, invoiceCount, oldestDaysOverdue, invoices): TemplateVars` (module-level) — produces the 5 supported variables (`invoice_list` = newline `"<number> — $<amount>, <n> days overdue"`).
  - `TemplateService.list(clientId): Promise<Template[]>` — returns global (`clientId: null`) + this client's, each with a `scope: 'global' | 'client'` field.
  - `TemplateService.create(clientId, scope, { name, subject, body }): Promise<Template>` — `client_id = scope==='global' ? null : clientId`.
  - `TemplateService.update(clientId, id, patch)` — only a template in scope (its `clientId === clientId` OR `null`); patch whitelisted to name/subject/body.
  - `TemplateService.remove(clientId, id): Promise<void>` — throws `ConflictException` (409) if a `ReminderStep` references it.

- [ ] **Step 1: Failing test** `api/src/config/template.service.spec.ts`:
```typescript
import { renderTemplate, buildVars } from './template.service';

describe('renderTemplate', () => {
  it('substitutes known vars and blanks unknown', () => {
    expect(renderTemplate('Hi {{debtor_name}}, you owe {{outstanding_amount}}. {{nope}}', {
      debtor_name: 'Acme', outstanding_amount: '$500',
    })).toBe('Hi Acme, you owe $500. ');
  });
});

describe('buildVars', () => {
  it('builds the supported variables incl. invoice_list', () => {
    const vars = buildVars('Acme', 86150_00, 3, 120, [
      { invoiceNumber: 'INV-31', amountDueCents: 45000_00, overdueDays: 120 },
    ]);
    expect(vars.debtor_name).toBe('Acme');
    expect(vars.outstanding_amount).toBe('$86,150');
    expect(vars.invoice_count).toBe('3');
    expect(vars.oldest_days_overdue).toBe('120');
    expect(vars.invoice_list).toContain('INV-31');
    expect(vars.invoice_list).toContain('120 days overdue');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd api && npx jest src/config/template.service.spec.ts`
- [ ] **Step 3: Implement** `api/src/config/template.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TemplateVars = Record<string, string>;

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

export function buildVars(
  debtorName: string,
  outstandingCents: number,
  invoiceCount: number,
  oldestDaysOverdue: number,
  invoices: { invoiceNumber: string; amountDueCents: number; overdueDays: number }[],
): TemplateVars {
  return {
    debtor_name: debtorName,
    outstanding_amount: formatCents(outstandingCents),
    invoice_count: String(invoiceCount),
    oldest_days_overdue: String(oldestDaysOverdue),
    invoice_list: invoices
      .map((i) => `${i.invoiceNumber} — ${formatCents(i.amountDueCents)}, ${i.overdueDays} days overdue`)
      .join('\n'),
  };
}

export type TemplateScope = 'global' | 'client';

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clientId: string) {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { OR: [{ clientId: null }, { clientId }] },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((t) => ({ ...t, scope: t.clientId ? 'client' : 'global' }));
  }

  create(clientId: string, scope: TemplateScope, data: { name: string; subject: string; body: string }) {
    return this.prisma.emailTemplate.create({
      data: {
        clientId: scope === 'global' ? null : clientId,
        name: data.name,
        subject: data.subject,
        body: data.body,
      },
    });
  }

  async update(clientId: string, id: string, patch: { name?: string; subject?: string; body?: string }) {
    // scope guard: only global or this client's template
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, OR: [{ clientId: null }, { clientId }] },
    });
    if (!existing) throw new ConflictException('Template not found in scope');
    const data: { name?: string; subject?: string; body?: string } = {};
    if (typeof patch.name === 'string') data.name = patch.name;
    if (typeof patch.subject === 'string') data.subject = patch.subject;
    if (typeof patch.body === 'string') data.body = patch.body;
    return this.prisma.emailTemplate.update({ where: { id }, data });
  }

  async remove(clientId: string, id: string): Promise<void> {
    const refs = await this.prisma.reminderStep.count({ where: { templateId: id } });
    if (refs > 0) throw new ConflictException('Template is used by a reminder step');
    const existing = await this.prisma.emailTemplate.findFirst({
      where: { id, OR: [{ clientId: null }, { clientId }] },
    });
    if (!existing) throw new ConflictException('Template not found in scope');
    await this.prisma.emailTemplate.delete({ where: { id } });
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add api/src/config/template.service.ts api/src/config/template.service.spec.ts
git commit -m "feat: TemplateService — render + CRUD"
```

---

### Task 3: FlowService — resolve, step-select, customize/reset/replace

**Files:**
- Create: `api/src/config/flow.service.ts`
- Test: `api/src/config/flow.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`.
- Produces:
  - `selectStepFor(oldestDaysOverdue: number, steps: { offsetDays: number }[]): number` (module export) — index of the step with the greatest `offsetDays ≤ oldestDaysOverdue`; if none (all offsets greater), returns `0` (earliest step); returns `-1` if `steps` is empty. Assumes `steps` sorted ascending by `offsetDays`.
  - `FlowService.getEffective(clientId, scope): Promise<{ flowId: string | null; isOverride: boolean; steps: StepView[] }>` — `scope='global'` → global flow; `scope='client'` → client flow if it exists (`isOverride: true`) else global (`isOverride: false`). `StepView = { id; offsetDays; order; templateId; templateName }` sorted by `offsetDays` asc.
  - `FlowService.resolveForClient(clientId): Promise<{ steps: StepView[] }>` — the effective flow used by drafting (client override → else global).
  - `FlowService.customize(clientId): Promise<void>` — clone global steps into a new client flow (no-op if a client flow already exists).
  - `FlowService.reset(clientId): Promise<void>` — delete the client flow (cascade steps).
  - `FlowService.replaceSteps(clientId, scope, steps: { offsetDays; templateId; order }[]): Promise<void>` — replace the target flow's steps atomically (delete all + recreate). For `scope='client'` the client flow must exist (else `ConflictException`). For `scope='global'`, ensures the global flow row exists (create if missing).
  - `FlowService.ensureGlobal(): Promise<string>` — returns the global flow id, creating the row if absent.

- [ ] **Step 1: Failing test** `api/src/config/flow.service.spec.ts` (covers `selectStepFor` boundaries + `getEffective` override-vs-inherit with mocked prisma):
```typescript
import { selectStepFor } from './flow.service';

describe('selectStepFor', () => {
  const steps = [{ offsetDays: -7 }, { offsetDays: 1 }, { offsetDays: 14 }, { offsetDays: 30 }];
  it('picks the latest step at or before the overdue days', () => {
    expect(selectStepFor(0, steps)).toBe(1);   // 0 >= 1? no → index of -7 is 0... see rule
  });
  it('returns earliest when before the first offset', () => {
    expect(selectStepFor(-30, steps)).toBe(0);
  });
  it('picks the last step when well overdue', () => {
    expect(selectStepFor(90, steps)).toBe(3);
  });
  it('exact match selects that step', () => {
    expect(selectStepFor(14, steps)).toBe(2);
  });
  it('returns -1 for empty', () => {
    expect(selectStepFor(5, [])).toBe(-1);
  });
});
```
(Fix the first assertion when writing: for `oldestDaysOverdue = 0`, the greatest `offsetDays ≤ 0` is `-7` at index 0, so `selectStepFor(0, steps)` is `0`. Correct the test literal to `toBe(0)` before running.)

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `api/src/config/flow.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StepView {
  id: string;
  offsetDays: number;
  order: number;
  templateId: string;
  templateName: string;
}
export type FlowScope = 'global' | 'client';

export function selectStepFor(
  oldestDaysOverdue: number,
  steps: { offsetDays: number }[],
): number {
  if (steps.length === 0) return -1;
  let chosen = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].offsetDays <= oldestDaysOverdue) chosen = i;
  }
  return chosen === -1 ? 0 : chosen;
}

@Injectable()
export class FlowService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureGlobal(): Promise<string> {
    const existing = await this.prisma.reminderFlow.findUnique({ where: { clientId: null } });
    if (existing) return existing.id;
    const created = await this.prisma.reminderFlow.create({ data: { clientId: null } });
    return created.id;
  }

  private async flowFor(clientId: string, scope: FlowScope) {
    if (scope === 'global') {
      return this.prisma.reminderFlow.findUnique({ where: { clientId: null } });
    }
    return this.prisma.reminderFlow.findUnique({ where: { clientId } });
  }

  private toStepViews(steps: { id: string; offsetDays: number; order: number; template: { id: string; name: string } }[]): StepView[] {
    return steps
      .map((s) => ({ id: s.id, offsetDays: s.offsetDays, order: s.order, templateId: s.template.id, templateName: s.template.name }))
      .sort((a, b) => a.offsetDays - b.offsetDays);
  }

  async getEffective(clientId: string, scope: FlowScope): Promise<{ flowId: string | null; isOverride: boolean; steps: StepView[] }> {
    if (scope === 'global') {
      const flow = await this.prisma.reminderFlow.findUnique({
        where: { clientId: null },
        include: { steps: { include: { template: true } } },
      });
      return { flowId: flow?.id ?? null, isOverride: false, steps: flow ? this.toStepViews(flow.steps) : [] };
    }
    const clientFlow = await this.prisma.reminderFlow.findUnique({
      where: { clientId },
      include: { steps: { include: { template: true } } },
    });
    if (clientFlow) return { flowId: clientFlow.id, isOverride: true, steps: this.toStepViews(clientFlow.steps) };
    const globalFlow = await this.prisma.reminderFlow.findUnique({
      where: { clientId: null },
      include: { steps: { include: { template: true } } },
    });
    return { flowId: globalFlow?.id ?? null, isOverride: false, steps: globalFlow ? this.toStepViews(globalFlow.steps) : [] };
  }

  async resolveForClient(clientId: string): Promise<{ steps: StepView[] }> {
    const eff = await this.getEffective(clientId, 'client');
    return { steps: eff.steps };
  }

  async customize(clientId: string): Promise<void> {
    const existing = await this.prisma.reminderFlow.findUnique({ where: { clientId } });
    if (existing) return;
    const global = await this.prisma.reminderFlow.findUnique({
      where: { clientId: null },
      include: { steps: true },
    });
    const flow = await this.prisma.reminderFlow.create({ data: { clientId } });
    if (global) {
      for (const s of global.steps) {
        await this.prisma.reminderStep.create({
          data: { flowId: flow.id, offsetDays: s.offsetDays, templateId: s.templateId, order: s.order },
        });
      }
    }
  }

  async reset(clientId: string): Promise<void> {
    const flow = await this.prisma.reminderFlow.findUnique({ where: { clientId } });
    if (flow) await this.prisma.reminderFlow.delete({ where: { id: flow.id } });
  }

  async replaceSteps(
    clientId: string,
    scope: FlowScope,
    steps: { offsetDays: number; templateId: string; order: number }[],
  ): Promise<void> {
    let flow = await this.flowFor(clientId, scope);
    if (!flow) {
      if (scope === 'global') {
        flow = await this.prisma.reminderFlow.create({ data: { clientId: null } });
      } else {
        throw new ConflictException('Customize the client flow before editing its steps');
      }
    }
    await this.prisma.reminderStep.deleteMany({ where: { flowId: flow.id } });
    for (const s of steps) {
      await this.prisma.reminderStep.create({
        data: { flowId: flow.id, offsetDays: s.offsetDays, templateId: s.templateId, order: s.order },
      });
    }
  }
}
```

- [ ] **Step 4: Run → PASS** (correct the `selectStepFor(0, …)` literal to `0` first).
- [ ] **Step 5: Commit**
```bash
git add api/src/config/flow.service.ts api/src/config/flow.service.spec.ts
git commit -m "feat: FlowService — resolve/customize/reset/replace + step selection"
```

---

### Task 4: ConfigController + ConfigModule + default seed

**Files:**
- Create: `api/src/config/config.controller.ts`, `api/src/config/config.module.ts`, `api/src/config/seed-defaults.ts`
- Modify: `api/src/app.module.ts` (import `ConfigModule`)
- Test: `api/src/config/seed-defaults.spec.ts`

**Interfaces:**
- Consumes: `TemplateService`, `FlowService`.
- Produces:
  - Controller `@Controller('config')`, all `@ClientId()`-scoped:
    - `GET /config/templates` → `TemplateService.list`
    - `POST /config/templates` (body `{ scope, name, subject, body }`) → `create`
    - `PATCH /config/templates/:id` (body `{ name?, subject?, body? }`) → `update`
    - `DELETE /config/templates/:id` → `remove`
    - `GET /config/flow?scope=` → `FlowService.getEffective`
    - `PUT /config/flow/steps?scope=` (body `{ steps: {offsetDays, templateId, order}[] }`) → `replaceSteps`
    - `POST /config/flow/customize` → `customize`
    - `DELETE /config/flow` → `reset`
  - `ensureDefaults(prisma): Promise<void>` (in `seed-defaults.ts`) — idempotent: if no global flow steps exist, create 4 global templates (pre-due nudge, due reminder, firm follow-up, final notice) and a global flow with steps at `offsetDays` −7, 1, 14, 30 referencing them. Called on module init.

- [ ] **Step 1: Failing test** `api/src/config/seed-defaults.spec.ts` — with a mocked prisma that reports 0 existing global steps, `ensureDefaults` creates 4 templates + a flow + 4 steps; with existing steps, it creates nothing. Assert the `offsetDays` set `[-7,1,14,30]` and that it's idempotent.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `seed-defaults.ts` (idempotent default cadence + templates), the controller (thin delegation, reads `scope` query default `'client'`), and the module (`providers: [TemplateService, FlowService]`, `controllers: [ConfigController]`; `onModuleInit` calls `ensureDefaults(this.prisma)`). Register `ConfigModule` in `AppModule`.

- [ ] **Step 4: Run → PASS + full suite + e2e boot.** `cd api && npx jest && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json`
- [ ] **Step 5: Commit**
```bash
git add api/src/config api/src/app.module.ts
git commit -m "feat: config endpoints + default reminder flow/template seed"
```

---

### Task 5: Rewire DraftingService to use the flow template

**Files:**
- Modify: `api/src/agent/drafting.service.ts`
- Modify: `api/src/agent/agent.module.ts` (import `ConfigModule` for `FlowService`/`TemplateService`)
- Modify: `api/src/agent/drafting.service.spec.ts`

**Interfaces:**
- Consumes: `FlowService.resolveForClient`, `TemplateService` render helpers (`renderTemplate`, `buildVars`), `overdueDays`, `LlmService`.
- Produces: `draftForDebtor(clientId, debtorId, asOf?)` unchanged signature, new behavior: resolve the client's flow steps; if steps exist, compute `oldestDaysOverdue` (max overdueDays across open invoices), `selectStepFor(...)` → the due step, load its `EmailTemplate`, `renderTemplate(subject/body, buildVars(...))` to a filled draft, then LLM-personalize the filled template → `{subject, body}`; persist `OutreachDraft` with `templateId` + `stepOffsetDays`. If no steps/template resolve, fall back to the existing from-scratch prompt (record `templateId: null`).

- [ ] **Step 1: Update the test** so `draftForDebtor` is given a `FlowService` returning one step (offset 14, templateId `t1`) and a template lookup returning a `{{debtor_name}}`/`{{invoice_list}}` template; assert the created draft's `templateId` is `t1`, `stepOffsetDays` is 14, and the LLM was called with the *rendered* template text (containing the debtor name, not the raw `{{debtor_name}}`). Add a fallback test: empty flow → LLM called with the from-scratch prompt, draft `templateId: null`.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the rewire (inject `FlowService` + a template fetch via `PrismaService.emailTemplate.findUnique`; keep the LLM personalization step; keep `status: 'pending'`). Preserve the `NotFoundException` for a missing debtor.
- [ ] **Step 4: Run → PASS + full suite + tsc.** `cd api && npx jest && npx tsc --noEmit`
- [ ] **Step 5: Commit**
```bash
git add api/src/agent/drafting.service.ts api/src/agent/drafting.service.spec.ts api/src/agent/agent.module.ts
git commit -m "feat: drafting personalizes the cadence-appropriate template"
```

---

### Task 6: UI — config API hooks + install @dnd-kit

**Files:**
- Modify: `ui/package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `ui/lib/api/config.ts`
- Test: `ui/lib/api/config.test.tsx`

**Interfaces:**
- Produces types + React Query hooks (Bearer via `useAuth().getToken`, invalidate `['config']`):
  - `Template = { id; name; subject; body; scope: 'global' | 'client' }`
  - `FlowStep = { id?; offsetDays: number; order: number; templateId: string; templateName?: string }`
  - `EffectiveFlow = { flowId: string | null; isOverride: boolean; steps: FlowStep[] }`
  - `useTemplates()`, `useSaveTemplate()` (create if no id else patch), `useDeleteTemplate()`, `useFlow(scope)`, `useSaveSteps(scope)`, `useCustomizeFlow()`, `useResetFlow()`.
  - Pure helper `renderPreview(text, vars): string` (mirror of backend `renderTemplate`) + `SAMPLE_VARS` for the editor preview — unit-tested.

- [ ] **Step 1: Install.** `cd ui && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- [ ] **Step 2: Failing test** `ui/lib/api/config.test.tsx` — `renderPreview('Hi {{debtor_name}}', {debtor_name:'Acme'})` → `'Hi Acme'`; unknown var blanks. (Put `renderPreview`/types in a Clerk-free `ui/lib/api/config-format.ts` re-exported by `config.ts`, per the existing `ar-format.ts` pattern.)
- [ ] **Step 3: Run → FAIL.** `cd ui && npx jest lib/api/config.test.tsx`
- [ ] **Step 4: Implement** `config-format.ts` (types + `renderPreview` + `SAMPLE_VARS`) and `config.ts` (hooks). Endpoints per Task 4.
- [ ] **Step 5: Run → PASS + build.** `cd ui && npx jest lib/api/config.test.tsx && npm run build`
- [ ] **Step 6: Commit**
```bash
git add ui/lib/api/config.ts ui/lib/api/config-format.ts ui/lib/api/config.test.tsx ui/package.json ui/package-lock.json
git commit -m "feat: config API hooks + @dnd-kit"
```

---

### Task 7: UI — Template editor page

**Files:**
- Create: `ui/app/templates/page.tsx`, `ui/components/template-editor.tsx`
- Test: `ui/app/templates/page.test.tsx`

> Use `frontend-design` + `DESIGN.md`.

**Interfaces:**
- Consumes: Task 6 hooks + `renderPreview`/`SAMPLE_VARS`.
- Produces: `/templates` — SignedIn; header + nav (add **Templates** + **Workflow** links to all page headers). A two-pane editor: left = template list (global/client badge, New button, select to edit); right = editor form (name, subject input, body textarea) with a **variable palette** (chips inserting `{{…}}` at cursor) and a **live preview** card rendering subject+body via `renderPreview(…, SAMPLE_VARS)`. Save (`useSaveTemplate`), Delete (`useDeleteTemplate`, showing the 409 "used by a step" error inline). SignedOut → RedirectToSignIn.

- [ ] **Step 1: Failing test** `ui/app/templates/page.test.tsx` — mock the hooks + Clerk; assert the page renders a "Templates" heading and a "New template" control, and that typing renders a preview containing the sample debtor name. (Mock `../../lib/api/config`; import `renderPreview` from `config-format`.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the page + `template-editor.tsx` component (variable-insert at cursor via a `textarea` ref). Add the nav links.
- [ ] **Step 4: Run → PASS + build.** `cd ui && npx jest && npm run build`
- [ ] **Step 5: Commit**
```bash
git add ui/app/templates ui/components/template-editor.tsx ui/app
git commit -m "feat: template editor page with variable palette + live preview"
```

---

### Task 8: UI — Workflow timeline (drag-and-drop)

**Files:**
- Create: `ui/app/workflow/page.tsx`, `ui/components/flow-timeline.tsx`, `ui/components/step-card.tsx`
- Test: `ui/components/flow-timeline.test.tsx`, `ui/app/workflow/page.test.tsx`

> Use `frontend-design` + `DESIGN.md`.

**Interfaces:**
- Consumes: Task 6 hooks (`useFlow`, `useSaveSteps`, `useCustomizeFlow`, `useResetFlow`, `useTemplates`).
- Produces: `/workflow` — SignedIn; header + nav (**Workflow** active). A **scope switch** (Global | This client). A due-date-anchored horizontal **timeline** of draggable **step cards** (`@dnd-kit/sortable` `SortableContext`, `useSortable` per card), each showing its offset label (`offsetLabel(offsetDays)` → e.g. `"7d before due"` / `"Due day"` / `"14d overdue"`), a template `<select>` (from `useTemplates`), an offset control (number input + a before/after toggle that sets the sign), and a remove button. **Add step** appends a card (default offset = last + 7, first available template). **Save** posts the ordered steps (`useSaveSteps(scope)`). For `scope=client` inheriting global: an *"Inheriting the global flow"* banner + **Customize** button (`useCustomizeFlow`); when `isOverride`, a **Reset to global** (`useResetFlow`). SignedOut → RedirectToSignIn.
  - `offsetLabel(offsetDays: number): string` and `StepCard` are unit-testable pieces; `flow-timeline.test.tsx` renders a `FlowTimeline` with two steps and asserts both offset labels appear and the Save button is present (drag itself need not be simulated — assert the sortable list renders each step).

- [ ] **Step 1: Failing tests** — `flow-timeline.test.tsx` (renders a card per step with correct offset labels + a Save button; mock `useTemplates`) and `workflow/page.test.tsx` (renders "Workflow" heading + scope switch; mock hooks + Clerk).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `step-card.tsx` (`useSortable`), `flow-timeline.tsx` (`DndContext` + `SortableContext`, `onDragEnd` reorders local state via `arrayMove`, `offsetLabel`, add/remove/save), and the page (scope switch + inherit/override banner). Read `ui/AGENTS.md` for Next 16 specifics.
- [ ] **Step 4: Run → PASS + build.** `cd ui && npx jest && npm run build`
- [ ] **Step 5: Commit**
```bash
git add ui/app/workflow ui/components/flow-timeline.tsx ui/components/step-card.tsx
git commit -m "feat: drag-and-drop reminder flow timeline (global + per-client override)"
```

---

### Task 9: Live verification

**Files:** none (verification).

- [ ] **Step 1:** Rebuild api (`npm run build`) + restart; confirm defaults seeded: `psql "$DIRECT_URL" -tAc "select count(*) from reminder_steps; select count(*) from email_templates"` → ≥4 each.
- [ ] **Step 2:** Guard check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/config/flow` → `401`.
- [ ] **Step 3:** Via a Nest-context script (like Plan 4's), for client `2050ceb1-…`: call `FlowService.getEffective(clientId,'client')` (expect inherited global, 4 steps), then `DraftingService.draftForDebtor` for a seeded debtor and confirm the new draft has a non-null `templateId` + `stepOffsetDays`, and its body contains real debtor data (rendered from the template). Paste the outcome.
- [ ] **Step 4:** In the browser: open `/templates` (see 4 seeded templates, edit + preview), `/workflow` (see the 4-step timeline, drag to reorder, Save), then draft outreach for a debtor and confirm the approval queue shows a template-based draft. Record the result.

---

## Self-Review

**Spec coverage:** Models (Task 1) ✓; template CRUD + render (Task 2) ✓; flow resolve/override/step-select (Task 3) ✓; endpoints + default seed (Task 4) ✓; agent uses the template (Task 5) ✓; template editor UI (Task 7) ✓; drag-drop timeline with global/override (Task 8) ✓; scope param + tenancy (global + client rows, never cross-client) enforced in Task 2/3 `where` clauses ✓. Deferred (scheduling, branching, per-debtor, role-gating) match the spec's "out of scope."

**Placeholder scan:** No TBD/TODO. The one intentional test-literal correction (`selectStepFor(0,…)` → `0`) is called out explicitly with the reasoning, not left vague.

**Type consistency:** `TemplateVars`/`renderTemplate`/`buildVars` (Task 2) consumed by drafting (Task 5) + mirrored as `renderPreview` (Task 6). `StepView`/`selectStepFor`/`FlowScope` (Task 3) consumed by controller (Task 4) + drafting (Task 5). `FlowStep`/`EffectiveFlow`/`Template` (Task 6) match the controller's responses (Task 4). `offsetDays` integer, due-date-relative, negative-before, used consistently. `OutreachDraft.templateId/stepOffsetDays` (Task 1) written by drafting (Task 5).
