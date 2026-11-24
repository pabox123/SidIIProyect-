import type { ContentStatus, ContentType } from '../api/types';

export const TYPE_LABEL: Record<ContentType, string> = {
  movie: 'Película',
  series: 'Serie',
  documentary: 'Documental',
};

export const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  withdrawn: 'Retirado',
};

const LANGUAGE_NAMES: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  de: 'Alemán',
  it: 'Italiano',
};

export const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export const minutes = (m?: number) => (m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ''}${m % 60} min` : '');

export const money = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);

export const number = (value: number) => new Intl.NumberFormat('es-CO').format(value);

export const date = (value?: string) =>
  value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(value)) : '—';

export const ageLabel = (rating: number) => (rating === 0 ? 'Todo público' : `+${rating}`);

/** Fecha local en formato AAAA-MM-DD para inputs type="date". */
export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
