import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { myListApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { MyListItem } from '../api/types';
import { ContentCard } from '../components/ContentCard';
import { Badge, Cover, Empty, ErrorBox, Spinner } from '../components/ui';
import { date } from '../utils/format';

export function MyListPage() {
  const { activeProfile } = useAuth();
  const profileId = activeProfile!.profileId;
  const toast = useToast();
  const [items, setItems] = useState<MyListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    myListApi
      .list(profileId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err)));
  }, [profileId]);

  useEffect(load, [load]);

  const remove = async (contentId: string) => {
    try {
      await myListApi.remove(profileId, contentId);
      setItems((list) => list?.filter((i) => i.contentId !== contentId) ?? null);
      toast('info', 'Quitado de Mi lista');
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!items) return <Spinner />;

  return (
    <section>
      <h1>Mi lista</h1>
      {items.length === 0 && <Empty>Todavía no ha agregado contenidos. Use «+ Mi lista» en cualquier título.</Empty>}
      <div className="grid">
        {items.map((item) =>
          item.isWithdrawn ? (
            <div key={item.contentId} className="card card-disabled" title="Este contenido fue retirado del catálogo">
              <Cover url={item.coverUrl} title={item.title} type={item.type} />
              <div className="card-body">
                <h3>{item.title}</h3>
                <div className="card-meta">
                  <Badge tone="warning">No disponible</Badge>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(item.contentId)}>
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <ContentCard
              key={item.contentId}
              item={item}
              extra={<small className="muted">Agregado {date(item.addedAt)}</small>}
            />
          ),
        )}
      </div>
    </section>
  );
}
