'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { simulateAdaptiveRoute } from '@/app/(app)/routing/adaptive-actions';
import type { ShadowComparison } from '@/lib/adaptive-routing';

type Result =
  | { ok: true; postcode: string; shadow: ShadowComparison; adaptiveEnabled: boolean }
  | { ok: false; error: string }
  | null;

const ruleLabel = (rule: string) =>
  ({
    starvation: 'Rule 1 · Starvation floor',
    most_behind: 'Rule 2 · Most behind',
    newest_client: 'Rule 3 · Newest client',
    round_robin: 'Rule 4 · Round robin',
    no_candidates: 'No coverage',
    adaptive_close_rate: 'Adaptive · Close rate',
  })[rule] ?? rule;

const ruleStyle = (rule: string) => {
  if (rule === 'adaptive_close_rate') return 'bg-amber/10 text-amber border-amber/30';
  switch (rule) {
    case 'starvation':   return 'bg-bad/10 text-bad border-bad/30';
    case 'most_behind':  return 'bg-amber/10 text-amber border-amber/30';
    case 'newest_client': return 'bg-good/10 text-good border-good/30';
    case 'round_robin':  return 'bg-hairline/40 text-ink border-hairline';
    default:             return 'bg-muted/10 text-muted border-hairline';
  }
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Routing…' : 'Simulate'}
    </button>
  );
}

export function AdaptiveSimulator({ adaptiveEnabled }: { adaptiveEnabled: boolean }) {
  const [state, action] = useFormState<Result, FormData>(
    async (_prev: Result, formData: FormData) => simulateAdaptiveRoute(formData),
    null,
  );

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col sm:flex-row gap-2">
        <input
          name="postcode"
          required
          placeholder="Enter a postcode, e.g. GU2 8AA"
          className="input flex-1"
          autoComplete="off"
        />
        <Submit />
      </form>

      {state && !state.ok && (
        <p className="text-bad text-sm">{state.error}</p>
      )}

      {state && state.ok && (
        <div className="space-y-3">
          {/* Two-column comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Base rules */}
            <div className="rounded-md border border-hairline bg-bg p-4 space-y-2">
              <div className="text-xs text-muted uppercase tracking-wide font-medium">
                Current rules (live)
              </div>
              <div className="text-xl font-semibold num">
                {state.shadow.base.winnerCompany ?? '—'}
              </div>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${ruleStyle(state.shadow.base.ruleFired)}`}>
                {ruleLabel(state.shadow.base.ruleFired)}
              </span>
              <p className="text-xs text-ink">{state.shadow.base.reason}</p>
            </div>

            {/* Adaptive */}
            <div className={`rounded-md border p-4 space-y-2 ${
              state.shadow.wouldDiffer
                ? 'border-amber/40 bg-amber/5'
                : 'border-hairline bg-bg'
            }`}>
              <div className="text-xs text-muted uppercase tracking-wide font-medium flex items-center gap-2">
                Adaptive layer
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                  adaptiveEnabled
                    ? 'bg-amber/10 text-amber border-amber/30'
                    : 'bg-hairline/40 text-muted border-hairline'
                }`}>
                  {adaptiveEnabled ? 'LIVE' : 'shadow'}
                </span>
              </div>
              <div className={`text-xl font-semibold num ${state.shadow.wouldDiffer ? 'text-amber' : ''}`}>
                {state.shadow.adaptive.winnerCompany ?? '—'}
              </div>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${ruleStyle(state.shadow.adaptive.adaptiveRuleFired)}`}>
                {ruleLabel(state.shadow.adaptive.adaptiveRuleFired)}
              </span>
              <p className="text-xs text-ink">{state.shadow.adaptive.adaptiveReason}</p>
            </div>
          </div>

          {/* Difference callout */}
          {state.shadow.wouldDiffer ? (
            <div className="rounded-md border border-amber/30 bg-amber/5 px-4 py-3">
              <div className="text-xs font-medium text-amber mb-0.5">
                {adaptiveEnabled ? 'Adaptive changed the decision' : 'Shadow: adaptive would route differently'}
              </div>
              <p className="text-xs text-ink">{state.shadow.shadowSummary}</p>
            </div>
          ) : (
            <div className="rounded-md border border-hairline bg-hairline/10 px-4 py-3">
              <div className="text-xs font-medium text-muted mb-0.5">Adaptive agrees</div>
              <p className="text-xs text-muted">{state.shadow.shadowSummary}</p>
            </div>
          )}

          {/* Per-client close rate context */}
          {Object.keys(state.shadow.adaptive.clientRates ?? {}).length > 0 && (
            <div className="pt-1 border-t border-hairline">
              <div className="label text-xs mb-2">Blended close rates used</div>
              <div className="space-y-1">
                {state.shadow.base.considered.map((c) => {
                  const rate = state.shadow.adaptive.clientRates?.[c.id];
                  if (!rate) return null;
                  const pct = (rate.blended_close_rate * 100).toFixed(0) + '%';
                  return (
                    <div key={c.id} className="flex items-center justify-between text-xs gap-3">
                      <span className={c.id === state.shadow.adaptive.winnerId ? 'font-medium' : 'text-muted'}>
                        {c.company}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`num ${rate.data_quality === 'sufficient' ? 'text-ink' : 'text-amber'}`}>
                          {pct}
                        </span>
                        <span className={`text-[10px] px-1 py-0.5 rounded border ${
                          rate.data_quality === 'sufficient'
                            ? 'bg-good/10 text-good border-good/30'
                            : rate.data_quality === 'insufficient'
                            ? 'bg-amber/10 text-amber border-amber/30'
                            : 'bg-hairline/40 text-muted border-hairline'
                        }`}>
                          {rate.data_quality === 'sufficient' ? 'sufficient' : rate.data_quality === 'insufficient' ? 'thin' : 'no data'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {state.shadow.base.starvationActive && (
            <p className="text-[11px] text-bad/80">
              ⚠ Late in the week — starvation floor is active. Adaptive does not override it.
            </p>
          )}
        </div>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Try these (seeded coverage)
        </summary>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-medium">GU</span>2 8AA, <span className="font-medium">KT</span>1 1AA,{' '}
            <span className="font-medium">RG</span>1 1AA → BrightRoof only
          </div>
          <div>
            <span className="font-medium">M</span>1 1AA, <span className="font-medium">BL</span>1 1AA,{' '}
            <span className="font-medium">OL</span>1 1AA → Northwind only
          </div>
          <div>
            <span className="font-medium">BR</span>1 1AA → both clients cover it (try tie-break)
          </div>
        </div>
      </details>
    </div>
  );
}
