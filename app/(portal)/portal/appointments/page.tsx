import { redirect } from 'next/navigation';
import { PortalAppointmentRow } from '@/components/PortalAppointmentRow';
import { loadPortalForClient, requireSession } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Appointments' };

export const dynamic = 'force-dynamic';

export default async function PortalAppointmentsPage() {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  const { appointments, leads } = await loadPortalForClient(clientId);

  const now = new Date();
  const upcoming = appointments
    .filter((a) => a.outcome === 'booked' && new Date(a.appt_date) >= now)
    .sort((a, b) => (a.appt_date < b.appt_date ? -1 : 1));

  // Recent = anything that has actually happened (not still 'booked')
  const recent = appointments.filter((a) => a.outcome !== 'booked').slice(0, 20);

  const leadById = new Map(leads.map((l) => [l.id, l]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Appointments
        </h1>
        <p className="text-muted text-sm mt-1">
          Upcoming sits and the outcome of recent ones — change outcome and
          quality inline.
        </p>
      </header>

      {/* UPCOMING */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Upcoming</h2>
          <p className="text-muted text-xs mt-0.5">
            Booked sits scheduled ahead. You&apos;ll get a confirmation call from
            us within 48 hours of the appointment.
          </p>
        </header>
        {upcoming.length === 0 ? (
          <div className="px-5 py-8 text-muted text-sm text-center">
            No upcoming appointments yet.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {upcoming.map((a) => {
              const lead = leadById.get(a.lead_id);
              return (
                <li key={a.id} className="px-5 py-3 flex justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{lead?.name ?? '—'}</div>
                    <div className="text-muted text-xs">{lead?.address ?? '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-sm">{fmtDateTime(a.appt_date)}</div>
                    <div className="text-[10px] mt-0.5">
                      {a.confirmed_at ? (
                        <span className="text-good">confirmed</span>
                      ) : (
                        <span className="text-muted">awaiting confirmation</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* RECENT — editable */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Recent</h2>
          <p className="text-muted text-xs mt-0.5">
            Mark the outcome and rate the lead quality — saves immediately.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-4 md:px-5 py-2">Lead</th>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Outcome</th>
              <th className="text-left font-medium px-4 md:px-5 py-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((a) => (
              <PortalAppointmentRow
                key={a.id}
                appt={a}
                lead={leadById.get(a.lead_id) ?? null}
              />
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  No appointments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
