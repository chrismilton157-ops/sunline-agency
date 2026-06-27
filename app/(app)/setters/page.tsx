import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computeSetterQuality } from '@/lib/setter-metrics';
import type { SetterRow, DispositionRow, ApptRow } from '@/lib/setter-metrics';
import { SettersClient } from './SettersClient';

export const dynamic = 'force-dynamic';

export default async function SettersPage() {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role !== 'owner') redirect('/queue');

  const admin = getServerAdmin();

  const [settersRes, dispsRes, apptsRes] = await Promise.all([
    admin.from('users').select('id, email, avatar_url').in('role', ['setter', 'owner']),
    admin.from('call_dispositions')
      .select('id, lead_id, disposition, disqual_reason, created_by, created_at'),
    admin.from('appointments')
      .select('id, setter_id, setter, outcome, quality_rating, quality_reason, confirmed_at, appt_date'),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (dispsRes.error) throw dispsRes.error;
  if (apptsRes.error) throw apptsRes.error;

  const setters = (settersRes.data ?? []) as SetterRow[];
  const disps = (dispsRes.data ?? []) as DispositionRow[];
  const appts = (apptsRes.data ?? []) as ApptRow[];

  const byRange = {
    today: computeSetterQuality(setters, disps, appts, 'today'),
    week: computeSetterQuality(setters, disps, appts, 'week'),
    month: computeSetterQuality(setters, disps, appts, 'month'),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Setter performance
        </h1>
        <p className="text-muted text-sm mt-1">
          Output metrics (bookings, dials) plus quality layer (no-show rate, down-ratings). Owner-only.
        </p>
      </header>

      <SettersClient byRange={byRange} />
    </div>
  );
}
