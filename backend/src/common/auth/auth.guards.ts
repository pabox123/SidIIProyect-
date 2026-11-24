import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_ROLES_KEY } from './auth.decorators';
import { AdminRole, TokenPayload } from './auth.types';

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

/** Solo deja pasar tokens de clientes y expone request.client. */
@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = await verify(this.jwt, request);
    if (payload.kind !== 'client' || !Number.isInteger(payload.sub)) {
      throw new ForbiddenException('Esta operación es solo para clientes');
    }
    request.client = { accountId: payload.sub, email: payload.email };
    return true;
  }
}

/** Solo deja pasar tokens de administradores con alguno de los roles pedidos. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload = await verify(this.jwt, request);
    if (payload.kind !== 'admin') {
      throw new ForbiddenException('Esta operación es solo para administradores');
    }
    const required =
      this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length > 0 && !required.some((role) => payload.roles?.includes(role))) {
      throw new ForbiddenException(`Necesita uno de estos roles: ${required.join(', ')}`);
    }
    request.admin = { adminId: payload.sub, email: payload.email, roles: payload.roles ?? [] };
    return true;
  }
}
