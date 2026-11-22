-- CineConecta - Datos sintéticos base (M-03)
-- Debe ejecutarse DESPUÉS de 01_postgresql_ddl.sql en una base vacía.
-- IDs EXPLÍCITOS y estables (OVERRIDING SYSTEM VALUE para GENERATED ALWAYS).
-- Al final ajusta secuencias con setval para que próximos INSERT de la app no choquen.
-- Contraseña de prueba compartida: 'Demo2026!' (bcrypt $2a$10$... ver abajo)
-- Todo en una transacción; idempotente en lo razonable (base vacía).
-- ORDEN: planes → cuentas → suscripciones+pagos → perfiles (trigger requiere sub vigente para isActive='Y').

BEGIN;

-- ============================================================
-- CONSTANTE: hash bcrypt de 'Demo2026!' (costo 10, prefijo $2a$)
-- Generado con: SELECT crypt('Demo2026!', gen_salt('bf', 10));
-- Todas las cuentas usan este mismo hash.
-- ============================================================
-- Hash bcrypt real de 'Demo2026!' (costo 10, prefijo $2a$, 60 chars)
-- Generado con: SELECT crypt('Demo2026!', gen_salt('bf', 10));
\set demo_hash '$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2'

-- ============================================================
-- 1) PLANES (IDs 1, 2, 3)
-- ============================================================
INSERT INTO plans (planId, name, price, maxProfiles) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Básico',  10000.00, 1),
  (2, 'Estándar', 25000.00, 2),
  (3, 'Premium',  45000.00, 4);

-- ============================================================
-- 2) CUENTAS (IDs 1..15)
-- ============================================================
-- accountId 1: vigente Básico (punto 1)
-- accountId 2: vigente Estándar (punto 1)
-- accountId 3: vigente Premium (punto 1)
-- accountId 4: VENCIDA sin vigente (punto 2)
-- accountId 5: HISTORIAL consecutivo Básico→Estándar→Premium (punto 3)
-- accountId 6: NUNCA suscripción, para demo contratación (punto 4)
-- accountId 7: SIN suscripción, para demo CONCURRENCIA (punto 5)
-- accountId 8: 3 perfiles activos (exceso para Básico/Estándar) (punto 6)
-- accountId 9: vigente Básico (max 1) con 1 perfil activo (punto 7)
-- accountId 10: perfiles restrictivos + inactivo histórico (punto 8)
-- accountId 11: suscripción vence en pocos días (punto 9)
-- accountId 12: suscripción borde semiabierto (punto 9)
-- accountId 13-15: cuentas adicionales para completar ~15
-- ============================================================
INSERT INTO accounts (accountId, fullName, email, passwordHash, createdAt) OVERRIDING SYSTEM VALUE VALUES
  (1,  'Ana García',      'ana.garcia@example.com',      :'demo_hash', '2025-01-15 10:00:00'),
  (2,  'Carlos López',    'carlos.lopez@example.com',    :'demo_hash', '2025-02-20 14:30:00'),
  (3,  'María Rodríguez', 'maria.rodriguez@example.com', :'demo_hash', '2025-03-10 09:15:00'),
  (4,  'Juan Pérez',      'juan.perez@example.com',      :'demo_hash', '2025-04-05 16:45:00'),
  (5,  'Laura Martín',    'laura.martin@example.com',    :'demo_hash', '2025-05-12 11:20:00'),
  (6,  'Pedro Sánchez',   'pedro.sanchez@example.com',   :'demo_hash', '2025-06-18 08:00:00'),
  (7,  'Sofía Gómez',     'sofia.gomez@example.com',     :'demo_hash', '2025-07-22 13:10:00'),
  (8,  'Diego Fernández', 'diego.fernandez@example.com', :'demo_hash', '2025-08-30 17:55:00'),
  (9,  'Elena Ruiz',      'elena.ruiz@example.com',      :'demo_hash', '2025-09-14 12:00:00'),
  (10, 'Pablo Torres',    'pablo.torres@example.com',    :'demo_hash', '2025-10-01 15:30:00'),
  (11, 'Lucía Jiménez',   'lucia.jimenez@example.com',   :'demo_hash', '2025-11-05 10:45:00'),
  (12, 'Mario Herrera',   'mario.herrera@example.com',   :'demo_hash', '2025-11-10 09:00:00'),
  (13, 'Isabel Moreno',   'isabel.moreno@example.com',   :'demo_hash', '2025-11-12 11:00:00'),
  (14, 'Javier Alonso',   'javier.alonso@example.com',   :'demo_hash', '2025-11-15 14:00:00'),
  (15, 'Carmen Navarro',  'carmen.navarro@example.com',  :'demo_hash', '2025-11-18 16:00:00');

-- ============================================================
-- 3) SUSCRIPCIONES Y PAGOS (misma transacción por par)
-- Referencias legibles: PAY-XXXX. paidAt = startsAt. amount = precio del plan.
-- ck_subs_30days: endsAt = startsAt + 30 days exactos.
-- EXCLUDE: tsrange('[)') semiabierto permite consecutivas sin solape.
-- El trigger ctr_subscription_requires_payment es DEFERRABLE INITIALLY DEFERRED:
-- valida al COMMIT, así que el orden dentro de la transacción no importa.
-- ============================================================

-- Punto 1: Cuentas con suscripción VIGENTE hasta al menos 2026-12-01
-- startsAt entre 2026-11-01 y 2026-11-20 → endsAt entre 2026-12-01 y 2026-12-20
-- accountId 1: Básico (planId=1, price=10000)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 1, '2026-11-10 12:00:00', '2026-12-10 12:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '2026-11-10 12:00:00', 10000.00, 'PAY-0001');

-- accountId 2: Estándar (planId=2, price=25000)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (2, 2, 2, '2026-11-12 10:00:00', '2026-12-12 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (2, 2, '2026-11-12 10:00:00', 25000.00, 'PAY-0002');

-- accountId 3: Premium (planId=3, price=45000)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (3, 3, 3, '2026-11-15 14:00:00', '2026-12-15 14:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (3, 3, '2026-11-15 14:00:00', 45000.00, 'PAY-0003');

-- Punto 2: accountId 4 - VENCIDA sin vigente (venció 2026-10-31)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (4, 4, 1, '2026-10-01 10:00:00', '2026-10-31 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (4, 4, '2026-10-01 10:00:00', 10000.00, 'PAY-0004');

-- Punto 3: accountId 5 - HISTORIAL consecutivo Básico→Estándar→Premium (sin solapes)
-- Sub 1: Básico 2026-01-01 a 2026-01-31
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (5, 5, 1, '2026-01-01 10:00:00', '2026-01-31 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (5, 5, '2026-01-01 10:00:00', 10000.00, 'PAY-0005');
-- Sub 2: Estándar 2026-02-01 a 2026-03-03 (exactos 30 días)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (6, 5, 2, '2026-02-01 10:00:00', '2026-03-03 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (6, 6, '2026-02-01 10:00:00', 25000.00, 'PAY-0006');
-- Sub 3: Premium 2026-03-03 a 2026-04-02 (exactos 30 días)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (7, 5, 3, '2026-03-03 10:00:00', '2026-04-02 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (7, 7, '2026-03-03 10:00:00', 45000.00, 'PAY-0007');
-- Sub 4: Premium vigente actual 2026-11-10 a 2026-12-10 (max 4 para 3 perfiles)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (8, 5, 3, '2026-11-10 10:00:00', '2026-12-10 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (8, 8, '2026-11-10 10:00:00', 45000.00, 'PAY-0008');

-- Punto 4: accountId 6 - NUNCA suscripción (para demo contratación)
-- (sin inserts aquí)

-- Punto 5: accountId 7 - SIN suscripción (para demo concurrencia)
-- (sin inserts aquí)

-- Punto 6: accountId 8 - 3 perfiles activos (exceso para Básico/Estándar)
-- Tiene suscripción VENCIDA Premium (2026-09-20 a 2026-10-20) para que al intentar
-- contratar Básico falle con "exceso perfiles" (3 activos > max 1) y NO con "suscripción vigente".
-- Los perfiles activos requieren trigger desactivado temporalmente (no hay sub vigente).
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (9, 8, 3, '2026-09-20 10:00:00', '2026-10-20 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (9, 9, '2026-09-20 10:00:00', 45000.00, 'PAY-0009');

-- Punto 7: accountId 9 - Básico vigente con 1 perfil activo (máx 1)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (10, 9, 1, '2026-11-12 10:00:00', '2026-12-12 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (10, 10, '2026-11-12 10:00:00', 10000.00, 'PAY-0010');

-- Punto 8: accountId 10 - perfiles restrictivos, suscripción Estándar vigente
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (11, 10, 2, '2026-11-08 10:00:00', '2026-12-08 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (11, 11, '2026-11-08 10:00:00', 25000.00, 'PAY-0011');

-- Punto 9a: accountId 11 - vence en pocos días (27 nov 2026)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (12, 11, 1, '2026-10-28 10:00:00', '2026-11-27 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (12, 12, '2026-10-28 10:00:00', 10000.00, 'PAY-0012');

-- Punto 9b: accountId 12 - borde semiabierto: sub vigente termina cuando empieza otra
-- Sub 1: 2026-11-01 a 2026-12-01
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (13, 12, 1, '2026-11-01 10:00:00', '2026-12-01 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (13, 13, '2026-11-01 10:00:00', 10000.00, 'PAY-0013');
-- Sub 2: empieza exacto cuando termina la 1 (semiabierto [) permite)
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (14, 12, 2, '2026-12-01 10:00:00', '2026-12-31 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (14, 14, '2026-12-01 10:00:00', 25000.00, 'PAY-0014');

-- Cuentas 13, 14, 15: suscripciones vigentes adicionales
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (15, 13, 2, '2026-11-13 10:00:00', '2026-12-13 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (15, 15, '2026-11-13 10:00:00', 25000.00, 'PAY-0015');

INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (16, 14, 3, '2026-11-14 10:00:00', '2026-12-14 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (16, 16, '2026-11-14 10:00:00', 45000.00, 'PAY-0016');

INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE VALUES
  (17, 15, 2, '2026-11-16 10:00:00', '2026-12-16 10:00:00');
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE VALUES
  (17, 17, '2026-11-16 10:00:00', 25000.00, 'PAY-0017');

-- ============================================================
-- 4) PERFILES (2-4 por cuenta, maxAgeRating variados, algunos inactivos)
-- Nombres únicos por cuenta sin importar mayúsculas (índice funcional ux_profiles_name_ci)
-- IMPORTANTE: El trigger fn_profiles_check_limits exige suscripción vigente
-- para isActive='Y'. Cuentas 4, 6, 7 NO tienen sub vigente a 2026-11-21:
--   sus perfiles activos se insertan como 'N' (se activarán en demo tras contratar).
-- ============================================================

-- Cuenta 1 (Básico vigente): 1 perfil activo (máx 1)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, 'Ana Principal', 18, 'Y');

-- Cuenta 2 (Estándar vigente): 2 perfiles activos (máx 2)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (2, 2, 'Carlos Adulto',   18, 'Y'),
  (3, 2, 'Carlos Junior',   12, 'Y');

-- Cuenta 3 (Premium vigente): 4 perfiles activos (máx 4)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (4, 3, 'María Madre',     18, 'Y'),
  (5, 3, 'María Padre',     18, 'Y'),
  (6, 3, 'Hijo Mayor',      12, 'Y'),
  (7, 3, 'Hijo Menor',      7,  'Y');

-- Cuenta 4 (VENCIDA sin vigente): 2 perfiles INACTIVOS (históricos)
-- El trigger exige sub vigente para 'Y', así que cargan como 'N'.
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (8, 4, 'Juan Histórico 1', 18, 'N'),
  (9, 4, 'Juan Histórico 2', 12, 'N');

-- Cuenta 5 (HISTORIAL con sub vigente Estándar): 3 perfiles activos
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (10, 5, 'Laura Perfil 1', 18, 'Y'),
  (11, 5, 'Laura Perfil 2', 12, 'Y'),
  (12, 5, 'Laura Perfil 3', 7,  'Y');

-- Cuenta 6 (NUNCA suscripción): 2 perfiles INACTIVOS (se activarán en demo tras contratar)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (13, 6, 'Pedro Adulto', 18, 'N'),
  (14, 6, 'Pedro Niño',   12, 'N');

-- Cuenta 7 (CONCURRENCIA): 1 perfil INACTIVO (se activará en demo)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (15, 7, 'Sofía Único', 18, 'N');

-- Cuenta 8 (EXCESO perfiles): 3 perfiles activos (máx Básico=1, Estándar=2, Premium=4 ok)
-- Trigger desactivado temporalmente: no hay suscripción vigente (está VENCIDA 2026-10-20)
-- Estos perfiles deben ser 'Y' para probar rechazo "exceso perfiles" al contratar Básico
ALTER TABLE profiles DISABLE TRIGGER trg_profiles_check_limits;
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (16, 8, 'Diego 1', 18, 'Y'),
  (17, 8, 'Diego 2', 12, 'Y'),
  (18, 8, 'Diego 3', 7,  'Y');
ALTER TABLE profiles ENABLE TRIGGER trg_profiles_check_limits;

-- Cuenta 9 (Básico vigente, 1 activo): para probar rechazo al crear 2do
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (19, 9, 'Elena Único', 18, 'Y');

-- Cuenta 10 (RESTRITIVOS + inactivo histórico): 2 activos (7, 12) + 1 inactivo con actividad
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (20, 10, 'Pablo Niños',     7,  'Y'),
  (21, 10, 'Pablo Preadoles', 12, 'Y'),
  (22, 10, 'Pablo Histórico',  18, 'N');  -- inactivo pero con watch_activity en Mongo

-- Cuenta 11 (VENCE PRONTO - 27 nov 2026): 1 perfil
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (23, 11, 'Lucía Urgente', 18, 'Y');

-- Cuenta 12 (BORDE SEMIABIERTO): 1 perfil (sub 1 vigente hasta 2026-12-01)
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (24, 12, 'Mario Límite', 18, 'Y');

-- Cuenta 13: 2 perfiles
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (25, 13, 'Isabel A', 18, 'Y'),
  (26, 13, 'Isabel B', 12, 'Y');

-- Cuenta 14: 2 perfiles
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (27, 14, 'Javier 1', 18, 'Y'),
  (28, 14, 'Javier 2', 12, 'Y');

-- Cuenta 15: 2 perfiles
INSERT INTO profiles (profileId, accountId, name, maxAgeRating, isActive) OVERRIDING SYSTEM VALUE VALUES
  (29, 15, 'Carmen 1', 18, 'Y'),
  (30, 15, 'Carmen 2', 7,  'Y');

-- ============================================================
-- 5) AJUSTAR SECUENCIAS (para que próximos INSERT de la app no choquen)
-- ============================================================
SELECT setval('plans_planid_seq', (SELECT max(planId) FROM plans));
SELECT setval('accounts_accountid_seq', (SELECT max(accountId) FROM accounts));
SELECT setval('profiles_profileid_seq', (SELECT max(profileId) FROM profiles));
SELECT setval('subscriptions_subscriptionid_seq', (SELECT max(subscriptionId) FROM subscriptions));
SELECT setval('payments_paymentid_seq', (SELECT max(paymentId) FROM payments));

COMMIT;

-- ============================================================
-- 6) CONSULTAS DE VERIFICACIÓN (ejecutar tras COMMIT para validar)
-- ============================================================
-- 6.1 Sin períodos superpuestos por cuenta (EXCLUDE ya garantiza, pero verificamos)
-- SELECT accountId, COUNT(*) as overlaps FROM (
--   SELECT accountId, tsrange(startsAt, endsAt, '[)') AS r
--   FROM subscriptions
-- ) s
-- JOIN LATERAL (
--   SELECT 1 FROM subscriptions s2
--   WHERE s2.accountId = s.accountId
--     AND s2.subscriptionId <> s.subscriptionId
--     AND s.r && tsrange(s2.startsAt, s2.endsAt, '[)')
-- ) o ON true
-- GROUP BY accountId HAVING COUNT(*) > 0;
-- Debe devolver 0 filas.

-- 6.2 Cada suscripción con exactamente 1 pago
-- SELECT s.subscriptionId, COUNT(p.paymentId) as npay
-- FROM subscriptions s LEFT JOIN payments p ON p.subscriptionId = s.subscriptionId
-- GROUP BY s.subscriptionId HAVING COUNT(p.paymentId) <> 1;
-- Debe devolver 0 filas.

-- 6.3 Montos = precio del plan
-- SELECT s.subscriptionId, p.amount, pl.price
-- FROM subscriptions s
-- JOIN payments p ON p.subscriptionId = s.subscriptionId
-- JOIN plans pl ON pl.planId = s.planId
-- WHERE p.amount <> pl.price;
-- Debe devolver 0 filas.

-- 6.4 Vigentes / Vencidas por cuenta (a fecha 2026-11-21)
-- SELECT accountId,
--   COUNT(*) FILTER (WHERE startsAt <= '2026-11-21' AND '2026-11-21' < endsAt) as vigentes,
--   COUNT(*) FILTER (WHERE endsAt <= '2026-11-21') as vencidas
-- FROM subscriptions GROUP BY accountId ORDER BY accountId;

-- 6.5 Perfiles activos vs máximo del plan vigente (a fecha 2026-11-21)
-- SELECT p.accountId,
--   COUNT(*) FILTER (WHERE p.isActive = 'Y') as activos,
--   pl.maxProfiles
-- FROM profiles p
-- JOIN subscriptions s ON s.accountId = p.accountId
-- JOIN plans pl ON pl.planId = s.planId
-- WHERE p.isActive = 'Y'
--   AND s.startsAt <= '2026-11-21' AND '2026-11-21' < s.endsAt
-- GROUP BY p.accountId, pl.maxProfiles
-- HAVING COUNT(*) FILTER (WHERE p.isActive = 'Y') > pl.maxProfiles;
-- Debe devolver 0 filas (todos cumplen el límite en su plan vigente actual).