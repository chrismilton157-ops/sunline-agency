import { NextResponse } from 'next/server';
import { requireOwner, loadOwnerInvoices } from '@/lib/data';
import { buildCsv, csvDate, csvMoney, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { role } = await requireOwner();
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { invoices, clientsById } = await loadOwnerInvoices();

  const headers = [
    'Period',
    'Client',
    'Status',
    'Advertising Management (£)',
    'Appointment Count',
    'Per-Sit Fee (£)',
    'Appointment Fees (£)',
    'Total (£)',
    'Ad Spend Raw (£)',
    'Management Markup (%)',
    'Issued Date',
    'Paid Date',
  ];

  const rows = invoices.map((i) => [
    i.period,
    clientsById.get(i.client_id) ?? '',
    i.status,
    csvMoney(i.advertising_management),
    i.appointment_count != null ? String(i.appointment_count) : '',
    csvMoney(i.per_sit_fee_snapshot),
    csvMoney(i.appointment_fees),
    csvMoney(i.total),
    csvMoney(i.ad_spend_raw),
    i.management_markup_pct_snapshot != null
      ? String(i.management_markup_pct_snapshot)
      : '',
    csvDate(i.issued_at),
    csvDate(i.paid_at),
  ]);

  const today = csvDate(new Date().toISOString()).replace(/\//g, '-');
  return csvResponse(
    `sunline-invoices-${today}.csv`,
    buildCsv(headers, rows),
  );
}
