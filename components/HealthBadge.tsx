import type { Health } from '@/lib/metrics';

export function HealthBadge({ health }: { health: Health }) {
  const { band, score } = health;
  const cls =
    band === 'Healthy'
      ? 'bg-good/10 text-good border-good/30'
      : band === 'Watch'
        ? 'bg-amber/10 text-amber border-amber/30'
        : 'bg-bad/10 text-bad border-bad/30';
  const dotCls =
    band === 'Healthy'
      ? 'bg-good'
      : band === 'Watch'
        ? 'bg-amber'
        : 'bg-bad';
  const pulseClass = band !== 'Healthy' ? 'animate-pulse' : '';
  const reasonText = health.reasons.join('. ') || 'No issues';
  return (
    <span
      className={`num inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                  text-xs font-medium border transition-colors ${cls}`}
      title={reasonText}
      aria-label={`Health: ${band}, score ${score}. ${reasonText}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls} ${pulseClass}`} aria-hidden="true" />
      {band} · {score}
    </span>
  );
}
