import type { Health } from '@/lib/metrics';

export function HealthBadge({ health }: { health: Health }) {
  const { band, score } = health;
  const cls =
    band === 'Healthy'
      ? 'bg-good/10 text-good border-good/30'
      : band === 'Watch'
        ? 'bg-amber/10 text-amber border-amber/30'
        : 'bg-bad/10 text-bad border-bad/30';
  return (
    <span
      className={`num inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                  text-xs font-medium border ${cls}`}
      title={health.reasons.join(' • ') || 'All good'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full
          ${band === 'Healthy' ? 'bg-good' : band === 'Watch' ? 'bg-amber' : 'bg-bad'}`}
      />
      {band} · {score}
    </span>
  );
}
