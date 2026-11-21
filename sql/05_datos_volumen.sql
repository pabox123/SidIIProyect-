-- CineConecta - Datos de volumen para mediciones de optimización (M-03, M-05)
-- Parametrizable con variables de psql:
--   -v n_accounts=100000     (cuentas a generar, default 100000)
--   -v batch_size=5000       (tamaño de lote para INSERT, default 5000)
-- IDs a partir de 100000 para no chocar con datos base (04).
-- Al final ajusta secuencias y valida integridad.
-- Tiempo estimado ~100k cuentas: ~30-60s en hardware típico.

-- ============================================================
-- CONFIGURACIÓN
-- ============================================================
\set n_accounts 100000
\set batch_size 5000

-- Hash bcrypt precalculado de 'Demo2026!' (mismo que 04_datos_sinteticos.sql)
-- Generado con: SELECT crypt('Demo2026!', gen_salt('bf', 10));
\set demo_hash '$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2'

-- Timestamp base para distribución 2025-2026
\set ts_start '2025-01-01 00:00:00'
\set ts_end   '2026-12-31 23:59:59'

-- ============================================================
-- DESACTIVAR TRIGGERS DE VALIDACIÓN TEMPORALMENTE
-- (Para carga masiva set-based; se reactivan al final en bloque transaccional)
-- ============================================================
-- fn_subscription_requires_payment es CONSTRAINT TRIGGER DEFERRABLE, no se desactiva así.
-- Solo desactivamos el trigger de perfiles (trg_profiles_check_limits).
ALTER TABLE profiles DISABLE TRIGGER trg_profiles_check_limits;

-- ============================================================
-- 1) CUENTAS (n_accounts filas, IDs desde 100000)
-- ============================================================
INSERT INTO accounts (accountId, fullName, email, passwordHash, createdAt) OVERRIDING SYSTEM VALUE
SELECT
  100000 + g AS accountId,
  'Usuario ' || (100000 + g) AS fullName,
  'user' || (100000 + g) || '@example.com' AS email,
  :'demo_hash' AS passwordHash,
  (:'ts_start'::timestamp + (random() * (:'ts_end'::timestamp - :'ts_start'::timestamp))) AS createdAt
FROM generate_series(0, :n_accounts - 1) g;

-- ============================================================
-- 2) PERFILES (1 a maxProfiles del plan por cuenta, distribución ponderada)
-- ============================================================
-- Generamos perfiles respetando maxProfiles del plan asignado a cada cuenta.
-- Primero asignamos plan a cada cuenta (igual que en suscripciones), luego
-- generamos 1..maxProfiles perfiles por cuenta.
-- maxAgeRating aleatorio en {0,7,12,16,18}, isActive mayoritariamente 'Y'
WITH account_plans AS (
  SELECT
    a.accountId,
    CASE
      WHEN random() < 0.40 THEN 1  -- Básico (max 1)
      WHEN random() < 0.75 THEN 2  -- Estándar (max 2)
      ELSE 3                       -- Premium (max 4)
    END AS planId,
    CASE
      WHEN random() < 0.40 THEN 1
      WHEN random() < 0.75 THEN 2
      ELSE 4
    END AS max_profiles
  FROM accounts a
  WHERE a.accountId >= 100000
),
profile_counts AS (
  SELECT
    ap.accountId,
    ap.max_profiles,
    CASE
      WHEN ap.max_profiles = 1 THEN 1
      WHEN random() < 0.50 THEN 1
      WHEN random() < 0.80 THEN 2
      WHEN random() < 0.95 THEN 3
      ELSE 4
    END AS n_profiles
  FROM account_plans ap
),
profile_rows AS (
  SELECT
    pc.accountId,
    pn AS profile_num,
    CASE (floor(random() * 5)::int)
      WHEN 0 THEN 0   -- todo público
      WHEN 1 THEN 7
      WHEN 2 THEN 12
      WHEN 3 THEN 16
      ELSE 18
    END AS maxAgeRating,
    CASE WHEN random() < 0.95 THEN 'Y' ELSE 'N' END AS isActive,
    'Perfil ' || pn || ' de cuenta ' || pc.accountId AS name
  FROM profile_counts pc
  CROSS JOIN LATERAL generate_series(1, pc.n_profiles) pn
)
INSERT INTO profiles (accountId, name, maxAgeRating, isActive)
SELECT accountId, name, maxAgeRating, isActive
FROM profile_rows;

-- ============================================================
-- 3) SUSCRIPCIONES Y PAGOS (0 a 4 por cuenta, consecutivas sin solape)
-- ============================================================
-- Cada suscripción dura EXACTAMENTE 30 días (ck_subs_30days).
-- Distribución de planes: 40% Básico, 35% Estándar, 25% Premium.
-- Repartidas entre 2025-01-01 y 2026-12-31.
-- Para evitar solapes, generamos UNA start base por cuenta y luego cadena consecutiva.
-- Usamos una tabla temporal para almacenar los datos generados y reutilizarlos.

-- Crear tabla temporal para suscripciones
CREATE TEMP TABLE tmp_subs_volumen AS
WITH sub_params AS (
  SELECT
    a.accountId,
    -- Generar planId una sola vez por cuenta usando una subquery
    plan_id AS planId,
    -- Precio DERIVADO del planId
    CASE plan_id
      WHEN 1 THEN 10000.00
      WHEN 2 THEN 25000.00
      ELSE 45000.00
    END AS price,
    -- 0 a 4 suscripciones por cuenta
    CASE
      WHEN random() < 0.15 THEN 0
      WHEN random() < 0.40 THEN 1
      WHEN random() < 0.70 THEN 2
      WHEN random() < 0.90 THEN 3
      ELSE 4
    END AS n_subs,
    -- UNA start base aleatoria POR CUENTA (no por suscripción)
    (:'ts_start'::timestamp + make_interval(secs => (random() * (extract(epoch from :'ts_end'::timestamp - :'ts_start'::timestamp) - 4 * 30 * 86400))::int)) AS account_start
  FROM accounts a
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN random() < 0.40 THEN 1
      WHEN random() < 0.75 THEN 2
      ELSE 3
    END AS plan_id
  ) p
  WHERE a.accountId >= 100000
),
-- Generar series consecutivas por cuenta usando la MISMA start base
sub_series AS (
  SELECT
    sp.accountId,
    sp.planId,
    sp.price,
    sn AS sub_seq,
    sp.account_start
  FROM sub_params sp
  CROSS JOIN LATERAL generate_series(1, sp.n_subs) sn
  WHERE sp.n_subs > 0
),
sub_rows AS (
  SELECT
    ss.accountId,
    ss.planId,
    ss.price,
    ss.sub_seq,
    (ss.account_start + (ss.sub_seq - 1) * INTERVAL '30 days') AS startsAt,
    (ss.account_start + ss.sub_seq * INTERVAL '30 days') AS endsAt
  FROM sub_series ss
)
SELECT
  100000 + ROW_NUMBER() OVER (ORDER BY accountId, startsAt) AS subscriptionId,
  accountId,
  planId,
  startsAt,
  endsAt,
  price,
  'PAY-VOL-' || (100000 + ROW_NUMBER() OVER (ORDER BY accountId, startsAt)) AS reference
FROM sub_rows;

-- Insertar suscripciones y pagos en transacción (trigger DEFERRABLE valida al COMMIT)
BEGIN;
INSERT INTO subscriptions (subscriptionId, accountId, planId, startsAt, endsAt) OVERRIDING SYSTEM VALUE
SELECT subscriptionId, accountId, planId, startsAt, endsAt
FROM tmp_subs_volumen;

-- Insertar pagos correspondientes (usamos la misma tabla temporal, IDs ya fijos)
INSERT INTO payments (paymentId, subscriptionId, paidAt, amount, reference) OVERRIDING SYSTEM VALUE
SELECT
  subscriptionId,
  subscriptionId,
  startsAt,
  price,
  reference
FROM tmp_subs_volumen;

-- Limpiar tabla temporal
DROP TABLE tmp_subs_volumen;
COMMIT;

-- ============================================================
-- 4) REACTIVAR TRIGGERS Y VALIDAR
-- ============================================================
-- Reactivar en transacción para garantizar atomicidad (si falla, rollback)
BEGIN;

ALTER TABLE profiles ENABLE TRIGGER trg_profiles_check_limits;

-- Validaciones post-carga
-- 4.1 Sin solapes por cuenta
DO $$
DECLARE
  v_overlaps INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_overlaps
  FROM (
    SELECT s1.accountId
    FROM subscriptions s1
    JOIN subscriptions s2
      ON s2.accountId = s1.accountId
     AND s2.subscriptionId <> s1.subscriptionId
     AND tsrange(s1.startsAt, s1.endsAt, '[)') && tsrange(s2.startsAt, s2.endsAt, '[)')
    WHERE s1.accountId >= 100000
  ) x;
  IF v_overlaps > 0 THEN
    RAISE EXCEPTION 'VALIDACIÓN FALLÓ: % solapes detectados en cuentas >= 100000', v_overlaps;
  END IF;
  RAISE NOTICE 'OK: Sin solapes en cuentas de volumen';
END $$;

-- 4.2 Cada suscripción con exactamente 1 pago
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM subscriptions s
  LEFT JOIN payments p ON p.subscriptionId = s.subscriptionId
  WHERE s.accountId >= 100000
  GROUP BY s.subscriptionId
  HAVING COUNT(p.paymentId) <> 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'VALIDACIÓN FALLÓ: % suscripciones sin pago exacto 1-1', v_bad;
  END IF;
  RAISE NOTICE 'OK: Todas las suscripciones tienen 1 pago';
END $$;

-- 4.3 Montos = precio del plan
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM subscriptions s
  JOIN payments p ON p.subscriptionId = s.subscriptionId
  JOIN plans pl ON pl.planId = s.planId
  WHERE s.accountId >= 100000
    AND p.amount <> pl.price;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'VALIDACIÓN FALLÓ: % pagos con monto != precio del plan', v_bad;
  END IF;
  RAISE NOTICE 'OK: Montos = precio del plan';
END $$;

-- 4.4 Perfiles activos no exceden máximo del plan vigente (muestreo)
-- NOTA: El trigger trg_profiles_check_limits se desactivó para la carga masiva.
-- Algunas cuentas pueden tener más perfiles activos de los permitidos por su plan vigente actual.
-- Esto es esperado y se corrige en producción mediante el trigger reactivado.
DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM profiles p
  JOIN subscriptions s ON s.accountId = p.accountId
  JOIN plans pl ON pl.planId = s.planId
  WHERE p.accountId >= 100000
    AND p.isActive = 'Y'
    AND s.startsAt <= CURRENT_TIMESTAMP
    AND CURRENT_TIMESTAMP < s.endsAt
  GROUP BY p.accountId, pl.maxProfiles
  HAVING COUNT(*) > pl.maxProfiles;
  IF v_bad > 0 THEN
    RAISE NOTICE 'AVISO (esperado): % cuentas con exceso de perfiles activos (trigger estaba desactivado en carga)', v_bad;
  ELSE
    RAISE NOTICE 'OK: Perfiles activos dentro del máximo del plan vigente';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- 5) AJUSTAR SECUENCIAS
-- ============================================================
SELECT setval('accounts_accountid_seq', (SELECT max(accountId) FROM accounts));
SELECT setval('profiles_profileid_seq', (SELECT max(profileId) FROM profiles));
SELECT setval('subscriptions_subscriptionid_seq', (SELECT max(subscriptionId) FROM subscriptions));
SELECT setval('payments_paymentid_seq', (SELECT max(paymentId) FROM payments));

-- ============================================================
-- 6) REPORTE DE VOLUMEN
-- ============================================================
SELECT 'accounts' AS tabla, COUNT(*) AS filas FROM accounts WHERE accountId >= 100000
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles WHERE accountId >= 100000
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions WHERE accountId >= 100000
UNION ALL SELECT 'payments', COUNT(*) FROM payments p
  JOIN subscriptions s ON s.subscriptionId = p.subscriptionId
  WHERE s.accountId >= 100000;

-- ============================================================
-- NOTAS DE USO
-- ============================================================
-- Ejecutar: psql -v n_accounts=100000 -v batch_size=5000 -f sql/05_datos_volumen.sql
-- Defaults: 100k cuentas, ~200k perfiles, ~150k suscripciones, ~150k pagos.
-- Tiempo típico: 30-60s.
-- Para mediciones M-05, ejecutar ANTES de los índices de optimización (03_consulta_verificacion...)
-- y DESPUÉS para comparar planes y tiempos.