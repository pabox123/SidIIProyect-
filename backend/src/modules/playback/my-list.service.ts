import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { ProfileAccessService } from '../../common/access/profile-access.service';

@Injectable()
export class MyListService {
  constructor(
    private readonly mongo: MongodbService,
    private readonly access: ProfileAccessService,
  ) {}

  private get lists() {
    return this.mongo.getCollection('user_lists');
  }

  /** "Mi lista" (consulta 6): los retirados se conservan marcados con isWithdrawn. */
  async list(accountId: number, profileId: number) {
    const profile = await this.access.getActiveProfile(accountId, profileId);
    return this.lists
      .aggregate([
        { $match: { accountId, profileId: profile.profileId } },
        { $sort: { addedAt: -1 } },
        { $limit: 100 },
        {
          $lookup: {
            from: 'catalog_items',
            localField: 'contentId',
            foreignField: '_id',
            pipeline: [{ $project: { title: 1, type: 1, coverUrl: 1, status: 1, ageRating: 1, releaseYear: 1 } }],
            as: 'item',
          },
        },
        { $unwind: '$item' },
        {
          $project: {
            _id: 0,
            contentId: 1,
            addedAt: 1,
            title: '$item.title',
            type: '$item.type',
            coverUrl: '$item.coverUrl',
            releaseYear: '$item.releaseYear',
            ageRating: '$item.ageRating',
            isWithdrawn: { $eq: ['$item.status', 'withdrawn'] },
          },
        },
      ])
      .toArray();
  }

  async add(accountId: number, profileId: number, contentId: string) {
    const profile = await this.access.getActiveProfile(accountId, profileId);
    const item = await this.mongo
      .getCollection('catalog_items')
      .findOne({ _id: contentId as any }, { projection: { status: 1, ageRating: 1 } });
    if (!item || item.status !== 'published') {
      throw new NotFoundException('El contenido no existe o no está disponible');
    }
    if (item.ageRating > profile.maxAgeRating) {
      throw new ForbiddenException('Clasificación no permitida para este perfil');
    }
    // Índice único (profileId, contentId): agregar dos veces no duplica
    await this.lists.updateOne(
      { profileId: profile.profileId, contentId },
      { $setOnInsert: { accountId, profileId: profile.profileId, contentId, addedAt: new Date() } },
      { upsert: true },
    );
    return { contentId, inMyList: true };
  }

  async remove(accountId: number, profileId: number, contentId: string) {
    const profile = await this.access.getActiveProfile(accountId, profileId);
    await this.lists.deleteOne({ accountId, profileId: profile.profileId, contentId });
    return { contentId, inMyList: false };
  }
}
