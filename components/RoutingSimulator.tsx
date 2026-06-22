'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { simulateRoute } from '@/app/(app)/routing/actions';

type Result =
  | { ok: true; postcode: string; decision: import('@/lib/routing').RoutingDecision }
  | { ok: false; error: string }
  | null;

const ruleStyle = (rule: string) => {
  switch (rule) {
    case 'starvation':
      return 'bg-bad/10 text-bad border-bad/30';
    case 'most_behind':
      return 'bg-amber/10 text-amber border-amber/30';
    case 'newest_client':
      return 'bg-good/10 text-good border-good/30';
    case 'round_robin':
      return 'bg-hairline/40 text-ink border-hairline';
    default:
      return 'bg-muted/10 text-muted border-hairline';
  }
};

const ruleLabel = (rule: string) =>
  ({
    starvation: 'Rule 1 · Starvation floor',
    most_behind: 'Rule 2 · Most behind',
    newest_client: 'Rule 3 · Newest client',
    round_robin: 'Rule 4 · Round robin',
    no_candidates: 'No coverage',
  })[rule] ?? rule;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Routing…' : 'Simulate'}
    </button>
  );
}

export function RoutingSimulator() {
  const [state, action] = useFormState<Result, FormData>(
    async (_prev: Result, formData: FormData) => simulateRoute(formData),
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
        <div className="rounded-md border border-hairline bg-bg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide">
                Next lead for{' '}
                <span className="num text-ink font-medium">{state.postcode}</span>{' '}
                goes to
              </div>
              <div className="num mt-1 text-xl font-semibold text-ink">
                {state.decision.winnerCompany ?? '—'}
              </div>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${ruleStyle(
                state.decision.ruleFired,
              )}`}
            >
              {ruleLabel(state.decision.ruleFired)}
            </span>
          </div>
          <p className="text-sm text-ink">{state.decision.reason}</p>
          {state.decision.considered.length > 1 && (
            <div className="pt-2 border-t border-hairline">
              <div className="label">Considered</div>
              <ul className="mt-1 text-sm space-y-1">
                {state.decision.considered.map((c) => (
                  <li
                    key={c.id}
                    className="flex justify-between items-baseline gap-3"
                  >
                    <span
                      className={
                        c.id === state.decision.winnerId
                          ? 'font-medium'
                          : 'text-muted'
                      }
                    >
                      {c.company}
                    </span>
                    <span className="num text-xs text-muted">
                      {c.leads_this_week}/{c.weekly_promise} ·{' '}
                      {Math.round(
                        (state.decision.fillPercents[c.id] ?? 0) * 100,
                      )}
                      %
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.decision.starvationActive && (
            <p className="text-[11px] text-bad/80">
              ⚠ Late in the week — starvation floor is active.
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
            <span className="font-medium">BR</span>1 1AA → both clients cover it
          </div>
        </div>
      </details>
    </div>
  );
}
