-- Phase 19: Add 'setter' to user_role enum (idempotent — already applied live
-- but recorded here for migration history). A separate migration (0020) adds
-- 'confirmer'. Both values must be committed in their own transaction before
-- any statement in the same session can reference the new value.

-- Postgres does not allow IF NOT EXISTS before PG 9.6, but Supabase (PG 15+)
-- fully supports it.  Running this when 'setter' already exists is safe.
alter type public.user_role add value if not exists 'setter';
