# Bitácora de IA — E-02: Registro, Autenticación de Clientes y Guards de Pertenencia

**Fecha:** 2026-11-25  
**Tarea:** E-02 — Registro y autenticación de clientes (hash seguro con `bcryptjs`, JWT, `/api/auth/me`) y guards de verificación de pertenencia de cuenta y perfiles en el servidor.  
**Rama:** `feat/backend` (creada desde `integracion`)

---

## (a) Diagnóstico previo realizado

1. **Estado del repositorio:**
   - Rama activa `integracion` limpia.
   - Los scripts SQL de Miguel viven en `sql/` (`01_postgresql_ddl.sql` a `06_optimizacion_relacional.sql`).
   - El backend ya contenía una base de autenticación creada por Balanta para B-01 (`backend/src/modules/auth/` y `backend/src/common/auth/`), con `POST /api/auth/login`, `GET /api/auth/me` y `POST /api/admin/auth/login`, pero sin `POST /api/auth/register` y sin guards declarativos de pertenencia (`:accountId` / `:profileId`).
2. **Esquema real en PostgreSQL (`sql/01_postgresql_ddl.sql`):**
   - `accounts(accountId, fullName, email, passwordHash, createdAt)` con índice único funcional `ux_accounts_email_ci` sobre `LOWER(email)` y restricción `ck_accounts_hash CHECK (LENGTH(passwordHash) >= 60)`.
   - `profiles(profileId, accountId, name, maxAgeRating, isActive)` con `isActive IN ('Y', 'N')`.
   - Usuario de BD `cineconecta_user` (rol `cineconecta_app`) con privilegios mínimos: `SELECT, INSERT` sobre `accounts` y `SELECT, INSERT, UPDATE` sobre `profiles`.
3. **Dependencias en Windows:**
   - `backend/package.json` tenía `bcrypt` nativo (`^5.1.1`) y `@types/bcrypt`. Se reemplazaron por `bcryptjs` y `@types/bcryptjs` (pure JS) para evitar fallos de compilación nativa en Windows.

---

## (b) Resumen técnico de lo implementado

### 1. Módulo de Autenticación (`backend/src/modules/auth/`)
- **`POST /api/auth/register`** (`RegisterDto` + `AuthService.registerClient`):
  - Valida `fullName` (2–150 chars, trim), `email` (formato válido, trim + lowercase, máx. 254) y `password` (8–72 chars).
  - Verifica unicidad insensible a mayúsculas con `SELECT 1 FROM accounts WHERE LOWER(email) = LOWER($1)` y maneja colisiones concurrentes (`23505`) devolviendo `409 Conflict`.
  - Hashea la contraseña con `bcryptjs.hash` usando `BCRYPT_ROUNDS` desde `.env` (default `10`).
  - Inserta en `accounts` con consulta parametrizada (`$1, $2, $3`) y retorna `{ accessToken, account: { accountId, fullName, email, createdAt } }` (nunca `passwordHash`).
- **`POST /api/auth/login`** (`LoginDto` + `AuthService.loginClient`):
  - Consulta `accounts` por `LOWER(email) = LOWER($1)` (aprovechando `ux_accounts_email_ci`, consulta `e` de M-05).
  - Verifica con `bcryptjs.compare` y devuelve error genérico `401 Unauthorized` (`Correo o contraseña incorrectos`) tanto si el correo no existe como si la contraseña falla.
  - Emite JWT firmado con `JWT_SECRET` y expiración `JWT_EXPIRES_IN` con payload `{ sub: accountId, kind: 'client', role: 'client', email }`, 100% compatible con el frontend de Balanta (B-01..B-05).
- **`GET /api/auth/me`**:
  - Protegido por `ClientAuthGuard`; devuelve cuenta, suscripción vigente y perfiles desde PostgreSQL usando siempre `accountId` del token.
- **`POST /api/admin/auth/login`**:
  - Conservado intacto para compatibilidad con B-01/B-03/B-05 (usando `bcryptjs.compare`), listo para ampliar en E-03.

### 2. Guards de Autenticación y Pertenencia (`backend/src/common/auth/`)
- **`JwtAuthGuard` y `ClientAuthGuard`** (`auth.guards.ts`):
  - Validan el token `Bearer` en cada petición protegida y adjuntan la identidad verificada en `request.user` y `request.client`.
  - `ClientAuthGuard` rechaza tokens que no sean de tipo cliente (`kind !== 'client'`) con `403 Forbidden`.
- **`AccountOwnershipGuard`** (`ownership.guards.ts`):
  - Verifica en el servidor que el parámetro `:accountId` de la ruta coincida estrictamente con `request.client.accountId` (de lo contrario, `403 Forbidden`; si no es entero positivo, `400 BadRequest`).
- **`ProfileOwnershipGuard`** (`ownership.guards.ts`):
  - Consulta PostgreSQL (`profiles`) por `profileId` (desde `params`, `query` o `body`).
  - Rechaza con `404 NotFound` si el perfil no existe y con `403 Forbidden` si pertenece a otra cuenta.
  - Si pertenece al cliente autenticado, adjunta `request.profile` para los controladores.
- Todos los guards están registrados y exportados globalmente desde `AuthCommonModule`.

### 3. Decisiones de seguridad tomadas
- **Cero secretos quemados en el código:** Se eliminaron los valores fallback hardcodeados de `JWT_SECRET` tanto en `AuthCommonModule` (ahora falla rápido si falta `JWT_SECRET`) como en `backend/src/config/database.config.ts`.
- **Prevención de SQL Injection:** Todas las consultas SQL en `AuthService` y `ProfileOwnershipGuard` utilizan parámetros posicionales (`$1`, `$2`, `$3`).
- **Prevención de enumeración de usuarios en login:** Mensaje y código HTTP idénticos (`401`) ante correo inexistente o contraseña incorrecta.
- **Límite de 72 caracteres en contraseña:** Alineado con el límite real de entrada de bcrypt para evitar truncamiento silencioso.
- **Pertenencia verificada en servidor:** `accountId` siempre proviene del JWT verificado, nunca de datos confiados del cliente.

---

## (c) Verificación automatizada ejecutada
- `npm run build` en `backend/`: exitoso (0 errores de TypeScript).
- `npm test` en `backend/`: **4 suites, 31 pruebas aprobadas (0 fallidas)**, incluyendo:
  - `src/modules/auth/auth.service.spec.ts` (registro con hash seguro y sin `passwordHash`, duplicado 409, race condition `23505`, login válido, credenciales inválidas 401 genérico, `/me` con cuenta inexistente).
  - `src/common/auth/ownership.guards.spec.ts` (`ClientAuthGuard`, `JwtAuthGuard`, `AccountOwnershipGuard` y `ProfileOwnershipGuard` con escenarios 200/400/401/403/404).
- Escaneo de código fuente en `backend/src/`: sin importaciones remanentes de `bcrypt` nativo ni secretos en texto plano.

---

## (d) Qué probar manualmente (Checklist para Edwar)

1. **Levantar backend** (`cd backend && npm run start:dev`) con PostgreSQL y MongoDB activos y `backend/.env` configurado (`JWT_SECRET`, `BCRYPT_ROUNDS=10`, `POSTGRES_*`).
2. **Registro (`POST http://localhost:3000/api/auth/register`):**
   - Enviar `{ "fullName": "Prueba E02", "email": "PruebaE02@example.com", "password": "Password123" }` → esperar `201 Created` con `accessToken` y `account` (sin `passwordHash`).
   - Repetir con `"pruebae02@example.com"` (distintas mayúsculas) → esperar `409 Conflict`.
   - Probar contraseña corta (`"1234"`) → esperar `400 Bad Request`.
3. **Login (`POST http://localhost:3000/api/auth/login`):**
   - Con credenciales correctas → `200 OK` y `accessToken`.
   - Con correo inexistente o contraseña incorrecta → `401 Unauthorized` con el mismo mensaje `"Correo o contraseña incorrectos"`.
4. **Sesión autenticada (`GET http://localhost:3000/api/auth/me`):**
   - Sin header `Authorization` → `401 Unauthorized`.
   - Con `Authorization: Bearer <accessToken>` → `200 OK` con datos de la cuenta, `activeSubscription` y `profiles`.
5. **Integración con frontend (`cd frontend && npm run dev`):**
   - Iniciar sesión como cliente desde la UI y verificar que carga `/profiles` sin romper ningún flujo de Balanta (B-01..B-05).
