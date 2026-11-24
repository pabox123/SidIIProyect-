# B-01 a B-05 — Frontend, catálogo, reproducción e informes

Responsable: Balanta. Rama: `feature/balanta-frontend` (parte de `feat/e01-base-repo-structure`).

## 1. Qué quedó implementado

| ID | Backend (NestJS) | Frontend (React) |
|----|------------------|------------------|
| B-01 | Contrato JWT y guards en `backend/src/common/auth`, verificación de perfil en `common/access`, filtro global de errores | Login de clientes y administradores, selección de perfil activo, navegación, rutas protegidas, avisos y mensajes de error visibles |
| B-02 | `GET /api/catalog`, `GET /api/catalog/filters`, `GET /api/catalog/:contentId` | Búsqueda por título con filtros (tipo, género, idioma, año) y paginación; detalle con temporadas y episodios |
| B-03 | `GET/POST/PUT /api/admin/catalog`, `POST /api/admin/catalog/:id/publish` y `/withdraw` | Tabla del catálogo con filtros, formulario por tipo (película, serie con temporadas y episodios, documental), publicar y retirar |
| B-04 | `POST /api/playback/sessions`, `POST /api/playback/sessions/:id/events`, `GET /api/playback/continue-watching`, `GET/POST/DELETE /api/my-list` | Reproductor simulado (iniciar, pausar, reanudar, avanzar, retroceder, finalizar), fila "Continuar viendo", página "Mi lista" |
| B-05 | `GET /api/admin/reports/revenue` y `/consumption` (JSON o `format=csv`) | Informes con filtro de fechas, totales y descarga CSV. Ejemplos en `docs/B-05_informes_ejemplo/` |

## 2. Dependencia con E-02 y E-03 (Edwar)

Para poder integrar y probar el frontend se dejó un inicio de sesión mínimo en
`backend/src/modules/auth`:

- `POST /api/auth/login` (clientes, contra `accounts` con bcrypt, consulta e de M-05)
- `GET /api/auth/me` (cuenta, suscripción vigente y perfiles)
- `POST /api/admin/auth/login` (administradores, contra `admin_users` en MongoDB)

No incluye registro de clientes ni el resto de E-02/E-03. Cuando Edwar suba su parte puede
reemplazar este módulo; lo único que el resto del código necesita es que el token respete el
contrato de `backend/src/common/auth/auth.types.ts`:

```ts
// clientes
{ sub: accountId /* número */, kind: 'client', email }
// administradores
{ sub: adminId /* string */, kind: 'admin', email, roles: ['catalog_admin' | 'report_viewer'] }
```

Las rutas usan `@UseGuards(ClientAuthGuard)` o `@UseGuards(AdminAuthGuard)` + `@AdminRoles(...)`.
El `accountId` siempre sale del token verificado; nunca del cuerpo ni de la URL.

## 3. Variables de entorno del backend

Además de las de E-01 (`POSTGRES_*`, `MONGODB_URI`, `MONGODB_DB_NAME`, `FRONTEND_URL`):

| Variable | Uso |
|----------|-----|
| `JWT_SECRET` | Firma de los tokens. Obligatoria en producción |
| `JWT_EXPIRES_IN` | Duración del token (por defecto `8h`) |

El frontend usa el proxy de Vite (`/api` → `http://localhost:3000`). Si el backend está en otra
URL se puede definir `VITE_API_URL`.

## 4. Reglas de negocio y dónde se validan

### Catálogo (B-02)
- Solo se listan contenidos `published` con `ageRating <= maxAgeRating` del perfil. El
  `maxAgeRating` se lee de PostgreSQL con el perfil activo de la cuenta del token.
- La búsqueda por título usa `$text` (índice `ix_catalog_text_title`); los filtros y el orden
  `releaseYear:-1, _id:1` son los de las consultas 1 y 3 de `mongodb/03_consultas.js`.
- El detalle de una serie trae temporadas y episodios en una sola lectura (consulta 4). Si el
  contenido está retirado o la clasificación no es permitida, responde 404 o 403 con el motivo.

### Administración del catálogo (B-03)
- Solo administradores con rol `catalog_admin`.
- Validación en dos capas: DTO con class-validator (tipos, formatos, enumeraciones) y
  `catalog-rules.ts` (campos obligatorios por tipo, campos que no corresponden al tipo,
  `seasonNumber` único, número de episodio único por temporada, valores repetidos). El
  `$jsonSchema` de MongoDB queda como última barrera.
- Los `_id` (`mov_`, `ser_`, `doc_`) y los `episodeId` (`epi_`) los genera el servidor con la
  colección `counters`. Al editar se conservan los `episodeId` existentes y se rechazan los
  que no pertenecen a la serie.
- Estados: un contenido nuevo queda en `draft`; `draft | withdrawn → published` (fija
  `publishedAt`), `published → withdrawn` (fija `withdrawnAt`). El tipo no se puede cambiar.

### Reproducción (B-04)
Sigue el flujo de `mongodb/integracion-bases-datos.md`, sección 2:
1. PostgreSQL (`sql/03_consulta_verificacion_reproduccion.sql`): perfil activo de la cuenta y
   suscripción vigente. Si falla: *"Su cuenta no tiene una suscripción vigente"*.
2. MongoDB: contenido publicado, clasificación permitida y episodio existente (series).
3. Se crea la sesión en `watch_activity` con `_id` generado por la aplicación y con el
   `planId`/`subscriptionId` de ese momento.

El reproductor envía eventos (`heartbeat` cada 10 s, `pause`, `resume`, `seek`, `finish`).
El servidor calcula el tiempo visto en `playback-rules.ts`:
- Solo suma el tramo entre la última posición y la nueva si la sesión estaba reproduciendo y
  el avance es coherente con el tiempo real transcurrido. Un salto («Avanzar») no suma.
- `watchedSeconds` es la unión de los tramos (`playSegments`): volver a ver un tramo no se
  cuenta dos veces.
- Se marca `completed` al llegar al 90 % visto (`threshold_90`) o al finalizar (`manual`).
- Una sesión cerrada no acepta más eventos. Las sesiones `open` sin actividad por 30 minutos
  se cierran al iniciar otra en el mismo perfil.

"Continuar viendo" es la consulta 5 (última sesión por contenido sin completar, solo
contenidos publicados y permitidos) y al reproducir retoma desde `lastPositionSeconds`.
"Mi lista" es la consulta 6: los contenidos retirados se conservan con `isWithdrawn: true` y el
frontend los muestra como "No disponible".

### Informes (B-05)
- Ingresos por plan: solo PostgreSQL, consulta a de M-05 (`ix_payments_paidat`), con
  `LEFT JOIN` desde `plans` para que los planes sin pagos aparezcan en cero.
- Consumo por plan y tipo de contenido: MongoDB agrupa `watch_activity` por `planId` y
  `contentType` (consulta 7, `ix_watch_report`) y PostgreSQL aporta el nombre de cada plan. El
  plan es el que estaba vigente cuando empezó cada sesión.
- Las fechas son inclusivas (`from` a `to`); internamente se consulta `[from, to + 1 día)`.
- Con `format=csv` se descarga el archivo (UTF-8 con BOM para que Excel respete las tildes).

### Errores
`AllExceptionsFilter` devuelve siempre `{ statusCode, message }`:
- `RAISE EXCEPTION` de funciones y triggers (P0001) → 422 con el mensaje de la base.
- Duplicados → 409. Base no disponible → 503 con un mensaje que dice cuál.
Si MongoDB cae, la pantalla de informes sigue mostrando el de ingresos (cada informe se pide
por separado).

## 5. Pruebas hechas

- `npm test` en `backend`: pruebas de `playback-rules` (saltos, pausas, unión de tramos, 90 %,
  finalizar) y `catalog-rules` (campos por tipo, temporadas y episodios repetidos).
- Contra PostgreSQL 16 local con `01_postgresql_ddl.sql` y `04_datos_sinteticos.sql` de
  `feature/BD`: login, `/auth/me`, verificación de perfil ajeno (404), perfil desactivado (403),
  suscripción vencida (cuenta 8, 403), informe de ingresos en JSON y CSV, rango inválido (400) y
  respuesta 503 cuando MongoDB no está disponible.
- `npm run build` en `frontend` sin errores de TypeScript.
- **Pendiente**: probar los flujos de MongoDB (catálogo, reproducción, Mi lista, consumo)
  contra la base real del equipo con los datos de K-03.
