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
- Se utiliza PostgreSQL como motor relacional. Los perfiles históricos de cuentas con suscripción vencida se cargan con `isActive = 'N'`, porque el trigger exige una suscripción vigente para crear o activar perfiles.

## MongoDB (mongosh, base cineconecta)
1. mongodb/00_colecciones_auxiliares.js
2. mongodb/01_catalog_items_validator.js
3. mongodb/02_indices.js
4. Ejemplos: mongoimport --db cineconecta --collection catalog_items --file mongodb/ejemplos/mov_000101.json (igual para ser_000201 y doc_000301; watch_activity_ejemplo.json va a watch_activity)
5. mongodb/03_consultas.js

La consulta 2 incluye `explain("executionStats")` para comparar el plan y verificar el costo del ordenamiento. `type` y `genres` son filtros opcionales: `ix_catalog_browse` es especialmente útil cuando ambos llegan; para búsquedas solo por año o idioma se consideran los índices específicos.

La validación de MongoDB comprueba tipos, formatos y campos obligatorios. La coherencia entre el prefijo del `_id` y `type`, las fechas de publicación/retiro y la unicidad de `seasonNumber`/`episodeNumber` se valida en la aplicación. El índice único de `episodeId` evita repeticiones globales, por lo que también evita que un episodio se repita dentro de una misma serie; no se usa como única garantía de los números de episodio por temporada.
