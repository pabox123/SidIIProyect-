

--   psql -U postgres -d cineconecta_test_m05 -f sql/06_optimizacion_relacional.sql
--   (previa carga de 01, 04, 05 y ANALYZE)

-- a) Informe de ingresos por plan en rango de fechas
--    Parámetros: mes de noviembre 2026 (selectivo, ~100 filas en payments)
--                o año 2026 completo (amplio, ~65k filas)
-- a1) Rango selectivo
SELECT p.planId, p.name as plan_name,
       COUNT(DISTINCT s.subscriptionId) as num_subscriptions,
       SUM(pay.amount) as total_revenue
FROM payments pay
JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
JOIN plans p ON p.planId = s.planId
WHERE pay.paidAt >= '2026-11-01' AND pay.paidAt < '2026-12-01'
GROUP BY p.planId, p.name
ORDER BY total_revenue DESC;

-- a2) Rango amplio
-- SELECT p.planId, p.name as plan_name,
--        COUNT(DISTINCT s.subscriptionId) as num_subscriptions,
--        SUM(pay.amount) as total_revenue
-- FROM payments pay
-- JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
-- JOIN plans p ON p.planId = s.planId
-- WHERE pay.paidAt >= '2026-01-01' AND pay.paidAt < '2027-01-01'
-- GROUP BY p.planId, p.name
-- ORDER BY total_revenue DESC;

-- b) Plan vigente de una cuenta en un instante
--    Usa accountId=1 (tiene suscripción vigente Básico a 2026-11-21)
SELECT s.subscriptionId, s.planId, pl.name as plan_name, s.startsAt, s.endsAt
FROM subscriptions s
JOIN plans pl ON pl.planId = s.planId
WHERE s.accountId = 1
  AND s.startsAt <= '2026-11-21'
  AND '2026-11-21' < s.endsAt;

-- c) Perfiles activos de una cuenta (conteo y listado)
--    accountId=100500 (cuenta de volumen con 1 perfil activo)
-- c1) Conteo
SELECT COUNT(*) as active_count
FROM profiles
WHERE accountId = 100500 AND isActive = 'Y';

-- c2) Listado
SELECT profileId, name, maxAgeRating
FROM profiles
WHERE accountId = 100500 AND isActive = 'Y'
ORDER BY profileId;

-- d) Historial de suscripciones y pagos de una cuenta, ordenado por fecha
--    accountId=1 (tiene 1 suscripción en datos base)
SELECT s.subscriptionId, s.planId, pl.name as plan_name, s.startsAt, s.endsAt,
       pay.paymentId, pay.paidAt, pay.amount, pay.reference
FROM subscriptions s
JOIN plans pl ON pl.planId = s.planId
JOIN payments pay ON pay.subscriptionId = s.subscriptionId
WHERE s.accountId = 1
ORDER BY s.startsAt DESC;

-- e) Login por correo (LOWER(email))
--    email='user100500@example.com' (cuenta de volumen)
SELECT accountId, fullName, email, passwordHash
FROM accounts
WHERE LOWER(email) = LOWER('user100500@example.com');

-- 2) MEDICIÓN ANTES/DESPUÉS - Índice ix_payments_paidat (consulta a1)
-- ANTES: sin índice
-- DROP INDEX IF EXISTS ix_payments_paidat;
-- ANALYZE payments;
-- \timing on
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT p.planId, p.name as plan_name,
--        COUNT(DISTINCT s.subscriptionId) as num_subscriptions,
--        SUM(pay.amount) as total_revenue
-- FROM payments pay
-- JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
-- JOIN plans p ON p.planId = s.planId
-- WHERE pay.paidAt >= '2026-11-01' AND pay.paidAt < '2026-12-01'
-- GROUP BY p.planId, p.name
-- ORDER BY total_revenue DESC;
-- \timing off

-- DESPUÉS: con índice
-- CREATE INDEX ix_payments_paidat ON payments (paidAt);
-- ANALYZE payments;
-- \timing on
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT p.planId, p.name as plan_name,
--        COUNT(DISTINCT s.subscriptionId) as num_subscriptions,
--        SUM(pay.amount) as total_revenue
-- FROM payments pay
-- JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
-- JOIN plans p ON p.planId = s.planId
-- WHERE pay.paidAt >= '2026-11-01' AND pay.paidAt < '2026-12-01'
-- GROUP BY p.planId, p.name
-- ORDER BY total_revenue DESC;
-- \timing off

-- 3) MEDICIÓN ANTES/DESPUÉS - Índice ix_subs_account_start (consulta b)
-- ANTES: sin índice
-- DROP INDEX IF EXISTS ix_subs_account_start;
-- ANALYZE subscriptions;
-- \timing on
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT s.subscriptionId, s.planId, pl.name as plan_name, s.startsAt, s.endsAt
-- FROM subscriptions s
-- JOIN plans pl ON pl.planId = s.planId
-- WHERE s.accountId = 1
--   AND s.startsAt <= '2026-11-21'
--   AND '2026-11-21' < s.endsAt;
-- \timing off

-- DESPUÉS: con índice
-- CREATE INDEX ix_subs_account_start ON subscriptions (accountId, startsAt DESC);
-- ANALYZE subscriptions;
-- \timing on
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
-- SELECT s.subscriptionId, s.planId, pl.name as plan_name, s.startsAt, s.endsAt
-- FROM subscriptions s
-- JOIN plans pl ON pl.planId = s.planId
-- WHERE s.accountId = 1
--   AND s.startsAt <= '2026-11-21'
--   AND '2026-11-21' < s.endsAt;
-- \timing off

-- 4) RECREAR ÍNDICES DEL DDL ORIGINAL (estado final)
-- Si se eliminaron índices durante las pruebas, recrearlos:
CREATE INDEX IF NOT EXISTS ix_payments_paidat ON payments (paidAt);
CREATE INDEX IF NOT EXISTS ix_subs_account_start ON subscriptions (accountId, startsAt DESC);
ANALYZE;

-- 5) VERIFICACIÓN DE USO DE ÍNDICES (pg_stat_user_indexes)
-- Ejecutar después de correr la carga de trabajo representativa
-- para ver qué índices se usan y cuáles no:
-- SELECT schemaname, relname as table_name, indexrelname as index_name,
--        pg_size_pretty(pg_relation_size(indexrelname::regclass)) as index_size,
--        idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;