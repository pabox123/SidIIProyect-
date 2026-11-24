import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { playbackApi } from '../api/endpoints';
import { api, errorMessage, tokenStore } from '../api/client';
import type { PlaybackStart, PlaybackState } from '../api/types';
import { useToast } from '../context/ToastContext';
import { Cover, ErrorBox } from '../components/ui';
import { clock } from '../utils/format';

const HEARTBEAT_EVERY = 10; // segundos

/**
 * Reproductor simulado: no hay video, el tiempo avanza en el navegador y se reporta al
 * servidor con eventos. El servidor calcula el tiempo visto sin contar los saltos.
 */
export function PlayerPage() {
  const { sessionId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const start = (location.state as { session?: PlaybackStart } | null)?.session;

  const [server, setServer] = useState<PlaybackState | null>(start ?? null);
  const [position, setPosition] = useState(start?.lastPositionSeconds ?? 0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const positionRef = useRef(position);
  const closedRef = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const ticks = useRef(0);

  positionRef.current = position;

  /** Los eventos se envían en orden, uno tras otro. */
  const send = useCallback(
    (type: string, positionSeconds: number, fromSeconds?: number) => {
      queue.current = queue.current.then(async () => {
        if (closedRef.current) return;
        try {
          const state = await playbackApi.event(sessionId, type, positionSeconds, fromSeconds);
          setServer(state);
          if (state.status === 'closed') closedRef.current = true;
          setError(null);
        } catch (err) {
          setError(errorMessage(err));
        }
      });
      return queue.current;
    },
    [sessionId],
  );

  // Reloj de reproducción
  useEffect(() => {
    if (!start || !playing || server?.status === 'closed') return;
    const timer = setInterval(() => {
      setPosition((p) => Math.min(p + 1, start.durationSeconds));
      ticks.current += 1;
      if (ticks.current % HEARTBEAT_EVERY === 0) send('heartbeat', positionRef.current + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [start, playing, server?.status, send]);

  // Al llegar al final se finaliza automáticamente
  useEffect(() => {
    if (start && position >= start.durationSeconds && !closedRef.current) {
      setPlaying(false);
      send('finish', start.durationSeconds);
    }
  }, [position, start, send]);

  // Si se sale de la página (o se cierra la pestaña) con la sesión abierta, se registra la pausa.
  // El setTimeout evita enviarla en el desmontaje simulado de React.StrictMode en desarrollo.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const pauseOnExit = () => {
      if (closedRef.current || !sessionId) return;
      const token = tokenStore.get();
      fetch(`${api.defaults.baseURL}/playback/sessions/${sessionId}/events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ type: 'pause', positionSeconds: Math.floor(positionRef.current) }),
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', pauseOnExit);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', pauseOnExit);
      setTimeout(() => {
        if (!mounted.current) pauseOnExit();
      }, 0);
    };
  }, [sessionId]);

  if (!start) {
    return (
      <div className="player-missing">
        <ErrorBox message="Esta sesión de reproducción ya no está activa en esta pestaña." />
        <Link to="/" className="btn btn-primary">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const duration = start.durationSeconds;
  const closed = server?.status === 'closed';

  const togglePlay = () => {
    if (closed) return;
    if (playing) {
      setPlaying(false);
      send('pause', Math.floor(position));
    } else {
      setPlaying(true);
      ticks.current = 0;
      send('resume', Math.floor(position));
    }
  };

  const seek = (delta: number) => {
    if (closed) return;
    const from = Math.floor(position);
    const to = Math.max(0, Math.min(duration - 1, from + delta));
    setPosition(to);
    ticks.current = 0;
    send('seek', to, from);
  };

  const finish = async () => {
    if (closed) return;
    setPlaying(false);
    await send('finish', Math.floor(position));
    toast('success', 'Reproducción finalizada');
  };

  const pct = (value: number) => `${Math.min(100, (value / duration) * 100)}%`;

  return (
    <section className="player">
      <div className="screen">
        <Cover url={start.coverUrl} title={start.title} type={start.contentType} />
        <div className="screen-overlay">
          <h1>{start.title}</h1>
          {start.episode && (
            <p>
              Temporada {start.episode.seasonNumber} · Episodio {start.episode.episodeNumber}: {start.episode.title}
            </p>
          )}
          <span className={`state state-${closed ? 'closed' : playing ? 'open' : 'paused'}`}>
            {closed ? '■ Finalizada' : playing ? '▶ Reproduciendo' : '❚❚ En pausa'}
          </span>
        </div>
      </div>

      <div className="timeline" aria-label="Progreso">
        <div className="timeline-pos" style={{ width: pct(position) }} />
      </div>
      <div className="times">
        <span>{clock(position)}</span>
        <span>{clock(duration)}</span>
      </div>

      <div className="controls">
        <button className="btn btn-ghost" onClick={() => seek(-10)} disabled={closed}>
          ⟲ 10 s
        </button>
        <button className="btn btn-primary" onClick={togglePlay} disabled={closed}>
          {playing ? '❚❚ Pausar' : '▶ Reanudar'}
        </button>
        <button className="btn btn-ghost" onClick={() => seek(30)} disabled={closed}>
          Avanzar 30 s ⟳
        </button>
        <button className="btn btn-ghost" onClick={() => seek(300)} disabled={closed}>
          Avanzar 5 min ⏩
        </button>
        <button className="btn btn-danger" onClick={finish} disabled={closed}>
          ■ Finalizar
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      <dl className="session-stats">
        <div>
          <dt>Tiempo visto (sin saltos)</dt>
          <dd>{clock(server?.watchedSeconds ?? 0)}</dd>
        </div>
        <div>
          <dt>Última posición registrada</dt>
          <dd>{clock(server?.lastPositionSeconds ?? 0)}</dd>
        </div>
        <div>
          <dt>Retomado desde</dt>
          <dd>{clock(start.resumedFrom)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            {server?.completed
              ? server.completionReason === 'threshold_90'
                ? 'Completado (90 %)'
                : 'Completado'
              : 'En curso'}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        El tiempo visto lo calcula el servidor con los tramos reproducidos; los saltos con «Avanzar» no suman. Sesión{' '}
        <code>{sessionId}</code>
      </p>
      {closed && (
        <button className="btn btn-primary" onClick={() => navigate(-1)}>
          Volver
        </button>
      )}
    </section>
  );
}
