
\echo '=== Suscripciones superpuestas (debe devolver 0 rows) ==='
SELECT s1.accountId,
       s1.subscriptionId AS sub1,
       s2.subscriptionId AS sub2,
       s1.startsAt AS start1,
       s1.endsAt   AS end1,
       s2.startsAt AS start2,
       s2.endsAt   AS end2
FROM subscriptions s1
JOIN subscriptions s2
  ON s2.accountId = s1.accountId
 AND s2.subscriptionId <> s1.subscriptionId
 AND tsrange(s1.startsAt, s1.endsAt, '[)') && tsrange(s2.startsAt, s2.endsAt, '[)')
ORDER BY s1.accountId, s1.subscriptionId;


\echo '=== Suscripciones sin pago (debe devolver 0 rows) ==='
SELECT s.subscriptionId, s.accountId, s.planId, s.startsAt, s.endsAt
FROM subscriptions s
LEFT JOIN payments p ON p.subscriptionId = s.subscriptionId
WHERE p.paymentId IS NULL
ORDER BY s.subscriptionId;


\echo '=== Pagos sin suscripcion (debe devolver 0 rows) ==='
SELECT p.paymentId, p.subscriptionId, p.paidAt, p.amount, p.reference
FROM payments p
LEFT JOIN subscriptions s ON s.subscriptionId = p.subscriptionId
WHERE s.subscriptionId IS NULL
ORDER BY p.paymentId;


\echo '=== Resumen de cuentas de prueba ==='
SELECT a.accountId,
       a.email,
       COUNT(DISTINCT s.subscriptionId) AS n_subs,
       COUNT(DISTINCT p.paymentId)      AS n_pays
FROM accounts a
LEFT JOIN subscriptions s ON s.accountId = a.accountId
LEFT JOIN payments p      ON p.subscriptionId = s.subscriptionId
WHERE a.email LIKE 'demo_tx_%'
GROUP BY a.accountId, a.email
ORDER BY a.accountId;


\echo '=== Totales globales: suscripciones y pagos ==='
SELECT
  (SELECT COUNT(*) FROM subscriptions) AS total_subscriptions,
  (SELECT COUNT(*) FROM payments)      AS total_payments,
  CASE
    WHEN (SELECT COUNT(*) FROM subscriptions) = (SELECT COUNT(*) FROM payments)
    THEN 'OK: IGUALES'
    ELSE 'FAIL: DIFERENTES'
  END AS comparacion;

-- 6) Referencias duplicadas en payments (debe devolver 0 filas)
SELECT reference, COUNT(*) AS cnt
FROM payments
GROUP BY reference
HAVING COUNT(*) > 1;

-- 7) Suscripciones que no duran exactamente 30 dias (debe devolver 0 filas)
SELECT subscriptionId, accountId, startsAt, endsAt,
       endsAt - startsAt AS duracion
FROM subscriptions
WHERE endsAt <> startsAt + INTERVAL '30 days';

-- 8) Resumen de cuentas demo de la ejecucion.
-- demo_tx_accounts es una tabla temporal creada por el demo y no sobrevive
-- entre conexiones; por eso se filtra por el prefijo del correo.
SELECT a.accountId,
       a.email,
       COUNT(DISTINCT s.subscriptionId) AS n_subs,
       COUNT(DISTINCT p.paymentId)      AS n_pays
FROM accounts a
LEFT JOIN subscriptions s ON s.accountId = a.accountId
LEFT JOIN payments p      ON p.subscriptionId = s.subscriptionId
WHERE a.email LIKE 'demo_tx_%'
GROUP BY a.accountId, a.email
ORDER BY a.accountId;
