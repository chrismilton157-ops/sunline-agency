import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Log activity' };

import { loadAll } from '@/lib/data';
import { logAppointment } from './actions';

export const dynamic = 'force-dynamic';

export default async function LogPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { clients } = await loadAll();

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Log activity
        </h1>
        <p className="text-muted text-sm mt-1">
          Add a booked appointment. It&apos;ll show on the client&apos;s detail page.
        </p>
      </header>

      <form action={logAppointment} className="card p-5 space-y-4">
        <div>
          <label className="label" htmlFor="client_id">
            Client
          </label>
          <select
            id="client_id"
            name="client_id"
            required
            className="input mt-1"
            defaultValue=""
          >
            <option value="" disabled>
              Choose a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="homeowner">
            Homeowner name
          </label>
          <input
            id="homeowner"
            name="homeowner"
            required
            className="input mt-1"
            placeholder="e.g. Alice Brown"
          />
        </div>

        <div>
          <label className="label" htmlFor="address">
            Address
          </label>
          <input
            id="address"
            name="address"
            className="input mt-1"
            placeholder="e.g. 12 Oak Lane, Guildford"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="appt_date">
              Appointment date & time
            </label>
            <input
              id="appt_date"
              name="appt_date"
              type="datetime-local"
              required
              className="input mt-1"
            />
          </div>
          <div>
            <label className="label" htmlFor="response_mins">
              Response time (mins)
            </label>
            <input
              id="response_mins"
              name="response_mins"
              type="number"
              min={0}
              step={1}
              className="input mt-1 num"
              placeholder="e.g. 5"
            />
          </div>
        </div>

        {searchParams.error && (
          <p className="text-bad text-sm">{searchParams.error}</p>
        )}

        <button type="submit" className="btn btn-primary w-full">
          Add booked appointment
        </button>
        <p className="text-xs text-muted">
          New row will appear with outcome <span className="font-medium">booked</span>.
          You change it to sat / sold from the client&apos;s appointment list.
        </p>
      </form>
    </div>
  );
}
