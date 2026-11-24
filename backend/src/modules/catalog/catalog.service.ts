import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { ProfileAccessService } from '../../common/access/profile-access.service';
import { SearchCatalogDto } from './catalog.dto';

/** Campos que se muestran en las tarjetas del listado (proyección liviana). */
export const CARD_PROJECTION = {
  title: 1,
  type: 1,
  coverUrl: 1,
  releaseYear: 1,
  ageRating: 1,
  genres: 1,
  audioLanguages: 1,
  durationMinutes: 1,
} as const;

@Injectable()
export class CatalogService {
  constructor(
    private readonly mongo: MongodbService,
    private readonly access: ProfileAccessService,
  ) {}

  private get items() {
    return this.mongo.getCollection('catalog_items');
  }

  /**
   * Búsqueda por título con filtros. Solo contenidos publicados y con clasificación
   * permitida para el perfil (maxAgeRating sale de PostgreSQL). Equivale a las consultas
   * 1 y 3 de mongodb/03_consultas.js y usa ix_catalog_text_title / ix_catalog_browse /
   * ix_catalog_language.
   */
  async search(accountId: number, dto: SearchCatalogDto) {
    const profile = await this.access.getActiveProfile(accountId, dto.profileId);
    const filter: Record<string, unknown> = {
      status: 'published',
      ageRating: { $lte: profile.maxAgeRating },
    };
    const q = dto.q?.trim();
    if (q) filter.$text = { $search: q };
    if (dto.type) filter.type = dto.type;
    if (dto.genre) filter.genres = dto.genre;
    if (dto.language) filter.audioLanguages = dto.language;
    if (dto.year) filter.releaseYear = dto.year;

    const skip = (dto.page - 1) * dto.pageSize;
    const [items, total] = await Promise.all([
      this.items
        .find(filter, { projection: CARD_PROJECTION })
        .sort({ releaseYear: -1, _id: 1 })
        .skip(skip)
        .limit(dto.pageSize)
        .toArray(),
      this.items.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => ({ ...item, contentId: item._id })),
      page: dto.page,
      pageSize: dto.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / dto.pageSize)),
      profile: { profileId: profile.profileId, maxAgeRating: profile.maxAgeRating },
    };
  }

  /** Valores disponibles para los filtros (solo de contenidos publicados). */
  async filters() {
    const published = { status: 'published' };
    const [genres, languages, years] = await Promise.all([
      this.items.distinct('genres', published),
      this.items.distinct('audioLanguages', published),
      this.items.distinct('releaseYear', published),
    ]);
    const sort = (values: unknown[]) => values.map(String).sort((a, b) => a.localeCompare(b, 'es'));
    return {
      types: ['movie', 'series', 'documentary'],
      genres: sort(genres),
      languages: sort(languages),
      years: (years as number[]).sort((a, b) => b - a),
    };
  }

  /**
   * Detalle de un contenido. Para series trae temporadas y episodios embebidos en una
   * sola lectura (consulta 4). Rechaza retirados/borradores y clasificaciones no permitidas.
   */
  async detail(accountId: number, profileId: number, contentId: string) {
    const profile = await this.access.getActiveProfile(accountId, profileId);
    const item = await this.items.findOne({ _id: contentId as any });
    if (!item || item.status !== 'published') {
      throw new NotFoundException('El contenido no existe o no está disponible');
    }
    if (item.ageRating > profile.maxAgeRating) {
      throw new ForbiddenException(
        `Clasificación no permitida: el contenido es +${item.ageRating} y el perfil permite hasta +${profile.maxAgeRating}`,
      );
    }
    const inMyList =
      (await this.mongo
        .getCollection('user_lists')
        .countDocuments({ profileId: profile.profileId, contentId }, { limit: 1 })) > 0;

    if (item.type === 'series' && Array.isArray(item.seasons)) {
      item.seasons = [...item.seasons]
        .sort((a: any, b: any) => a.seasonNumber - b.seasonNumber)
        .map((season: any) => ({
          ...season,
          episodes: [...season.episodes].sort((a: any, b: any) => a.number - b.number),
        }));
    }
    return { ...item, contentId: item._id, inMyList };
  }
}
