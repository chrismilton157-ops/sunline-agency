import { NextResponse } from 'next/server';
import { requireOwner, loadOwnerLeads } from '@/lib/data';
import { buildCsv, csvDate, csvDateTime, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { role } = await requireOwner();
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { leads, clientsById } = await loadOwnerLeads();

  const headers = [
    'Captured',
    'Name',
    'Phone',
    'Email',
    'Address',
    'Postcode',
    'Status',
    'Consent',
    'Consent Date',
    'Owner-Occupier',
    'Bill Payer',
    'Roof OK',
    'Finance Interest',
    'Monthly Bill (£)',
    'Routed Client',
    'Routing Rule',
    'Campaign Source',
    'Response (mins)',
    'Notes',
    'Data Retention Until',
  ];

  const rows = leads.map((l) => [
    csvDateTime(l.created_at),
    l.name,
    l.phone,
    l.email,
    l.address,
    l.postcode,
    l.status,
    l.consent ? 'Yes' : 'No',
    csvDate(l.consent_at),
    l.is_homeowner == null ? '' : l.is_homeowner ? 'Yes' : 'No',
    l.bill_payer == null ? '' : l.bill_payer ? 'Yes' : 'No',
    l.roof_suitable == null ? '' : l.roof_suitable ? 'Yes' : 'No',
    l.finance_interest == null ? '' : l.finance_interest ? 'Yes' : 'No',
    l.monthly_bill != null ? String(l.monthly_bill) : '',
    l.client_id ? (clientsById.get(l.client_id) ?? '') : '',
    l.routing_rule_fired ?? '',
    l.campaign_source ?? '',
    l.response_mins != null ? String(l.response_mins) : '',
    l.notes ?? '',
    csvDate(l.data_retention_until),
  ]);

  const today = csvDate(new Date().toISOString()).replace(/\//g, '-');
  return csvResponse(`sunline-leads-${today}.csv`, buildCsv(headers, rows));
}
