# Modelo de datos de MongoDB — CineConecta

## 1. Colecciones de MongoDB

El sistema utiliza cinco colecciones en la base de datos `cineconecta`, cada una con un propósito claro dentro de la arquitectura políglota.

**catalog_items**  
Es la colección central del catálogo. Almacena películas, series y documentales en una sola colección mediante polimorfismo de esquema (campo `type`). Cada documento contiene todos los metadatos compartidos (título, sinopsis, año, géneros, países, idiomas, clasificación, portada) y los campos específicos de su tipo: duración, directores y reparto para películas; temporadas con episodios embebidos para series; duración, directores, temas, entrevistados y fuentes para documentales. El campo `status` controla el ciclo de vida (`draft`, `published`, `withdrawn`) y `schemaVersion` permite evoluciones futuras del esquema sin migraciones masivas.

**user_lists**  
Representa la funcionalidad "Mi lista" por perfil. Cada documento vincula un `accountId`, un `profileId` y un `contentId` (referencia a `catalog_items._id`) con la fecha `addedAt`. El índice único compuesto `(profileId, contentId)` impide duplicados. Cuando un contenido pasa a `withdrawn`, el documento permanece en la lista pero la consulta de enriquecimiento marca `isWithdrawn: true` para que la interfaz lo distinga visualmente sin borrar la preferencia del usuario.

**watch_activity**  
Registra cada sesión de reproducción. Guarda `accountId`, `profileId`, `contentId`, `contentType` y, para series, `episodeId`, `seasonNumber` y `episodeNumber`. También almacena el `planId` y `subscriptionId` vigentes en ese momento (provenientes de la base relacional), tiempos de inicio/fin/última actividad, duración total, segundos efectivamente vistos (excluyendo saltos), última posición, segmentos de reproducción (`playSegments`), estado de la sesión y si se completó (por finalización o umbral del 90%). Esta colección es inmutable: nunca se sobrescribe una sesión anterior aunque el usuario vuelva a ver el mismo contenido.

**admin_users**  
Usuarios administradores de la plataforma, separados completamente de las cuentas de clientes (que viven en PostgreSQL/Oracle). Cada documento tiene `email` único, `fullName`, `passwordHash` (bcrypt), array de `roles` (`catalog_admin`, `report_viewer`), bandera `isActive` y auditoría de `createdAt`/`lastLoginAt`. La separación de dominios evita mezclar autenticación de staff con la de suscriptores y permite esquemas de seguridad distintos.

**counters**  
Colección auxiliar para la generación atómica de identificadores estables (`mov_`, `ser_`, `doc_`, `epi_`) mediante `findOneAndUpdate` con `$inc`. No tiene validación de esquema porque solo la aplicación la toca.

---

## 2. Documentos embebidos vs referencias

### Episodios embebidos en series (`catalog_items`)

Los episodios viven dentro del array `seasons[].episodes[]` del documento de la serie. Esta decisión responde a tres factores:

1. **Lectura atómica**: la operación más frecuente es "abrir una serie" para mostrar todas sus temporadas y episodios. Con el embebido, un `findOne` por `_id` trae el árbol completo sin `$lookup` ni `$unwind`, con una sola lectura de disco.
2. **Ausencia de consultas independientes**: el sistema nunca busca episodios sueltos sin su serie (no existe "episodio del día" ni recomendaciones a nivel de episodio desacopladas). Toda navegación parte del contenido padre.
3. **Cardinalidad acotada**: una temporada típica tiene 8–13 episodios; incluso series largas rara vez superan 200 episodios totales. El documento resultante queda muy por debajo del límite de 16 MB de BSON, por lo que el crecimiento no es un riesgo.

El validator exige `episodeId` con patrón `^epi_[0-9]{6,}$` y un índice único parcial (`ux_catalog_episode_id`) garantiza que no se repita globalmente. La unicidad de `number` dentro de cada temporada y de `seasonNumber` dentro de la serie se valida en la aplicación antes de persistir, ya que MongoDB no soporta restricciones de unicidad condicionales dentro de arrays anidados.

### Referencias en `user_lists` y `watch_activity`

Ambas colecciones almacenan `contentId` (y `episodeId` en `watch_activity`) como referencias a `catalog_items._id`, nunca embebiendo datos del catálogo.

- **Separación de dominios**: "Mi lista" es una preferencia del usuario, no parte del catálogo. Embeber el título o la portada duplicaría datos y obligaría a actualizar todas las listas al cambiar una portada.
- **Contenidos retirados**: cuando un contenido pasa a `withdrawn`, debe desaparecer del catálogo público y de "Continuar viendo", pero **no** de "Mi lista". La referencia permite conservar el vínculo y calcular `isWithdrawn` en tiempo de consulta mediante `$lookup` contra `catalog_items.status`.
- **Histórico inmutable**: `watch_activity` registra lo que ocurrió en un instante. Si el contenido cambia de título, se retira o se corrige una sinopsis, la sesión histórica no debe mutar. La referencia preserva la integridad del registro y el `planId`/`subscriptionId` capturados en ese momento permiten el informe cross-DB.

### `admin_users` como colección independiente

Los administradores no son perfiles de cuenta. Viven en MongoDB con su propio esquema de autenticación (hash bcrypt, roles propios) mientras que los clientes se autentican contra la base relacional. Esto evita acoplar el modelo de seguridad del staff al de suscriptores y permite escalar o migrar cada dominio por separado.

---

## 3. Estructura por tipo de contenido y validaciones

El validator de `catalog_items` (`01_catalog_items_validator.js`) usa `oneOf` con tres ramas, cada una activada por el valor de `type`. Todas comparten la base de campos obligatorios:

```json
{
  "required": ["_id", "type", "title", "synopsis", "releaseYear", "genres",
    "productionCountries", "audioLanguages", "subtitleLanguages",
    "ageRating", "coverUrl", "status", "schemaVersion", "createdAt", "updatedAt"]
}
```

**Películas (`type: "movie"`)**  
Añaden `durationMinutes`, `directors` (array de strings, mínimo 1) y `cast` (array de objetos con `name` y `character`, ambos obligatorios). El validator prohíbe `seasons`.

**Series (`type: "series"`)**  
Requieren `seasons`: array de objetos con `seasonNumber`, `description` y `episodes`. Cada episodio exige `episodeId` (patrón `^epi_[0-9]{6,}$`), `number`, `title`, `synopsis`, `durationMinutes`. El validator no puede expresar "número de episodio único por temporada" ni "seasonNumber único"; esas reglas viven en la capa de aplicación.

**Documentales (`type: "documentary"`)**  
Añaden `durationMinutes`, `directors`, `topics` (array de strings), `interviewees` (objetos con `name` y `role` opcional) y `sources` (objetos con `name` e `institution` opcional). Prohíbe `seasons`.

**Validaciones transversales**  
- `_id`: patrón `^(mov|ser|doc)_[0-9]{6,}$` que además debe coincidir con `type` (validado en aplicación).  
- `productionCountries`: códigos ISO-3166-1 alpha-2 (`^[A-Z]{2}$`).  
- `audioLanguages` / `subtitleLanguages`: códigos IETF (`^[a-z]{2,3}(-[A-Z]{2})?$`).  
- `ageRating`: enum `[0, 7, 12, 16, 18]`.  
- `status`: enum `["draft", "published", "withdrawn"]` con fechas `publishedAt` / `withdrawnAt` consistentes.  
- `schemaVersion`: número entero ≥ 1 para futuras migraciones sin romper documentos existentes.

---

## 4. Ejemplos representativos

### Película — `mov_000101.json`

```json
{
  "_id": "mov_000101",
  "type": "movie",
  "title": "Ruta al Pacífico",
  "synopsis": "Dos hermanos recorren Colombia en bus para llegar a Buenaventura antes de que se venda la casa familiar.",
  "releaseYear": 2021,
  "genres": ["Drama", "Road movie"],
  "productionCountries": ["CO", "ES"],
  "audioLanguages": ["es"],
  "subtitleLanguages": ["en", "es", "pt"],
  "ageRating": 12,
  "coverUrl": "https://cdn.cineconecta.example/covers/mov_000101.jpg",
  "durationMinutes": 108,
  "directors": ["Laura Mejía"],
  "cast": [
    { "name": "Andrés Cifuentes", "character": "Tomás" },
    { "name": "Marcela Orozco", "character": "Valeria" },
    { "name": "Héctor Quintero" }
  ],
  "status": "published",
  "schemaVersion": 1,
  "createdAt": { "$date": "2026-03-02T15:00:00Z" },
  "updatedAt": { "$date": "2026-03-05T09:30:00Z" },
  "publishedAt": { "$date": "2026-03-05T09:30:00Z" }
}
```

### Serie — `ser_000201.json` (versión resumida, dos temporadas con dos episodios cada una)

```json
{
  "_id": "ser_000201",
  "type": "series",
  "title": "Los Hijos del Cauca",
  "synopsis": "Tres generaciones de una familia cañera enfrentan disputas por la tierra y los secretos de su fundador.",
  "releaseYear": 2023,
  "genres": ["Drama", "Familia"],
  "productionCountries": ["CO"],
  "audioLanguages": ["es"],
  "subtitleLanguages": ["en", "es"],
  "ageRating": 12,
  "coverUrl": "https://cdn.cineconecta.example/covers/ser_000201.jpg",
  "seasons": [
    {
      "seasonNumber": 1,
      "description": "La llegada del heredero al ingenio azucarero.",
      "episodes": [
        { "episodeId": "epi_0002001", "number": 1, "title": "El regreso", "synopsis": "Mateo vuelve al valle tras diez años de ausencia.", "durationMinutes": 45 },
        { "episodeId": "epi_0002002", "number": 2, "title": "La herencia", "synopsis": "La lectura del testamento divide a la familia.", "durationMinutes": 47 }
      ]
    },
    {
      "seasonNumber": 2,
      "description": "Las consecuencias del conflicto por el agua.",
      "episodes": [
        { "episodeId": "epi_0002003", "number": 1, "title": "Sequía", "synopsis": "El río baja y los cultivos se pierden.", "durationMinutes": 45 },
        { "episodeId": "epi_0002004", "number": 2, "title": "Pacto roto", "synopsis": "Una alianza antigua se quiebra en plena cosecha.", "durationMinutes": 46 }
      ]
    }
  ],
  "status": "published",
  "schemaVersion": 1,
  "createdAt": { "$date": "2026-02-10T14:00:00Z" },
  "updatedAt": { "$date": "2026-06-18T10:00:00Z" },
  "publishedAt": { "$date": "2026-02-14T08:00:00Z" }
}
```

### Documental — `doc_000301.json`

```json
{
  "_id": "doc_000301",
  "type": "documentary",
  "title": "Voces del Manglar",
  "synopsis": "Comunidades del Pacífico colombiano cuentan cómo protegen el manglar frente a la tala y la contaminación.",
  "releaseYear": 2022,
  "genres": ["Documental", "Naturaleza"],
  "productionCountries": ["CO", "FR"],
  "audioLanguages": ["es", "fr"],
  "subtitleLanguages": ["es", "en"],
  "ageRating": 0,
  "coverUrl": "https://cdn.cineconecta.example/covers/doc_000301.jpg",
  "durationMinutes": 74,
  "directors": ["Camila Ruiz", "Étienne Marchand"],
  "topics": ["Conservación", "Comunidades costeras", "Cambio climático"],
  "interviewees": [
    { "name": "Doña Rosalba Angulo", "role": "Líder comunitaria" },
    { "name": "Dr. Julián Pardo", "role": "Biólogo marino" }
  ],
  "sources": [
    { "name": "Consejo Comunitario de Bazán", "institution": "Consejo Comunitario" },
    { "name": "Instituto de Investigaciones Marinas" }
  ],
  "status": "published",
  "schemaVersion": 1,
  "createdAt": { "$date": "2026-01-20T16:00:00Z" },
  "updatedAt": { "$date": "2026-01-25T11:00:00Z" },
  "publishedAt": { "$date": "2026-01-25T11:00:00Z" }
}
```

### Sesión de visualización — `watch_activity_ejemplo.json`

```json
{
  "_id": { "$oid": "674a1f0c9b3d4e2a1c8f5b01" },
  "accountId": 1042,
  "profileId": 3087,
  "contentId": "ser_000201",
  "contentType": "series",
  "episodeId": "epi_0002001",
  "seasonNumber": 1,
  "episodeNumber": 1,
  "planId": 2,
  "subscriptionId": 5518,
  "startedAt": { "$date": "2026-11-12T20:15:00Z" },
  "endedAt": { "$date": "2026-11-12T20:48:20Z" },
  "lastActivityAt": { "$date": "2026-11-12T20:48:20Z" },
  "durationSeconds": 2700,
  "watchedSeconds": 1980,
  "lastPositionSeconds": 2490,
  "playSegments": [
    { "from": 0, "to": 1200 },
    { "from": 1710, "to": 2490 }
  ],
  "status": "closed",
  "completed": true,
  "completionReason": "threshold_90"
}
```

---

## 5. Consultas que justifican el diseño

Todas las consultas provienen de `mongodb/03_consultas.js`.

### 5.1 findOne de serie completa (Consulta 4)

```javascript
db.catalog_items.findOne({ _id: "ser_000201", status: "published", ageRating: { $lte: 12 } })
```

**Por qué es eficiente**: al tener los episodios embebidos dentro de `seasons[].episodes[]`, un único `findOne` por `_id` recupera la serie entera con todas sus temporadas y episodios. No hay `$lookup`, no hay `$unwind`, no hay lecturas adicionales. El índice único sobre `_id` (clave primaria implícita) resuelve la búsqueda en O(1). Si los episodios estuvieran en una colección aparte, necesitaríamos al menos dos rondas (serie + episodios) o un `$lookup` con `pipeline` y `$unwind`, multiplicando I/O y CPU.

---

### 5.2 Búsqueda/filtro de catálogo con paginación (Consultas 1, 2 y 3)

**Consulta 1 — búsqueda textual + filtros combinados**:
```javascript
db.catalog_items.find(
  {
    $text: { $search: "pacífico" },
    status: "published",
    type: "movie",
    genres: "Drama",
    audioLanguages: "es",
    releaseYear: { $gte: 2015, $lte: 2024 },
    ageRating: { $lte: 12 }
  },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1, ageRating: 1, genres: 1 }
).sort({ releaseYear: -1, _id: 1 }).skip(0).limit(20)
```

**Consulta 2 — misma consulta con `explain("executionStats")`** para verificar que el plan usa el índice y no hace sort en memoria.

**Consulta 3 — filtro por idioma sin búsqueda textual**:
```javascript
db.catalog_items.find(
  { status: "published", audioLanguages: "es", ageRating: { $lte: 12 } },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1 }
).sort({ releaseYear: -1, _id: 1 }).skip(0).limit(20)
```

**Por qué son eficientes**: el índice compuesto `ix_catalog_browse` (`status:1, type:1, genres:1, releaseYear:-1, _id:1, ageRating:1`) cubre los filtros de igualdad (`status`, `type`, `genres`), el rango (`releaseYear`), el ordenamiento (`releaseYear:-1, _id:1`) y el filtro de `ageRating`. MongoDB puede hacer *index-only scan* (proyección cubierta) y devolver páginas ordenadas sin leer documentos completos ni ordenar en memoria. El índice de texto `ix_catalog_text_title` atiende la búsqueda `$text` y se combina con los filtros del índice compuesto. Para consultas solo por idioma/año, `ix_catalog_language` (`status:1, audioLanguages:1, releaseYear:-1`) sirve de alternativa.

---

### 5.3 "Continuar viendo" (Consulta 5)

```javascript
db.watch_activity.aggregate([
  { $match: { accountId: 1042, profileId: 3087 } },
  { $sort: { lastActivityAt: -1 } },
  { $group: { _id: "$contentId", last: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$last" } },
  { $match: { completed: false } },
  { $sort: { lastActivityAt: -1 } },
  { $lookup: {
      from: "catalog_items", localField: "contentId", foreignField: "_id",
      pipeline: [{ $project: { title: 1, type: 1, coverUrl: 1, status: 1 } }],
      as: "item"
  } },
  { $unwind: "$item" },
  { $match: { "item.status": "published" } },
  { $limit: 20 },
  { $project: {
      _id: 0, contentId: 1, episodeId: 1,
      lastPositionSeconds: 1, lastActivityAt: 1,
      title: "$item.title", type: "$item.type", coverUrl: "$item.coverUrl"
  } }
])
```

**Por qué funciona bien**: el índice `ix_watch_profile_recent` (`profileId:1, lastActivityAt:-1`) resuelve el `$match` + `$sort` inicial sin escanear. El `$lookup` usa un *pipeline* que proyecta solo los cuatro campos necesarios del catálogo (`title`, `type`, `coverUrl`, `status`), evitando traer el documento completo (que en series incluye todas las temporadas). El filtro `"item.status": "published"` descarta automáticamente contenidos retirados. La referencia `contentId` en `watch_activity` hace posible este cruce sin duplicar datos del catálogo en cada sesión.

---

### 5.4 "Mi lista" con detección de retirados (Consulta 6)

```javascript
db.user_lists.aggregate([
  { $match: { accountId: 1042, profileId: 3087 } },
  { $sort: { addedAt: -1 } },
  { $skip: 0 },
  { $limit: 20 },
  { $lookup: {
      from: "catalog_items", localField: "contentId", foreignField: "_id",
      pipeline: [{ $project: { title: 1, type: 1, coverUrl: 1, status: 1 } }],
      as: "item"
  } },
  { $unwind: "$item" },
  { $addFields: { isWithdrawn: { $eq: ["$item.status", "withdrawn"] } } }
])
```

**Por qué la referencia permite esto**: `user_lists` guarda solo `contentId` y `addedAt`. Al hacer `$lookup` contra `catalog_items`, obtenemos el `status` actual del contenido. El `$addFields` calcula `isWithdrawn` en vuelo: si el contenido fue retirado, la lista lo muestra pero la UI sabe que debe marcarlo (ej. con badge "No disponible") sin haber borrado la preferencia del usuario. Si el contenido estuviera embebido en la lista, no habría forma de saber su estado actual sin actualizar masivamente todas las listas al retirar un título.

---

### 5.5 Informe de consumo por plan y tipo de contenido (Consulta 7)

```javascript
db.watch_activity.aggregate([
  { $match: {
      startedAt: { $gte: ISODate("2026-10-01T00:00:00Z"), $lt: ISODate("2026-11-01T00:00:00Z") }
  } },
  { $group: {
      _id: { planId: "$planId", contentType: "$contentType" },
      totalSeconds: { $sum: "$watchedSeconds" },
      profiles: { $addToSet: "$profileId" }
  } },
  { $project: {
      _id: 0,
      planId: "$_id.planId",
      contentType: "$_id.contentType",
      minutesWatched: { $round: [{ $divide: ["$totalSeconds", 60] }, 2] },
      distinctProfiles: { $size: "$profiles" }
  } },
  { $sort: { planId: 1, contentType: 1 } }
])
```

**Por qué el diseño cross-DB funciona**: `watch_activity` captura `planId` y `subscriptionId` **en el momento de la reproducción** (vienen de la base relacional vía la aplicación). Así, aunque el usuario cambie de plan después, la sesión histórica queda asociada al plan vigente entonces. La agregación agrupa por `planId` y `contentType` (valores `movie`, `series`, `documentary` que vienen del catálogo) y suma `watchedSeconds` (tiempo real visto, sin saltos). El índice `ix_watch_report` (`startedAt:1, planId:1, contentType:1`) acota el escaneo al rango temporal solicitado. No se necesita `$lookup` contra la base relacional porque la información necesaria ya viajó y se guardó en Mongo en el momento del evento.