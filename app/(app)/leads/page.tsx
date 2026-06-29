import { loadOwnerLeads } from '@/lib/data';
import { smsConfigured } from '@/lib/sms';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { DISQUAL_LABELS, parseDqRule } from '@/lib/qualifying';
import { deleteLead } from './actions';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Leads' };

export const dynamic = 'force-dynamic';

const ruleLabel = (rule: string | null) => {
  const dq = parseDqRule(rule);
  if (dq) {
    return {
      text: `Disqualified · ${DISQUAL_LABELS[dq]}`,
      cls: 'bg-bad/10 text-bad border-bad/30',
    };
  }
  switch (rule) {
    case 'starvation':
      return { text: 'Rule 1 · Starvation', cls: 'bg-bad/10 text-bad border-bad/30' };
    case 'most_behind':
      return { text: 'Rule 2 · Most behind', cls: 'bg-amber/10 text-amber border-amber/30' };
    case 'newest_client':
      return { text: 'Rule 3 · Newest', cls: 'bg-good/10 text-good border-good/30' };
    case 'round_robin':
      return { text: 'Rule 4 · Round robin', cls: 'bg-hairline/40 text-ink border-hairline' };
    case 'no_candidates':
      return { text: 'No coverage', cls: 'bg-muted/10 text-muted border-hairline' };
    default:
      return { text: rule ?? '—', cls: 'bg-muted/10 text-muted border-hairline' };
  }
};

function YesNoChip({ label, value }: { label: string; value: boolean | null }) {
  if (value == null) return null;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded border
        ${value ? 'bg-good/10 text-good border-good/30' : 'bg-bad/10 text-bad border-bad/30'}`}
    >
      {label} {value ? '✓' : '✗'}
    </span>
  );
}

export default async function LeadsPage() {
  const { leads, clientsById } = await loadOwnerLeads();
  const disqualified = leads.filter((l) => l.status === 'disqualified').length;
  // "Unassigned" now means: not DQ, but no client_id (postcode uncovered).
  const unassigned = leads.filter(
    (l) => !l.client_id && l.status !== 'disqualified',
  ).length;
  const noConsent = leads.filter((l) => !l.consent).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Leads
        </h1>
        <p className="text-muted text-sm mt-1">
          Live captures from the public form. Routing rule fired, consent state,
          and GDPR delete are visible here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink">
            {leads.length} total
          </span>
          {unassigned > 0 && (
            <span className="num px-2 py-1 rounded-md bg-bad/10 text-bad border border-bad/30">
              {unassigned} unassigned
            </span>
          )}
          {disqualified > 0 && (
            <span className="num px-2 py-1 rounded-md bg-muted/10 text-muted border border-hairline">
              {disqualified} disqualified
            </span>
          )}
          {noConsent > 0 && (
            <span className="num px-2 py-1 rounded-md bg-bad/10 text-bad border border-bad/30">
              {noConsent} no consent
            </span>
          )}
          <span
            className={`px-2 py-1 rounded-md border
              ${smsConfigured()
                ? 'bg-good/10 text-good border-good/30'
                : 'bg-amber/10 text-amber border-amber/30'
              }`}
          >
            SMS: {smsConfigured() ? 'live' : 'no-op (no provider configured)'}
          </span>
        </div>
      </header>

      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase bg-bg/60">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-4 py-3">Captured</th>
              <th className="text-left font-medium px-3 py-3">Homeowner</th>
              <th className="text-left font-medium px-3 py-3">Postcode</th>
              <th className="text-left font-medium px-3 py-3">Qualifying</th>
              <th className="text-left font-medium px-3 py-3">Routed to</th>
              <th className="text-left font-medium px-3 py-3">Consent</th>
              <th className="text-right font-medium px-4 py-3">Erase</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const rule = ruleLabel(l.routing_rule_fired);
              return (
                <tr key={l.id} className="border-b last:border-b-0 border-hairline align-top">
                  <td className="px-4 py-3 num text-xs whitespace-nowrap">
                    {fmtDateTime(l.created_at)}
                    {l.campaign_source && (
                      <div className="text-[10px] text-muted mt-0.5">
                        via {l.campaign_source}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{l.name ?? '—'}</div>
                    <div className="text-muted text-xs num">
                      {l.phone ?? '—'}
                    </div>
                    <div className="text-muted text-xs">{l.email ?? '—'}</div>
                    {l.address && (
                      <div className="text-muted text-xs mt-1">{l.address}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 num text-sm">{l.postcode ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <YesNoChip label="owner" value={l.is_homeowner} />
                      <YesNoChip label="bill payer" value={l.bill_payer} />
                      <YesNoChip label="roof OK" value={l.roof_suitable} />
                      <YesNoChip label="finance" value={l.finance_interest} />
                    </div>
                    {l.monthly_bill != null && (
                      <div className="text-xs text-muted mt-1.5 num">
                        ~{fmtMoney(l.monthly_bill)}/mo bill
                      </div>
                    )}
                    {l.notes && (
                      <div className="text-xs text-muted mt-1 italic">
                        “{l.notes}”
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {l.client_id ? (
                      <div className="text-sm font-medium">
                        {clientsById.get(l.client_id) ?? '(deleted)'}
                      </div>
                    ) : l.status === 'disqualified' ? (
                      <div className="text-muted text-xs font-medium">
                        Disqualified
                      </div>
                    ) : (
                      <div className="text-bad text-xs font-medium">
                        Unassigned
                      </div>
                    )}
                    <span
                      className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded border ${rule.cls}`}
                    >
                      {rule.text}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {l.consent ? (
                      <div>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-good/10 text-good border border-good/30">
                          ✓ consented
                        </span>
                        {l.consent_at && (
                          <div className="text-[10px] text-muted mt-1 num">
                            {fmtDateTime(l.consent_at)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-bad/10 text-bad border border-bad/30">
                        ✗ no consent
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteLead}>
                      <input type="hidden" name="id" value={l.id} />
                      <button
                        type="submit"
                        className="text-xs text-bad hover:underline"
                        title="GDPR delete: removes the homeowner's record entirely (and any linked appointment)."
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted">
                  No leads yet. Try the public form at{' '}
                  <span className="text-ink font-medium">/apply</span>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
