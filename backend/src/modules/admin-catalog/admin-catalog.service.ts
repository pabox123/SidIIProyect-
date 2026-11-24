import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { ContentType } from '../catalog/catalog.dto';
import { AdminCatalogQueryDto, CatalogItemDto } from './catalog-item.dto';
import { prefixFor, typeMatchesId, validateByType } from './catalog-rules';

type Status = 'draft' | 'published' | 'withdrawn';

/** Campos que se guardan según el tipo (todo lo demás del DTO se descarta). */
const COMMON_FIELDS = [
  'title', 'synopsis', 'releaseYear', 'genres', 'productionCountries',
  'audioLanguages', 'subtitleLanguages', 'ageRating', 'coverUrl',
] as const;
const TYPE_FIELDS: Record<ContentType, readonly string[]> = {
  movie: ['durationMinutes', 'directors', 'cast'],
  series: ['seasons'],
  documentary: ['durationMinutes', 'directors', 'topics', 'interviewees', 'sources'],
};

@Injectable()
export class AdminCatalogService {
  constructor(private readonly mongo: MongodbService) {}

  private get items() {
    return this.mongo.getCollection('catalog_items');
  }

  /** Siguiente valor de una secuencia de counters (mov, ser, doc, epi). */
  private async nextSequence(name: 'mov' | 'ser' | 'doc' | 'epi'): Promise<number> {
    const counters = this.mongo.getCollection('counters');
    await counters.updateOne({ _id: name as any }, { $setOnInsert: { nextValue: 1 } }, { upsert: true });
    const before = await counters.findOneAndUpdate(
      { _id: name as any },
      { $inc: { nextValue: 1 } },
      { returnDocument: 'before' },
    );
    return before!.nextValue as number;
  }

  private async newEpisodeId(): Promise<string> {
    return `epi_${String(await this.nextSequence('epi')).padStart(7, '0')}`;
  }

  private assertValid(type: ContentType, dto: CatalogItemDto) {
    const errors = validateByType(type, dto);
    if (errors.length > 0) throw new BadRequestException(errors);
  }

  /** Arma el documento solo con los campos que corresponden al tipo. */
  private async buildFields(type: ContentType, dto: CatalogItemDto, allowedEpisodeIds: Set<string>) {
    const doc: Record<string, unknown> = {};
    for (const f of [...COMMON_FIELDS, ...TYPE_FIELDS[type]]) {
      const value = (dto as any)[f];
      if (value !== undefined) doc[f] = value;
    }
    doc.genres = dto.genres.map((g) => g.trim());
    doc.title = dto.title.trim();

    if (type === 'series') {
      const seasons = [];
      for (const s of [...dto.seasons!].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
        const episodes = [];
        for (const e of [...s.episodes].sort((a, b) => a.number - b.number)) {
          if (e.episodeId && !allowedEpisodeIds.has(e.episodeId)) {
            throw new BadRequestException(`El episodio ${e.episodeId} no pertenece a esta serie`);
          }
          episodes.push({
            episodeId: e.episodeId ?? (await this.newEpisodeId()),
            number: e.number,
            title: e.title.trim(),
            synopsis: e.synopsis.trim(),
            durationMinutes: e.durationMinutes,
          });
        }
        seasons.push({ seasonNumber: s.seasonNumber, description: s.description.trim(), episodes });
      }
      doc.seasons = seasons;
    }
    return doc;
  }

  async list(dto: AdminCatalogQueryDto) {
    const filter: Record<string, unknown> = {};
    if (dto.q?.trim()) filter.title = { $regex: escapeRegex(dto.q.trim()), $options: 'i' };
    if (dto.type) filter.type = dto.type;
    if (dto.status) filter.status = dto.status;
    const [items, total] = await Promise.all([
      this.items
        .find(filter, {
          projection: { title: 1, type: 1, status: 1, ageRating: 1, releaseYear: 1, coverUrl: 1, updatedAt: 1 },
        })
        .sort({ updatedAt: -1, _id: 1 })
        .skip((dto.page - 1) * dto.pageSize)
        .limit(dto.pageSize)
        .toArray(),
      this.items.countDocuments(filter),
    ]);
    return {
      items: items.map((i) => ({ ...i, contentId: i._id })),
      page: dto.page,
      pageSize: dto.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / dto.pageSize)),
    };
  }

  async get(contentId: string) {
    const item = await this.items.findOne({ _id: contentId as any });
    if (!item) throw new NotFoundException('El contenido no existe');
    return { ...item, contentId: item._id };
  }

  /** Registra un contenido nuevo como borrador. */
  async create(dto: CatalogItemDto) {
    if (!dto.type) throw new BadRequestException(['El tipo de contenido es obligatorio']);
    const type = dto.type;
    this.assertValid(type, dto);
    if (type === 'series' && dto.seasons!.some((s) => s.episodes.some((e) => e.episodeId))) {
      throw new BadRequestException(['En un contenido nuevo los episodeId los genera el servidor']);
    }
    const now = new Date();
    const fields = await this.buildFields(type, dto, new Set());
    const prefix = prefixFor(type) as 'mov' | 'ser' | 'doc';
    const _id = `${prefix}_${String(await this.nextSequence(prefix)).padStart(6, '0')}`;
    const doc = {
      _id,
      type,
      ...fields,
      status: 'draft' as Status,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.items.insertOne(doc as any);
    return { ...doc, contentId: _id };
  }

  /** Actualiza los datos (no el tipo ni el estado). */
  async update(contentId: string, dto: CatalogItemDto) {
    const current = await this.items.findOne({ _id: contentId as any });
    if (!current) throw new NotFoundException('El contenido no existe');
    const type = current.type as ContentType;
    if (dto.type && dto.type !== type) {
      throw new BadRequestException(['No se puede cambiar el tipo de un contenido existente']);
    }
    if (!typeMatchesId(type, contentId)) {
      throw new ConflictException('El identificador no corresponde al tipo del contenido');
    }
    this.assertValid(type, dto);

    const existingEpisodeIds = new Set<string>(
      (current.seasons ?? []).flatMap((s: any) => s.episodes.map((e: any) => e.episodeId)),
    );
    const fields = await this.buildFields(type, dto, existingEpisodeIds);
    const unset: Record<string, ''> = {};
    for (const f of TYPE_FIELDS[type]) if (!(f in fields) && f in current) unset[f] = '';

    const update: Record<string, unknown> = { $set: { ...fields, updatedAt: new Date() } };
    if (Object.keys(unset).length) update.$unset = unset;
    await this.items.updateOne({ _id: contentId as any }, update);
    return this.get(contentId);
  }

  /** draft|withdrawn → published */
  async publish(contentId: string) {
    const now = new Date();
    const result = await this.items.updateOne(
      { _id: contentId as any, status: { $in: ['draft', 'withdrawn'] } },
      { $set: { status: 'published', publishedAt: now, updatedAt: now }, $unset: { withdrawnAt: '' } },
    );
    if (result.matchedCount === 0) await this.explainTransition(contentId, 'publicar');
    return this.get(contentId);
  }

  /** published → withdrawn. Se conserva en "Mi lista" (marcado como no disponible). */
  async withdraw(contentId: string) {
    const now = new Date();
    const result = await this.items.updateOne(
      { _id: contentId as any, status: 'published' },
      { $set: { status: 'withdrawn', withdrawnAt: now, updatedAt: now } },
    );
    if (result.matchedCount === 0) await this.explainTransition(contentId, 'retirar');
    return this.get(contentId);
  }

  private async explainTransition(contentId: string, action: string): Promise<never> {
    const item = await this.items.findOne({ _id: contentId as any }, { projection: { status: 1 } });
    if (!item) throw new NotFoundException('El contenido no existe');
    throw new ConflictException(`No se puede ${action} un contenido en estado "${item.status}"`);
  }
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
