-- Sunline Phase 12: Setter Profile Photos
--
-- 1. Adds avatar_url column to the users table (nullable text, safe to expose
--    to all roles since it's a public CDN URL — no sensitive data).
-- 2. Creates the Supabase Storage bucket for setter avatar photos.
-- 3. Storage RLS policies — setter may only write to their own folder;
--    public read so photos can render via CDN URL without auth.
-- 4. A SECURITY DEFINER RPC function that lets a setter update ONLY their own
--    avatar_url — deliberately scoped so they cannot change role, email, etc.

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists avatar_url text;

comment on column public.users.avatar_url is
  'Public CDN URL of the setter profile photo stored in the setter-avatars
   storage bucket.  NULL when no photo has been uploaded.  Safe to read by
   any role — it is just a URL, not sensitive data.';

-- ---------------------------------------------------------------------------
-- 2. Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'setter-avatars',
  'setter-avatars',
  true,             -- public: CDN URL works without a signed URL (photos are
                    -- intentionally visible on the leaderboard to all setters)
  5242880,          -- 5 MB per file
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Storage RLS policies
-- File naming convention: {auth.uid()}/{timestamp}  (enforced in policy)
-- ---------------------------------------------------------------------------

-- A setter can upload/replace only files inside their own folder.
create policy "setter_avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'setter-avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

-- UPDATE for upsert behaviour (storage SDK may use this path).
create policy "setter_avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'setter-avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

-- Allow deletion so a setter can replace their photo.
create policy "setter_avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'setter-avatars'
    and (string_to_array(name, '/'))[1] = auth.uid()::text
  );

-- Anyone (including unauthenticated visitors) may read objects — the
-- leaderboard renders in the browser and requests the CDN URL directly.
create policy "setter_avatars_select_public"
  on storage.objects for select to public
  using (bucket_id = 'setter-avatars');

-- ---------------------------------------------------------------------------
-- 4. RPC to update own avatar_url safely
-- SECURITY DEFINER means it runs as the table owner (bypasses RLS) but it
-- only touches avatar_url for auth.uid() — no role escalation possible.
-- ---------------------------------------------------------------------------
create or replace function public.update_own_avatar(new_url text)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.users
     set avatar_url = new_url,
         updated_at = now()
   where id = auth.uid();
$$;

-- Grant execute to authenticated users (setters, owner alike).
grant execute on function public.update_own_avatar(text) to authenticated;
