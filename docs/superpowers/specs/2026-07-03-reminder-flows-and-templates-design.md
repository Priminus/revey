# Reminder Flows + Email Templates — Design

> **Status:** Approved design (2026-07-03)
> **Scope:** A visual, drag-and-drop reminder-cadence builder (global default + per-client
> override) and an email template editor, wired into the agent's drafting.
> **Depends on:** Plan 4 (scoring, drafting, HITL approvals, messaging).

---

## 1. Goal

Let the operator **define and visualise the flow of reminders** — a cadence of steps at
offsets relative to an invoice's due date (−7d, due, +7d, +14d, +30d…) — with a **global**
default that applies to all clients and a **per-client override**. Provide an **email
template editor** so the content the agent sends is authored and reusable, not written from
scratch each time. The agent stays agentic: it **personalizes** the chosen template per
debtor rather than sending a static blast.

**Scope interpretation:** "per client" = per **Revey `Client`** (the customer company Revey
serves). Global flow (`clientId = null`) is the default; a `Client` overrides it with its
own flow. The `ReminderFlow.clientId` column is the single lever — a later variant could
scope overrides per-debtor by adding a `debtorId`, but that is out of scope here.

---

## 2. Data model

- **`EmailTemplate`** — `id`, `clientId String?` (`null` = global, set = client-owned),
  `name`, `subject`, `body` (`@db.Text`), `createdAt`, `updatedAt`. `subject`/`body` may
  contain `{{variables}}`.
  - Supported variables (resolved from debtor + open invoices at draft time):
    `{{debtor_name}}`, `{{outstanding_amount}}` (formatted), `{{invoice_count}}`,
    `{{oldest_days_overdue}}`, `{{invoice_list}}` (newline list of `number — $amount, N days overdue`).
- **`ReminderFlow`** — `id`, `clientId String? @unique` (`null` = the single global flow;
  set = that client's override), `createdAt`, `updatedAt`. Back-relation `steps ReminderStep[]`.
- **`ReminderStep`** — `id`, `flowId` (FK → `reminder_flows`, cascade), `offsetDays Int`
  (negative = before due date, positive = after), `templateId` (FK → `email_templates`),
  `order Int`, `createdAt`. `@@index([flowId])`. Anchored to **invoice due date**.

**Resolution (`FlowResolver`):** for a `clientId`, return the client's `ReminderFlow` if one
exists, else the global flow (`clientId = null`). "Default to global" is the absence of a
client flow. **Customize** clones the global flow's steps into a new client flow; **Reset to
global** deletes the client flow (falls back to global).

**Seed:** on first use, ensure a global flow exists with a sensible default cadence
(e.g. −7d pre-due nudge, +1d due reminder, +14d firm follow-up, +30d final notice), each
step pointing at a matching seeded global template.

---

## 3. Agent integration (the agentic wiring)

`DraftingService.draftForDebtor` changes from "write from scratch" to
**"personalize the cadence-appropriate template"**:

1. Resolve the effective flow for the debtor's client (override → else global).
2. Compute the debtor's cadence position: take the **oldest overdue open invoice's days
   past due** (`oldestDaysOverdue`), and select the step whose `offsetDays` is the **greatest
   value ≤ oldestDaysOverdue** (the most-recent step that has come due). If the account is
   not yet at the first step (e.g. all invoices still before their earliest offset), select
   the earliest step (or, if configured, produce no draft — MVP: select the earliest step).
3. Load that step's `EmailTemplate`. Substitute the `{{variables}}` with real values to
   produce a *filled* template, then ask the **LLM to personalize** it (respect the
   template's structure and tone, keep it professional, reference the real invoices) →
   `{ subject, body }`.
4. Create the `OutreachDraft` (`status: 'pending'`) as today, additionally recording
   provenance: `templateId` and `stepOffsetDays` on the draft.

**Fallback:** if no flow/step/template resolves (misconfiguration), fall back to the current
from-scratch drafting so the feature can never block outreach.

`OutreachDraft` gains nullable `templateId String?` and `stepOffsetDays Int?`.

---

## 4. Backend surface (tenant-scoped by `@ClientId()`)

New `ConfigModule` exposing (a single `scope` query param — `global | client` — selects
which scope to operate on, defaulting to `client`; MVP allows the signed-in client to edit
both, role-gate global to ops-admin later):

- **Templates:** `GET /config/templates` (always returns global + this client's, each tagged
  with its scope), `POST /config/templates` (body includes `scope`), `PATCH
  /config/templates/:id`, `DELETE /config/templates/:id`.
- **Flow:**
  - `GET /config/flow?scope=global|client` — the effective flow for that scope, with steps
    expanded (incl. template name). For `scope=client`, also returns `isOverride` (whether the
    client has its own flow or is inheriting global).
  - `PUT /config/flow/steps?scope=global|client` — replace that scope's steps with an ordered
    array of `{offsetDays, templateId, order}` (the drag-drop editor saves the whole timeline
    at once). For `scope=client`, this requires an existing client flow (call customize first).
  - `POST /config/flow/customize` — clone the global flow's steps into a new client flow.
  - `DELETE /config/flow` — reset this client to global (delete the client flow).

Services: `TemplateService` (CRUD + variable substitution), `FlowService` (resolve,
customize, reset, replace-steps), consumed by `DraftingService`.

---

## 5. Frontend

Two new pages + nav links (**Workflow**, **Templates**) on the shared header, styled with
`DESIGN.md` primitives.

**Workflow (`/workflow`)** — the timeline builder:
- A scope switch: **Global** | **This client**.
- A horizontal, due-date-anchored **timeline**. Each step is a **draggable card**
  (`@dnd-kit/core` + `@dnd-kit/sortable`) positioned by `offsetDays`, showing the offset
  (e.g. "−7d", "Due +14d"), the selected template name, and controls: an offset input
  (number + before/after toggle), a template dropdown, and remove. **Add step** appends a card.
- Client scope, no override yet → an *"Inheriting the global flow"* banner + **Customize**
  button. Overridden → **Reset to global**.
- A **Save** action persists the whole step list (`PUT …/steps`). Optimistic, with error toast.

**Templates (`/templates`)** — the editor:
- List of global + client templates (badge for scope). **New template** + edit.
- Editor: `name`, `subject`, `body` (textarea) with a **variable palette** (clickable chips
  that insert `{{…}}` at the cursor), and a **live preview** panel rendering the template
  against **sample debtor data** (client-side substitution). Save / delete.

**React Query hooks** in `ui/lib/api/`: `useTemplates`, `useSaveTemplate`, `useDeleteTemplate`,
`useFlow`, `useCustomizeFlow`, `useResetFlow`, `useSaveSteps`.

---

## 6. Testing & error handling

- **Unit:** `FlowService.resolve` (client-override-else-global); step selection
  (`selectStepFor(oldestDaysOverdue, steps)` — boundary cases: before first offset, exact
  match, beyond last); `TemplateService.render(template, vars)` substitution incl. missing
  variable (left blank or literal). `DraftingService` uses the resolved template and records
  provenance; fallback path when unresolved.
- **UI:** template preview substitution; the timeline renders a card per step and saving
  posts the ordered step list; scope switch shows inherit/override states.
- **Error handling:** invalid offset (non-integer) rejected; deleting a template referenced
  by a step is blocked (or nulls the step's template with a warning) — MVP: block delete with
  a `409` if referenced, surfaced as an inline error. Drafting never throws on
  misconfiguration (fallback).

---

## 7. Out of scope (later plans)

Auto-firing the cadence on a **schedule** (cron + per-invoice due detection that drafts the
right reminder automatically into the approval queue), branching/conditional flows,
non-email channels (WhatsApp/SMS), per-debtor overrides, and role-gating global edits to
ops-admin.
