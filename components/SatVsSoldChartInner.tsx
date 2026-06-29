'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { monthLabel } from '@/lib/format';
import type { MonthBar } from '@/lib/metrics';

export function SatVsSoldChartInner({ data }: { data: MonthBar[] }) {
  const labelled = data.map((d) => ({ ...d, label: monthLabel(d.ym) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={labelled} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" />
          <XAxis
            dataKey="label"
            stroke="#6B7178"
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="#6B7178"
            tick={{ fontSize: 12 }}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #E8E6DF',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: '#15181D', fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="sat" name="Sat" fill="#E07B39" radius={[3, 3, 0, 0]} />
          <Bar dataKey="sold" name="Sold" fill="#2E9E6B" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
