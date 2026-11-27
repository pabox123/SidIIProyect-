-- Limpieza de cuentas de prueba demo_tx_*@example.com
-- Ejecutar con el usuario dueño (cineconecta_owner) en el SQL Editor de Neon
-- o con psql: psql -U cineconecta_owner -d neondb -f limpieza_owner.sql

\echo '=== Limpieza de datos de prueba demo_tx_* ==='
\echo 'Borrando en orden de llaves foráneas: payments -> subscriptions -> profiles -> accounts'

BEGIN;

DELETE FROM payments
WHERE subscriptionId IN (
  SELECT subscriptionId
  FROM subscriptions
  WHERE accountId IN (
    SELECT accountId FROM accounts WHERE email LIKE 'demo_tx_%@example.com'
  )
);

DELETE FROM subscriptions
WHERE accountId IN (
  SELECT accountId FROM accounts WHERE email LIKE 'demo_tx_%@example.com'
);

DELETE FROM profiles
WHERE accountId IN (
  SELECT accountId FROM accounts WHERE email LIKE 'demo_tx_%@example.com'
);

DELETE FROM accounts
WHERE email LIKE 'demo_tx_%@example.com';

COMMIT;

\echo ''
\echo '=== Cuentas demo_tx_ que quedan tras la limpieza ==='
SELECT count(*) AS cuentas_demo_tx_restantes
FROM accounts
WHERE email LIKE 'demo_tx_%@example.com';

\echo ''
\echo 'Si el resultado es 0, la limpieza fue completa.'