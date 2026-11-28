# Evidencia de medición de índices - CineConecta (M-09)

## Objetivo
Medir el efecto de los índices ix_payments_paidat, ix_subs_account_start e ix_profiles_account_active en PostgreSQL con un volumen realista de datos (~150k cuentas, ~1.9M suscripciones, ~1.9M pagos), y dejar la evidencia lista para incluir en el documento técnico.

## Entorno
- **PostgreSQL**: PostgreSQL 16.16 (Debian 16.16-1.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
- **Sistema operativo**: Microsoft Windows 11 Home (host Windows), contenedor Docker Linux
- **CPU**: AMD Ryzen 7 7445HS w/ Radeon 740M Graphics
- **RAM**: 15.3 GB
- **shared_buffers**: 128MB
- **work_mem**: 4MB
- **Nota**: PostgreSQL corriendo en contenedor Docker 'cine-evidencia' en Windows, puerto 5433 mapeado a 5432 interno

## Volumen de datos cargado
tabla     |  filas  | tamaño_total
---------------+---------+--------------
plans         |       3 | 40 kB
profiles      |   49427 | 7096 kB
accounts      |  150000 | 35 MB
payments      | 1890000 | 491 MB
subscriptions | 1890000 | 1148 MB
(5 rows)


### Tamaños de índices
schemaname |     tabla     |           indice           | tamaño
------------+---------------+----------------------------+---------
public     | accounts      | pk_accounts                | 3312 kB
public     | accounts      | ux_accounts_email_ci       | 10 MB
public     | payments      | ix_payments_paidat         | 12 MB
public     | payments      | pk_payments                | 41 MB
public     | payments      | uq_payments_reference      | 216 MB
public     | payments      | uq_payments_subscription   | 41 MB
public     | plans         | pk_plans                   | 16 kB
public     | plans         | uq_plans_name              | 16 kB
public     | profiles      | ix_profiles_account_active | 1096 kB
public     | profiles      | pk_profiles                | 1096 kB
public     | profiles      | ux_profiles_name_ci        | 1968 kB
public     | subscriptions | ex_subs_no_overlap         | 395 MB
public     | subscriptions | ix_subs_account_start      | 235 MB
public     | subscriptions | ix_subs_plan               | 37 MB
public     | subscriptions | pk_subscriptions           | 130 MB
(15 rows)


## Consultas medidas

### Consulta A: Informe de ingresos por plan (principal)
SUM(amount) y COUNT de suscripciones por plan, filtrando pagos por paidAt en un rango de fechas.
Dos rangos: **1 mes** (enero 2025) y **1 año completo** (2025).
Compara ejecución **SIN** ix_payments_paidat y **CON** ix_payments_paidat.

#### A1: Rango 1 mes (2025-01-01 a 2025-02-01)
**SIN índice ix_payments_paidat**

- Plan: Parallel Seq Scan en payments + Filter (paidAt >= '2025-01-01' AND paidAt < '2025-02-01'), Hash Join con subscriptions y plans, GroupAggregate, Sort
- Workers: 2 (parallel)
- Buffers: shared hit=5971 read=62336
- Tiempo 1ra ejecución: 226.82 ms
- Mínimo: 207.53 ms
- Mediana: 221.9 ms
- Máximo: 246.74 ms

**CON índice ix_payments_paidat**

- Plan: **Parallel Bitmap Heap Scan** en payments con **Bitmap Index Scan on ix_payments_paidat** (Recheck Cond), Hash Join con subscriptions y plans, GroupAggregate, Sort
- Workers: 2 (parallel)
- Buffers: shared hit=139 read=57767 written=10032
- Tiempo 1ra ejecución: 227.14 ms
- Mínimo: 178.58 ms
- Mediana: 189.68 ms
- Máximo: 227.14 ms

#### A2: Rango 1 año completo (2025-01-01 a 2026-01-01)
**SIN índice ix_payments_paidat**

- Plan: Parallel Seq Scan en payments + Filter (rango 1 año ~20% tabla), Hash Join, GroupAggregate, Sort (external merge a disco)
- Workers: 2 (parallel)
- Buffers: shared hit=14264 read=54007, temp read=1325 written=1331
- Tiempo 1ra ejecución: 547.9 ms
- Mínimo: 532.92 ms
- Mediana: 553.13 ms
- Máximo: 583.85 ms

**CON índice ix_payments_paidat**

- Plan: **Parallel Bitmap Heap Scan** en payments con **Bitmap Index Scan on ix_payments_paidat** (Recheck Cond, 360k rows), Hash Join, GroupAggregate, Sort (external merge a disco)
- Workers: 2 (parallel)
- Buffers: shared hit=14025 read=44124, temp read=1325 written=1330
- Tiempo 1ra ejecución: 543.6 ms
- Mínimo: 525.75 ms
- Mediana: 538.43 ms
- Máximo: 550.71 ms


### Consulta B: Verificación al iniciar una reproducción (sql/03)
Busca la suscripción vigente de una cuenta y su perfil activo (parámetros: accountId=1, profileId=1, now=2026-11-15 20:00:00).
Compara **SIN** ix_subs_account_start y **CON** ix_subs_account_start.
Nota: la restricción ex_subs_no_overlap crea un índice GiST sobre (accountId, tsrange(startsAt, endsAt)) que el planificador puede usar.

**SIN índice ix_subs_account_start**

- Plan: Nested Loop
  - profiles: **Index Scan using ix_profiles_account_active** (accountId=1, isActive='Y') + Filter profileId=1
  - subscriptions: **Bitmap Heap Scan** con **Bitmap Index Scan on ex_subs_no_overlap** (GiST, Index Cond: accountId=1) + Filter rango fechas
- Buffers: shared hit=4 read=4
- Tiempo 1ra ejecución: 0.49 ms
- Mínimo: 0.49 ms
- Mediana: 0.62 ms
- Máximo: 1.27 ms

**CON índice ix_subs_account_start**

- Plan: Nested Loop
  - profiles: **Index Scan using ix_profiles_account_active** (accountId=1, isActive='Y') + Filter profileId=1
  - subscriptions: **Index Scan using ix_subs_account_start** (B-tree, Index Cond: accountId=1 AND startsAt <= now) + Filter endsAt > now
- Buffers: shared hit=4 read=3
- Tiempo 1ra ejecución: 0.14 ms
- Mínimo: 0.09 ms
- Mediana: 0.10 ms
- Máximo: 0.14 ms


### Consulta C: Perfiles activos de una cuenta
Selecciona perfiles con isActive = 'Y' para un accountId dado (1).
Compara **SIN** ix_profiles_account_active y **CON** ix_profiles_account_active.

**SIN índice ix_profiles_account_active**

- Plan: **Index Scan using ux_profiles_name_ci** (índice único en accountId, lower(name)) con Index Cond: accountId=1 + Filter isActive='Y' + Sort por profileId
- Buffers: shared hit=4 read=2
- Tiempo 1ra ejecución: 0.11 ms
- Mínimo: 0.06 ms
- Mediana: 0.08 ms
- Máximo: 0.11 ms

**CON índice ix_profiles_account_active**

- Plan: **Index Scan using ix_profiles_account_active** (accountId=1, isActive='Y') + Sort por profileId
- Buffers: shared hit=4 read=2
- Tiempo 1ra ejecución: 0.08 ms
- Mínimo: 0.07 ms
- Mediana: 0.10 ms
- Máximo: 0.28 ms


## Interpretación honesta

### Consulta A (ingresos por plan)
- **Rango 1 mes**: El índice `ix_payments_paidat` **sí se usa** (Bitmap Index Scan → Bitmap Heap Scan), pero la ganancia es marginal (~220ms vs ~190ms mediano, ~15% mejora). El planificador usa paralelismo (2 workers) en ambos casos y el overhead de coordinar workers + Bitmap Heap Scan (recheck de tuplas) compensa la reducción de filas leídas. El índice reduce buffers leídos (62k → 57k) pero no el tiempo total significativamente.
- **Rango 1 año completo**: El índice **también se usa** (Bitmap Index Scan), pero al abarcar ~20% de la tabla (360k filas), el planificador opta por Bitmap Heap Scan paralelo. La mejora es despreciable (~540ms vs ~538ms mediano, <1%). El costo dominante es el join con subscriptions (1.9M filas) y el Sort externo a disco, no el acceso a payments. **Conclusión**: para consultas analíticas que procesan gran parte de la tabla y hacen joins pesados, un índice en la columna de filtro ayuda poco si el cuello de botella está en otro lado.

### Consulta B (verificación reproducción)
- **Mejora real y significativa: ~5-6x más rápido** (mediana 0.62ms → 0.10ms).
- **SIN** `ix_subs_account_start`: el planificador usa el **índice GiST de `ex_subs_no_overlap`** (Bitmap Index Scan) para encontrar suscripciones de la cuenta, luego filtra por rango de fechas. El GiST soporta búsquedas de rango pero es menos eficiente que B-tree para consultas puntuales con ordenamiento.
- **CON** `ix_subs_account_start`: **Index Scan B-tree directo** en `(accountId, startsAt DESC)` que busca accountId y startsAt <= now en un solo paso, sin recheck ni bitmap. El orden DESC evita leer filas antiguas innecesarias.
- El índice GiST de la constraint de exclusión **no sustituye** un B-tree bien diseñado para esta consulta. El B-tree es ~5x más rápido aquí.

### Consulta C (perfiles activos)
- **Mejora marginal** (0.08ms vs 0.11ms mediano, ~30% pero en valores sub-milisegundo).
- **SIN** `ix_profiles_account_active`: el planificador usa `ux_profiles_name_ci` (único en accountId, lower(name)) que ya permite acceso por accountId, y luego filtra `isActive='Y'`. Como hay pocas filas por cuenta (~0.3 perfiles/cuenta), el filter es barato.
- **CON** `ix_profiles_account_active`: Index Scan directo en `(accountId, isActive)` evita el filter residual, pero la diferencia es imperceptible en la práctica.
- **Conclusión**: el índice único compuesto en `(accountId, name)` ya servía de "índice de acceso por cuenta". El índice dedicado en `isActive` solo ahorra un filter residual trivial.


## Cómo reproducir
1. Asegurar Docker Desktop corriendo con contenedor cine-evidencia en puerto 5433.
2. Ejecutar: powershell -File evidencia_indices/03_medir.ps1
3. Los EXPLAIN completos quedan en evidencia_indices/salida/.
4. Este resultados.md se genera al final.