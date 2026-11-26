import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { PostgresService } from '../db/postgres/postgres.service';
import { ClientAuthGuard } from '../../common/auth/auth.guards';
import { ProfileOwnershipGuard } from '../../common/auth/ownership.guards';

describe('AccountService & AccountController (E-04)', () => {
  let service: AccountService;
  let pg: { query: jest.Mock };

  beforeEach(() => {
    pg = { query: jest.fn() };
    service = new AccountService(pg as unknown as PostgresService);
  });

  describe('listPlans', () => {
    it('devuelve los planes disponibles ordenados por precio', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [
          { planid: 1, name: 'Básico', price: '19900.00', maxprofiles: 1 },
          { planid: 2, name: 'Estándar', price: '29900.00', maxprofiles: 2 },
        ],
      });

      const plans = await service.listPlans();

      expect(plans).toEqual([
        { planId: 1, name: 'Básico', price: 19900, maxProfiles: 1 },
        { planId: 2, name: 'Estándar', price: 29900, maxProfiles: 2 },
      ]);
    });
  });

  describe('getSubscriptionsAndPayments', () => {
    it('devuelve la suscripción vigente, el historial y los pagos de la cuenta autenticada', async () => {
      const starts = new Date('2026-11-01T00:00:00Z');
      const ends = new Date('2026-12-01T00:00:00Z');
      pg.query.mockResolvedValueOnce({
        rows: [
          {
            subscriptionid: 10,
            planid: 2,
            planname: 'Estándar',
            planprice: '29900.00',
            maxprofiles: 2,
            startsat: starts,
            endsat: ends,
            isactive: true,
            paymentid: 100,
            paidat: starts,
            amount: '29900.00',
            reference: 'REF-100',
          },
        ],
      });

      const res = await service.getSubscriptionsAndPayments(5);

      expect(pg.query).toHaveBeenCalledWith(expect.stringContaining('WHERE s.accountId = $1'), [5]);
      expect(res.activeSubscription?.subscriptionId).toBe(10);
      expect(res.subscriptions).toHaveLength(1);
      expect(res.payments).toHaveLength(1);
      expect(res.payments[0].reference).toBe('REF-100');
    });
  });

  describe('subscribe (función transaccional M-02 sp_contratar_suscripcion)', () => {
    it('invoca sp_contratar_suscripcion con parámetros y retorna la suscripción creada y su pago', async () => {
      const starts = new Date('2026-11-25T19:00:00Z');
      const ends = new Date('2026-12-25T19:00:00Z');
      pg.query
        .mockResolvedValueOnce({ rows: [{ subscriptionid: 55 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              subscriptionid: 55,
              planid: 2,
              planname: 'Estándar',
              planprice: '29900.00',
              maxprofiles: 2,
              startsat: starts,
              endsat: ends,
              isactive: true,
              paymentid: 550,
              paidat: starts,
              amount: '29900.00',
              reference: 'PAY-REF-55',
            },
          ],
        });

      const result = await service.subscribe(3, { planId: 2, reference: 'PAY-REF-55', approved: true });

      expect(pg.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('sp_contratar_suscripcion($1, $2, $3, $4)'),
        [3, 2, 'PAY-REF-55', true],
      );
      expect(result.subscriptionId).toBe(55);
      expect(result.isActive).toBe(true);
      expect(result.payment.reference).toBe('PAY-REF-55');
    });

    it('mapea suscripción ya vigente (P0001) a 409 Conflict', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'La cuenta 3 ya tiene una suscripción vigente',
      });
      await expect(service.subscribe(3, { planId: 2 })).rejects.toThrow(ConflictException);
    });

    it('mapea exceso de perfiles activos para el nuevo plan (P0001) a 409 Conflict', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'Desactive 2 perfil(es) antes de contratar este plan',
      });
      await expect(service.subscribe(3, { planId: 1 })).rejects.toThrow(ConflictException);
    });

    it('mapea plan inexistente (P0001) a 404 NotFound', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'El plan 999 no existe',
      });
      await expect(service.subscribe(3, { planId: 999 })).rejects.toThrow(NotFoundException);
    });

    it('mapea pago no aprobado (P0001) a 422 UnprocessableEntity', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'Pago no aprobado: la contratación requiere pago aprobado',
      });
      await expect(service.subscribe(3, { planId: 1, approved: false })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('mapea solapamiento (23P01) y referencia duplicada (23505) a 409 Conflict', async () => {
      pg.query.mockRejectedValueOnce({ code: '23P01' });
      await expect(service.subscribe(3, { planId: 1 })).rejects.toThrow(ConflictException);

      pg.query.mockRejectedValueOnce({ code: '23505' });
      await expect(service.subscribe(3, { planId: 1, reference: 'DUP-1' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('Perfiles (crear, listar, desactivar y rechazos de reglas de negocio)', () => {
    it('crea un perfil activo con consulta parametrizada', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [{ profileid: 12, accountid: 3, name: 'Kids', maxagerating: 7, isactive: 'Y' }],
      });

      const profile = await service.createProfile(3, { name: '  Kids ', maxAgeRating: 7 });

      expect(pg.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO profiles'),
        [3, 'Kids', 7],
      );
      expect(profile).toEqual({
        profileId: 12,
        accountId: 3,
        name: 'Kids',
        maxAgeRating: 7,
        isActive: true,
      });
    });

    it('rechaza creación de perfil con 403 Forbidden si la suscripción está vencida (trigger P0001)', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'La cuenta 8 no tiene una suscripción vigente',
      });

      await expect(service.createProfile(8, { name: 'Nuevo', maxAgeRating: 12 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza creación de perfil con 409 Conflict por exceso de perfiles activos (trigger P0001)', async () => {
      pg.query.mockRejectedValueOnce({
        code: 'P0001',
        message: 'La cuenta 1 alcanzó el máximo de 1 perfiles activos',
      });

      await expect(service.createProfile(1, { name: 'Extra', maxAgeRating: 16 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rechaza nombre duplicado de perfil (23505) con 409 Conflict', async () => {
      pg.query.mockRejectedValueOnce({ code: '23505' });
      await expect(service.createProfile(1, { name: 'Principal', maxAgeRating: 18 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('desactiva un perfil haciendo UPDATE isActive = N (sin DELETE)', async () => {
      pg.query.mockResolvedValueOnce({
        rows: [{ profileid: 12, accountid: 3, name: 'Kids', maxagerating: 7, isactive: 'N' }],
      });

      const res = await service.deactivateProfile(3, 12);

      expect(pg.query).toHaveBeenCalledWith(
        expect.stringContaining("SET isActive = 'N'"),
        [12, 3],
      );
      expect(res.isActive).toBe(false);
    });
  });

  describe('Auditoría de guards en AccountController', () => {
    it('protege todas las rutas de cuenta con ClientAuthGuard y las de :profileId con ProfileOwnershipGuard', () => {
      const clientOnlyHandlers: (keyof AccountController)[] = [
        'getSubscriptions',
        'getPayments',
        'subscribe',
        'listProfiles',
        'createProfile',
      ];
      for (const method of clientOnlyHandlers) {
        const guards = Reflect.getMetadata(GUARDS_METADATA, AccountController.prototype[method]) ?? [];
        expect(guards).toContain(ClientAuthGuard);
      }

      const profileOwnedHandlers: (keyof AccountController)[] = [
        'deactivateProfile',
        'activateProfile',
      ];
      for (const method of profileOwnedHandlers) {
        const guards = Reflect.getMetadata(GUARDS_METADATA, AccountController.prototype[method]) ?? [];
        expect(guards).toContain(ClientAuthGuard);
        expect(guards).toContain(ProfileOwnershipGuard);
      }
    });
  });
});
