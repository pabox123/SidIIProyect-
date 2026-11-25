import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PostgresService } from '../db/postgres/postgres.service';
import { MongodbService } from '../db/mongodb/mongodb.service';
import { AdminTokenPayload, ClientTokenPayload } from '../../common/auth/auth.types';
import { RegisterDto } from './register.dto';

const INVALID = 'Correo o contraseña incorrectos';
const DEFAULT_BCRYPT_ROUNDS = 10;

/**
 * Servicio de autenticación de clientes (PostgreSQL - E-02) y administradores (MongoDB - E-03).
 * Mantiene compatibilidad total con el contrato de common/auth/auth.types.ts usado por el frontend.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly pg: PostgresService,
    private readonly mongo: MongodbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private getBcryptRounds(): number {
    const raw = Number(this.config.get<string>('BCRYPT_ROUNDS'));
    if (Number.isInteger(raw) && raw >= 4 && raw <= 14) {
      return raw;
    }
    return DEFAULT_BCRYPT_ROUNDS;
  }

  async registerClient(dto: RegisterDto) {
    const fullName = dto.fullName.trim();
    const email = dto.email.trim().toLowerCase();

    const existing = await this.pg.query(
      `SELECT 1
         FROM accounts
        WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException('Ya existe una cuenta registrada con ese correo');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.getBcryptRounds());

    try {
      const { rows } = await this.pg.query(
        `INSERT INTO accounts (fullName, email, passwordHash)
         VALUES ($1, $2, $3)
         RETURNING accountId, fullName, email, createdAt`,
        [fullName, email, passwordHash],
      );
      const account = rows[0];
      const payload: ClientTokenPayload = {
        sub: account.accountid,
        kind: 'client',
        role: 'client',
        email: account.email,
      };
      return {
        accessToken: await this.jwt.signAsync(payload),
        account: {
          accountId: account.accountid,
          fullName: account.fullname,
          email: account.email,
          createdAt: account.createdat,
        },
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('Ya existe una cuenta registrada con ese correo');
      }
      throw error;
    }
  }

  async loginClient(email: string, password: string) {
    const normalizedEmail = email.trim();
    // Consulta e de M-05 (usa ux_accounts_email_ci)
    const { rows } = await this.pg.query(
      `SELECT accountId, fullName, email, passwordHash
         FROM accounts
        WHERE LOWER(email) = LOWER($1)`,
      [normalizedEmail],
    );
    const account = rows[0];
    if (!account || !(await bcrypt.compare(password, account.passwordhash))) {
      throw new UnauthorizedException(INVALID);
    }
    const payload: ClientTokenPayload = {
      sub: account.accountid,
      kind: 'client',
      role: 'client',
      email: account.email,
    };
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
