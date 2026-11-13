# CineConecta - Entrega 1

## Relacional
- sql/01_postgresql_ddl.sql: tablas, restricciones, triggers y procedimiento (psql -f, o pegar en Supabase/Neon).
- sql/02_oracle_ddl.sql: variante Oracle (SID ESTUD).
- sql/03_consulta_verificacion_reproduccion.sql: consulta de verificación.

## MongoDB (mongosh, base cineconecta)
1. mongodb/00_colecciones_auxiliares.js
2. mongodb/01_catalog_items_validator.js
3. mongodb/02_indices.js
4. Ejemplos: mongoimport --db cineconecta --collection catalog_items --file mongodb/ejemplos/mov_000101.json (igual para ser_000201 y doc_000301; watch_activity_ejemplo.json va a watch_activity)
5. mongodb/03_consultas.js
