# CLAUDE.md — Sunline guardrails

Read this before touching code in this repo. Every session does.

## What Sunline is

A platform for a one-person UK solar appointment-setting agency. Two front
doors: the **owner app** (depth, control room) and the **client portal**
(calm, one big number, mobile-first). UK residential solar only. GBP and
UK formats throughout.

The full spec lives in the build brief shared with the user. Build it in the
five phases at the end of that brief — do **not** jump ahead.

## Non-negotiables

These come from Section 12 of the brief and are not up for debate:

1. **Clients never see ad spend, agency margin, or cost-per-sit to the
   agency.** Specifically: `clients.ad_spend_monthly`, `campaigns.ad_spend`,
   and any derived agency-cost / margin metric. Enforce at *both* the
   database (RLS / column-level care) and the UI (the portal must only
   select safe columns — do not `select *` from these tables in client code).

2. **Tenant isolation is enforced at the database, not just the UI.** RLS is
   on for every business table. Helper functions (`auth_role`, `auth_client_id`,
   `is_owner`) are the only allowed way to read role/tenant from a policy. Any
   new table that carries `client_id` must enable RLS in the same migration and
   ship the owner-all + client-read-own policy pair.

3. **No outbound message without recorded consent.** `leads.consent = true`
   gates *every* outbound SMS / email / call path. The webhook that triggers
   speed-to-lead must check it; setters must not be allowed to dial without it.

4. **No automated ad-budget changes.** Anything that would alter live spend is
   a *suggestion* surfaced to the owner for approval. Never a write.

5. **GBP and UK formats throughout.** £, en-GB locale, UK phone format,
   UK addresses. No mixed currency anywhere.

## Stack defaults

- Postgres on Supabase = source of truth. Real auth via Supabase Auth. RLS
  for tenant isolation. These are non-negotiable.
- Frontend (Phase 2+): Next.js App Router + Tailwind + Recharts. Port from
  the React prototype the user will share.
- Hosting: Vercel + Supabase managed.
- Automation (Phase 4): webhook endpoints in the Next.js app, wired to
  Make/n8n + an SMS provider initially. Claude Agent SDK can replace the
  qualifying logic later.

If something genuinely needs a different tool, justify it — but "owned
Postgres + real auth + row-level isolation" doesn't move.

## How to work in this repo

- **Phase discipline.** Ship and verify one phase before starting the next.
  Phase 1's acceptance test is `npm run verify:rls` passing.
- **Migrations are append-only.** Add `supabase/migrations/000N_*.sql` —
  never edit a migration that's been applied to the live project.
- **No service-role key in browser code.** Service role bypasses RLS; it
  belongs in scripts and server-side handlers only.
- **Two tables, two views, in the client portal.** When writing portal code,
  prefer a typed query that lists safe columns explicitly. Never lean on RLS
  alone to hide a column — RLS hides *rows*, not fields.
- **Money is `numeric(10,2)`**, not float. GBP.
- **Dates** are `date` for calendar days, `timestamptz` for moments. No naive
  timestamps.
- **Identifiers** are `uuid` with `gen_random_uuid()` defaults.

## UX principles (when UI phases land)

From Section 9 of the brief — port these into every component decision:

- Two front doors, unequal. Owner gets depth; client gets calm.
- Data enters itself — auto-capture wherever possible.
- One-tap actions — outcome and rating are single taps, never forms.
- Mobile-first — installers are in vans on phones.
- Plain words — "appointments that showed up", not bare jargon.
- Friendly edges — helpful empty states, fast pages.

## Compliance (don't paper over)

- UK GDPR / PECR apply because we store homeowners' personal data.
- Capture consent on the form; store it on the lead; the messaging path is
  gated on it (see non-negotiable #3).
- Build the data-retention policy and a "delete this person" path from day
  one — don't bolt it on later.
- Screen against TPS before any live cold call.
- These are build requirements, not legal advice. Actual policy wording is
  for the user's solicitor.

## When in doubt

Re-read the brief, then ask before guessing. Especially before:
- exposing a new column to the client portal
- adding any outbound communication
- automating anything that spends money
- relaxing or removing an RLS policy
