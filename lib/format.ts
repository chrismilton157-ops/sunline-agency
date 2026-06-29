const gbp0 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const gbp2 = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct1 = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const num1 = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const num0 = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0,
});

export const fmtMoney = (v: number | null | undefined) =>
  v == null ? '—' : gbp0.format(v);

export const fmtMoney2 = (v: number | null | undefined) =>
  v == null ? '—' : gbp2.format(v);

export const fmtPct = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : pct1.format(v);

export const fmtRatio = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${num1.format(v)}×`;

export const fmtInt = (v: number | null | undefined) =>
  v == null ? '—' : num0.format(v);

export const fmtMins = (v: number | null | undefined) =>
  v == null ? '—' : `${num0.format(v)} min`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// Full datetime including seconds — used in audit log.
export const fmtDateFull = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const monthLabel = (ym: string) => {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  });
};
