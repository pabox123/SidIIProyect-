import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PostgresService } from '../db/postgres/postgres.service';
import { CreateProfileDto, SubscribeDto } from './account.dto';

@Injectable()
export class AccountService {
  constructor(private readonly pg: PostgresService) {}

  /** Catálogo de planes disponibles en PostgreSQL. */
  async listPlans() {
    const { rows } = await this.pg.query(
      `SELECT planId, name, price, maxProfiles
         FROM plans
        ORDER BY price ASC, planId ASC`,
    );
    return rows.map((p) => ({
      planId: p.planid,
      name: p.name,
      price: Number(p.price),
      maxProfiles: p.maxprofiles,
    }));
  }

  /**
   * Historial de suscripciones y pagos de la cuenta autenticada (consulta d de M-05).
   * Indica vigencia estricta bajo [startsAt, endsAt): startsAt <= CURRENT_TIMESTAMP < endsAt.
   */
  async getSubscriptionsAndPayments(accountId: number) {
    const { rows } = await this.pg.query(
      `SELECT s.subscriptionId,
              s.planId,
              pl.name AS planName,
              pl.price AS planPrice,
              pl.maxProfiles,
              s.startsAt,
              s.endsAt,
              (s.startsAt <= CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP < s.endsAt) AS isActive,
              pay.paymentId,
              pay.paidAt,
              pay.amount,
              pay.reference
         FROM subscriptions s
         JOIN plans pl ON pl.planId = s.planId
         JOIN payments pay ON pay.subscriptionId = s.subscriptionId
        WHERE s.accountId = $1
        ORDER BY s.startsAt DESC`,
      [accountId],
    );

    const subscriptions = rows.map((r) => ({
      subscriptionId: r.subscriptionid,
      planId: r.planid,
      planName: r.planname,
      planPrice: Number(r.planprice),
      maxProfiles: r.maxprofiles,
      startsAt: r.startsat,
      endsAt: r.endsat,
      isActive: Boolean(r.isactive),
      payment: {
        paymentId: r.paymentid,
        subscriptionId: r.subscriptionid,
        paidAt: r.paidat,
        amount: Number(r.amount),
        reference: r.reference,
      },
    }));

    const activeSubscription = subscriptions.find((s) => s.isActive) ?? null;
    const payments = subscriptions.map((s) => ({
      ...s.payment,
      planId: s.planId,
      planName: s.planName,
    }));

    return {
      activeSubscription,
      subscriptions,
      payments,
    };
  }

  /** Historial de pagos de la cuenta autenticada. */
  async getPayments(accountId: number) {
    const { rows } = await this.pg.query(
      `SELECT pay.paymentId,
              pay.subscriptionId,
              s.planId,
              pl.name AS planName,
              pay.paidAt,
              pay.amount,
              pay.reference
         FROM payments pay
         JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
         JOIN plans pl ON pl.planId = s.planId
        WHERE s.accountId = $1
        ORDER BY pay.paidAt DESC`,
      [accountId],
    );

    return rows.map((r) => ({
      paymentId: r.paymentid,
      subscriptionId: r.subscriptionid,
      planId: r.planid,
      planName: r.planname,
      paidAt: r.paidat,
      amount: Number(r.amount),
      reference: r.reference,
    }));
  }

  /**
   * Contrata una suscripción invocando directamente la función transaccional M-02
   * sp_contratar_suscripcion(p_accountId, p_planId, p_reference, p_aprobado).
   */
  async subscribe(accountId: number, dto: SubscribeDto) {
    const reference =
      dto.reference || `PAY-${accountId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const approved = dto.approved ?? true;

    let subscriptionId: number;
    try {
      const { rows } = await this.pg.query(
        `SELECT sp_contratar_suscripcion($1, $2, $3, $4) AS subscriptionId`,
        [accountId, dto.planId, reference, approved],
      );
      subscriptionId = rows[0].subscriptionid;
    } catch (error: any) {
      this.mapSubscriptionError(error);
    }

    const { rows } = await this.pg.query(
      `SELECT s.subscriptionId,
              s.planId,
              pl.name AS planName,
              pl.price AS planPrice,
              pl.maxProfiles,
              s.startsAt,
              s.endsAt,
              (s.startsAt <= CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP < s.endsAt) AS isActive,
              pay.paymentId,
              pay.paidAt,
              pay.amount,
              pay.reference
         FROM subscriptions s
         JOIN plans pl ON pl.planId = s.planId
         JOIN payments pay ON pay.subscriptionId = s.subscriptionId
        WHERE s.subscriptionId = $1 AND s.accountId = $2`,
      [subscriptionId, accountId],
    );

    const r = rows[0];
    return {
      subscriptionId: r.subscriptionid,
      planId: r.planid,
      planName: r.planname,
      planPrice: Number(r.planprice),
      maxProfiles: r.maxprofiles,
      startsAt: r.startsat,
      endsAt: r.endsat,
      isActive: Boolean(r.isactive),
      payment: {
        paymentId: r.paymentid,
        subscriptionId: r.subscriptionid,
        paidAt: r.paidat,
        amount: Number(r.amount),
        reference: r.reference,
      },
    };
  }

  /** Lista todos los perfiles de la cuenta autenticada y su cupo vigente. */
  async listProfiles(accountId: number) {
    const profilesRes = await this.pg.query(
      `SELECT profileId, accountId, name, maxAgeRating, isActive
         FROM profiles
        WHERE accountId = $1
        ORDER BY profileId ASC`,
      [accountId],
    );

    const activePlanRes = await this.pg.query(
      `SELECT pl.maxProfiles
         FROM subscriptions s
         JOIN plans pl ON pl.planId = s.planId
        WHERE s.accountId = $1
          AND s.startsAt <= CURRENT_TIMESTAMP
          AND CURRENT_TIMESTAMP < s.endsAt`,
      [accountId],
    );

    const profiles = profilesRes.rows.map((p) => ({
      profileId: p.profileid,
      accountId: p.accountid,
      name: p.name,
      maxAgeRating: p.maxagerating,
      isActive: p.isactive === 'Y',
    }));

    const activeCount = profiles.filter((p) => p.isActive).length;
    const maxProfiles = activePlanRes.rows[0]?.maxprofiles ?? 0;

    return {
      profiles,
      activeCount,
      maxProfiles,
      hasActiveSubscription: activePlanRes.rows.length > 0,
    };
  }

  /**
   * Crea un perfil activo para la cuenta autenticada.
   * El trigger trg_profiles_check_limits valida suscripción vigente y límite maxProfiles.
   */
  async createProfile(accountId: number, dto: CreateProfileDto) {
    try {
      const { rows } = await this.pg.query(
        `INSERT INTO profiles (accountId, name, maxAgeRating, isActive)
         VALUES ($1, $2, $3, 'Y')
         RETURNING profileId, accountId, name, maxAgeRating, isActive`,
        [accountId, dto.name.trim(), dto.maxAgeRating],
      );
      const p = rows[0];
      return {
        profileId: p.profileid,
        accountId: p.accountid,
        name: p.name,
        maxAgeRating: p.maxagerating,
        isActive: p.isactive === 'Y',
      };
    } catch (error: any) {
      this.mapProfileError(error);
    }
  }

  /**
   * Desactiva un perfil perteneciente a la cuenta autenticada (UPDATE isActive = 'N', nunca DELETE).
   * La pertenencia ya fue verificada por ProfileOwnershipGuard y se refuerza en el WHERE.
   */
  async deactivateProfile(accountId: number, profileId: number) {
    const { rows } = await this.pg.query(
      `UPDATE profiles
          SET isActive = 'N'
        WHERE profileId = $1 AND accountId = $2
        RETURNING profileId, accountId, name, maxAgeRating, isActive`,
      [profileId, accountId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('El perfil no existe o no pertenece a su cuenta');
    }

    const p = rows[0];
    return {
      profileId: p.profileid,
      accountId: p.accountid,
      name: p.name,
      maxAgeRating: p.maxagerating,
      isActive: p.isactive === 'Y',
    };
  }

  /**
   * Reactiva un perfil desactivado perteneciente a la cuenta autenticada.
   * El trigger trg_profiles_check_limits rechaza si la suscripción está vencida o excede maxProfiles.
   */
  async activateProfile(accountId: number, profileId: number) {
    try {
      const { rows } = await this.pg.query(
        `UPDATE profiles
            SET isActive = 'Y'
          WHERE profileId = $1 AND accountId = $2
          RETURNING profileId, accountId, name, maxAgeRating, isActive`,
        [profileId, accountId],
      );

      if (rows.length === 0) {
        throw new NotFoundException('El perfil no existe o no pertenece a su cuenta');
      }

      const p = rows[0];
      return {
        profileId: p.profileid,
        accountId: p.accountid,
        name: p.name,
        maxAgeRating: p.maxagerating,
        isActive: p.isactive === 'Y',
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.mapProfileError(error);
    }
  }

  private mapSubscriptionError(error: any): never {
    const msg: string = error?.message ?? '';

    if (error?.code === 'P0001') {
      if (/no existe/i.test(msg)) {
        throw new NotFoundException(msg);
      }
      if (/ya tiene una suscripción vigente/i.test(msg)) {
        throw new ConflictException(msg);
      }
      if (/desactive .* perfil/i.test(msg)) {
        throw new ConflictException(msg);
      }
      if (/pago no aprobado/i.test(msg)) {
        throw new UnprocessableEntityException(msg);
      }
      throw new UnprocessableEntityException(msg);
    }

    if (error?.code === '23P01') {
      throw new ConflictException('El período se superpone con una suscripción existente');
    }

    if (error?.code === '23505') {
      throw new ConflictException('La referencia de pago ya fue utilizada');
    }

    throw error;
  }

  private mapProfileError(error: any): never {
    const msg: string = error?.message ?? '';

    if (error?.code === 'P0001') {
      if (/no tiene una suscripción vigente/i.test(msg)) {
        throw new ForbiddenException(
          'Su cuenta no tiene una suscripción vigente. Contrate o renueve un plan para gestionar perfiles activos',
        );
      }
      if (/alcanzó el máximo de/i.test(msg)) {
        throw new ConflictException(msg);
      }
      throw new UnprocessableEntityException(msg);
    }

    if (error?.code === '23505') {
      throw new ConflictException('Ya existe un perfil con ese nombre en su cuenta');
    }

    throw error;
  }
}
