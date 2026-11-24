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
| **Auth Clientes** | JWT + bcrypt | Edwar | ⏳ E-02 (próximo) |
| **Auth Admins** | JWT + MongoDB | Edwar | ⏳ E-03 |
| **API Cuenta/Subs** | REST + OpenAPI | Edwar | ⏳ E-04 |
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
cp .env
```

### 3. Variables de entorno (Frontend)

```bash
cd ../frontend
cp .env
```
---

## 🗄️ Base de Datos - Orden de Ejecución

### PostgreSQL (ejecutar en orden)

```bash
# 1. Crear base de datos (como superusuario)
psql -U postgres -c "CREATE DATABASE cineconecta;"

# 2. Ejecutar DDL + roles + funciones (como superusuario)
# IMPORTANTE: pasar contraseña del usuario app como variable
psql -v app_password='tu_password_seguro' -d cineconecta -f database/postgres/01_postgresql_ddl.sql

# 3. Datos sintéticos base (~15 cuentas, 30 perfiles)
psql -d cineconecta -f database/postgres/04_datos_sinteticos.sql

# 4. (Opcional) Datos de volumen para pruebas de carga
psql -d cineconecta -f database/postgres/05_datos_volumen.sql
```

> **Nota:** El script `01_postgresql_ddl.sql` crea los roles `cineconecta_owner` (DDL), `cineconecta_app` (DML runtime) y `cineconecta_user` (LOGIN). La app se conecta **siempre** con `cineconecta_user` (privilegios mínimos).

### MongoDB (ejecutar en orden)

```bash
# Usar mongosh (no mongo legacy)
mongosh "mongodb://localhost:27017" database/mongodb/04_create_collections_and_indexes.js

# O para Atlas:
mongosh "mongodb+srv://user:pass@cluster.xxx.mongodb.net" database/mongodb/04_create_collections_and_indexes.js
```

El script crea 5 colecciones con validación `$jsonSchema` e índices optimizados:
- `catalog_items` (películas, series, documentales)
- `user_lists` ("Mi lista")
- `watch_activity` (sesiones, "Continuar viendo")
- `admin_users` (administradores)
- `counters` (secuencias atómicas para IDs)

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
│   ├── src/
│   │   ├── config/               # Configuración (@nestjs/config)
│   │   ├── modules/
│   │   │   ├── db/
│   │   │   │   ├── postgres/     # Pool pg + Service
│   │   │   │   └── mongodb/      # Mongoose + Service
│   │   │   └── health/           # Health checks (Terminus)
│   │   ├── app.module.ts
│   │   └── main.ts               # Bootstrap + Helmet + CORS
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                     # React + Vite + TS
│   ├── src/
│   │   ├── components/           # UI reutilizable
│   │   ├── pages/                # Páginas/ruteo
│   │   ├── hooks/                # Custom hooks
│   │   ├── services/             # API clients (axios)
│   │   ├── context/              # React Context (auth, etc)
│   │   ├── types/                # TypeScript types
│   │   ├── App.tsx               # Root + Health demo
│   │   └── main.tsx              # Entry point
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── database/
│   ├── postgres/                 # Scripts SQL (Miguel)
│   │   ├── 01_postgresql_ddl.sql
│   │   ├── 04_datos_sinteticos.sql
│   │   └── 05_datos_volumen.sql
│   └── mongodb/                  # Scripts mongosh (Krystal)
│       ├── 04_create_collections_and_indexes.js
│       └── 03_consultas.js
│
├── docs/
│   ├── architecture/             # Decisiones de arquitectura
│   └── ai-log/                   # Bitácora de uso de IA
│
├── .gitignore
└── README.md
```

---

## 🔐 Seguridad

- ✅ **Cero credenciales en código** — todo en `.env` (no versionado)
- ✅ **Usuario BD con privilegios mínimos** — `cineconecta_user` (no owner)
- ✅ **Helmet.js** — headers de seguridad HTTP
- ✅ **CORS configurado** — solo origen frontend permitido
- ✅ **Validación global** — class-validator en todos los DTOs
- ✅ **Rate limiting** — (pendiente E-02)
- ✅ **JWT HttpOnly cookies** — (pendiente E-02)

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
| Modelo MongoDB | `database/mongodb/modelo-datos-mongodb.md` | Colecciones, validaciones, consultas justificadas |
| Datos de prueba | `README.md` (sección "Datos de prueba") | Mapa de 15 cuentas, perfiles, planes, IDs para Mongo |
| Consultas Mongo | `database/mongodb/03_consultas.js` | 7 consultas optimizadas con explain |
| Frontend y API (B-01 a B-05) | `docs/B-01_B-05_frontend_y_api.md` | Endpoints, reglas de negocio, contrato JWT, pruebas |
| Guion de sustentación | `docs/B-06_guion_sustentacion.md` | Flujo completo, rechazos, informes, checklist |

---

## 🤝 Flujo de Trabajo del Equipo

1. **Miguel/Krystal** completan scripts de BD → suben a `database/`
2. **Edwar** implementa E-01 base → Backend arranca + health check OK
3. **Balanta** inicia B-01 (frontend base) consumiendo `/api/health`
4. **Edwar** implementa E-02 (Auth) → Balanta integra login/registro
5. **Edwar** implementa E-03 (Admin Auth) → Krystal valida admin_users
6. **Edwar** implementa E-04 (API Cuenta) → Balanta hace B-02 (Catálogo)
7. **Balanta** implementa Reproducción + Informes (B-03, B-04)

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