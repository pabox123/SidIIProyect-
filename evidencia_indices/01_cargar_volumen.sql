-- CineConecta - Carga de volumen para evidencia de índices (M-09)
-- Genera ~150k cuentas, ~1M suscripciones, ~1M pagos, perfiles según plan
-- Semilla fija para reproducibilidad

-- 1) Poblar tabla plans (catálogo fijo)
INSERT INTO plans (name, price, maxProfiles) VALUES
  ('Basic', 9.99, 1),
  ('Standard', 15.99, 2),
  ('Premium', 21.99, 4)
ON CONFLICT (name) DO NOTHING;

-- 2) Desactivar triggers y FK temporalmente para carga masiva rápida
-- Usamos session_replication_role = replica para saltar triggers y FK
SET session_replication_role = replica;

-- 3) Cuentas: ~150,000
-- Semilla fija: setseed(0.42) para generate_series determinista
SELECT setseed(0.42);

WITH base AS (
  SELECT
    gs AS accountId,
    'Usuario ' || gs AS fullName,
    'user' || gs || '@example.com' AS email,
    '$2b$12$' || md5(random()::text || gs::text) || md5(gs::text || random()::text) AS passwordHash, -- 7 + 32 + 32 = 71 chars
    (DATE '2023-01-01' + (random() * 365)::int * INTERVAL '1 day') AS createdAt
  FROM generate_series(1, 150000) gs
)
INSERT INTO accounts (accountId, fullName, email, passwordHash, createdAt)
OVERRIDING SYSTEM VALUE
SELECT accountId, fullName, email, passwordHash, createdAt FROM base;

-- 4) Suscripciones: ~5.25M (35 por cuenta x 150k = 5.25M) para cubrir ene-2024 a nov-2026
-- Ventana: 2024-01-01 a 2026-11-30 = 35 meses = ~1050 días = 35 períodos de 30 días
-- Cada suscripción = 30 días exactos, consecutivas por cuenta, sin solape
-- Distribución de planes: 50% Basic, 30% Standard, 20% Premium
SELECT setseed(0.42);

WITH account_plans AS (
  SELECT a.accountId,
         CASE
           WHEN random() < 0.50 THEN 1 -- Basic
           WHEN random() < 0.80 THEN 2 -- Standard
           ELSE 3 -- Premium
         END AS planId,
         -- Primera suscripción empieza en 2024-01-01 exactamente para alinear todas
         DATE '2024-01-01' AS first_start
  FROM accounts a
),
subs_expanded AS (
  SELECT
    ap.accountId,
    ap.planId,
    ap.first_start + (n * INTERVAL '30 days') AS startsAt,
    ap.first_start + ((n + 1) * INTERVAL '30 days') AS endsAt,
    ROW_NUMBER() OVER (PARTITION BY ap.accountId ORDER BY n) AS rn
  FROM account_plans ap
  CROSS JOIN LATERAL generate_series(0, 34) n -- 35 suscripciones por cuenta (cubre 35 meses)
  WHERE ap.first_start + (n * INTERVAL '30 days') < DATE '2026-12-01'
)
INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
SELECT accountId, planId, startsAt, endsAt
FROM subs_expanded
WHERE rn <= 35; -- 35 subs por cuenta = ~5.25M total, pero limitamos a ~1M total muestreando

-- Para no exceder 1M suscripciones, hacemos un muestreo: solo 1 de cada 5 cuentas tiene todas las 35 subs
-- Las otras 4/5 tienen solo 7 subs (como antes) para totalizar ~1M
DELETE FROM subscriptions
WHERE accountId IN (
  SELECT accountId FROM accounts
  WHERE accountId % 5 <> 1  -- solo 20% de cuentas (las que terminan en 1, 6, 11...)
);

-- Re-insertar para el 80% restante con solo 7 subs cada una
WITH account_plans AS (
  SELECT a.accountId,
         CASE
           WHEN random() < 0.50 THEN 1
           WHEN random() < 0.80 THEN 2
           ELSE 3
         END AS planId,
         DATE '2024-01-01' AS first_start
  FROM accounts a
  WHERE accountId % 5 <> 1
),
subs_expanded AS (
  SELECT
    ap.accountId,
    ap.planId,
    ap.first_start + (n * INTERVAL '30 days') AS startsAt,
    ap.first_start + ((n + 1) * INTERVAL '30 days') AS endsAt
  FROM account_plans ap
  CROSS JOIN LATERAL generate_series(0, 6) n -- 7 subs por cuenta
  WHERE ap.first_start + (n * INTERVAL '30 days') < DATE '2026-12-01'
)
INSERT INTO subscriptions (accountId, planId, startsAt, endsAt)
SELECT accountId, planId, startsAt, endsAt
FROM subs_expanded;

-- 5) Pagos: 1 por suscripción (paidAt = startsAt, amount = precio del plan)
INSERT INTO payments (subscriptionId, paidAt, amount, reference)
SELECT
  s.subscriptionId,
  s.startsAt AS paidAt,
  p.price AS amount,
  'PAY-' || s.subscriptionId || '-' || md5(random()::text || s.subscriptionId::text) AS reference
FROM subscriptions s
JOIN plans p ON p.planId = s.planId;

-- 6) Perfiles: según maxProfiles del plan vigente de cada cuenta en 2026-11-15
-- Cada cuenta tiene entre 1 y maxProfiles perfiles activos, algunos inactivos
SELECT setseed(0.42);

WITH active_plan AS (
  SELECT DISTINCT ON (s.accountId) s.accountId, s.planId
  FROM subscriptions s
  WHERE s.startsAt <= DATE '2026-11-15' AND DATE '2026-11-15' < s.endsAt
  ORDER BY s.accountId, s.startsAt DESC
),
profile_counts AS (
  SELECT ap.accountId, ap.planId, p.maxProfiles,
         (1 + (random() * (p.maxProfiles - 1))::int) AS n_active,
         CASE WHEN random() < 0.3 THEN 1 ELSE 0 END AS n_inactive
  FROM active_plan ap
  JOIN plans p ON p.planId = ap.planId
)
INSERT INTO profiles (accountId, name, maxAgeRating, isActive)
SELECT
  pc.accountId,
  'Perfil ' || pc.accountId || '_' || gn,
  CASE WHEN random() < 0.6 THEN (random() * 18)::int ELSE 18 END,
  CASE WHEN gn <= pc.n_active THEN 'Y' ELSE 'N' END
FROM profile_counts pc
CROSS JOIN LATERAL generate_series(1, pc.n_active + pc.n_inactive) gn;

-- 7) Reactivar triggers y FK
SET session_replication_role = DEFAULT;

-- 8) ANALYZE para estadísticas actualizadas
ANALYZE;

-- 9) Conteos y tamaños
SELECT 'accounts' AS tabla, COUNT(*) AS filas, pg_size_pretty(pg_total_relation_size('accounts')) AS tamaño_total
FROM accounts
UNION ALL
SELECT 'profiles', COUNT(*), pg_size_pretty(pg_total_relation_size('profiles')) FROM profiles
UNION ALL
SELECT 'plans', COUNT(*), pg_size_pretty(pg_total_relation_size('plans')) FROM plans
UNION ALL
SELECT 'subscriptions', COUNT(*), pg_size_pretty(pg_total_relation_size('subscriptions')) FROM subscriptions
UNION ALL
SELECT 'payments', COUNT(*), pg_size_pretty(pg_total_relation_size('payments')) FROM payments;

-- Tamaños de índices individuales
SELECT
  schemaname,
  relname AS tabla,
  indexrelname AS indice,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamaño
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY relname, indexrelname;