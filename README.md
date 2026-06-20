# Sunline

Platform for a one-person UK solar appointment-setting agency. Owner (you) runs
the agency; clients (the installers) get a calm portal showing only their own
results. GBP throughout, UK-only.

This repo will be built in five phases (see the full brief). **Only Phase 1 is
implemented today**: Supabase project, six tables, RLS policies, owner + one
client login, seed data. Dashboards, portal UI and automation come later.

---

## Phase 1 — what's here

```
sunline-agency/
├── CLAUDE.md                       guardrails every future session reads
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql           tables, enums, indexes, triggers
│       └── 0002_rls.sql            RLS helpers + policies
├── scripts/
│   ├── seed.ts                     creates auth users + seeded business data
│   └── verify-rls.ts               proves tenant isolation works
├── package.json
├── tsconfig.json
└── .env.example
```

Six tables: `clients`, `campaigns`, `leads`, `appointments`, `invoices`,
`users`. Every business row carries `client_id` so RLS can isolate tenants.

---

## What you need to set up

You'll need three things before this runs locally:

1. **A Supabase project.** Free tier is fine.
   - Go to https://supabase.com → New project → pick a region close to the UK
     (e.g. London / Frankfurt).
   - Once it's provisioned, open *Project settings → API*. You'll need:
     - **Project URL** → `SUPABASE_URL`
     - **anon public** key → `SUPABASE_ANON_KEY`
     - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only, never
       ship to the browser; it bypasses RLS)*

2. **Node 20+.** Check with `node --version`.

3. **A local `.env` file.**
   ```bash
   cp .env.example .env
   ```
   Fill in the three Supabase values and pick passwords for the seed accounts:
   - `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` — your owner login
   - `SEED_CLIENT_EMAIL` / `SEED_CLIENT_PASSWORD` — the BrightRoof Solar
     client login

   `.env` is gitignored. Don't commit it.

---

## Run it

```bash
npm install
```

### 1. Apply the migrations

Easiest path (no CLI needed):

1. Open your Supabase project → **SQL editor**.
2. Paste `supabase/migrations/0001_init.sql`, run it.
3. Paste `supabase/migrations/0002_rls.sql`, run it.

(Or, if you have the Supabase CLI linked to the project,
`supabase db push` will apply both.)

### 2. Seed users + data

```bash
npm run seed
```

This:
- creates (or resets the password of) the owner and client auth users
- inserts two clients (BrightRoof Solar, Northwind Energy), campaigns, leads,
  appointments and invoices
- maps the client login to BrightRoof, owner to no tenant

Idempotent — safe to re-run.

### 3. Verify tenant isolation (this is the Phase 1 acceptance test)

```bash
npm run verify:rls
```

Signs in as the owner *and* as the client using the **anon** key (so RLS is
enforced exactly as it will be in the browser) and asserts:

- owner sees all clients / leads / appointments / invoices
- client sees only BrightRoof's rows
- client cannot read Northwind by id or by `client_id`
- client cannot reassign an appointment to Northwind

Expected output ends with **`All RLS checks passed.`** Any `✗` line means RLS
is broken — do not move to Phase 2 until this is clean.

---

## How to test by hand

If you want to poke at it yourself before trusting the script:

**As the owner**
- Log in via the Supabase dashboard's **Authentication → Users** (or the
  Phase 2 app, once it exists) with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`.
- In SQL editor, run with your owner session:
  ```sql
  select company from clients;             -- expect both companies
  select count(*) from leads;              -- expect 3
  ```

**As the client**
- Sign in with `SEED_CLIENT_EMAIL` / `SEED_CLIENT_PASSWORD`.
- The simplest browser check: open `Project → API Docs → leads → Read rows`,
  set Authorization to the client user's JWT, run it. You should see two leads
  (both BrightRoof), never Cara Daniels (Northwind).
- Try to grab Northwind directly:
  ```sql
  select * from clients where company = 'Northwind Energy';
  ```
  Expect **zero rows**. That's RLS doing its job — not an empty database.

---

## What's deliberately NOT in Phase 1

- No Next.js app, no dashboards, no portal screens.
- No webhook / SMS / speed-to-lead automation.
- No invoice generation.
- No metric calculations (Section 6 of the brief).

Those land in Phases 2–5. Don't add them until Phase 1 is verified.

---

## Future phases (reminder)

2. Agency dashboards (owner screens + metric math)
3. Client portal + verified RLS isolation in the UI
4. Lead capture form + webhook + consent-gated SMS + setter writeback
5. Invoice automation + ad-spend → revenue attribution
