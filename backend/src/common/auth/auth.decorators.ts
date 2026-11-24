import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AdminRole, AuthenticatedAdmin, AuthenticatedClient } from './auth.types';

export const ADMIN_ROLES_KEY = 'adminRoles';

/** Roles de administrador permitidos (basta con tener uno). */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

/** Cliente autenticado (lo deja ClientAuthGuard en la petición). */
export const CurrentClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedClient => ctx.switchToHttp().getRequest().client,
);

/** Administrador autenticado (lo deja AdminAuthGuard en la petición). */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => ctx.switchToHttp().getRequest().admin,
);
