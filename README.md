# 🎬 CineConecta

Plataforma de streaming de películas, series y documentales con **persistencia políglota** (PostgreSQL + MongoDB).

> **Sistemas Intensivos en Datos II** — Proyecto académico colaborativo  
> Equipo: **Miguel** (BD Relacional), **Krystal** (MongoDB), **Edwar** (Backend/Auth/API), **Balanta** (Frontend/Catálogo/Reproducción/Informes)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        CineConecta API                          │
│                    (NestJS + TypeScript)                        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
    │ PostgreSQL  │       │  MongoDB    │       │   Frontend  │
    │  (Relacional)│       │ (Documental)│       │  (React+Vite)│
    └─────────────┘       └─────────────┘       └─────────────┘
    - accounts              - catalog_items           - Búsqueda
    - profiles              - user_lists              - Catálogo
    - plans                 - watch_activity          - Reproducción
    - subscriptions         - admin_users             - Mi Lista
    - payments              - counters                - Continuar Viendo
```

### División de Responsabilidades

| Componente | Tecnología | Responsable | Estado |
|------------|------------|-------------|--------|
| **BD Relacional** | PostgreSQL 18+ | Miguel | ✅ M-01 a M-04 completados |
| **BD Documental** | MongoDB 6+ | Krystal | ✅ K-01, K-02 completados |
| **Backend Base** | NestJS + TypeScript | Edwar | 🔄 **E-01 ACTUAL** |
| **Auth Clientes** | JWT + bcrypt | Edwar | ✅ E-02 (registro, login, verificación de cuenta y perfiles) |
| **Auth Admins** | JWT + MongoDB | Edwar | ✅ E-03 (admin_users, roles verificados en cada operación) |
| **API Cuenta/Subs** | REST | Edwar | ✅ E-04 (planes, contratación M-02, pagos, perfiles) |
| **Frontend Base** | React 18 + Vite | Balanta | ✅ B-01 (login, perfiles, navegación, errores) |
| **Catálogo/Búsqueda** | React + API | Balanta | ✅ B-02 |
| **Gestión de catálogo (admin)** | React + API | Balanta | ✅ B-03 |
| **Reproducción / Mi lista / Continuar viendo** | React + API | Balanta | ✅ B-04 |
| **Informes + CSV** | React + API | Balanta | ✅ B-05 |
| **Guion de sustentación** | Markdown | Balanta | ✅ B-06 (falta el ensayo del equipo) |

> Detalle de endpoints, reglas y pruebas de B-01 a B-05: `docs/B-01_B-05_frontend_y_api.md`.
> Guion de la sustentación: `docs/B-06_guion_sustentacion.md`.

---

## 📋 Requisitos Previos

- **Node.js** 20+ (LTS recomendado)
- **pnpm** 9+ (o npm/yarn)
- **PostgreSQL** 14+ (local, Docker, Supabase, Neon, Aiven...)
- **MongoDB** 6+ (local, Docker, MongoDB Atlas...)
- **Git** 2.30+

### Verificar instalaciones

```bash
node --version    # v20.x.x
pnpm --version    # 9.x.x
psql --version    # 14+
mongosh --version # 2.x.x
```

---

## ⚙️ Configuración

### 1. Clonar y preparar

```bash
git clone <repo-url>
cd SidIIProyect-
```

### 2. Variables de entorno (Backend)

```bash
cd backend
cp .env.example .env
# Completar credenciales de Neon (POSTGRES_*, POSTGRES_SSL=true), MONGODB_URI y JWT_SECRET
```

### 3. Variables de entorno (Frontend)

```bash
cd ../frontend
cp .env.example .env   # opcional: sin .env se usa el proxy /api de Vite
```
---

## 🗄️ Base de Datos - Orden de Ejecución

### PostgreSQL (ejecutar en orden)

```bash
# 1. Crear base de datos (como superusuario)
psql -U postgres -c "CREATE DATABASE cineconecta;"

# 2. Ejecutar DDL + roles + funciones (como superusuario)
# IMPORTANTE: pasar contraseña del usuario app como variable
psql -v app_password='tu_password_seguro' -d cineconecta -f sql/01_postgresql_ddl.sql

# 3. Datos sintéticos base (~15 cuentas, 30 perfiles)
psql -d cineconecta -f sql/04_datos_sinteticos.sql

# 4. (Opcional) Datos de volumen para pruebas de carga
psql -d cineconecta -f sql/05_datos_volumen.sql

# 5. Índices y vistas de optimización (M-05)
psql -d cineconecta -f sql/06_optimizacion_relacional.sql
```

> **Nota:** El script `01_postgresql_ddl.sql` crea los roles `cineconecta_owner` (DDL), `cineconecta_app` (DML runtime) y `cineconecta_user` (LOGIN). La app se conecta **siempre** con `cineconecta_user` (privilegios mínimos).

### MongoDB (ejecutar en orden)

```bash
# Usar mongosh (no mongo legacy)
mongosh "mongodb://localhost:27017/cineconecta" mongodb/04_create_collections_and_indexes.js

# O para Atlas:
mongosh "mongodb+srv://user:pass@cluster.xxx.mongodb.net/cineconecta" mongodb/04_create_collections_and_indexes.js

# Datos sintéticos alineados con los IDs de PostgreSQL (K-03)
mongosh "mongodb://localhost:27017/cineconecta" mongodb/05_datos_sinteticos.js

# Usuario de la aplicación con privilegios mínimos (no usar el administrador)
APP_MONGO_PASSWORD='...' mongosh "mongodb://admin@localhost:27017/cineconecta" mongodb/06_usuario_aplicacion.js
```

El script crea 5 colecciones con validación `$jsonSchema` e índices optimizados:
- `catalog_items` (películas, series, documentales)
- `user_lists` ("Mi lista")
- `watch_activity` (sesiones, "Continuar viendo")
- `admin_users` (administradores)
- `counters` (secuencias atómicas para IDs)

### Datos de prueba (M-03)

#### Contraseña de prueba compartida
Todas las cuentas de datos sintéticos usan la misma contraseña: **`Demo2026!`**
Hash bcrypt (prefijo $2a$, costo 10): `$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2`

#### Mapa de IDs (caso de prueba → accountId | profileIds | plan | vigencia)
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

#### Pruebas funcionales con cineconecta_user (datos base)
```bash
# Contratación exitosa (cuenta 6, nunca suscripción)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(6, 1, 'PAY-TEST-001');"

# Rechazo por suscripción vigente (cuenta 1)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(1, 1, 'PAY-TEST-002');"

# Rechazo por exceso perfiles (cuenta 8 con 3 activos, intenta Básico max 1)
psql -U cineconecta_user -d cineconecta_test_m03 -c "SELECT sp_contratar_suscripcion(8, 1, 'PAY-TEST-003');"
```

### Verificación rápida

```bash
# PostgreSQL: probar función de contratación (cuenta 6 = sin suscripción previa)
psql -U cineconecta_user -d cineconecta -c "SELECT sp_contratar_suscripcion(6, 1, 'TEST-001');"

# MongoDB: verificar colecciones
mongosh "mongodb://localhost:27017/cineconecta" --eval "show collections"
```

---

## 🚀 Ejecución

### Desarrollo (dos terminales)

**Terminal 1 - Backend:**
```bash
cd backend
pnpm install
pnpm run start:dev
```
> API en `http://localhost:3000/api`  
> Health check: `http://localhost:3000/api/health`  
> Swagger (si habilitado): `http://localhost:3000/api/docs`

**Terminal 2 - Frontend:**
```bash
cd frontend
pnpm install
pnpm run dev
```
> App en `http://localhost:5173` (proxy a `/api` → backend)

### Producción

```bash
# Backend
cd backend
pnpm install --prod
pnpm run build
NODE_ENV=production pnpm run start:prod

# Frontend
cd frontend
pnpm install
pnpm run build
# Servir dist/ con nginx, Vercel, Netlify, etc.
```

---

## 🔍 Verificación Health Check

```bash
# Health general (PostgreSQL + MongoDB)
curl http://localhost:3000/api/health

# Solo PostgreSQL
curl http://localhost:3000/api/health/postgres

# Solo MongoDB
curl http://localhost:3000/api/health/mongodb
```

**Respuesta esperada (200 OK):**
```json
{
  "status": "ok",
  "info": {
    "postgres": { "status": "up", "latency": "2ms", "pool": {...} },
    "mongodb": { "status": "up", "latency": "5ms", "collections": 5, "connectionState": "connected" }
  },
  "error": {},
  "details": { ... }
}
```

**Si falla (503 Service Unavailable):**
```json
{
  "status": "error",
  "error": {
    "postgres": { "status": "down", "error": "connection refused" }
  }
}
```

---

## 📁 Estructura del Proyecto

```
SidIIProyect-/
├── backend/                      # NestJS API
│   └── src/
│       ├── common/               # Contrato JWT, guards, acceso a perfiles, errores, CSV
│       ├── config/               # Configuración (@nestjs/config)
│       ├── modules/
│       │   ├── db/               # Pool pg + Mongoose
│       │   ├── health/           # Health checks (Terminus)
│       │   ├── auth/             # Registro y login de clientes (E-02) y administradores (E-03)
│       │   ├── account/          # E-04 suscripciones, pagos y perfiles
│       │   ├── catalog/          # B-02 catálogo del cliente
│       │   ├── admin-catalog/    # B-03 gestión del catálogo
│       │   ├── playback/         # B-04 reproducción, Continuar viendo, Mi lista
│       │   └── reports/          # B-05 informes + CSV
│       ├── app.module.ts
│       └── main.ts               # Bootstrap + Helmet + CORS + filtro de errores
│
├── frontend/                     # React + Vite + TS
│   └── src/
│       ├── api/                  # Cliente axios, endpoints y tipos
│       ├── components/           # Layout, guards de rutas, UI
│       ├── context/              # Sesión (auth) y avisos
│       ├── pages/                # Cliente y admin/
│       └── App.tsx               # Rutas
│
├── sql/                          # PostgreSQL (Miguel): DDL, verificación, datos, optimización
├── mongodb/                      # MongoDB (Krystal): colecciones, datos, consultas, modelo
├── docs/                         # M-04, M-05, B-01..B-06, documento del proyecto
├── .gitignore
└── README.md
```

---

## 🔐 Seguridad

- ✅ **Cero credenciales en código** — todo en `.env` (no versionado)
- ✅ **Usuarios BD con privilegios mínimos** — PostgreSQL: `cineconecta_user` (no owner, `sql/01`); MongoDB: `cineconecta_app` con un rol por colección (`mongodb/06_usuario_aplicacion.js`)
- ✅ **Contraseñas con hash bcrypt** — clientes en PostgreSQL y administradores en MongoDB
- ✅ **Autorización en el servidor** — el `accountId` sale del JWT; cada perfil se verifica contra PostgreSQL y cada operación administrativa revisa el rol vigente en MongoDB
- ✅ **Helmet.js** — headers de seguridad HTTP
- ✅ **CORS configurado** — solo origen frontend permitido
- ✅ **Validación global** — class-validator en todos los DTOs
- ✅ **JWT en encabezado `Authorization: Bearer`** — el frontend lo guarda en `sessionStorage` (se borra al cerrar la pestaña); al no usar cookies no hay exposición a CSRF

---

## 🧪 Testing

```bash
# Backend
cd backend
pnpm run test           # Unit tests
pnpm run test:e2e       # E2E tests
pnpm run test:cov       # Coverage report

# Frontend
cd frontend
pnpm run test           # Vitest
```

---

## 📚 Documentación Adicional

| Documento | Ubicación | Descripción |
|-----------|-----------|-------------|
| Modelo relacional | `docs/M-04_catalogo_objetos_relacional.md` | Catálogo completo tablas, índices, funciones, roles |
| Modelo MongoDB | `mongodb/modelo-datos-mongodb.md` | Colecciones, validaciones, consultas justificadas |
| Datos de prueba | `README.md` (sección "Datos de prueba") | Mapa de 15 cuentas, perfiles, planes, IDs para Mongo |
| Consultas Mongo | `mongodb/03_consultas.js` | 7 consultas optimizadas con explain |
| Frontend y API (B-01 a B-05) | `docs/B-01_B-05_frontend_y_api.md` | Endpoints, reglas de negocio, contrato JWT, pruebas |
| Guion de sustentación | `docs/B-06_guion_sustentacion.md` | Flujo completo, rechazos, informes, checklist |

---

## 🤝 Ramas

- `integracion`: rama con todo el trabajo unido (base E-01, BD de Miguel, MongoDB de Krystal, backend de Edwar y frontend de Balanta). Es la que se usa para la sustentación.
- `feature/BD`, `feature/mongodb-catalog-design`, `feat/backend`, `feature/balanta-frontend`: ramas de trabajo de cada integrante.

---

## 🐛 Troubleshooting

### Backend no conecta a PostgreSQL
```bash
# Verificar que el usuario existe y tiene permisos
psql -U cineconecta_user -d cineconecta -c "SELECT current_user, current_database();"

# Verificar variables de entorno
cat backend/.env | grep POSTGRES
```

### Backend no conecta a MongoDB
```bash
# Probar conexión directa
mongosh "mongodb://localhost:27017/cineconecta" --eval "db.adminCommand('ping')"

# Verificar URI en .env
cat backend/.env | grep MONGODB
```

### Health check devuelve 503
- Revisar logs del backend (consola donde corre `pnpm run start:dev`)
- Verificar que ambos servicios estén arriba
- Comprobar firewall/puertos (5432, 27017)

### Frontend no hace proxy al backend
- Verificar `vite.config.ts` → `server.proxy`
- Confirmar que backend corre en puerto 3000
- Revisar consola del navegador (Network tab)

---

## 📝 Licencia

Proyecto académico — Universidad Icesi — Sistemas Intensivos en Datos II (2026)

---

## 👥 Créditos

- **Miguel** — PostgreSQL DDL, funciones, triggers, roles, datos sintéticos
- **Krystal** — Modelo MongoDB, validaciones `$jsonSchema`, índices, consultas
- **Edwar** — Backend NestJS, configuración dual DB, health checks, auth (próximo)
- **Balanta** — Frontend React, catálogo, administración del catálogo, reproducción, informes y guion de sustentación