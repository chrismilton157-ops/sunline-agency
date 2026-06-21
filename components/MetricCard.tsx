type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'bad' | 'amber';
};

export function MetricCard({ label, value, hint, tone = 'default' }: Props) {
  const valueClass =
    tone === 'good'
      ? 'text-good'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'amber'
          ? 'text-amber'
          : 'text-ink';

  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`num mt-2 text-2xl md:text-3xl font-semibold tracking-tight ${valueClass}`}>
        {value}
      </div>
      {hint && <div className="text-muted text-xs mt-1.5">{hint}</div>}
    </div>
  );
}
