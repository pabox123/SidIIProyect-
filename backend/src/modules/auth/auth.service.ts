import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PostgresService } from '../db/postgres/postgres.service';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { AdminTokenPayload, ClientTokenPayload } from '../../common/auth/auth.types';

const INVALID = 'Correo o contraseña incorrectos';

/**
 * Inicio de sesión mínimo para poder integrar el frontend (B-01).
 * El registro, la sesión completa y el resto de E-02/E-03 los implementa Edwar;
 * cuando estén listos este servicio se puede reemplazar sin tocar el frontend,
 * siempre que se respete el contrato de common/auth/auth.types.ts.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly pg: PostgresService,
    private readonly mongo: MongodbService,
    private readonly jwt: JwtService,
  ) {}

  async loginClient(email: string, password: string) {
    // Consulta e de M-05 (usa ux_accounts_email_ci)
    const { rows } = await this.pg.query(
      `SELECT accountId, fullName, email, passwordHash
         FROM accounts
        WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    const account = rows[0];
    if (!account || !(await bcrypt.compare(password, account.passwordhash))) {
      throw new UnauthorizedException(INVALID);
    }
    const payload: ClientTokenPayload = { sub: account.accountid, kind: 'client', email: account.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      account: { accountId: account.accountid, fullName: account.fullname, email: account.email },
    };
  }

  async loginAdmin(email: string, password: string) {
    const admin = await this.mongo
      .getCollection('admin_users')
      .findOne({ email: email.toLowerCase(), isActive: true });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException(INVALID);
    }
    await this.mongo
      .getCollection('admin_users')
      .updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
    const payload: AdminTokenPayload = {
      sub: String(admin._id),
      kind: 'admin',
      email: admin.email,
      roles: admin.roles,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      admin: { adminId: String(admin._id), fullName: admin.fullName, email: admin.email, roles: admin.roles },
    };
  }

  /** Datos de la cuenta autenticada con sus perfiles (para la selección de perfil). */
  async me(accountId: number) {
    const account = await this.pg.query(
      `SELECT accountId, fullName, email FROM accounts WHERE accountId = $1`,
      [accountId],
    );
    if (account.rows.length === 0) throw new UnauthorizedException('La cuenta ya no existe');
    const profiles = await this.pg.query(
      `SELECT profileId, name, maxAgeRating, isActive
         FROM profiles
        WHERE accountId = $1
        ORDER BY profileId`,
      [accountId],
    );
    const subscription = await this.pg.query(
      `SELECT s.subscriptionId, s.planId, pl.name AS planName, pl.maxProfiles, s.startsAt, s.endsAt
         FROM subscriptions s
         JOIN plans pl ON pl.planId = s.planId
        WHERE s.accountId = $1
          AND s.startsAt <= CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP < s.endsAt`,
      [accountId],
    );
    const a = account.rows[0];
    const s = subscription.rows[0];
    return {
      accountId: a.accountid,
      fullName: a.fullname,
      email: a.email,
      activeSubscription: s
        ? {
            subscriptionId: s.subscriptionid,
            planId: s.planid,
            planName: s.planname,
            maxProfiles: s.maxprofiles,
            startsAt: s.startsat,
            endsAt: s.endsat,
          }
        : null,
      profiles: profiles.rows.map((p) => ({
        profileId: p.profileid,
        name: p.name,
        maxAgeRating: p.maxagerating,
        isActive: p.isactive === 'Y',
      })),
    };
  }
}
