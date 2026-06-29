// CSV builder — never import client-side; server-only callers only.

function escapeCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // Wrap in quotes if the value contains commas, quotes, or newlines.
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  const lines: string[] = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\r\n');
}

// UK date: "29/06/2026"
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// UK datetime: "29/06/2026 14:30"
export function csvDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Plain number for money — no £ symbol so spreadsheets treat it as numeric.
export function csvMoney(v: number | string | null | undefined): string {
  if (v == null || v === '') return '';
  return Number(v).toFixed(2);
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
