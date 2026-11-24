/**
 * Reglas puras de la reproducción simulada (sin acceso a base de datos) para poder
 * probarlas aisladas. El tiempo visualizado es la unión de los tramos realmente
 * reproducidos: los saltos (avanzar) no suman y volver a ver un tramo no se cuenta dos veces.
 */
export interface Segment {
  from: number;
  to: number;
}

export type SessionStatus = 'open' | 'paused' | 'closed';
export type PlaybackEventType = 'heartbeat' | 'pause' | 'resume' | 'seek' | 'finish';

export interface SessionState {
  status: SessionStatus;
  durationSeconds: number;
  lastPositionSeconds: number;
  lastActivityAt: Date;
  playSegments: Segment[];
  watchedSeconds: number;
  completed: boolean;
  completionReason?: 'manual' | 'threshold_90';
  endedAt?: Date;
}

export interface PlaybackEvent {
  type: PlaybackEventType;
  /** Posición actual del reproductor (en seek, el destino del salto). */
  positionSeconds: number;
  /** Solo en seek: posición justo antes de saltar. */
  fromSeconds?: number;
}

export const COMPLETION_THRESHOLD = 0.9;
/** Holgura sobre el tiempo real transcurrido (latencia de red, redondeos). */
const SLACK_SECONDS = 5;
const SLACK_FACTOR = 1.5;

/** Une tramos solapados o contiguos. */
export function mergeSegments(segments: Segment[]): Segment[] {
  const sorted = segments
    .filter((s) => s.to > s.from)
    .map((s) => ({ from: s.from, to: s.to }))
    .sort((a, b) => a.from - b.from);
  const merged: Segment[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else merged.push(s);
  }
  return merged;
}

export function watchedFrom(segments: Segment[]): number {
  return mergeSegments(segments).reduce((sum, s) => sum + (s.to - s.from), 0);
}

const clamp = (value: number, max: number) => Math.min(Math.max(0, Math.round(value)), max);

/**
 * Suma el tramo [desde, hasta] solo si la sesión estaba reproduciendo y el avance es
 * coherente con el tiempo real transcurrido; si no, se toma como salto y no cuenta.
 */
function playedSegment(state: SessionState, to: number, now: Date): Segment | null {
  if (state.status !== 'open') return null;
  const from = state.lastPositionSeconds;
  if (to <= from) return null;
  const elapsed = (now.getTime() - new Date(state.lastActivityAt).getTime()) / 1000;
  if (to - from > elapsed * SLACK_FACTOR + SLACK_SECONDS) return null;
  return { from, to };
}

/** Aplica un evento y devuelve el nuevo estado de la sesión. */
export function applyEvent(state: SessionState, event: PlaybackEvent, now: Date): SessionState {
  if (state.status === 'closed') {
    throw new Error('La sesión ya terminó');
  }
  const duration = state.durationSeconds;
  const position = clamp(event.positionSeconds, duration);
  const next: SessionState = { ...state, playSegments: [...state.playSegments], lastActivityAt: now };

  const add = (segment: Segment | null) => {
    if (segment) next.playSegments = mergeSegments([...next.playSegments, segment]);
  };

  switch (event.type) {
    case 'heartbeat':
      add(playedSegment(state, position, now));
      next.lastPositionSeconds = position;
      break;
    case 'pause':
      add(playedSegment(state, position, now));
      next.lastPositionSeconds = position;
      next.status = 'paused';
      break;
    case 'resume':
      next.lastPositionSeconds = position;
      next.status = 'open';
      break;
    case 'seek': {
      const before = clamp(event.fromSeconds ?? state.lastPositionSeconds, duration);
      add(playedSegment(state, before, now));
      next.lastPositionSeconds = position;
      break;
    }
    case 'finish':
      add(playedSegment(state, position, now));
      next.lastPositionSeconds = position;
      next.status = 'closed';
      next.endedAt = now;
      if (!next.completed) {
        next.completed = true;
        next.completionReason = 'manual';
      }
      break;
  }

  next.watchedSeconds = watchedFrom(next.playSegments);
  if (!next.completed && next.watchedSeconds >= COMPLETION_THRESHOLD * duration) {
    next.completed = true;
    next.completionReason = 'threshold_90';
  }
  return next;
}
