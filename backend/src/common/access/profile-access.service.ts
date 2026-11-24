import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PostgresService } from '../../modules/db/postgres/postgres.service';

export interface ProfileContext {
  profileId: number;
  accountId: number;
  name: string;
  maxAgeRating: number;
}

export interface PlaybackContext extends ProfileContext {
  subscriptionId: number;
  planId: number;
}

/**
 * Verificaciones en PostgreSQL (fuente de verdad de cuentas, perfiles y suscripciones).
 * Todas reciben el accountId del token, nunca de la petición.
 */
@Injectable()
export class ProfileAccessService {
  constructor(private readonly pg: PostgresService) {}

  /** El perfil existe, es de la cuenta autenticada y está activo. */
  async getActiveProfile(accountId: number, profileId: number): Promise<ProfileContext> {
    const { rows } = await this.pg.query(
      `SELECT profileId, accountId, name, maxAgeRating, isActive
         FROM profiles
        WHERE profileId = $1 AND accountId = $2`,
      [profileId, accountId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('El perfil no existe o no pertenece a su cuenta');
    }
    if (rows[0].isactive !== 'Y') {
      throw new ForbiddenException('El perfil está desactivado');
    }
    return {
      profileId: rows[0].profileid,
      accountId: rows[0].accountid,
      name: rows[0].name,
      maxAgeRating: rows[0].maxagerating,
    };
  }

  /**
   * Paso 1 del flujo de reproducción (sql/03_consulta_verificacion_reproduccion.sql):
   * perfil activo de la cuenta + suscripción vigente en este instante.
   */
  async getPlaybackContext(accountId: number, profileId: number): Promise<PlaybackContext> {
    const profile = await this.getActiveProfile(accountId, profileId);
    const { rows } = await this.pg.query(
      `SELECT s.subscriptionId, s.planId, p.maxAgeRating
         FROM profiles p
         JOIN subscriptions s ON s.accountId = p.accountId
        WHERE p.profileId = $1
          AND p.accountId = $2
          AND p.isActive = 'Y'
          AND s.startsAt <= CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP < s.endsAt`,
      [profileId, accountId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException(
        'Su cuenta no tiene una suscripción vigente. Contrate un plan para poder reproducir contenido',
      );
    }
    return { ...profile, subscriptionId: rows[0].subscriptionid, planId: rows[0].planid };
  }
}
