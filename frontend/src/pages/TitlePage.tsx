import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { catalogApi, myListApi, playbackApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { CatalogItem } from '../api/types';
import { Badge, Cover, ErrorBox, Spinner } from '../components/ui';
import { ageLabel, languageName, minutes, TYPE_LABEL } from '../utils/format';

export function TitlePage() {
  const { contentId = '' } = useParams();
  const [params] = useSearchParams();
  const { activeProfile } = useAuth();
  const profileId = activeProfile!.profileId;
  const toast = useToast();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const focusEpisode = params.get('episode');

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await catalogApi.detail(contentId, profileId);
      setItem(data);
      const seasons = data.seasons ?? [];
      const withFocus = seasons.find((s) => s.episodes.some((e) => e.episodeId === focusEpisode));
      setSeason((withFocus ?? seasons[0])?.seasonNumber ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [contentId, profileId, focusEpisode]);

  useEffect(() => {
    load();
  }, [load]);

  const play = async (episodeId?: string) => {
    setPlayError(null);
    setBusy(true);
    try {
      const session = await playbackApi.start(profileId, contentId, episodeId);
      navigate(`/watch/${session.sessionId}`, { state: { session } });
    } catch (err) {
      // Rechazos del servidor: suscripción vencida, clasificación no permitida, retirado...
      setPlayError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleList = async () => {
    if (!item) return;
    try {
      if (item.inMyList) {
        await myListApi.remove(profileId, contentId);
        toast('info', 'Quitado de Mi lista');
      } else {
        await myListApi.add(profileId, contentId);
        toast('success', 'Agregado a Mi lista');
      }
      setItem({ ...item, inMyList: !item.inMyList });
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!item) return <Spinner />;

  const currentSeason = item.seasons?.find((s) => s.seasonNumber === season);
  const firstEpisode = focusEpisode ?? item.seasons?.[0]?.episodes[0]?.episodeId;

  return (
    <article className="title-page">
      <div className="title-hero">
        <Cover url={item.coverUrl} title={item.title} type={item.type} />
        <div className="title-info">
          <h1>{item.title}</h1>
          <div className="card-meta">
            <span>{TYPE_LABEL[item.type]}</span>
            <span>{item.releaseYear}</span>
            {item.durationMinutes && <span>{minutes(item.durationMinutes)}</span>}
            {item.seasons && (
              <span>
                {item.seasons.length} temporada{item.seasons.length === 1 ? '' : 's'}
              </span>
            )}
            <Badge>{ageLabel(item.ageRating)}</Badge>
          </div>
          <p>{item.synopsis}</p>
          <dl className="facts">
            <dt>Géneros</dt>
            <dd>{item.genres.join(', ')}</dd>
            <dt>Audio</dt>
            <dd>{item.audioLanguages.map(languageName).join(', ')}</dd>
            {item.subtitleLanguages.length > 0 && (
              <>
                <dt>Subtítulos</dt>
                <dd>{item.subtitleLanguages.map(languageName).join(', ')}</dd>
              </>
            )}
            <dt>Países</dt>
            <dd>{item.productionCountries.join(', ')}</dd>
            {item.directors && (
              <>
                <dt>Dirección</dt>
                <dd>{item.directors.join(', ')}</dd>
              </>
            )}
            {item.cast && (
              <>
                <dt>Reparto</dt>
                <dd>{item.cast.map((c) => (c.character ? `${c.name} (${c.character})` : c.name)).join(', ')}</dd>
              </>
            )}
            {item.topics && (
              <>
                <dt>Temas</dt>
                <dd>{item.topics.join(', ')}</dd>
              </>
            )}
            {item.interviewees && item.interviewees.length > 0 && (
              <>
                <dt>Entrevistados</dt>
                <dd>{item.interviewees.map((i) => (i.role ? `${i.name} (${i.role})` : i.name)).join(', ')}</dd>
              </>
            )}
          </dl>
          <div className="actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => play(item.type === 'series' ? firstEpisode : undefined)}
            >
              ▶ {item.type === 'series' ? 'Reproducir episodio' : 'Reproducir'}
            </button>
            <button className="btn btn-ghost" onClick={toggleList}>
              {item.inMyList ? '✓ En Mi lista' : '+ Mi lista'}
            </button>
          </div>
          {playError && <ErrorBox message={playError} />}
        </div>
      </div>

      {item.seasons && (
        <section className="seasons">
          <div className="tabs">
            {item.seasons.map((s) => (
              <button
                key={s.seasonNumber}
                className={s.seasonNumber === season ? 'active' : ''}
                onClick={() => setSeason(s.seasonNumber)}
              >
                Temporada {s.seasonNumber}
              </button>
            ))}
          </div>
          {currentSeason && (
            <>
              <p className="muted">{currentSeason.description}</p>
              <ol className="episodes">
                {currentSeason.episodes.map((e) => (
                  <li key={e.episodeId} className={e.episodeId === focusEpisode ? 'focus' : ''}>
                    <div>
                      <strong>
                        {e.number}. {e.title}
                      </strong>
                      <p className="muted small">{e.synopsis}</p>
                    </div>
                    <span className="muted small">{minutes(e.durationMinutes)}</span>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => play(e.episodeId)}>
                      ▶ Ver
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </article>
  );
}
