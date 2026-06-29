'use client';
import dynamic from 'next/dynamic';
import type { MonthBar } from '@/lib/metrics';

// recharts is a heavy dependency (~24KB gzipped) — split it into its own
// chunk so pages that render this chart don't ship it in the main bundle
// until the chart actually mounts.
const SatVsSoldChartInner = dynamic(
  () => import('./SatVsSoldChartInner').then((m) => m.SatVsSoldChartInner),
  {
    loading: () => <div className="h-64 animate-pulse rounded-md bg-hairline/40" />,
  },
);

export function SatVsSoldChart({ data }: { data: MonthBar[] }) {
  if (data.length === 0) {
    return (
      <div className="text-muted text-sm py-8 text-center">
        No sits or sales yet — log an appointment to see this fill in.
      </div>
    );
  }
  return <SatVsSoldChartInner data={data} />;
}
