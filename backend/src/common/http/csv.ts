/** Convierte filas a CSV (RFC 4180) con BOM para que Excel respete las tildes. */
export function toCsv(columns: { key: string; header: string }[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
