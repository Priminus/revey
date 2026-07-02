# Revey — Design-Partner MVP Design

> **Status:** Draft for review
> **Date:** 2026-07-02
> **Scope:** Thin-slice MVP to get 1–2 design partners live
> **Product:** AI collections agent for B2B finance teams (see ICP doc)

---

## 1. Goal & scope

Revey is an AI collections agent for mid-market B2B finance teams. It reads the
accounts-receivable (AR) aging report, scores each debtor account on *intelligence*
rather than days overdue, runs branded follow-ups, auto-pauses on disputes and routes
them to a human, and reconciles payments. The value proposition is lower Days Sales
Outstanding (DSO) and reclaimed time for finance teams.

This document specifies the **design-partner MVP** — the smallest end-to-end system
that gets 1–2 design partners live and produces measurable before/after DSO. It is
**managed-service first** (Revey's ops team operates on behalf of clients), with the
same UI later opened for customer self-serve.

### In scope (MVP / Phase 1)

- **Xero** integration (OAuth, AR aging + invoices + payments sync).
- **AR ingestion** into a tenant-isolated debtor/invoice model.
- **LLM scoring** — willingness-to-pay score + recommended action per debtor.
- **Email** outreach: branded, threaded, reply-detection.
- **Human-in-the-loop (HITL) approval queue** — every outreach is drafted by the agent
  and approved (or edited/rejected) by a human before sending.
- **Reply + dispute detection** — classify inbound replies; auto-pause and route
  disputes to a human.
- **Payment reconciliation** — match Xero payments to invoices, close out chased debts.
- **Per-client + per-debtor memory** — evolving profile that makes each cycle smarter.
- **Managed-service console** — Revey ops team manages all client profiles.
- **DSO metrics** — before/after measurement per client (the core proof).

### Out of scope (explicitly deferred)

- **WhatsApp** channel → Phase 2.
- **Client self-serve portal** and **configurable autonomy** → Phase 2.
- **QuickBooks**, **voice**, **SMS**, and **trained ML scoring** → Phase 3+.
- **Zep/Graphiti temporal memory** → Phase 2 upgrade path (see §7).

---

## 2. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Plan scope | Thin-slice MVP | Integration depth is the #1 constraint; land design partners fast. |
| First integration | **Xero** | Deepest SG + ANZ penetration; clean OAuth + AR API. |
| First channel | **Email** (then WhatsApp in P2) | Fastest, lowest compliance surface, proves the branded/dispute-aware agent. |
| Autonomy | **Approve-before-send (HITL)** | Safest for early debtor-relationship trust; generates rich feedback data. |
| Scoring | **LLM reasoning over memory + AR data** | Explainable, needs no labeled data at start; matches "intelligence not days overdue". |
| Orchestration | **LangGraph.js** inside NestJS | Long-running resumable state machine; native `interrupt()` for HITL; durable checkpointer; auditable graph. |
| Auth + tenancy | **Clerk Organizations** | Each client company = one org; ops team spans orgs; roles for ops vs client users. |
| DB + storage | **Supabase** (Postgres + pgvector + storage + realtime) | Managed Postgres with SG region; RLS for DB-enforced tenant isolation; realtime for live queue/dashboards. |
| Memory | **Mem0 (OSS, self-hosted) on Supabase pgvector** | Node SDK; clean `app_id`/`user_id` tenancy; all data stays in Supabase (residency); no extra datastore. |
| Deploy | **Fly.io** (`sin` region) | API + UI as Fly apps; SG residency story for CFO/IT blockers. |
| Model | **Claude** (Anthropic SDK) | Scoring, drafting, reply classification. |
| ORM / migrations | **Prisma** | Schema + migrations (house convention); tenant scoping enforced in service layer + RLS. |

### Assumptions to validate with first partners

1. **Integration depth** is the primary constraint — validate Xero AR/invoice/payment
   coverage before scaling outreach.
2. **LLM scoring** over memory + AR is sufficiently accurate and explainable without a
   trained model at this stage.
3. Late payment is driven by **willingness-to-pay**, not genuine disputes (screened at
   qualification; disputes auto-route to humans).
4. **Mem0's** single-scope query constraint and non-graph temporal model are acceptable
   for MVP; Zep is the escalation path if temporal recall becomes the differentiator.

---

## 3. Architecture overview

Monorepo, house convention:

```
revey/
├── api/                 # NestJS backend (multi-tenant)
│   └── src/
│       ├── auth/            # Clerk integration + tenant guard
│       ├── clients/         # Client (customer company) profiles, config, brand voice
│       ├── integrations/
│       │   └── xero/        # OAuth, sync AR aging + invoices + payments
│       ├── debtors/         # Debtor accounts + invoices + aging state (per client)
│       ├── scoring/         # LLM willingness-to-pay score + recommended action
│       ├── workflow/        # LangGraph.js collection graph (orchestration)
│       ├── outreach/        # Cadence planning + branded email drafting (LLM)
│       ├── approvals/       # HITL queue: draft → review/edit → approve/reject
│       ├── messaging/       # Email send + inbound reply webhook (WhatsApp adapter P2)
│       ├── disputes/        # Reply classification, auto-pause, human routing
│       ├── reconciliation/  # Match Xero payments → invoices, close debts
│       ├── memory/          # Mem0 abstraction: per-client + per-debtor memory
│       └── metrics/         # DSO before/after per client
├── ui/                  # Next.js (App Router) — managed-service console (P1)
├── docs/
└── README.md
```

- **`api/` (NestJS)** owns HTTP, DI, integrations, auth, and hosts the LangGraph runtime.
- **`ui/` (Next.js)** is the **managed-service console** in P1; Phase 2 reuses the same
  components, scoped by Clerk org + role, as the **client self-serve portal**.
- **Supabase Postgres** is the single datastore: relational tables (Prisma-migrated),
  `pgvector` for Mem0 memory, storage for attachments, realtime for live queue/dashboards.
- **LangGraph checkpointer** persists workflow state to Supabase Postgres so collection
  runs can pause for days (awaiting approval or a reply) and resume durably.

---

## 4. Modules (responsibilities & boundaries)

| Module | Does | Depends on |
|---|---|---|
| `auth` | Verify Clerk session, resolve active org → `client_id`, enforce role; expose a tenant guard/interceptor. | Clerk |
| `clients` | CRUD client profiles: brand voice, cadence config, timezone/quiet hours, autonomy (fixed HITL in P1). | Supabase |
| `integrations/xero` | OAuth connect/refresh; scheduled sync of AR aging, invoices, payments; normalize into `debtors`. | Xero API |
| `debtors` | Store debtor accounts, invoices, aging state per client; expose current AR snapshot. | Supabase |
| `scoring` | For each debtor, call Claude with AR data + memory → willingness-to-pay score, reasoning, recommended action. | `memory`, model |
| `workflow` | LangGraph graph orchestrating a debtor's collection cycle; owns state transitions + HITL interrupt + timers. | most modules |
| `outreach` | Decide who is due; draft branded email via Claude + memory; hand to `approvals`. | `memory`, model |
| `approvals` | HITL queue: persist drafts, surface to console, apply human edits, approve/reject, resume the graph. | `workflow` |
| `messaging` | Send approved email (branded/threaded); receive inbound reply webhooks. WhatsApp adapter added P2. | email provider |
| `disputes` | Classify inbound replies (payment promise / dispute / question); on dispute, pause account + route to human. | model, `workflow` |
| `reconciliation` | Match Xero payments to invoices; mark paid; feed DSO metric + memory. | `integrations/xero` |
| `memory` | Thin interface over Mem0 (read/write per-client + per-debtor). Swappable → Zep later. | Mem0, pgvector |
| `metrics` | Compute DSO before/after per client; power dashboards. | `debtors`, `reconciliation` |

**Boundary rule:** all memory access goes through the `memory` module so the Mem0→Zep
swap in Phase 2 is contained. The `messaging` module hides channel specifics behind a
channel-agnostic interface so WhatsApp slots in without touching `workflow`/`outreach`.

---

## 5. The collection workflow (LangGraph)

Modeled as one durable, resumable graph per debtor collection cycle:

```
[sync]            Xero → refresh debtor/invoice/aging state
   ↓
[score]           LLM reasons over aging + payment history + memory
                  → willingness-to-pay score + recommended action
   ↓
[plan]            pick next follow-up step per cadence + score
   ↓
[draft]           LLM drafts branded email using client voice + debtor memory
   ↓
[approve] ⏸       interrupt() — human reviews/edits/approves in console
   ├─ reject → end cycle (write memory)
   └─ approve ↓
[send]            messaging sends; log to memory
   ↓
[await-reply] ⏸   pause (timer + inbound webhook)
   ├─ dispute        → pause account, route to human, write memory  → end
   ├─ payment promise/question → update state, write memory → back to [plan]
   └─ no reply (timeout) → back to [plan] (next cadence step)
   ↓
[reconcile]       Xero payment detected → mark paid, update DSO, write memory → end
```

- `⏸` = LangGraph `interrupt()` / durable pause; state is checkpointed to Supabase.
- Every meaningful node writes to **memory**, so the next `score`/`draft` is smarter.
- The graph is the audit trail: each debtor's history of states + decisions is inspectable.

---

## 6. Multi-tenancy & data residency

- **Tenant = Clerk Organization = client company.** Ops-team members belong to multiple
  orgs; client users (Phase 2) belong to one. Roles: `ops-admin`, `client-admin`,
  `client-user`.
- **Every table carries `client_id`.** Enforced two ways: (1) a NestJS tenant guard
  derives `client_id` from the Clerk org and scopes all queries; (2) **Supabase RLS** as
  DB-enforced defense-in-depth (Clerk JWT → Supabase). Ops-admin access is explicit and
  audited.
- **Memory isolation:** Mem0 `app_id = client_id`, `user_id = debtor_id`,
  `run_id = collection case`. Per-client and per-debtor isolation by construction.
- **Residency:** Supabase (SG region) + Fly.io (`sin`) keep all client AR data and memory
  in-region — the concrete answer to CFO/IT/Legal blocker concerns in the ICP.

---

## 7. Memory (Mem0) & the Phase-2 path

- **MVP:** Mem0 OSS self-hosted, vector store = Supabase `pgvector`. Stores extracted
  facts about the client's business, each debtor's payment behavior/history, prior
  outreach outcomes, promises-to-pay, and dispute notes.
- **Access pattern:** `memory` module exposes `recall(clientId, debtorId, query)` and
  `remember(clientId, debtorId, event)`; `scoring` and `outreach` call these.
- **Phase-2 upgrade:** Zep/Graphiti's bi-temporal knowledge graph better models how a
  debtor's behavior/dispute status *changes over time*. Because all memory access is
  behind the `memory` interface, this swap is contained. Trigger: temporal recall proves
  to be the differentiator with early partners.

---

## 8. Error handling

- **Xero sync failures:** retry with backoff; surface a connection-health banner in the
  console; never silently serve stale AR without a "last synced" indicator.
- **LLM failures (scoring/drafting/classification):** retry; on persistent failure, park
  the debtor in a `needs-attention` state rather than sending anything.
- **Reply misclassification risk:** bias toward caution — ambiguous replies route to a
  human, and any dispute signal pauses the account.
- **Send failures:** the graph does not advance past `send` until the provider confirms;
  failures return to the approval queue flagged.
- **HITL is the ultimate guardrail in P1:** nothing reaches a debtor without human approval.

---

## 9. Testing

- **Unit (Jest):** scoring prompt assembly, cadence planning, reply-classification
  parsing, reconciliation matching, tenant-guard scoping.
- **Integration:** Xero sync against sandbox; email send/reply webhook against provider
  sandbox; memory read/write against a test Supabase.
- **Workflow:** LangGraph graph tested with a fake checkpointer — drive a debtor through
  approve/reject/dispute/reconcile paths deterministically.
- **Tenant isolation:** explicit tests that a query scoped to client A never returns
  client B rows (both app guard and RLS).
- **Build gate:** `api` — `npm test && npm run build`; `ui` — `npm run build`.

---

## 10. Phasing

- **Phase 1 (MVP):** everything in §1 "In scope" — Xero, email, HITL, scoring,
  disputes, reconciliation, memory, managed-service console, DSO metrics. Land 1–2 partners.
- **Phase 2:** WhatsApp channel; client self-serve portal; configurable autonomy (dial
  down HITL as trust grows); evaluate Zep memory upgrade.
- **Phase 3+:** QuickBooks, voice, SMS, trained ML scoring, further APAC geos.

---

## 11. Open questions

- Email provider choice (branded sending + threaded replies + inbound webhooks) — to be
  decided in the implementation plan (candidates: Postmark, Resend, SendGrid).
- Exact Xero sync cadence and rate-limit handling — validate against Xero API limits.
- DSO calculation method for before/after (baseline window, formula) — confirm with the
  first partner's finance champion.
