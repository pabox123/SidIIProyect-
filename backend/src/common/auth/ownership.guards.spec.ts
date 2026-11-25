import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ClientAuthGuard, JwtAuthGuard } from './auth.guards';
import { AccountOwnershipGuard, ProfileOwnershipGuard } from './ownership.guards';
import { PostgresService } from '../../modules/db/postgres/postgres.service';

function mockContext(request: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('Auth & Ownership Guards (E-02)', () => {
  describe('ClientAuthGuard & JwtAuthGuard', () => {
    let jwt: { verifyAsync: jest.Mock };
    let clientGuard: ClientAuthGuard;
    let jwtGuard: JwtAuthGuard;

    beforeEach(() => {
      jwt = { verifyAsync: jest.fn() };
      clientGuard = new ClientAuthGuard(jwt as unknown as JwtService);
      jwtGuard = new JwtAuthGuard(jwt as unknown as JwtService);
    });

    it('rechaza peticiones sin token Bearer con 401', async () => {
      const ctx = mockContext({ headers: {} });
      await expect(clientGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza tokens expirados o inválidos con 401', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      const ctx = mockContext({ headers: { authorization: 'Bearer bad.token.here' } });
      await expect(clientGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token de administrador en rutas de cliente con 403', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 'adm_1',
        kind: 'admin',
        email: 'admin@cineconecta.com',
        roles: ['catalog_admin'],
      });
      const ctx = mockContext({ headers: { authorization: 'Bearer admin.token' } });
      await expect(clientGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('permite un token de cliente válido y adjunta request.client y request.user', async () => {
      jwt.verifyAsync.mockResolvedValue({
        sub: 12,
        kind: 'client',
        role: 'client',
        email: 'cliente@example.com',
      });
      const req: Record<string, any> = { headers: { authorization: 'Bearer valid.token' } };
      await expect(clientGuard.canActivate(mockContext(req))).resolves.toBe(true);
      expect(req.client).toEqual({ accountId: 12, email: 'cliente@example.com', role: 'client' });
      expect(req.user).toEqual(req.client);
    });
  });

  describe('AccountOwnershipGuard', () => {
    const guard = new AccountOwnershipGuard();

    it('permite el acceso cuando :accountId coincide con request.client.accountId', () => {
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { accountId: '10' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('bloquea con 403 Forbidden cuando :accountId pertenece a otra cuenta', () => {
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { accountId: '99' },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('rechaza con 400 BadRequest si :accountId no es entero positivo', () => {
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { accountId: 'abc' },
      });
      expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
    });
  });

  describe('ProfileOwnershipGuard', () => {
    let pg: { query: jest.Mock };
    let guard: ProfileOwnershipGuard;

    beforeEach(() => {
      pg = { query: jest.fn() };
      guard = new ProfileOwnershipGuard(pg as unknown as PostgresService);
    });

    it('permite el acceso si el perfil existe en PostgreSQL y pertenece a la cuenta del JWT', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [{ profileid: 5, accountid: 10, name: 'Kids', maxagerating: 7, isactive: 'Y' }],
      });
      const req: Record<string, any> = {
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { profileId: '5' },
      };

      await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
      expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('FROM profiles'), [5]);
      expect(req.profile).toEqual({
        profileId: 5,
        accountId: 10,
        name: 'Kids',
        maxAgeRating: 7,
        isActive: true,
      });
    });

    it('bloquea con 403 Forbidden cuando el perfil pertenece a otra cuenta', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [{ profileid: 8, accountid: 99, name: 'Ajeno', maxagerating: 18, isactive: 'Y' }],
      });
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { profileId: '8' },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('rechaza con 404 NotFound cuando el perfil no existe', async () => {
      pg.query.mockResolvedValueOnce({ rows: [] });
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { profileId: '9999' },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    });

    it('rechaza con 400 BadRequest cuando profileId es inválido', async () => {
      const ctx = mockContext({
        client: { accountId: 10, email: 'a@b.com', role: 'client' },
        params: { profileId: '-3' },
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
    });
  });
});
