import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminCatalogApi } from '../../api/endpoints';
import { errorMessage } from '../../api/client';
import type { CatalogItem, ContentStatus, ContentType, Page } from '../../api/types';
import { useToast } from '../../context/ToastContext';
import { Badge, Empty, ErrorBox, Pagination, Spinner } from '../../components/ui';
import { ageLabel, date, STATUS_LABEL, TYPE_LABEL } from '../../utils/format';

const STATUS_TONE: Record<ContentStatus, string> = { draft: 'neutral', published: 'success', withdrawn: 'warning' };

export function AdminCatalogPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState<ContentType | ''>('');
  const [status, setStatus] = useState<ContentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<CatalogItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminCatalogApi.list({ q, type, status, page }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [q, type, status, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const transition = async (item: CatalogItem, action: 'publish' | 'withdraw') => {
    setBusyId(item.contentId);
    try {
      await (action === 'publish' ? adminCatalogApi.publish(item.contentId) : adminCatalogApi.withdraw(item.contentId));
      toast('success', `«${item.title}» ${action === 'publish' ? 'publicado' : 'retirado'}`);
      await load();
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="page-head">
        <h1>Gestión del catálogo</h1>
        <Link to="/admin/catalog/new" className="btn btn-primary">
          + Nuevo contenido
        </Link>
      </div>
      <div className="filters">
        <input
          type="search"
          placeholder="Buscar por título"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select value={type} onChange={(e) => { setType(e.target.value as ContentType | ''); setPage(1); }}>
          <option value="">Todos los tipos</option>
          <option value="movie">Películas</option>
          <option value="series">Series</option>
          <option value="documentary">Documentales</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value as ContentStatus | ''); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
          <option value="withdrawn">Retirado</option>
        </select>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <>
          {data.items.length === 0 ? (
            <Empty>No hay contenidos con esos filtros.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    <th>Tipo</th>
                    <th>Año</th>
                    <th>Clasif.</th>
                    <th>Estado</th>
                    <th>Actualizado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.contentId}>
                      <td><code>{item.contentId}</code></td>
                      <td>{item.title}</td>
                      <td>{TYPE_LABEL[item.type]}</td>
                      <td>{item.releaseYear}</td>
                      <td>{ageLabel(item.ageRating)}</td>
                      <td><Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge></td>
                      <td>{date(item.updatedAt)}</td>
                      <td className="row-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/admin/catalog/${item.contentId}`}>
                          Editar
                        </Link>
                        {item.status !== 'published' ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busyId === item.contentId}
                            onClick={() => transition(item, 'publish')}
                          >
                            Publicar
                          </button>
                        ) : (
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={busyId === item.contentId}
                            onClick={() => transition(item, 'withdraw')}
                          >
                            Retirar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </section>
  );
}
