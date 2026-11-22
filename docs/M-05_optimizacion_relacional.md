# Optimización relacional

Proyecto CineConecta. Evidencia de optimización de consultas e índices en PostgreSQL.

## 1. Entorno y volumen de datos

| Parámetro | Valor |
|---|---|
| PostgreSQL | 18.7 sobre x86_64 Windows (msvc-19.44.35230, 64 bits) |
| CPU | AMD Ryzen 7 7445HS (6 núcleos, 12 hilos) |
| RAM | 16 GB |
| shared_buffers | 128 MB |
| work_mem | 4 MB |
| effective_cache_size | 4 GB |
| max_parallel_workers_per_gather | 2 |

Los datos salen de sql/04_datos_sinteticos.sql (15 cuentas base) y de sql/05_datos_volumen.sql ejecutado con n_accounts=100000. La carga completa tardó unos 20 segundos y se ejecutó ANALYZE al terminar.

| Tabla | Filas | Tamaño de tabla | Tamaño de índices | Total |
|---|---|---|---|---|
| subscriptions | 152.666 | 8,8 MB | 22 MB | 31 MB |
| payments | 152.666 | 10,2 MB | 16 MB | 26 MB |
| profiles | 136.603 | 10 MB | 12 MB | 22 MB |
| accounts | 100.015 | 13 MB | 6,1 MB | 20 MB |
| plans | 3 | 8 KB | 32 KB | 40 KB |
La carga de sql/05_datos_volumen.sql genera datos aleatorios sin semilla, por lo que los conteos varían un poco entre corridas. Las mediciones de las secciones 1, 4.4 y 5 salen de una primera carga (152.666 suscripciones y pagos). Las de las secciones 4.1 a 4.3 y 6.2 salen de una segunda carga en otra base temporal (152.252 suscripciones y pagos). En cada caso la comparación antes y después usa los mismos datos.

## 2. Consultas principales

Los parámetros existen en los datos generados.

| ID | Descripción | SQL |
|---|---|---|
| a | Ingresos por plan en un rango de fechas | `SELECT p.planId, p.name, COUNT(DISTINCT s.subscriptionId) AS num_subscriptions, SUM(pay.amount) AS total_revenue FROM payments pay JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId JOIN plans p ON p.planId = s.planId WHERE pay.paidAt >= '2026-11-01' AND pay.paidAt < '2026-12-01' GROUP BY p.planId, p.name ORDER BY total_revenue DESC;` |
| b | Plan vigente de una cuenta en un instante | `SELECT s.subscriptionId, s.planId, pl.name, s.startsAt, s.endsAt FROM subscriptions s JOIN plans pl ON pl.planId = s.planId WHERE s.accountId = 1 AND s.startsAt <= '2026-11-21' AND '2026-11-21' < s.endsAt;` |
| c | Perfiles activos de una cuenta | `SELECT COUNT(*) FROM profiles WHERE accountId = 100500 AND isActive = 'Y';` y el mismo filtro con listado ordenado por profileId |
| d | Historial de suscripciones y pagos de una cuenta | `SELECT s.subscriptionId, s.planId, pl.name, s.startsAt, s.endsAt, pay.paymentId, pay.paidAt, pay.amount, pay.reference FROM subscriptions s JOIN plans pl ON pl.planId = s.planId JOIN payments pay ON pay.subscriptionId = s.subscriptionId WHERE s.accountId = 1 ORDER BY s.startsAt DESC;` |
| e | Inicio de sesión por correo | `SELECT accountId, fullName, email, passwordHash FROM accounts WHERE LOWER(email) = LOWER('user100500@example.com');` |

## 3. Índices y justificación

La base tiene 15 índices, incluidos los que PostgreSQL crea para claves primarias, restricciones únicas y la restricción EXCLUDE.

| Índice | Columnas | Consulta o regla que sirve | Evidencia | Veredicto |
|---|---|---|---|---|
| pk_plans | planId | Clave primaria, referenciada desde subscriptions | Implícito | Necesario |
| uq_plans_name | name | Nombre de plan único | No medido | Necesario por regla de negocio |
| pk_accounts | accountId | Clave primaria, referenciada desde profiles y subscriptions | Implícito | Necesario |
| ux_accounts_email_ci | LOWER(email) | Consulta e | Index Scan, 1 fila, 4 buffers | Útil |
| pk_profiles | profileId | Clave primaria | Implícito | Necesario |
| ux_profiles_name_ci | accountId, LOWER(name) | Nombre de perfil único por cuenta | Sin uso en las cinco consultas | Necesario por regla de negocio |
| ix_profiles_account_active | accountId, isActive | Consulta c | Index Only Scan, 1 fila, 3 buffers, Heap Fetches 0 | Útil |
| pk_subscriptions | subscriptionId | Clave primaria, referenciada desde payments | Implícito | Necesario |
| ix_subs_plan | planId | Consultas por plan y clave foránea fk_subs_plan | Cubre la clave foránea | Útil |
| ix_subs_account_start | accountId, startsAt DESC | Consultas b y d | Index Scan frente a Bitmap Heap Scan sobre el GiST (sección 5) | Útil |
| ex_subs_no_overlap | accountId, tsrange(startsAt, endsAt, '[)') | Restricción de no superposición | Respalda la restricción EXCLUDE | Necesario |
| pk_payments | paymentId | Clave primaria | Implícito | Necesario |
| uq_payments_subscription | subscriptionId | Relación uno a uno y uniones con subscriptions | Usado en el plan de la consulta a | Necesario |
| uq_payments_reference | reference | Referencia de pago única | Sin uso en las cinco consultas | Necesario por regla de negocio |
| ix_payments_paidat | paidAt | Consulta a | Bitmap Index Scan con rango selectivo, Seq Scan con rango amplio (sección 4) | Útil con rangos selectivos |

Los contadores idx_scan de pg_stat_user_indexes no se usan como evidencia de utilidad. Incluyen la actividad de la carga masiva, donde las validaciones de claves y de la restricción EXCLUDE recorren los índices por cada fila insertada. Los índices ux_profiles_name_ci y uq_payments_reference no aparecen en las cinco consultas, pero existen para proteger reglas de unicidad y no se recomienda quitarlos.

Claves foráneas. Las cuatro tienen un índice que empieza por la columna de la clave, por lo que no hace falta agregar otros:

| Clave foránea | Índice que la cubre |
|---|---|
| fk_profiles_account | ix_profiles_account_active y ux_profiles_name_ci |
| fk_subs_account | ix_subs_account_start y ex_subs_no_overlap |
| fk_subs_plan | ix_subs_plan |
| fk_payments_subscription | uq_payments_subscription |

Los índices ix_subs_account_start y ex_subs_no_overlap no son redundantes entre sí. El primero es un B-tree que sirve las consultas por cuenta y fecha. El segundo es un GiST necesario para la restricción de no superposición.

## 4. Comparación antes y después: consulta a

La consulta a se eligió porque es donde el índice ix_payments_paidat produce una diferencia medible. Con un rango de noviembre de 2026 se leen 102 de 152.666 pagos (0,07 %).

### 4.1 Plan antes (sin ix_payments_paidat)

Segunda carga: 152.252 suscripciones y pagos. El rango de noviembre de 2026 contiene 82 pagos (0,05 %).

~~~
Sort  (cost=6019.36..6019.37 rows=3 width=52) (actual time=31.197..36.334 rows=3 loops=1)
  Sort Key: (sum(pay.amount)) DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=2391
  ->  GroupAggregate  (cost=4413.58..6019.34 rows=3 width=52) (actual time=31.171..36.327 rows=3 loops=1)
        Group Key: p.name
        Buffers: shared hit=2391
        ->  Incremental Sort  (cost=4413.58..6014.25 rows=673 width=23) (actual time=31.148..36.305 rows=82 loops=1)
              Sort Key: p.name, s.subscriptionid
              Presorted Key: p.name
              Full-sort Groups: 2  Sort Method: quicksort
              Pre-sorted Groups: 2  Sort Method: quicksort
              Buffers: shared hit=2391
              ->  Nested Loop  (cost=3617.48..5979.50 rows=673 width=23) (actual time=8.706..36.251 rows=82 loops=1)
                    Join Filter: (s.planid = p.planid)
                    Rows Removed by Join Filter: 164
                    Buffers: shared hit=2391
                    ->  Index Scan using uq_plans_name on plans p  (cost=0.13..12.18 rows=3 width=12) (actual time=0.006..0.012 rows=3 loops=1)
                          Buffers: shared hit=2
                    ->  Materialize  (cost=3617.35..5938.72 rows=673 width=15) (actual time=2.899..12.070 rows=82 loops=3)
                          Storage: Memory  Maximum Storage: 20kB
                          Buffers: shared hit=2389
                          ->  Gather  (cost=3617.35..5935.36 rows=673 width=15) (actual time=8.691..36.155 rows=82 loops=1)
                                Workers Planned: 1
                                Workers Launched: 1
                                Buffers: shared hit=2389
                                ->  Parallel Hash Join  (cost=2617.35..4868.06 rows=396 width=15) (actual time=4.267..10.424 rows=41 loops=2)
                                      Hash Cond: (s.subscriptionid = pay.subscriptionid)
                                      Buffers: shared hit=2389
                                      ->  Parallel Seq Scan on subscriptions s  (cost=0.00..2015.60 rows=89560 width=8) (actual time=0.005..6.000 rows=152252 loops=1)
                                            Buffers: shared hit=1120
                                      ->  Parallel Hash  (cost=2612.40..2612.40 rows=396 width=11) (actual time=4.210..4.211 rows=41 loops=2)
                                            Buckets: 1024  Batches: 1  Memory Usage: 40kB
                                            Buffers: shared hit=1269
                                            ->  Parallel Seq Scan on payments pay  (cost=0.00..2612.40 rows=396 width=11) (actual time=0.007..8.355 rows=82 loops=1)
                                                  Filter: ((paidat >= '2026-11-01') AND (paidat < '2026-12-01'))
                                                  Rows Removed by Filter: 152170
                                                  Buffers: shared hit=1269
Planning Time: 0.435 ms
Execution Time: 36.432 ms
~~~

### 4.2 Plan después (con ix_payments_paidat)

~~~
Sort  (cost=4270.37..4270.37 rows=3 width=52) (actual time=10.881..10.883 rows=3 loops=1)
  Sort Key: (sum(pay.amount)) DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=1197
  ->  GroupAggregate  (cost=2180.23..4270.34 rows=3 width=52) (actual time=10.858..10.878 rows=3 loops=1)
        Group Key: p.name
        Buffers: shared hit=1197
        ->  Incremental Sort  (cost=2180.23..4265.12 rows=692 width=22) (actual time=10.843..10.861 rows=82 loops=1)
              Sort Key: p.name, s.subscriptionid
              Presorted Key: p.name
              Full-sort Groups: 2  Sort Method: quicksort
              Pre-sorted Groups: 2  Sort Method: quicksort
              Buffers: shared hit=1197
              ->  Nested Loop  (cost=1142.14..4229.25 rows=692 width=22) (actual time=0.105..10.819 rows=82 loops=1)
                    Join Filter: (s.planid = p.planid)
                    Rows Removed by Join Filter: 164
                    Buffers: shared hit=1197
                    ->  Index Scan using uq_plans_name on plans p  (cost=0.13..12.18 rows=3 width=12) (actual time=0.004..0.008 rows=3 loops=1)
                          Buffers: shared hit=2
                    ->  Materialize  (cost=1142.01..4187.66 rows=692 width=14) (actual time=0.034..3.598 rows=82 loops=3)
                          Storage: Memory  Maximum Storage: 20kB
                          Buffers: shared hit=1195
                          ->  Hash Join  (cost=1142.01..4184.20 rows=692 width=14) (actual time=0.098..10.770 rows=82 loops=1)
                                Hash Cond: (s.subscriptionid = pay.subscriptionid)
                                Buffers: shared hit=1195
                                ->  Seq Scan on subscriptions s  (cost=0.00..2642.52 rows=152252 width=8) (actual time=0.008..5.402 rows=152252 loops=1)
                                      Buffers: shared hit=1120
                                ->  Hash  (cost=1133.36..1133.36 rows=692 width=10) (actual time=0.083..0.084 rows=82 loops=1)
                                      Buckets: 1024  Batches: 1  Memory Usage: 12kB
                                      Buffers: shared hit=75
                                      ->  Bitmap Heap Scan on payments pay  (cost=15.51..1133.36 rows=692 width=10) (actual time=0.017..0.075 rows=82 loops=1)
                                            Recheck Cond: ((paidat >= '2026-11-01') AND (paidat < '2026-12-01'))
                                            Heap Blocks: exact=72
                                            Buffers: shared hit=75
                                            ->  Bitmap Index Scan on ix_payments_paidat  (cost=0.00..15.34 rows=692 width=0) (actual time=0.007..0.007 rows=82 loops=1)
                                                  Index Cond: ((paidat >= '2026-11-01') AND (paidat < '2026-12-01'))
                                                  Index Searches: 1
                                                  Buffers: shared hit=3
Planning Time: 0.270 ms
Execution Time: 10.921 ms
~~~

### 4.3 Mediciones con rango selectivo

Cinco ejecuciones por caso, descartando la primera. Misma consulta, mismos parámetros y mismos datos en ambos casos.

| Caso | Mínimo | Mediana | Máximo |
|---|---|---|---|
| Sin ix_payments_paidat | 36,43 ms | 37,67 ms | 41,54 ms |
| Con ix_payments_paidat | 10,92 ms | 11,63 ms | 12,31 ms |

| Métrica | Sin índice | Con índice |
|---|---|---|
| Nodo sobre payments | Parallel Seq Scan | Bitmap Heap Scan con Bitmap Index Scan |
| Filas leídas de payments | 152.252 | 82 |
| Buffers (shared hit) | 2.391 | 1.197 |
| Planning Time | 0,435 ms | 0,270 ms |

Con el índice la consulta es 3,2 veces más rápida (mediana de 37,67 a 11,63 ms) y lee la mitad de los buffers. El resto del plan sigue igual, incluido un Seq Scan sobre subscriptions de 1.120 buffers, que explica el tiempo que queda.

### 4.4 Mediciones con rango amplio

Rango del año 2026 completo, unas 65.000 filas (43 % de la tabla).

| Métrica | Sin índice | Con índice |
|---|---|---|
| Execution Time | 115,5 ms | 124,5 ms |
| Nodo sobre payments | Seq Scan | Seq Scan |
| Buffers | 2.403 | 2.406 |

Con el 43 % de la tabla, el planner no usa el índice, porque recorrer toda la tabla cuesta menos que hacer miles de accesos aleatorios al heap. El índice ayuda solo cuando el rango es estrecho. No se midió a partir de qué porcentaje cambia el plan.

## 5. Comparación complementaria: consulta b

La consulta b busca el plan vigente de una cuenta (accountId = 1) en un instante. Es la que se ejecuta al iniciar una reproducción para el informe de consumo. Cinco ejecuciones por caso.

| Métrica | Sin ix_subs_account_start | Con ix_subs_account_start |
|---|---|---|
| Nodo sobre subscriptions | Bitmap Heap Scan sobre el GiST ex_subs_no_overlap, con accountId = 1 | Index Scan sobre ix_subs_account_start, con accountId = 1 y startsAt <= instante, y filtro sobre endsAt |
| Execution Time (mediana) | 1,30 ms | 0,07 ms |
| Planning Time (mediana) | 4,4 ms | 4,9 ms |
| Buffers (shared hit) | 4 | 2 a 3 |

La diferencia relativa es de unas 18,6 veces, pero la absoluta es de poco más de un milisegundo, y la cuenta 1 tiene una sola suscripción. No se midió con una cuenta con historial largo.

## 6. Interpretación

### 6.1 Qué cambió en los planes (reemplaza el primer párrafo)

En la consulta a, sin índice PostgreSQL recorre toda la tabla payments con un Parallel Seq Scan y descarta 152.170 de 152.252 filas. Con el índice, un Bitmap Index Scan localiza los 82 pagos del rango y el Bitmap Heap Scan lee 72 bloques. El resto del plan no cambia.

### 6.2 Tamaño y costo de escritura (reemplaza la sección completa)

| Índice | Tamaño en disco | Tabla asociada |
|---|---|---|
| ix_payments_paidat | 3,4 MB | payments, 10,2 MB |
| ix_subs_account_start | 4,7 MB | subscriptions, 8,8 MB |

Para medir el costo de escritura se creó una tabla de prueba con la estructura de payments, sin triggers ni restricciones de otras tablas, y se insertaron 150.000 filas con INSERT ... SELECT desde generate_series, tres veces por caso.

| Caso | Repetición 1 | Repetición 2 | Repetición 3 | Mediana |
|---|---|---|---|---|
| Sin índice en paidAt | 374,96 ms | 302,46 ms | 364,31 ms | 364,31 ms |
| Con índice en paidAt | 738,80 ms | 706,12 ms | 1.170,60 ms | 738,80 ms |

El índice duplica el tiempo de una carga masiva (de 364 a 739 ms para 150.000 filas). La tercera repetición con índice (1.170 ms) es un valor alto aislado y por eso se usa la mediana. En la aplicación se inserta un pago por cada contratación, de modo que ese costo es despreciable en el uso normal. Solo pesa en cargas masivas, como la de sql/05_datos_volumen.sql, donde podría crearse el índice después de cargar los datos.

## 7. Limitaciones

- Las mediciones corresponden a 100.000 cuentas y a un solo equipo local. No se repitieron con un volumen mayor.
- Se midieron cinco consultas definidas por el equipo, no la carga real de la aplicación.
- No se evaluó particionado de payments por fecha. Con unos 150.000 pagos la tabla ocupa 10 MB y no se justifica a este volumen.
- Los parámetros del servidor (shared_buffers de 128 MB y work_mem de 4 MB) son los de una instalación local. Otro entorno puede producir otros planes.

## 8. Cómo reproducir

~~~
psql -U postgres -c "CREATE DATABASE cineconecta_test_m05;"
psql -U postgres -d cineconecta_test_m05 -v app_password='clave_de_prueba' -f sql/01_postgresql_ddl.sql
psql -U postgres -d cineconecta_test_m05 -f sql/04_datos_sinteticos.sql
psql -U postgres -d cineconecta_test_m05 -v n_accounts=100000 -f sql/05_datos_volumen.sql
psql -U postgres -d cineconecta_test_m05 -c "ANALYZE;"
psql -U postgres -d cineconecta_test_m05 -f sql/06_optimizacion_relacional.sql
~~~

La medición manual de la consulta a sigue estos pasos. Antes: DROP INDEX ix_payments_paidat; ANALYZE payments; y EXPLAIN (ANALYZE, BUFFERS) con la consulta. Después: CREATE INDEX ix_payments_paidat ON payments (paidAt); ANALYZE payments; y la misma medición. Se repite cinco veces por caso y se calcula la mediana.

Para borrar la base de prueba: DROP DATABASE cineconecta_test_m05; y DROP ROLE IF EXISTS cineconecta_user, cineconecta_app, cineconecta_owner;
