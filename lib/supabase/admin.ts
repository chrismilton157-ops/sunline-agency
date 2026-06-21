import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-side ONLY. Bypasses RLS — never import from a client component.
// Used for reading agency-only columns that have been REVOKE'd from the
// `authenticated` role (ad_spend_monthly, ad_spend) so the cookie-auth
// client can no longer SELECT them, even for owners.
export function getServerAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for service-role client.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
