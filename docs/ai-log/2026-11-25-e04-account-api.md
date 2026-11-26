# Bitácora de IA — E-04: API de Cuenta, Suscripciones, Pagos y Perfiles

**Fecha:** 2026-11-25  
**Tarea:** E-04 — API de cuenta: consultar suscripciones y pagos, contratar suscripción (función transaccional M-02), crear, listar y desactivar/activar perfiles, con rechazos por suscripción vencida y por exceso de perfiles.  
**Rama:** `feat/backend` (integrada en `integracion`)

---

## (a) Hallazgos de la auditoría previa (Fase 1)

1. **Función transaccional M-02 (`sql/01_postgresql_ddl.sql`):**
   - Firma exacta: `sp_contratar_suscripcion(p_accountId INTEGER, p_planId INTEGER, p_reference VARCHAR, p_aprobado BOOLEAN DEFAULT true) RETURNS INTEGER` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`, `EXECUTE` concedido a `cineconecta_app`).
   - Serializa concurrencia con `SELECT ... FOR UPDATE` sobre `accounts`, valida plan, pago aprobado, ausencia de suscripción vigente `[startsAt, endsAt)` y que perfiles activos `<= maxProfiles` del nuevo plan, e inserta atómicamente suscripción (30 días exactos) + pago.
   - Errores lanzados: `P0001` (`La cuenta % no existe`, `El plan % no existe`, `Pago no aprobado...`, `La cuenta % ya tiene una suscripción vigente`, `Desactive % perfil(es) antes de contratar este plan`), `23P01` (`ex_subs_no_overlap`) y `23505` (`uq_payments_reference`).
2. **Trigger de perfiles (`trg_profiles_check_limits`):**
   - Valida en `INSERT` y `UPDATE OF isActive` (`NEW.isActive = 'Y'`) que exista suscripción vigente (`P0001`: `La cuenta % no tiene una suscripción vigente`) y que el conteo activo no supere `maxProfiles` (`P0001`: `La cuenta % alcanzó el máximo de % perfiles activos`).
3. **Permisos del usuario de BD (`cineconecta_user` vía `cineconecta_app`):**
   - `SELECT` en `plans`; `SELECT, INSERT` en `accounts`, `subscriptions`, `payments`; `SELECT, INSERT, UPDATE` en `profiles` (sin `DELETE` para conservar historial); `USAGE` en secuencias y `EXECUTE` en `sp_contratar_suscripcion` y `fn_profiles_check_limits`.

---

## (b) Resumen técnico de lo implementado (Fase 2)

Nuevo módulo `AccountModule` (`backend/src/modules/account/`, registrado en `AppModule`):

### Endpoints implementados
| Método y Ruta | Protección | Descripción |
|---------------|------------|-------------|
| `GET /api/plans` | Pública | Lista los planes disponibles (`planId`, `name`, `price`, `maxProfiles`) ordenados por precio. |
| `GET /api/account/subscriptions` | `ClientAuthGuard` | Historial de suscripciones (con `isActive` calculado en BD bajo `[startsAt, endsAt)`) y pagos de `request.client.accountId`. |
| `GET /api/account/payments` | `ClientAuthGuard` | Historial de pagos de la cuenta autenticada ordenado por `paidAt DESC`. |
| `POST /api/account/subscriptions` | `ClientAuthGuard` | Contrata un plan invocando directamente `SELECT sp_contratar_suscripcion($1, $2, $3, $4)` con consulta parametrizada. |
| `GET /api/account/profiles` | `ClientAuthGuard` | Lista perfiles de la cuenta, `activeCount`, `maxProfiles` vigente y `hasActiveSubscription`. |
| `POST /api/account/profiles` | `ClientAuthGuard` | Crea perfil activo (`name`, `maxAgeRating` en `{0, 7, 12, 16, 18}`); delega validación de vigencia y cupo al trigger de BD. |
| `PATCH /api/account/profiles/:profileId/deactivate` | `ClientAuthGuard` + `ProfileOwnershipGuard` | Desactiva perfil (`UPDATE profiles SET isActive = 'N'`, sin `DELETE`). |
| `PATCH /api/account/profiles/:profileId/activate` | `ClientAuthGuard` + `ProfileOwnershipGuard` | Reactiva perfil (`UPDATE profiles SET isActive = 'Y'`), respetando vigencia y límite de perfiles activos. |

### Mapeo de errores de negocio (PostgreSQL → HTTP)
- **Suscripción ya vigente / solapamiento (`P0001` / `23P01`):** `409 Conflict`.
- **Exceso de perfiles activos al cambiar de plan (`P0001`):** `409 Conflict` (indicando cuántos perfiles desactivar).
- **Plan o cuenta inexistente (`P0001`):** `404 Not Found`.
- **Pago no aprobado (`P0001`):** `422 Unprocessable Entity`.
- **Referencia de pago duplicada (`23505`):** `409 Conflict`.
- **Creación/reactivación de perfil con suscripción vencida (`P0001`):** `403 Forbidden`.
- **Creación/reactivación de perfil excediendo `maxProfiles` (`P0001`):** `409 Conflict`.
- **Nombre de perfil duplicado en la cuenta (`23505`):** `409 Conflict`.

---

## (c) Verificación automatizada ejecutada
- `npm run build` en `backend/`: exitoso (0 errores de TypeScript).
- `npm test` en `backend/`: **6 suites, 58 pruebas aprobadas (0 fallidas)**, incluyendo `src/modules/account/account.service.spec.ts` (14 pruebas cubriendo planes, suscripciones/pagos, `sp_contratar_suscripcion`, todos los rechazos HTTP, perfiles y auditoría de metadatos `ClientAuthGuard` + `ProfileOwnershipGuard`).
- Escaneo de secretos/hashes/bcrypt en `backend/src/`: 0 coincidencias.

---

## (d) Checklist de pruebas manuales (para Edwar)

1. `GET /api/plans` → `200 OK` con los planes de PostgreSQL.
2. Con cuenta **sin suscripción vigente** (ej. cuenta recién registrada o cuenta 8 vencida):
   - `POST /api/account/profiles` → `403 Forbidden` (rechazo por suscripción vencida).
   - `POST /api/account/subscriptions` con `{ "planId": 1, "approved": false }` → `422 Unprocessable Entity` (sin insertar suscripción ni pago).
   - `POST /api/account/subscriptions` con `{ "planId": 1 }` → `201 Created` con suscripción de 30 días y pago asociado.
3. Con cuenta con suscripción vigente (ej. Plan Básico `maxProfiles = 1`):
   - `POST /api/account/subscriptions` de nuevo → `409 Conflict` (ya tiene suscripción vigente).
   - `POST /api/account/profiles` (1er perfil) → `201 Created`; 2do perfil → `409 Conflict` (exceso de perfiles).
   - `PATCH /api/account/profiles/:profileId/deactivate` con perfil propio → `200 OK` (`isActive: false`); con perfil ajeno → `403 Forbidden`.
4. `GET /api/account/subscriptions` y `GET /api/account/payments` → `200 OK` mostrando solo el historial de la cuenta autenticada.
