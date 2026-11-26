# Bitácora de IA — E-05: Documento de Requerimientos Funcionales, No Funcionales y Arquitectura

**Fecha:** 2026-11-25  
**Tarea:** E-05 — Documento de requerimientos funcionales y no funcionales implementados, con arquitectura de la aplicación para la sustentación.  
**Rama:** `integracion`

---

## (a) Auditoría del repositorio previa a la redacción

Se verificó directamente el código real de todos los módulos antes de redactar el documento para garantizar 100% trazabilidad sin elementos inventados:

- **Backend (`backend/src/modules/`):** 7 controladores y 31 endpoints REST verificados (`HealthController`, `AuthController`, `AccountController`, `CatalogController`, `PlaybackController`, `AdminCatalogController`, `ReportsController`).
- **Frontend (`frontend/src/App.tsx`):** 10 vistas y rutas reales en React 18 + Vite + TypeScript (`/login`, `/profiles`, `/`, `/title/:contentId`, `/watch/:sessionId`, `/my-list`, `/admin`, `/admin/catalog`, `/admin/catalog/new`, `/admin/catalog/:contentId`, `/admin/reports`, `/status`).
- **PostgreSQL (`sql/01_postgresql_ddl.sql`, `sql/06_optimizacion_relacional.sql`):** 5 tablas (`plans`, `accounts`, `profiles`, `subscriptions`, `payments`), función transaccional `sp_contratar_suscripcion` (M-02), triggers `trg_profiles_check_limits` y `ctr_subscription_requires_payment`, exclusión GiST `ex_subs_no_overlap`, roles mínimos (`cineconecta_owner`, `cineconecta_app`, `cineconecta_user`) e índices de M-05.
- **MongoDB (`mongodb/04_create_collections_and_indexes.js`, `05_datos_sinteticos.js`):** 5 colecciones (`catalog_items`, `user_lists`, `watch_activity`, `admin_users`, `counters`) con validación `$jsonSchema` (`strict` + `error`) e índices de K-02/K-06.
- **Pruebas automatizadas:** 6 suites Jest, 58 pruebas aprobadas (`npm test`) y compilación limpia (`npm run build`).

---

## (b) Entregables generados

1. **[docs/E05_Requerimientos_y_Arquitectura.md](../E05_Requerimientos_y_Arquitectura.md):**
   - Resumen ejecutivo del sistema y justificación de persistencia políglota.
   - Tabla trazable de **16 Requerimientos Funcionales** (`RF-01` a `RF-16`) agrupados por actor (Cliente, Administrador, Sistema/Operación) con endpoints exactos, motor de BD y reglas/rechazos validados.
   - Tabla verificable de **8 Requerimientos No Funcionales** (`RNF-01` a `RNF-08`) cubriendo seguridad, concurrencia/atomicidad, resiliencia políglota, integridad, rendimiento y mantenibilidad.
   - Arquitectura de la aplicación con **diagrama Mermaid**, **diagrama ASCII de respaldo**, descripción por capas, integración entre motores y flujos de las 3 peticiones críticas (contratación M-02, reproducción simulada e informe de consumo combinado).
2. **[docs/E05_Requerimientos_y_Arquitectura.docx](../E05_Requerimientos_y_Arquitectura.docx):**
   - Versión Word generada con `python-docx` con encabezados jerárquicos, tablas sombreadas legibles y bloques monoespaciados listos para entrega y sustentación.

---

## (c) Verificación recomendada para Edwar antes de sustentar

- Abrir `docs/E05_Requerimientos_y_Arquitectura.docx` en Word/LibreOffice para revisar visualmente las tablas y el diagrama ASCII.
- Si deseas agregar el nombre completo de todos los integrantes en la portada/encabezado del documento, puedes editar las primeras líneas de ambos archivos.
- Hacer commit de los documentos de E-05 en `integracion` junto con el resto de entregables.
