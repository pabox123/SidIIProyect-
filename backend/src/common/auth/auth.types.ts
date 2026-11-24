/**
 * Contrato de los tokens JWT que usa la API.
 *
 * - Clientes (cuentas en PostgreSQL): { sub: accountId, kind: 'client', email }
 * - Administradores (admin_users en MongoDB): { sub: adminId, kind: 'admin', email, roles }
 *
 * El accountId SIEMPRE sale del token verificado en el servidor, nunca del cuerpo
 * ni de la URL de la petición.
 */
export type AdminRole = 'catalog_admin' | 'report_viewer';

export interface ClientTokenPayload {
  sub: number;
  kind: 'client';
  email: string;
}

export interface AdminTokenPayload {
  sub: string;
  kind: 'admin';
  email: string;
  roles: AdminRole[];
}

export type TokenPayload = ClientTokenPayload | AdminTokenPayload;

export interface AuthenticatedClient {
  accountId: number;
  email: string;
}

export interface AuthenticatedAdmin {
  adminId: string;
  email: string;
  roles: AdminRole[];
}
