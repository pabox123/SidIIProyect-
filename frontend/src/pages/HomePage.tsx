import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { catalogApi, playbackApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { CatalogFilters, ContentCard as Card, ContinueWatchingItem, Page } from '../api/types';
import { ContentCard } from '../components/ContentCard';
import { Cover, Empty, ErrorBox, InlineSpinner, Pagination, Spinner } from '../components/ui';
import { clock, languageName, TYPE_LABEL } from '../utils/format';

export function HomePage() {
  const { activeProfile } = useAuth();
  const profileId = activeProfile!.profileId;
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<CatalogFilters | null>(null);
  const [result, setResult] = useState<Page<Card> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [continueItems, setContinueItems] = useState<ContinueWatchingItem[]>([]);
  const [q, setQ] = useState(params.get('q') ?? '');
  const requestIdRef = useRef(0);

  const query = {
    q: params.get('q') ?? '',
    type: (params.get('type') ?? '') as Card['type'] | '',
    genre: params.get('genre') ?? '',
    language: params.get('language') ?? '',
    year: params.get('year') ? Number(params.get('year')) : ('' as const),
    page: Number(params.get('page') ?? 1),
  };
  const key = params.toString();

  const update = (changes: Record<string, string | number>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === undefined) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await catalogApi.search({ profileId, ...query, pageSize: 12 });
      if (reqId === requestIdRef.current) setResult(data);
    } catch (err) {
      if (reqId === requestIdRef.current) setError(errorMessage(err));
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, key]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    catalogApi.filters().then(setFilters).catch(() => setFilters(null));
    playbackApi
      .continueWatching(profileId)
      .then(setContinueItems)
      .catch(() => setContinueItems([]));
  }, [profileId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    update({ q: q.trim() });
  };

  const hasFilters = Boolean(query.q || query.type || query.genre || query.language || query.year);

  return (
    <div className="home">
      {continueItems.length > 0 && !hasFilters && (
        <section>
          <h2>Continuar viendo</h2>
          <div className="row-scroll">
            {continueItems.map((item) => (
              <Link
                key={item.contentId}
                to={`/title/${item.contentId}${item.episodeId ? `?episode=${item.episodeId}` : ''}`}
                className="card card-wide"
              >
                <Cover url={item.coverUrl} title={item.title} type={item.type} />
                <div className="progress">
                  <div style={{ width: `${Math.min(100, (item.lastPositionSeconds / item.durationSeconds) * 100)}%` }} />
                </div>
                <div className="card-body">
                  <h3>{item.title}</h3>
                  <div className="card-meta">
                    {item.seasonNumber ? (
                      <span>
                        T{item.seasonNumber} · E{item.episodeNumber}
                      </span>
                    ) : (
                      <span>{TYPE_LABEL[item.type]}</span>
                    )}
                    <span>
                      {clock(item.lastPositionSeconds)} / {clock(item.durationSeconds)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Catálogo</h2>
        <form className="search-bar" onSubmit={submit}>
          <input
            type="search"
            placeholder="Buscar por título..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar por título"
          />
          <button className="btn btn-primary" disabled={loading}>
            {loading ? (
              <>
                <InlineSpinner />
                Buscando...
              </>
            ) : (
              'Buscar'
            )}
          </button>
        </form>
        <div className="filters">
          <select value={query.type} onChange={(e) => update({ type: e.target.value })} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            <option value="movie">Películas</option>
            <option value="series">Series</option>
            <option value="documentary">Documentales</option>
          </select>
          <select value={query.genre} onChange={(e) => update({ genre: e.target.value })} aria-label="Género">
            <option value="">Todos los géneros</option>
            {filters?.genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select value={query.language} onChange={(e) => update({ language: e.target.value })} aria-label="Idioma">
            <option value="">Todos los idiomas</option>
            {filters?.languages.map((l) => (
              <option key={l} value={l}>
                {languageName(l)}
              </option>
            ))}
          </select>
          <select value={query.year} onChange={(e) => update({ year: e.target.value })} aria-label="Año">
            <option value="">Todos los años</option>
            {filters?.years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQ('');
                setParams(new URLSearchParams());
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && <ErrorBox message={error} onRetry={load} />}
        {loading && !result && <Spinner />}
        {result && (
          <>
            <p className="muted small">
              {result.total} resultado{result.total === 1 ? '' : 's'} · solo se muestran contenidos permitidos para{' '}
              {activeProfile!.name}
            </p>
            {result.items.length === 0 ? (
              <Empty>No encontramos contenidos con esos criterios.</Empty>
            ) : (
              <div className={`grid ${loading ? 'is-loading' : ''}`}>
                {result.items.map((item) => (
                  <ContentCard key={item.contentId} item={item} />
                ))}
              </div>
            )}
            <Pagination page={result.page} totalPages={result.totalPages} onChange={(page) => update({ page })} />
          </>
        )}
      </section>
    </div>
  );
}
