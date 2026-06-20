-- Sunline Phase 1: schema
-- Six tables, GBP throughout, every business row carries client_id for RLS.

create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type client_status        as enum ('active', 'paused');
create type campaign_platform    as enum ('meta', 'google', 'other');
create type lead_status          as enum ('new', 'contacted', 'qualified', 'booked', 'disqualified');
create type appointment_outcome  as enum ('booked', 'sat', 'sold', 'no_show');
create type quality_rating       as enum ('up', 'down');
create type user_role            as enum ('owner', 'client');

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- clients ----------
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  company           text          not null,
  contact           text,
  region            text,
  retainer          numeric(10,2) not null default 0,
  per_sit_fee       numeric(10,2) not null default 0,
  ad_spend_monthly  numeric(10,2) not null default 0,
  status            client_status not null default 'active',
  joined_at         date          not null default current_date,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);
create trigger trg_clients_updated
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------- campaigns ----------
create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid              not null references public.clients(id) on delete cascade,
  name        text              not null,
  platform    campaign_platform not null default 'meta',
  ad_spend    numeric(10,2)     not null default 0,
  created_at  timestamptz       not null default now(),
  updated_at  timestamptz       not null default now()
);
create index campaigns_client_id_idx on public.campaigns(client_id);
create trigger trg_campaigns_updated
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------- leads ----------
create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid          not null references public.clients(id)   on delete cascade,
  campaign_id       uuid          references public.campaigns(id)          on delete set null,
  name              text,
  phone             text,
  email             text,
  address           text,
  monthly_bill      numeric(10,2),
  is_homeowner      boolean,
  bill_payer        boolean,
  roof_suitable     boolean,
  finance_interest  boolean,
  consent           boolean       not null default false,
  status            lead_status   not null default 'new',
  response_mins     integer,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);
create index leads_client_id_idx   on public.leads(client_id);
create index leads_campaign_id_idx on public.leads(campaign_id);
create trigger trg_leads_updated
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------- appointments ----------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid                not null references public.leads(id)   on delete cascade,
  client_id       uuid                not null references public.clients(id) on delete cascade,
  appt_date       timestamptz         not null,
  setter          text,
  outcome         appointment_outcome not null default 'booked',
  sale_value      numeric(10,2),
  replaced        boolean             not null default false,
  quality_rating  quality_rating,
  quality_reason  text,
  invoiced        boolean             not null default false,
  created_at      timestamptz         not null default now(),
  updated_at      timestamptz         not null default now()
);
create index appointments_client_id_idx on public.appointments(client_id);
create index appointments_lead_id_idx   on public.appointments(lead_id);
create trigger trg_appointments_updated
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------- invoices ----------
create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid          not null references public.clients(id) on delete cascade,
  period      text          not null,            -- 'YYYY-MM'
  amount      numeric(10,2) not null,
  paid        boolean       not null default false,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create index invoices_client_id_idx on public.invoices(client_id);
create unique index invoices_client_period_uq on public.invoices(client_id, period);
create trigger trg_invoices_updated
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------- users ----------
-- Mirrors auth.users; carries the client_id + role used by RLS.
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  client_id   uuid          references public.clients(id) on delete cascade,
  email       text          not null unique,
  role        user_role     not null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  constraint owner_has_no_client check (
    (role = 'owner'  and client_id is null) or
    (role = 'client' and client_id is not null)
  )
);
create index users_client_id_idx on public.users(client_id);
create trigger trg_users_updated
  before update on public.users
  for each row execute function public.set_updated_at();
