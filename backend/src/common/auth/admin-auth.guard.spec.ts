import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ObjectId } from 'mongodb';
import { AdminAuthGuard } from './auth.guards';
import { ADMIN_ROLES_KEY } from './auth.decorators';
import { MongodbService } from '../../modules/db/mongodb/mongodb.service';
import { AdminCatalogController } from '../../modules/admin-catalog/admin-catalog.controller';
import { ReportsController } from '../../modules/reports/reports.controller';
import { AuthController } from '../../modules/auth/auth.controller';

function mockContext(request: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => (() => undefined),
    getClass: () => class DummyController {},
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard & Admin Route Protection (E-03)', () => {
  let jwt: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };
  let adminCollection: { findOne: jest.Mock };
  let mongo: { getCollection: jest.Mock };
  let guard: AdminAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue([]) };
    adminCollection = { findOne: jest.fn() };
    mongo = { getCollection: jest.fn().mockReturnValue(adminCollection) };
    guard = new AdminAuthGuard(
      jwt as unknown as JwtService,
      reflector as unknown as Reflector,
      mongo as unknown as MongodbService,
    );
  });

  it('rechaza peticiones sin token con 401 Unauthorized', async () => {
    const ctx = mockContext({ headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza tokens inválidos o expirados con 401 Unauthorized', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
    const ctx = mockContext({ headers: { authorization: 'Bearer expired.token' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza explícitamente tokens de cliente (kind: client) con 403 Forbidden', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: 12,
      kind: 'client',
      role: 'client',
      email: 'cliente@example.com',
    });
    const ctx = mockContext({ headers: { authorization: 'Bearer client.token' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(adminCollection.findOne).not.toHaveBeenCalled();
  });

  it('rechaza con 401 si el administrador fue desactivado en MongoDB aunque el JWT siga vigente', async () => {
    const adminId = new ObjectId('692000000000000000000001');
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: String(adminId),
      kind: 'admin',
      role: 'admin',
      email: 'admin@cineconecta.example',
      roles: ['catalog_admin'],
    });
    adminCollection.findOne.mockResolvedValueOnce({
      _id: adminId,
      email: 'admin@cineconecta.example',
      roles: ['catalog_admin'],
      isActive: false,
    });

    const ctx = mockContext({ headers: { authorization: 'Bearer admin.token' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza con 403 Forbidden si el administrador no tiene el rol requerido en MongoDB', async () => {
    const adminId = new ObjectId('692000000000000000000002');
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: String(adminId),
      kind: 'admin',
      role: 'admin',
      email: 'reportes@cineconecta.example',
      roles: ['report_viewer'],
    });
    adminCollection.findOne.mockResolvedValueOnce({
      _id: adminId,
      email: 'reportes@cineconecta.example',
      roles: ['report_viewer'],
      isActive: true,
    });
    reflector.getAllAndOverride.mockReturnValueOnce(['catalog_admin']);

    const ctx = mockContext({ headers: { authorization: 'Bearer report.token' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('permite un administrador activo con el rol requerido y adjunta request.admin y request.user', async () => {
    const adminId = new ObjectId('692000000000000000000001');
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: String(adminId),
      kind: 'admin',
      role: 'admin',
      email: 'admin@cineconecta.example',
      roles: ['catalog_admin'],
    });
    adminCollection.findOne.mockResolvedValueOnce({
      _id: adminId,
      email: 'admin@cineconecta.example',
      roles: ['catalog_admin'],
      isActive: true,
    });
    reflector.getAllAndOverride.mockReturnValueOnce(['catalog_admin']);

    const req: Record<string, any> = { headers: { authorization: 'Bearer valid.admin.token' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.admin).toEqual({
      adminId: String(adminId),
      email: 'admin@cineconecta.example',
      roles: ['catalog_admin'],
    });
    expect(req.user).toEqual(req.admin);
  });

  describe('Auditoría de metadatos en controladores administrativos', () => {
    it('AdminCatalogController (B-03) protege todas sus rutas con AdminAuthGuard y rol catalog_admin', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AdminCatalogController) ?? [];
      const roles = Reflect.getMetadata(ADMIN_ROLES_KEY, AdminCatalogController) ?? [];
      expect(guards).toContain(AdminAuthGuard);
      expect(roles).toEqual(['catalog_admin']);
    });

    it('ReportsController (B-05) protege todas sus rutas con AdminAuthGuard y roles report_viewer/catalog_admin', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ReportsController) ?? [];
      const roles = Reflect.getMetadata(ADMIN_ROLES_KEY, ReportsController) ?? [];
      expect(guards).toContain(AdminAuthGuard);
      expect(roles).toEqual(expect.arrayContaining(['report_viewer', 'catalog_admin']));
    });

    it('AuthController.adminMe protege GET /api/admin/auth/me con AdminAuthGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.adminMe) ?? [];
      expect(guards).toContain(AdminAuthGuard);
    });
  });
});
