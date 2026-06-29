import 'server-only';
import { getServerAdmin } from './supabase/admin';

export type AuditActorRole = 'owner' | 'setter' | 'client' | 'system' | 'public';

export type AuditEntry = {
  actor_id?: string | null;
  actor_role: AuditActorRole;
  action_type: string;
  entity_type: string;
  entity_id?: string | null;
  description: string;
  metadata?: Record<string, unknown> | null;
};

// Write an audit entry. Uses the service-role client so it always succeeds
// regardless of the caller's auth state.
// Errors are swallowed — audit failure must never block the primary action.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = getServerAdmin();
    const { error } = await admin.from('audit_log').insert({
      actor_id:    entry.actor_id ?? null,
      actor_role:  entry.actor_role,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id:   entry.entity_id ?? null,
      description: entry.description,
      metadata:    entry.metadata ?? null,
    });
    if (error) console.error('[audit] write error:', error.message);
  } catch (e) {
    console.error('[audit] unexpected error:', e);
  }
}

// Resolve the current user's id and role from a Supabase client.
// Returns { id: null, role: 'public' } when not authenticated.
// Accepts `unknown` to avoid fighting with the Supabase SDK's complex generics.
export async function resolveActor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ id: string | null; role: AuditActorRole }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, role: 'public' };
    const { data: row } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const r = row?.role ?? 'public';
    const role: AuditActorRole =
      r === 'owner' ? 'owner' :
      r === 'setter' ? 'setter' :
      r === 'client' ? 'client' : 'public';
    return { id: user.id, role };
  } catch {
    return { id: null, role: 'public' };
  }
}
