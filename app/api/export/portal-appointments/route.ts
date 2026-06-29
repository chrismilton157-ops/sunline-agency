import { NextResponse } from 'next/server';
import { requireSession, loadPortalForClient } from '@/lib/data';
import { buildCsv, csvDateTime, csvDate, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, role, clientId } = await requireSession();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  // Only clients may use this endpoint — owners have their own export.
  // Setters have no clientId and are rejected here.
  if (role !== 'client' || !clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // loadPortalForClient is the same RLS-enforced query used by the portal
  // pages — it never selects ad_spend or any agency-only column.
  const { appointments, leads } = await loadPortalForClient(clientId);

  const leadsById = new Map(leads.map((l) => [l.id, l]));

  const headers = [
    'Appointment Date',
    'Homeowner',
    'Address',
    'Outcome',
    'Confirmed',
    'Quality Rating',
    'Quality Reason',
  ];

  const rows = appointments.map((a) => {
    const lead = leadsById.get(a.lead_id);
    return [
      csvDateTime(a.appt_date),
      lead?.name ?? '',
      lead?.address ?? '',
      a.outcome,
      a.confirmed_at ? csvDate(a.confirmed_at) : 'No',
      a.quality_rating ?? '',
      a.quality_reason ?? '',
    ];
  });

  const today = csvDate(new Date().toISOString()).replace(/\//g, '-');
  return csvResponse(
    `my-appointments-${today}.csv`,
    buildCsv(headers, rows),
  );
}
