# CineConecta - Entrega 1

## Relacional
- sql/01_postgresql_ddl.sql: tablas, restricciones, triggers, procedimiento **y roles/privilegios mínimos** (psql -f, o pegar en Supabase/Neon).
  - Ejecutar pasando la contraseña del usuario de app como variable: `psql -v app_password='tu_secreto' -f sql/01_postgresql_ddl.sql` (o `psql -v app_password="$APP_PASSWORD" -f ...`).
  - Roles creados: `cineconecta_owner` (DDL, NOLOGIN), `cineconecta_app` (DML runtime, NOLOGIN), `cineconecta_user` (LOGIN, miembro de app).
  - Privilegios: REVOKE CREATE/EXECUTE de PUBLIC; GRANTs mínimos por tabla.
  - Funciones SECURITY DEFINER (owner = cineconecta_owner, SET search_path = public, pg_temp):
    - `sp_contratar_suscripcion`: transacción atómica suscripción+pago, requiere FOR UPDATE/INSERT internos.
    - `fn_profiles_check_limits`: trigger que valida límite de perfiles, requiere FOR UPDATE en accounts.
    - La app solo necesita EXECUTE en estas dos funciones; NO tiene UPDATE/INSERT directo en accounts/subscriptions/payments.
  - `fn_subscription_requires_payment`: CONSTRAINT TRIGGER AFTER DEFERRABLE (no SECURITY DEFINER), se valida al COMMIT con privilegios del owner de la tabla.
- sql/02_oracle_ddl.sql: DDL compatible con Oracle/SQL Developer para generar el diagrama relacional. No es el script de ejecución de la aplicación; PostgreSQL es el motor implementado.
- sql/03_consulta_verificacion_reproduccion.sql: consulta de verificación.
- sql/04_datos_sinteticos.sql: datos base (~15 cuentas) para pruebas funcionales, demo y semilla de IDs para MongoDB.
- sql/05_datos_volumen.sql: datos masivos parametrizables (default 100k cuentas) para mediciones de optimización (M-05).
- Se utiliza PostgreSQL como motor relacional. Los perfiles históricos de cuentas con suscripción vencida se cargan con `isActive = 'N'`, porque el trigger exige una suscripción vigente para crear o activar perfiles.

## Datos de prueba (M-03)

### Contraseña de prueba compartida
Todas las cuentas de datos sintéticos usan la misma contraseña: **`Demo2026!`**
Hash bcrypt (prefijo $2a$, costo 10): `$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2`

### Mapa de IDs (caso de prueba → accountId | profileIds | plan | vigencia)
Este es el contrato que usan Krystal (Mongo), Edwar y Balanta.

| Caso | Descripción | accountId | profileIds (maxAgeRating, isActive) | plan | vigencia (startsAt → endsAt) |
|------|-------------|-----------|-------------------------------------|------|------------------------------|
| 1a | Vigente Básico | 1 | 1 (18, Y) | Básico (1) | 2026-11-10 → 2026-12-10 |
| 1b | Vigente Estándar | 2 | 2 (18, Y), 3 (12, Y) | Estándar (2) | 2026-11-12 → 2026-12-12 |
| 1c | Vigente Premium | 3 | 4 (18, Y), 5 (18, Y), 6 (12, Y), 7 (7, Y) | Premium (3) | 2026-11-15 → 2026-12-15 |
| 2 | Vencida sin vigente | 4 | 8 (18, Y), 9 (12, N) | Básico (1) | 2026-10-01 → 2026-10-31 (vencida) |
| 3 | Historial consecutivo | 5 | 10 (18, Y), 11 (12, Y), 12 (7, Y) | Básico→Estándar→Premium→Premium (vigente) | 2026-01-01→31, 2026-02-01→03-03, 2026-03-03→04-02, 2026-11-10→12-10 |
| 4 | Nunca suscripción (demo contratación) | 6 | 13 (18, Y), 14 (12, Y) | — | — |
| 5 | Sin suscripción (demo concurrencia) | 7 | 15 (18, Y) | — | — |
| 6 | Exceso perfiles (3 activos) | 8 | 16 (18, Y), 17 (12, Y), 18 (7, Y) | Premium (3) VENCIDA | 2026-09-20 → 2026-10-20 (vencida) |
| 7 | Básico (max 1) con 1 activo | 9 | 19 (18, Y) | Básico (1) | 2026-11-12 → 2026-12-12 |
| 8 | Perfiles restrictivos + histórico | 10 | 20 (7, Y), 21 (12, Y), 22 (18, N) | Estándar (2) | 2026-11-08 → 2026-12-08 |
| 9a | Vence pronto (27 nov) | 11 | 23 (18, Y) | Básico (1) | 2026-10-28 → 2026-11-27 |
| 9b | Borde semiabierto | 12 | 24 (18, Y) | Básico→Estándar | 2026-11-01→12-01, 2026-12-01→12-31 |
| — | Cuentas extra | 13 | 25 (18, Y), 26 (12, Y) | Estándar (2) | 2026-11-13 → 2026-12-13 |
| — | Cuentas extra | 14 | 27 (18, Y), 28 (12, Y) | Premium (3) | 2026-11-14 → 2026-12-14 |
| — | Cuentas extra | 15 | 29 (18, Y), 30 (7, Y) | Estándar (2) | 2026-11-16 → 2026-12-16 |

### Ejecución de datos base (04_datos_sinteticos.sql)
```bash
# Requiere base ya inicializada con 01_postgresql_ddl.sql
psql -U postgres -d cineconecta_test_m03 -f sql/04_datos_sinteticos.sql
# O en una línea con 01 y 04:
psql -U postgres -c "CREATE DATABASE cineconecta_test_m03;" && \
psql -U postgres -d cineconecta_test_m03 -f sql/01_postgresql_ddl.sql && \
psql -U postgres -d cineconecta_test_m03 -f sql/04_datos_sinteticos.sql
```

### Ejecución de datos de volumen (05_datos_volumen.sql)
```bash
# Default: 100k cuentas, ~200k perfiles, ~150k subs, ~150k pagos
psql -U postgres -d cineconecta_test_m03 -f sql/05_datos_volumen.sql

# Personalizado:
psql -U postgres -d cineconecta_test_m03 -v n_accounts=50000 -v batch_size=2000 -f sql/05_datos_volumen.sql
```
Volumen por defecto (100k cuentas): ~100k accounts, ~200k profiles, ~150k subscriptions, ~150k payments. Tiempo típico: 30-60s.

### Pruebas funcionales con cineconecta_user (datos base)
```bash
# Contratación exitosa (cuenta 6, nunca suscripción)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(6, 1, 'PAY-TEST-001');"

# Rechazo por suscripción vigente (cuenta 1)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(1, 1, 'PAY-TEST-002');"

# Rechazo por exceso perfiles (cuenta 8 con 3 activos, intenta Básico max 1)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(8, 1, 'PAY-TEST-003');"
```

## MongoDB (mongosh, base cineconecta)
1. mongodb/00_colecciones_auxiliares.js
2. mongodb/01_catalog_items_validator.js
3. mongodb/02_indices.js
4. Ejemplos: mongoimport --db cineconecta --collection catalog_items --file mongodb/ejemplos/mov_000101.json (igual para ser_000201 y doc_000301; watch_activity_ejemplo.json va a watch_activity)
5. mongodb/03_consultas.js

La consulta 2 incluye `explain("executionStats")` para comparar el plan y verificar el costo del ordenamiento. `type` y `genres` son filtros opcionales: `ix_catalog_browse` es especialmente útil cuando ambos llegan; para búsquedas solo por año o idioma se consideran los índices específicos.

La validación de MongoDB comprueba tipos, formatos y campos obligatorios. La coherencia entre el prefijo del `_id` y `type`, las fechas de publicación/retiro y la unicidad de `seasonNumber`/`episodeNumber` se valida en la aplicación. El índice único de `episodeId` evita repeticiones globales, por lo que también evita que un episodio se repita dentro de una misma serie; no se usa como única garantía de los números de episodio por temporada.
