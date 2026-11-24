import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { ProfileAccessService } from '../../common/access/profile-access.service';
import { applyEvent, SessionState } from './playback-rules';
import { PlaybackEventDto, StartPlaybackDto } from './playback.dto';

/** Una sesión "open" sin actividad en este tiempo se considera interrumpida. */
const STALE_MINUTES = 30;

@Injectable()
export class PlaybackService {
  constructor(
    private readonly mongo: MongodbService,
    private readonly access: ProfileAccessService,
  ) {}

  private get sessions() {
    return this.mongo.getCollection('watch_activity');
  }

  /**
   * Inicia una sesión siguiendo el flujo de integración (mongodb/integracion-bases-datos.md):
   * 1) PostgreSQL: perfil activo de la cuenta del token y suscripción vigente.
   * 2) MongoDB: contenido publicado, clasificación permitida y episodio existente.
   * Solo entonces se crea el documento en watch_activity con planId/subscriptionId del momento.
   */
  async start(accountId: number, dto: StartPlaybackDto) {
    const ctx = await this.access.getPlaybackContext(accountId, dto.profileId);

    const item = await this.mongo
      .getCollection('catalog_items')
      .findOne({ _id: dto.contentId as any });
    if (!item || item.status !== 'published') {
      throw new NotFoundException('El contenido no existe o ya no está disponible');
    }
    if (item.ageRating > ctx.maxAgeRating) {
      throw new ForbiddenException(
        `Clasificación no permitida: el contenido es +${item.ageRating} y el perfil "${ctx.name}" permite hasta +${ctx.maxAgeRating}`,
      );
    }

    let durationMinutes: number = item.durationMinutes;
    let episode: { episodeId: string; seasonNumber: number; episodeNumber: number; title: string } | null = null;
    if (item.type === 'series') {
      if (!dto.episodeId) throw new BadRequestException('Seleccione el episodio que quiere ver');
      for (const season of item.seasons ?? []) {
        const found = season.episodes.find((e: any) => e.episodeId === dto.episodeId);
        if (found) {
          durationMinutes = found.durationMinutes;
          episode = {
            episodeId: found.episodeId,
            seasonNumber: season.seasonNumber,
            episodeNumber: found.number,
            title: found.title,
          };
          break;
        }
      }
      if (!episode) throw new NotFoundException('El episodio no existe en esta serie');
    } else if (dto.episodeId) {
      throw new BadRequestException('Solo las series tienen episodios');
    }

    const now = new Date();
    await this.closeStaleSessions(ctx.profileId, now);

    // "Continuar viendo": retoma desde la última sesión sin completar del mismo contenido/episodio
    const previous = await this.sessions.findOne(
      {
        profileId: ctx.profileId,
        contentId: dto.contentId,
        ...(episode ? { episodeId: episode.episodeId } : {}),
      },
      { sort: { lastActivityAt: -1 }, projection: { completed: 1, lastPositionSeconds: 1 } },
    );
    const durationSeconds = Math.round(durationMinutes * 60);
    const resumeAt =
      previous && !previous.completed ? Math.min(previous.lastPositionSeconds ?? 0, durationSeconds - 1) : 0;

    // _id generado por la aplicación: un reintento no duplica la sesión
    const session = {
      _id: new ObjectId(),
      accountId: ctx.accountId,
      profileId: ctx.profileId,
      contentId: dto.contentId,
      contentType: item.type,
      ...(episode
        ? { episodeId: episode.episodeId, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber }
        : {}),
      planId: ctx.planId,
      subscriptionId: ctx.subscriptionId,
      startedAt: now,
      lastActivityAt: now,
      durationSeconds,
      watchedSeconds: 0,
      lastPositionSeconds: resumeAt,
      playSegments: [],
      status: 'open',
      completed: false,
    };
    await this.sessions.insertOne(session as any);

    return {
      sessionId: session._id.toHexString(),
      ...this.publicState(session as any),
      title: item.title,
      contentType: item.type,
      coverUrl: item.coverUrl,
      episode,
      resumedFrom: resumeAt,
    };
  }

  /** Iniciar, pausar, avanzar y finalizar llegan aquí como eventos. */
  async event(accountId: number, sessionId: string, dto: PlaybackEventDto) {
    if (!ObjectId.isValid(sessionId)) throw new NotFoundException('La sesión no existe');
    const _id = new ObjectId(sessionId);
    const current = await this.sessions.findOne({ _id });
    if (!current || current.accountId !== accountId) {
      throw new NotFoundException('La sesión no existe');
    }
    if (current.status === 'closed') throw new ConflictException('La sesión ya terminó');

    const next = applyEvent(current as unknown as SessionState, dto, new Date());
    const $set: Record<string, unknown> = {
      status: next.status,
      lastActivityAt: next.lastActivityAt,
      lastPositionSeconds: next.lastPositionSeconds,
      playSegments: next.playSegments,
      watchedSeconds: next.watchedSeconds,
      completed: next.completed,
    };
    if (next.completionReason) $set.completionReason = next.completionReason;
    if (next.endedAt) $set.endedAt = next.endedAt;

    // Control optimista: si otro evento la modificó primero, este no la pisa
    const result = await this.sessions.updateOne(
      { _id, lastActivityAt: current.lastActivityAt, status: { $ne: 'closed' } },
      { $set },
    );
    if (result.matchedCount === 0) {
      throw new ConflictException('La sesión cambió mientras se actualizaba, intente de nuevo');
    }
    return { sessionId, ...this.publicState({ ...current, ...$set } as any) };
  }

  /** Cierra sesiones abiertas que quedaron colgadas (pestaña cerrada, sin conexión). */
  private async closeStaleSessions(profileId: number, now: Date) {
    const limit = new Date(now.getTime() - STALE_MINUTES * 60_000);
    const stale = await this.sessions
      .find({ profileId, status: 'open', lastActivityAt: { $lt: limit } }, { projection: { lastActivityAt: 1 } })
      .toArray();
    for (const s of stale) {
      await this.sessions.updateOne(
        { _id: s._id, status: 'open' },
        { $set: { status: 'closed', endedAt: s.lastActivityAt } },
      );
    }
  }

  private publicState(s: SessionState & { durationSeconds: number }) {
    return {
      status: s.status,
      durationSeconds: s.durationSeconds,
      lastPositionSeconds: s.lastPositionSeconds,
      watchedSeconds: s.watchedSeconds,
      completed: s.completed,
      completionReason: s.completionReason ?? null,
    };
  }

  /**
   * "Continuar viendo" (consulta 5): última sesión por contenido, sin completar, de
   * contenidos aún publicados y permitidos para el perfil. Usa ix_watch_profile_recent.
   */
  async continueWatching(accountId: number, profileId: number) {
    const profile = await this.access.getActiveProfile(accountId, profileId);
    return this.sessions
      .aggregate([
        { $match: { accountId, profileId: profile.profileId } },
        { $sort: { lastActivityAt: -1 } },
        { $group: { _id: '$contentId', last: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$last' } },
        { $match: { completed: false } },
        { $sort: { lastActivityAt: -1 } },
        {
          $lookup: {
            from: 'catalog_items',
            localField: 'contentId',
            foreignField: '_id',
            pipeline: [{ $project: { title: 1, type: 1, coverUrl: 1, status: 1, ageRating: 1 } }],
            as: 'item',
          },
        },
        { $unwind: '$item' },
        { $match: { 'item.status': 'published', 'item.ageRating': { $lte: profile.maxAgeRating } } },
        { $limit: 20 },
        {
          $project: {
            _id: 0,
            contentId: 1,
            episodeId: 1,
            seasonNumber: 1,
            episodeNumber: 1,
            lastPositionSeconds: 1,
            durationSeconds: 1,
            lastActivityAt: 1,
            title: '$item.title',
            type: '$item.type',
            coverUrl: '$item.coverUrl',
          },
        },
      ])
      .toArray();
  }
}
