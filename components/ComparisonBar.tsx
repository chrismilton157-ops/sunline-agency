import { fmtPct } from '@/lib/format';

type Props = {
  label: string;
  yours: number | null;
  benchmark: number;
  benchmarkLabel?: string;
};

// Simple two-row horizontal bar — yours in amber, industry benchmark in grey.
// Both bars share the same scale (0 → max(yours, benchmark) * 1.25).
export function ComparisonBar({ label, yours, benchmark, benchmarkLabel = 'Industry typical' }: Props) {
  const youVal = yours ?? 0;
  const max = Math.max(youVal, benchmark) * 1.25 || 1;
  const youPct = (youVal / max) * 100;
  const bmPct = (benchmark / max) * 100;
  const beating = yours != null && yours >= benchmark;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">
          You <span className={`num ${beating ? 'text-good' : 'text-ink'}`}>
            {fmtPct(yours)}
          </span>{' '}
          · <span className="num">{fmtPct(benchmark)}</span> {benchmarkLabel.toLowerCase()}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-muted w-16">You</div>
          <div className="flex-1 h-3 bg-hairline/50 rounded-sm overflow-hidden">
            <div
              className={`h-full ${beating ? 'bg-good' : 'bg-amber'}`}
              style={{ width: `${Math.max(2, youPct)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-muted w-16">{benchmarkLabel}</div>
          <div className="flex-1 h-3 bg-hairline/50 rounded-sm overflow-hidden">
            <div
              className="h-full bg-muted/60"
              style={{ width: `${Math.max(2, bmPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
