import { ReactNode, useState } from 'react';
import type { ContentType } from '../api/types';
import { TYPE_LABEL } from '../utils/format';

export function Spinner({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div className="spinner-box" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  if (!label) return <span className="inline-spinner" aria-hidden="true" />;
  return (
    <span className="inline-spinner-wrap" role="status" aria-live="polite">
      <span className="inline-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>⚠️ {message}</span>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

const PALETTE = ['#e94560', '#0f9b8e', '#f5a623', '#7b61ff', '#2d9cdb', '#eb5757', '#27ae60'];

/** Portada; si la imagen no carga se dibuja una portada generada con el título. */
export function Cover({ url, title, type }: { url?: string; title: string; type?: ContentType }) {
  const [failed, setFailed] = useState(!url);
  const color = PALETTE[[...title].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
  if (failed) {
    return (
      <div className="cover cover-fallback" style={{ background: `linear-gradient(140deg, ${color}, #1a1a2e 85%)` }}>
        <span className="cover-title">{title}</span>
        {type && <span className="cover-type">{TYPE_LABEL[type]}</span>}
      </div>
    );
  }
  return <img className="cover" src={url} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginación">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Siguiente →
      </button>
    </nav>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
