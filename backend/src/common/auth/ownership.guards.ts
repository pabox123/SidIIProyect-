import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PostgresService } from '../../modules/db/postgres/postgres.service';
import { AuthenticatedClient } from './auth.types';

function parsePositiveInt(raw: unknown, fieldName: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`El parámetro ${fieldName} debe ser un entero positivo`);
  }
  return value;
}

function getAuthenticatedClient(request: any): AuthenticatedClient {
  const client: AuthenticatedClient | undefined = request.client ?? request.user;
  if (!client || !Number.isInteger(client.accountId)) {
    throw new UnauthorizedException('Debe iniciar sesión como cliente');
  }
  return client;
}

/**
 * Verifica en el servidor que el parámetro :accountId de la ruta coincida
 * estrictamente con la cuenta autenticada en el JWT (request.client / request.user).
 * Debe aplicarse después de ClientAuthGuard (o JwtAuthGuard).
 */
@Injectable()
export class AccountOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const client = getAuthenticatedClient(request);

    if (request.params?.accountId === undefined) {
      return true;
    }

    const targetAccountId = parsePositiveInt(request.params.accountId, 'accountId');
    if (targetAccountId !== client.accountId) {
      throw new ForbiddenException('No tiene permiso para acceder a esta cuenta');
    }
    return true;
  }
}

/**
 * Verifica en el servidor contra PostgreSQL (tabla profiles) que el :profileId
 * solicitado pertenezca realmente a la cuenta autenticada en el JWT.
 * Rechaza con 404 si el perfil no existe y con 403 si pertenece a otra cuenta.
 * Debe aplicarse después de ClientAuthGuard (o JwtAuthGuard).
 */
@Injectable()
export class ProfileOwnershipGuard implements CanActivate {
  constructor(private readonly pg: PostgresService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const client = getAuthenticatedClient(request);

    const rawProfileId =
      request.params?.profileId ?? request.query?.profileId ?? request.body?.profileId;

    if (rawProfileId === undefined) {
      return true;
    }

    const profileId = parsePositiveInt(rawProfileId, 'profileId');

    const { rows } = await this.pg.query(
      `SELECT profileId, accountId, name, maxAgeRating, isActive
         FROM profiles
        WHERE profileId = $1`,
      [profileId],
    );

    if (rows.length === 0) {
      throw new NotFoundException('El perfil no existe');
    }

    const profile = rows[0];
    if (profile.accountid !== client.accountId) {
      throw new ForbiddenException('No tiene permiso para acceder a este perfil');
    }

    request.profile = {
      profileId: profile.profileid,
      accountId: profile.accountid,
      name: profile.name,
      maxAgeRating: profile.maxagerating,
      isActive: profile.isactive === 'Y',
    };

    return true;
  }
}
