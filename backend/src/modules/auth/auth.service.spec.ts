import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PostgresService } from '../db/postgres/postgres.service';
import { MongodbService } from '../db/mongodb/mongodb.service';

describe('AuthService (E-02 Client Auth)', () => {
  let service: AuthService;
  let pg: { query: jest.Mock };
  let mongo: { getCollection: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    pg = { query: jest.fn() };
    mongo = { getCollection: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt-token') };
    config = {
      get: jest.fn((key: string) => (key === 'BCRYPT_ROUNDS' ? '4' : undefined)),
    };

    service = new AuthService(
      pg as unknown as PostgresService,
      mongo as unknown as MongodbService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('registerClient', () => {
    it('registra una cuenta nueva con contraseña hasheada, sin exponer passwordHash y devuelve JWT', async () => {
      const createdAt = new Date('2026-11-25T17:00:00Z');
      pg.query
        .mockResolvedValueOnce({ rows: [] }) // verificación LOWER(email)
        .mockResolvedValueOnce({
          rows: [
            {
              accountid: 42,
              fullname: 'Ana Gómez',
              email: 'ana@example.com',
              createdat: createdAt,
            },
          ],
        });

      const result = await service.registerClient({
        fullName: '  Ana Gómez  ',
        email: '  ANA@Example.com  ',
        password: 'PasswordSegura123',
      });

      // 1) Consulta parametrizada de unicidad insensible a mayúsculas
      expect(pg.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('LOWER(email) = LOWER($1)'),
        ['ana@example.com'],
      );

      // 2) INSERT parametrizado con hash bcryptjs válido (>= 60 chars) y nunca contraseña en texto plano
      const insertArgs = pg.query.mock.calls[1];
      expect(insertArgs[0]).toContain('INSERT INTO accounts');
      expect(insertArgs[1][0]).toBe('Ana Gómez');
      expect(insertArgs[1][1]).toBe('ana@example.com');
      const storedHash = insertArgs[1][2] as string;
      expect(storedHash).not.toBe('PasswordSegura123');
      expect(storedHash.length).toBeGreaterThanOrEqual(60);
      expect(await bcrypt.compare('PasswordSegura123', storedHash)).toBe(true);

      // 3) Payload JWT y respuesta segura sin passwordHash
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 42,
        kind: 'client',
        role: 'client',
        email: 'ana@example.com',
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        account: {
          accountId: 42,
          fullName: 'Ana Gómez',
          email: 'ana@example.com',
          createdAt,
        },
      });
      expect((result.account as any).passwordHash).toBeUndefined();
    });

    it('rechaza con 409 Conflict si el correo ya existe (case-insensitive)', async () => {
      pg.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      await expect(
        service.registerClient({
          fullName: 'Ana Gómez',
          email: 'ANA@example.com',
          password: 'PasswordSegura123',
        }),
      ).rejects.toThrow(ConflictException);
      expect(pg.query).toHaveBeenCalledTimes(1);
    });

    it('traduce violación concurrente de índice único (23505) a 409 Conflict', async () => {
      pg.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.registerClient({
          fullName: 'Ana Gómez',
          email: 'ana@example.com',
          password: 'PasswordSegura123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('loginClient', () => {
    it('autentica un cliente con credenciales válidas y emite JWT con contrato de cliente', async () => {
      const hash = await bcrypt.hash('ClaveValida2026', 4);
      pg.query.mockResolvedValueOnce({
        rows: [
          {
            accountid: 7,
            fullname: 'Carlos Ruiz',
            email: 'carlos@example.com',
            passwordhash: hash,
          },
        ],
      });

      const result = await service.loginClient('  CARLOS@example.com ', 'ClaveValida2026');

      expect(pg.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(email) = LOWER($1)'),
        ['CARLOS@example.com'],
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 7,
        kind: 'client',
        role: 'client',
        email: 'carlos@example.com',
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        account: {
          accountId: 7,
          fullName: 'Carlos Ruiz',
          email: 'carlos@example.com',
        },
      });
    });

    it('devuelve el mismo error genérico 401 si el correo no existe o si la contraseña no coincide', async () => {
      pg.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.loginClient('noexiste@example.com', 'cualquiera')).rejects.toThrow(
        new UnauthorizedException('Correo o contraseña incorrectos'),
      );

      const hash = await bcrypt.hash('Correcta123', 4);
      pg.query.mockResolvedValueOnce({
        rows: [
          {
            accountid: 7,
            fullname: 'Carlos Ruiz',
            email: 'carlos@example.com',
            passwordhash: hash,
          },
        ],
      });
      await expect(service.loginClient('carlos@example.com', 'Incorrecta999')).rejects.toThrow(
        new UnauthorizedException('Correo o contraseña incorrectos'),
      );
    });
  });

  describe('me', () => {
    it('devuelve 401 si la cuenta del token ya no existe en PostgreSQL', async () => {
      pg.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.me(999)).rejects.toThrow(UnauthorizedException);
    });
  });
});
