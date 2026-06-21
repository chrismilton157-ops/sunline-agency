import { fmtDateTime, fmtMoney } from '@/lib/format';
import type { Appointment, Lead } from '@/lib/types';
import {
  updateAppointmentOutcome,
  updateAppointmentQuality,
} from '@/app/(portal)/portal/actions';

const outcomeStyle = (o: Appointment['outcome']) => {
  switch (o) {
    case 'sold':
      return 'bg-good/10 text-good border-good/30';
    case 'sat':
      return 'bg-amber/10 text-amber border-amber/30';
    case 'no_show':
      return 'bg-bad/10 text-bad border-bad/30';
    default:
      return 'bg-hairline/40 text-muted border-hairline';
  }
};

export function PortalAppointmentRow({
  appt,
  lead,
}: {
  appt: Appointment;
  lead: Lead | null;
}) {
  return (
    <tr className="border-b last:border-b-0 border-hairline">
      <td className="px-4 md:px-5 py-3 align-top">
        <div className="text-sm font-medium">{lead?.name ?? '—'}</div>
        <div className="text-muted text-xs">{lead?.address ?? '—'}</div>
      </td>
      <td className="px-3 py-3 align-top num text-sm whitespace-nowrap">
        {fmtDateTime(appt.appt_date)}
        {appt.confirmed_at && (
          <div className="text-[10px] text-good mt-0.5">
            confirmed {fmtDateTime(appt.confirmed_at)}
          </div>
        )}
      </td>
      <td className="px-3 py-3 align-top">
        <form action={updateAppointmentOutcome} className="flex items-center gap-2">
          <input type="hidden" name="id" value={appt.id} />
          <select
            name="outcome"
            defaultValue={appt.outcome}
            className={`text-xs px-2 py-1 rounded-md border ${outcomeStyle(
              appt.outcome,
            )}`}
          >
            <option value="booked">booked</option>
            <option value="sat">sat</option>
            <option value="sold">sold</option>
            <option value="no_show">no_show</option>
          </select>
          <input
            name="sale_value"
            type="number"
            min={0}
            step={50}
            placeholder="sale £"
            defaultValue={appt.sale_value ?? ''}
            className="num w-20 text-xs px-2 py-1 rounded-md border border-hairline"
          />
          <button type="submit" className="text-xs text-amber hover:underline">
            save
          </button>
        </form>
        {appt.outcome === 'sold' && appt.sale_value != null && (
          <div className="text-xs text-muted mt-1 num">
            {fmtMoney(appt.sale_value)}
          </div>
        )}
      </td>
      <td className="px-4 md:px-5 py-3 align-top">
        <div className="flex items-center gap-1">
          <QualityForm id={appt.id} rating="up" active={appt.quality_rating === 'up'} />
          <QualityForm id={appt.id} rating="down" active={appt.quality_rating === 'down'} />
        </div>
      </td>
    </tr>
  );
}

function QualityForm({
  id,
  rating,
  active,
}: {
  id: string;
  rating: 'up' | 'down';
  active: boolean;
}) {
  const submitValue = active ? '' : rating;
  const symbol = rating === 'up' ? '👍' : '👎';
  const activeClass =
    rating === 'up'
      ? 'bg-good/10 border-good/40'
      : 'bg-bad/10 border-bad/40';
  return (
    <form action={updateAppointmentQuality}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="rating" value={submitValue} />
      <button
        type="submit"
        className={`w-7 h-7 rounded-md border text-sm flex items-center justify-center
          ${active ? activeClass : 'border-hairline hover:bg-hairline/40'}`}
        title={`thumbs ${rating}${active ? ' (tap to clear)' : ''}`}
      >
        {symbol}
      </button>
    </form>
  );
}
