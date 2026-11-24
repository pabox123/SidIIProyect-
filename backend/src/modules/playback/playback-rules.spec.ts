import { applyEvent, mergeSegments, SessionState, watchedFrom } from './playback-rules';

const t0 = new Date('2026-11-23T20:00:00Z');
const at = (s: number) => new Date(t0.getTime() + s * 1000);

function fresh(duration = 1000, start = 0): SessionState {
  return {
    status: 'open',
    durationSeconds: duration,
    lastPositionSeconds: start,
    lastActivityAt: t0,
    playSegments: [],
    watchedSeconds: 0,
    completed: false,
  };
}

describe('mergeSegments', () => {
  it('une tramos solapados y contiguos', () => {
    expect(mergeSegments([{ from: 50, to: 80 }, { from: 0, to: 60 }, { from: 80, to: 90 }, { from: 100, to: 120 }]))
      .toEqual([{ from: 0, to: 90 }, { from: 100, to: 120 }]);
    expect(watchedFrom([{ from: 0, to: 60 }, { from: 30, to: 90 }])).toBe(90);
  });
});

describe('applyEvent', () => {
  it('cuenta el tiempo reproducido entre latidos', () => {
    let s = applyEvent(fresh(), { type: 'heartbeat', positionSeconds: 10 }, at(10));
    s = applyEvent(s, { type: 'heartbeat', positionSeconds: 20 }, at(20));
    expect(s.watchedSeconds).toBe(20);
    expect(s.lastPositionSeconds).toBe(20);
  });

  it('no cuenta el salto al avanzar', () => {
    let s = applyEvent(fresh(), { type: 'heartbeat', positionSeconds: 10 }, at(10));
    s = applyEvent(s, { type: 'seek', fromSeconds: 15, positionSeconds: 300 }, at(15));
    s = applyEvent(s, { type: 'heartbeat', positionSeconds: 310 }, at(25));
    expect(s.watchedSeconds).toBe(25); // 0-15 + 300-310
    expect(s.playSegments).toEqual([{ from: 0, to: 15 }, { from: 300, to: 310 }]);
  });

  it('un avance mayor al tiempo real se toma como salto', () => {
    const s = applyEvent(fresh(), { type: 'heartbeat', positionSeconds: 500 }, at(10));
    expect(s.watchedSeconds).toBe(0);
    expect(s.lastPositionSeconds).toBe(500);
  });

  it('en pausa no suma tiempo', () => {
    let s = applyEvent(fresh(), { type: 'pause', positionSeconds: 30 }, at(30));
    expect(s.status).toBe('paused');
    s = applyEvent(s, { type: 'heartbeat', positionSeconds: 30 }, at(300));
    expect(s.watchedSeconds).toBe(30);
    s = applyEvent(s, { type: 'resume', positionSeconds: 30 }, at(310));
    s = applyEvent(s, { type: 'heartbeat', positionSeconds: 40 }, at(320));
    expect(s.watchedSeconds).toBe(40);
  });

  it('volver a ver un tramo no se cuenta dos veces', () => {
    let s = applyEvent(fresh(), { type: 'heartbeat', positionSeconds: 60 }, at(60));
    s = applyEvent(s, { type: 'seek', fromSeconds: 60, positionSeconds: 0 }, at(60));
    s = applyEvent(s, { type: 'heartbeat', positionSeconds: 60 }, at(120));
    expect(s.watchedSeconds).toBe(60);
  });

  it('marca completado al 90 % visto', () => {
    const s = applyEvent(fresh(100), { type: 'heartbeat', positionSeconds: 90 }, at(90));
    expect(s.completed).toBe(true);
    expect(s.completionReason).toBe('threshold_90');
    expect(s.status).toBe('open');
  });

  it('finalizar cierra la sesión como completada manualmente', () => {
    const s = applyEvent(fresh(), { type: 'finish', positionSeconds: 20 }, at(20));
    expect(s.status).toBe('closed');
    expect(s.completed).toBe(true);
    expect(s.completionReason).toBe('manual');
    expect(s.endedAt).toEqual(at(20));
    expect(() => applyEvent(s, { type: 'heartbeat', positionSeconds: 30 }, at(30))).toThrow();
  });

  it('no pasa de la duración', () => {
    const s = applyEvent(fresh(50, 40), { type: 'heartbeat', positionSeconds: 99 }, at(30));
    expect(s.lastPositionSeconds).toBe(50);
    expect(s.watchedSeconds).toBe(10);
  });
});
