import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
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

  describe('loginAdmin & adminMe (E-03 Admin Auth)', () => {
    let adminCollection: { findOne: jest.Mock; updateOne: jest.Mock };

    beforeEach(() => {
      adminCollection = {
        findOne: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
      mongo.getCollection.mockReturnValue(adminCollection);
    });

    it('autentica un administrador activo con bcryptjs, actualiza lastLoginAt y emite JWT sin passwordHash', async () => {
      const adminId = new ObjectId('692000000000000000000001');
      const hash = await bcrypt.hash('AdminClave2026!', 4);
      adminCollection.findOne.mockResolvedValueOnce({
        _id: adminId,
        email: 'admin@cineconecta.example',
        fullName: 'Administración de catálogo',
        passwordHash: hash,
        roles: ['catalog_admin'],
        isActive: true,
      });

      const result = await service.loginAdmin('  ADMIN@CineConecta.example ', 'AdminClave2026!');

      expect(mongo.getCollection).toHaveBeenCalledWith('admin_users');
      expect(adminCollection.findOne).toHaveBeenCalledWith(
        { email: 'admin@cineconecta.example' },
        { collation: { locale: 'en', strength: 2 } },
      );
      expect(adminCollection.updateOne).toHaveBeenCalledWith(
        { _id: adminId },
        { $set: { lastLoginAt: expect.any(Date) } },
      );
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: String(adminId),
        kind: 'admin',
        role: 'admin',
        email: 'admin@cineconecta.example',
        roles: ['catalog_admin'],
      });
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        admin: {
          adminId: String(adminId),
          fullName: 'Administración de catálogo',
          email: 'admin@cineconecta.example',
          roles: ['catalog_admin'],
        },
      });
      expect((result.admin as any).passwordHash).toBeUndefined();
    });

    it('devuelve el mismo error genérico 401 si el admin no existe, está inactivo o la contraseña falla', async () => {
      const hash = await bcrypt.hash('ClaveReal2026!', 4);

      // 1) Inexistente
      adminCollection.findOne.mockResolvedValueOnce(null);
      await expect(service.loginAdmin('nadie@cineconecta.example', 'ClaveReal2026!')).rejects.toThrow(
        new UnauthorizedException('Correo o contraseña incorrectos'),
      );

      // 2) Inactivo (isActive: false)
      adminCollection.findOne.mockResolvedValueOnce({
        _id: new ObjectId('692000000000000000000002'),
        email: 'inactivo@cineconecta.example',
        fullName: 'Inactivo',
        passwordHash: hash,
        roles: ['catalog_admin'],
        isActive: false,
      });
      await expect(service.loginAdmin('inactivo@cineconecta.example', 'ClaveReal2026!')).rejects.toThrow(
        new UnauthorizedException('Correo o contraseña incorrectos'),
      );

      // 3) Contraseña incorrecta
      adminCollection.findOne.mockResolvedValueOnce({
        _id: new ObjectId('692000000000000000000003'),
        email: 'admin@cineconecta.example',
        fullName: 'Admin',
        passwordHash: hash,
        roles: ['catalog_admin'],
        isActive: true,
      });
      await expect(service.loginAdmin('admin@cineconecta.example', 'Incorrecta!')).rejects.toThrow(
        new UnauthorizedException('Correo o contraseña incorrectos'),
      );
    });

    it('adminMe devuelve el perfil seguro del administrador activo sin passwordHash', async () => {
      const adminId = new ObjectId('692000000000000000000001');
      const createdAt = new Date('2026-01-05T12:00:00Z');
      const lastLoginAt = new Date('2026-11-25T18:00:00Z');
      adminCollection.findOne.mockResolvedValueOnce({
        _id: adminId,
        email: 'admin@cineconecta.example',
        fullName: 'Administración de catálogo',
        roles: ['catalog_admin'],
        isActive: true,
        createdAt,
        lastLoginAt,
      });

      const result = await service.adminMe(String(adminId));

      expect(adminCollection.findOne).toHaveBeenCalledWith(
        { _id: adminId, isActive: true },
        { projection: { passwordHash: 0 } },
      );
      expect(result).toEqual({
        adminId: String(adminId),
        fullName: 'Administración de catálogo',
        email: 'admin@cineconecta.example',
        roles: ['catalog_admin'],
        isActive: true,
        createdAt,
        lastLoginAt,
      });
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('adminMe rechaza con 401 si el ID es inválido o el admin está inactivo/inexistente', async () => {
      await expect(service.adminMe('id-invalido')).rejects.toThrow(UnauthorizedException);

      adminCollection.findOne.mockResolvedValueOnce(null);
      await expect(service.adminMe('692000000000000000000099')).rejects.toThrow(UnauthorizedException);
    });
  });
});
