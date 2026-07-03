# Revey Design System

> **Purpose:** The single source of truth for styling the Revey app (`ui/`). Derived
> directly from the live brand at **https://revey.ai** (extracted from its CSS custom
> properties and type stack). Use these tokens verbatim — do **not** use Composio or any
> generic template. When styling any component, map to the tokens below.

---

## 1. Brand foundation

Revey is an **AI collections agent for B2B finance teams**. The brand is calm, precise,
and confident — a serious financial tool, not a playful SaaS toy. The visual language is
**warm-minimal**: lots of paper-white space, one confident green as the identity color, an
amber/red severity scale reserved strictly for money-at-risk, and a distinctive grotesque
display face that gives it personality without noise.

**Design principles**
1. **Money state = color.** Green means collected/healthy. Amber means overdue. Red means
   seriously at risk. Never use these colors decoratively — color always means something.
2. **Numbers are first-class.** Financial figures use the mono face, tabular alignment, and
   never wrap. The number is the hero of most components.
3. **Quiet chrome, loud data.** Borders are hairline, backgrounds are near-white, shadows
   are minimal. The data (amounts, aging, debtors) carries the visual weight.
4. **Generous whitespace, tight type.** Sections breathe; text blocks are compact and
   left-aligned.

**Voice** (from revey.ai): direct, outcome-led, empathetic to the pain.
- Headlines: *"Never chase an invoice again."* · *"Days overdue is the wrong place to
  start."* · *"See Revey clear your aging report."*
- Never corporate filler. Short, declarative, specific. Numbers over adjectives.

---

## 2. Color tokens

Exact values from revey.ai. Names mirror the site's own CSS variables so intent is
unambiguous.

### Neutrals
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FFFFFF` | Primary background (cards, page) |
| `--inset` | `#F5F5F4` | Subtle inset / secondary background, table zebra |
| `--line` | `#E7E7E5` | Hairline borders, dividers |
| `--ink` | `#0A0A0A` | Primary text / headings |
| `--vault` | `#0A0A0A` | Dark surfaces (footer, dark CTA) |
| `--muted` | `#52635B` | Secondary / supporting text (green-tinted gray) |

### Paid / success (green family — "collected, healthy")
| Token | Hex | Use |
|---|---|---|
| `--paid` | `#0E8A55` | **Primary brand green.** Primary buttons, active nav, positive KPI |
| `--paid-bright` | `#2FD08A` | Bright accent, highlights, sparkline/positive delta |
| `--paid-deep` | `#0A6E44` | Hover/pressed green, dense text on light green |
| `--paid-soft` | `#E4F3EB` | Success badge background, filled cell |
| `--paid-tint` | `#F3FAF6` | Faintest green wash (section background) |

### Overdue / warning (amber family — "at risk")
| Token | Hex | Use |
|---|---|---|
| `--overdue` | `#C0762F` | Overdue amount, warning accent |
| `--overdue-ink` | `#8A5012` | Dark amber text on soft amber |
| `--overdue-soft` | `#F6EADB` | Overdue badge background |

### Danger (red — "seriously overdue / dispute") — extend the palette
| Token | Hex | Use |
|---|---|---|
| `--danger` | `#C0492F` | 90+ days, disputes, destructive actions |
| `--danger-soft` | `#F6E2DC` | Danger badge background |

### Info (blue) — sparing use only
| Token | Hex | Use |
|---|---|---|
| `--info` | `#0A6ABF` | Links to external systems (Xero), informational notes |

> **Rule:** green / amber / red are *semantic*. A neutral chip (status = draft, unknown)
> uses `--inset` + `--muted`, never a brand color.

---

## 3. Typography

Load via Google Fonts (already how revey.ai does it):
`Bricolage Grotesque` (display), `Hanken Grotesk` (body), `JetBrains Mono` (mono).

| Token | Stack |
|---|---|
| `--display` | `"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--body` | `"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--mono` | `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` |

**Roles**
- **Headings / page titles / section titles →** `--display`, weight 600–700, tight
  tracking (`-0.01em`), slightly reduced line-height (1.05–1.15).
- **Body / labels / UI text →** `--body`, weight 400 (500 for emphasis, 600 for labels).
- **All money, dates, counts, IDs →** `--mono`, weight 500, `font-variant-numeric:
  tabular-nums`. Never wrap a currency figure.

**Type scale** (rem)
| Step | Size | Use |
|---|---|---|
| Display | 2.5–3rem | Hero / big KPI number |
| H1 | 1.75rem | Page title |
| H2 | 1.25rem | Section title |
| Body | 0.9375rem (15px) | Default UI text |
| Small | 0.8125rem (13px) | Labels, captions, table meta |
| Micro | 0.6875rem (11px) | Uppercase eyebrow labels (tracking `0.08em`) |

---

## 4. Layout, shape, elevation, motion

| Token | Value | Use |
|---|---|---|
| `--maxw` | `1180px` | Max content width (centered) |
| `--radius` | `14px` | Cards, inputs, buttons |
| `--radius-lg` | `22px` | Large panels, hero cards, modals |
| radius-pill | `999px` | Badges, chips |
| `--ease` | `cubic-bezier(.22,.61,.36,1)` | All transitions (180–240ms) |

**Spacing:** 4px base scale — 4, 8, 12, 16, 24, 32, 48, 64. Section padding ≥ 32px;
card padding 20–24px.

**Elevation:** keep flat. Cards = `1px solid var(--line)` on `--paper`, no shadow by
default. Only elevate on hover/overlay: `0 6px 24px rgba(10,10,10,0.06)`.

**Motion:** subtle. Hover state changes color/border, not size. Use `--ease`, 180–240ms.

---

## 5. Component patterns

**Buttons**
- *Primary:* bg `--paid`, text `--paper`, radius `--radius`, weight 600; hover `--paid-deep`.
- *Secondary:* bg `--paper`, text `--ink`, `1px solid --line`; hover bg `--inset`.
- *Ghost:* transparent, text `--muted`; hover text `--ink`.
- *Destructive:* text/border `--danger`; hover bg `--danger-soft`.

**Cards / KPI tiles**
- `--paper` bg, `1px solid --line`, `--radius`, 20–24px padding.
- Eyebrow label: Micro, uppercase, `--muted`. Value: `--display` or `--mono`, large,
  `--ink`. Optional delta chip (green up / amber-red down).
- A KPI whose meaning is negative (Overdue) tints its value `--overdue`; positive
  (Collected) tints `--paid`.

**Badges / status chips** (pill, Small weight 600, soft bg + ink text)
- Paid → `--paid-soft` / `--paid-deep`
- Overdue → `--overdue-soft` / `--overdue-ink`
- 90+ / dispute → `--danger-soft` / `--danger`
- Neutral (draft/unknown) → `--inset` / `--muted`

**Tables** (the debtors list is the workhorse)
- Header row: Small, uppercase-ish, `--muted`, `1px solid --line` bottom.
- Rows: hairline `--line` dividers, hover bg `--paid-tint`. Row min-height 48px.
- Money columns: right-aligned, `--mono`, tabular-nums. Name column links in `--ink`,
  hover `--paid`. Zebra optional via `--inset`.

**Nav / header:** `--paper`, hairline bottom border, wordmark in `--display` 600. Active
link `--ink`/`--paid`, inactive `--muted`.

---

## 6. Data visualization — aging & money

Follow the `dataviz` skill's method, but the palette below **is** the Revey ramp. The AR
aging buckets form a severity ramp from healthy green → at-risk amber → danger red:

| Bucket | Token / Hex | Meaning |
|---|---|---|
| `current` | `--paid` `#0E8A55` | Not yet due — healthy |
| `1-30` | `#33B06B` (green→amber midpoint) | Just slipped |
| `31-60` | `--overdue` `#C0762F` | Overdue |
| `61-90` | `--overdue-ink` `#8A5012` | Seriously overdue |
| `90+` | `--danger` `#C0492F` | At risk / write-off zone |

Rules: bars/segments use the ramp above; label each with the bucket name **and**
`formatCents(amount)`; every bar carries an `aria-label` (accessible without color).
Axis/gridlines in `--line`; value labels in `--mono`. Never rely on color alone — always
pair with a text label. Keep charts flat (no gradients/3D).

---

## 7. Applying it in the Next.js app (`ui/`)

Tailwind v4 is already wired (`app/globals.css` uses `@import "tailwindcss"`, loaded via
`app/layout.tsx`). Implement the system as:

1. **Fonts:** load the three families with `next/font/google` (`Bricolage_Grotesque`,
   `Hanken_Grotesk`, `JetBrains_Mono`), expose as CSS variables on `<body>`.
2. **Tokens:** declare all color/type/shape tokens in `app/globals.css` under a Tailwind v4
   `@theme` block (so utilities like `bg-paper`, `text-ink`, `text-paid`, `border-line`,
   `font-display`, `font-mono`, `rounded-[--radius]` exist), plus a `:root` mirror for raw
   `var(--token)` use.
3. **Primitives:** build small styled components — `Button`, `Card`, `KpiTile`, `Badge`,
   `DataTable` — that consume the tokens, so pages compose from them instead of ad-hoc
   Tailwind. Keep them in `ui/components/`.
4. **Numbers:** a `<Money>`/`formatCents` display that always renders `--mono` + tabular
   nums.
5. **Dark mode:** out of scope for now — ship the light (paper) theme first; the token
   layer makes a later dark theme a swap of the `:root` values.

**Definition of done for "styled":** the current dashboard, connections, and debtor pages
render using these tokens — Bricolage/Hanken/JetBrains fonts live, `--paid` green identity,
KPI tiles as bordered cards, the aging chart on the severity ramp, and the debtors table
with mono right-aligned money. No default serif, no unstyled fallbacks, no Clerk
`OrganizationSwitcher`.

---

**Source:** https://revey.ai (design tokens extracted 2026-07-03). This document supersedes
the Composio default referenced in the global guide for the Revey project.
