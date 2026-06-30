import { type NextRequest, NextResponse } from 'next/server';
import { requireOwner, loadAll } from '@/lib/data';
import { buildCsv, csvDate, csvDateTime, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
  const { role } = await requireOwner();
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clientFilter = req.nextUrl.searchParams.get('client');

  const { appointments, clients, leads } = await loadAll();

  const clientsById = new Map(clients.map((c) => [c.id, c.company]));
  const leadsById = new Map(leads.map((l) => [l.id, l]));

  const filtered = clientFilter
    ? appointments.filter((a) => a.client_id === clientFilter)
    : appointments;

  const sorted = [...filtered].sort((a, b) =>
    a.appt_date < b.appt_date ? 1 : -1,
  );

  const headers = [
    'Appointment Date',
    'Client',
    'Homeowner',
    'Address',
    'Outcome',
    'Confirmed',
    'Quality Rating',
    'Quality Reason',
    'Sale Value (£)',
    'Setter',
    'Invoiced',
  ];

  const rows = sorted.map((a) => {
    const lead = leadsById.get(a.lead_id);
    return [
      csvDateTime(a.appt_date),
      clientsById.get(a.client_id) ?? '',
      lead?.name ?? '',
      lead?.address ?? '',
      a.outcome,
      a.confirmed_at ? csvDate(a.confirmed_at) : 'No',
      a.quality_rating ?? '',
      a.quality_reason ?? '',
      a.sale_value != null ? String(a.sale_value) : '',
      a.setter ?? '',
      a.invoiced ? 'Yes' : 'No',
    ];
  });

  const clientLabel = clientFilter
    ? (clientsById.get(clientFilter) ?? clientFilter).replace(/\s+/g, '-').toLowerCase()
    : 'all';
  const today = csvDate(new Date().toISOString()).replace(/\//g, '-');
  return csvResponse(
    `sunline-appointments-${clientLabel}-${today}.csv`,
    buildCsv(headers, rows),
  );
  } catch {
    return NextResponse.json({ error: 'Export failed — please try again.' }, { status: 500 });
  }
}
