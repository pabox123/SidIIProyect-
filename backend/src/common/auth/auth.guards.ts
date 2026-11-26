import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ObjectId } from 'mongodb';
import { ADMIN_ROLES_KEY } from './auth.decorators';
import { AdminRole, TokenPayload } from './auth.types';
import { MongodbService } from '../../modules/db/mongodb/mongodb.service';

function extractToken(request: any): string | null {
  const header: string | undefined = request.headers?.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

async function verify(jwt: JwtService, request: any): Promise<TokenPayload> {
  const token = extractToken(request);
  if (!token) throw new UnauthorizedException('Debe iniciar sesión');
  try {
    return await jwt.verifyAsync<TokenPayload>(token);
  } catch {
    throw new UnauthorizedException('La sesión expiró o no es válida, vuelva a iniciar sesión');
  }
}

/** Valida cualquier token Bearer válido y expone request.user (y request.client si es cliente). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = await verify(this.jwt, request);
    if (payload.kind === 'client' && Number.isInteger(payload.sub)) {
      const client = { accountId: payload.sub, email: payload.email, role: 'client' as const };
      request.client = client;
      request.user = client;
    } else if (payload.kind === 'admin') {
      const admin = { adminId: payload.sub, email: payload.email, roles: payload.roles ?? [] };
      request.admin = admin;
      request.user = admin;
    } else {
      throw new UnauthorizedException('Token de sesión no válido');
    }
    return true;
  }
}

/** Solo deja pasar tokens de clientes y expone request.client y request.user. */
@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = await verify(this.jwt, request);
    if (payload.kind !== 'client' || !Number.isInteger(payload.sub)) {
      throw new ForbiddenException('Esta operación es solo para clientes');
    }
    const client = { accountId: payload.sub, email: payload.email, role: 'client' as const };
    request.client = client;
    request.user = client;
    return true;
  }
}

/**
 * Solo deja pasar tokens de administradores activos en MongoDB con alguno de los roles pedidos.
 * Rechaza tokens de cliente con 403 Forbidden y tokens inválidos/inactivos con 401 Unauthorized.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly mongo: MongodbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = await verify(this.jwt, request);
    if (payload.kind !== 'admin') {
      throw new ForbiddenException('Esta operación es solo para administradores');
    }
    if (!ObjectId.isValid(payload.sub)) {
      throw new UnauthorizedException('Token de administrador no válido');
    }

    const admin = await this.mongo
      .getCollection('admin_users')
      .findOne(
        { _id: new ObjectId(payload.sub) },
        { projection: { email: 1, roles: 1, isActive: 1 } },
      );

    if (!admin || admin.isActive !== true) {
      throw new UnauthorizedException('La cuenta de administrador no está activa o no existe');
    }

    const liveRoles: AdminRole[] = Array.isArray(admin.roles) ? admin.roles : [];
    const required =
      this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length > 0 && !required.some((role) => liveRoles.includes(role))) {
      throw new ForbiddenException(`Necesita uno de estos roles: ${required.join(', ')}`);
    }

    const authenticatedAdmin = {
      adminId: String(admin._id),
      email: admin.email as string,
      roles: liveRoles,
    };
    request.admin = authenticatedAdmin;
    request.user = authenticatedAdmin;
    return true;
  }
}
