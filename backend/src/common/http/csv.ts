/** Convierte filas a CSV (RFC 4180) con BOM UTF-8, separador ;, CRLF y escape de comillas.
 *  Incluye protección contra inyección de fórmulas (=, +, -, @ al inicio). */
export function toCsv(columns: { key: string; header: string }[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let text = value instanceof Date ? value.toISOString() : String(value);
    // Protección contra inyección de fórmulas: si empieza con =, +, -, @ anteponer comilla simple
    if (/^[\=+\-@]/.test(text)) {
      text = "'" + text;
    }
    // Escapar comillas y envolver entre comillas si contiene ;, comillas o saltos de línea
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.header)).join(';')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c.key])).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Formatea un número como texto con coma decimal y dos decimales (ej. 20000,00). */
export function formatNumber(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Formatea minutos con coma decimal y dos decimales. */
export function formatMinutes(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Genera nombre de archivo en minúsculas, sin tildes, sin espacios, con rango.
 *  Conserva guiones en fechas (YYYY-MM-DD). */
export function buildFilename(base: string, from?: string, to?: string): string {
  const sanitize = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, ''); // permite guiones para fechas
  const range = (from && to) ? `${sanitize(from)}_a_${sanitize(to)}` : 'todo_el_periodo';
  return `${sanitize(base)}_${range}.csv`;
}
