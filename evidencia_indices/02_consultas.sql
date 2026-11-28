-- CineConecta - Consultas para medición de índices (M-09)
-- Ejecutar cada bloque con EXPLAIN (ANALYZE, BUFFERS) repitiendo 5 veces

-- =====================================================================
-- CONSULTA A: Informe de ingresos por plan (principal)
-- SUM(amount) y COUNT de suscripciones por plan, pagos en rango de fechas
-- Comparar SIN ix_payments_paidat y CON él
-- =====================================================================

-- A1: Rango de 1 mes (enero 2025)
-- SIN índice: DROP INDEX ix_payments_paidat; ANALYZE;
-- CON índice: CREATE INDEX ix_payments_paidat ON payments (paidAt); ANALYZE;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT pl.name AS plan, SUM(pay.amount) AS total_ingresos, COUNT(DISTINCT s.subscriptionId) AS num_suscripciones
FROM payments pay
JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
JOIN plans pl ON pl.planId = s.planId
WHERE pay.paidAt >= '2025-01-01' AND pay.paidAt < '2025-02-01'
GROUP BY pl.name
ORDER BY total_ingresos DESC;

-- A2: Rango de 1 año completo (2025)
-- SIN índice: DROP INDEX ix_payments_paidat; ANALYZE;
-- CON índice: CREATE INDEX ix_payments_paidat ON payments (paidAt); ANALYZE;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT pl.name AS plan, SUM(pay.amount) AS total_ingresos, COUNT(DISTINCT s.subscriptionId) AS num_suscripciones
FROM payments pay
JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
JOIN plans pl ON pl.planId = s.planId
WHERE pay.paidAt >= '2025-01-01' AND pay.paidAt < '2026-01-01'
GROUP BY pl.name
ORDER BY total_ingresos DESC;

-- =====================================================================
-- CONSULTA B: Verificación al iniciar una reproducción (sql/03)
-- Suscripción vigente de una cuenta + perfil activo
-- Comparar con y sin ix_subs_account_start, notar si usa índice GiST de ex_subs_no_overlap
-- =====================================================================

-- Parámetros de prueba (cuenta con datos)
-- Usar una cuenta que exista y tenga suscripción vigente en 2026-11-15
-- SIN índice: DROP INDEX ix_subs_account_start; ANALYZE;
-- CON índice: CREATE INDEX ix_subs_account_start ON subscriptions (accountId, startsAt DESC); ANALYZE;

\set accountId 12345
\set profileId 1
\set now '2026-11-15 20:00:00'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.subscriptionId, s.planId, p.maxAgeRating
FROM profiles p
JOIN subscriptions s ON s.accountId = p.accountId
WHERE p.profileId = :profileId
  AND p.accountId = :accountId
  AND p.isActive = 'Y'
  AND s.startsAt <= :now AND :now < s.endsAt;

-- =====================================================================
-- CONSULTA C: Perfiles activos de una cuenta
-- Comparar con y sin ix_profiles_account_active
-- =====================================================================

-- SIN índice: DROP INDEX ix_profiles_account_active; ANALYZE;
-- CON índice: CREATE INDEX ix_profiles_account_active ON profiles (accountId, isActive); ANALYZE;

\set accountId 12345

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT profileId, name, maxAgeRating, isActive
FROM profiles
WHERE accountId = :accountId AND isActive = 'Y'
ORDER BY profileId;

-- =====================================================================
-- COMANDOS DE CONTROL DE ÍNDICES (ejecutar antes de cada serie)
-- =====================================================================

-- Índice ix_payments_paidat (pagos)
-- DROP INDEX IF EXISTS ix_payments_paidat;
-- CREATE INDEX ix_payments_paidat ON payments (paidAt);
-- ANALYZE payments;

-- Índice ix_subs_account_start (suscripciones)
-- DROP INDEX IF EXISTS ix_subs_account_start;
-- CREATE INDEX ix_subs_account_start ON subscriptions (accountId, startsAt DESC);
-- ANALYZE subscriptions;

-- Índice ix_profiles_account_active (perfiles)
-- DROP INDEX IF EXISTS ix_profiles_account_active;
-- CREATE INDEX ix_profiles_account_active ON profiles (accountId, isActive);
-- ANALYZE profiles;

-- Índice GiST de la restricción ex_subs_no_overlap (no se puede dropear sin dropear la constraint)
-- Se puede verificar con: \d subscriptions