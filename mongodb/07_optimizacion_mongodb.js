// Medición de optimización MongoDB (K-06)
// Compara planes de ejecución ANTES (sin índices) y DESPUÉS (con índices) usando explain("executionStats")
// Ejecutar DESPUÉS de cargar datos de volumen (06_datos_volumen.js) y ANTES de crear índices (04_create_collections_and_indexes.js)
// Para medir "antes": ejecutar este script SIN los índices (dropear índices secundarios primero)
// Para medir "después": crear índices con 04_create_collections_and_indexes.js y volver a ejecutar
//
// Uso:
//   mongosh "mongodb://localhost:27017/cineconecta" mongodb/07_optimizacion_mongodb.js
//
// Resultados: se imprimen en consola; copiar a docs/K-06_optimizacion_mongodb.md

const RUN_BEFORE = (typeof RUN_BEFORE_VAR !== 'undefined') ? RUN_BEFORE_VAR : false; // Cambiar a false para medir "después" de crear índices

function runExplain(queryFn, label) {
  print(`\n${'='.repeat(80)}`);
  print(`${label}`);
  print(`${'='.repeat(80)}`);
  try {
    const result = queryFn();
    printjson(result);
    return result;
  } catch (e) {
    print(`ERROR: ${e.message}`);
    return { error: e.message };
  }
}

function extractMetrics(explainResult) {
  const exec = explainResult.executionStats || explainResult;
  return {
    executionTimeMs: exec.executionTimeMillis || exec.executionTimeEstimate || 'N/A',
    totalKeysExamined: exec.totalKeysExamined || 'N/A',
    totalDocsExamined: exec.totalDocsExamined || 'N/A',
    nReturned: exec.nReturned || 'N/A',
    stages: exec.stages ? exec.stages.map(s => ({
      stage: s.stage,
      inputStage: s.inputStage?.stage,
      keysExamined: s.keysExamined,
      docsExamined: s.docsExamined,
      nReturned: s.nReturned
    })) : []
  };
}

print('\n================================================================================');
print(`MEDICIÓN K-06: ${RUN_BEFORE ? 'ANTES (sin índices secundarios)' : 'DESPUÉS (con índices)'}`);
print('================================================================================');

// Asegurar que estamos en la base correcta
db = db.getSiblingDB('cineconecta');

// ============================================================
// CONSULTA 1: Búsqueda textual + filtros combinados (catálogo)
// Índices involucrados: ix_catalog_text_title (texto) + ix_catalog_browse (compuesto)
// ============================================================
runExplain(() => db.catalog_items.find(
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
).sort({ releaseYear: -1, _id: 1 }).limit(20).explain("executionStats"),
"CONSULTA 1: Búsqueda textual + filtros (movie, Drama, es, 2015-2024, age<=12)"
);

// ============================================================
// CONSULTA 2: Filtros sin búsqueda textual (catálogo)
// Índice: ix_catalog_browse (status, type, genres, releaseYear, _id, ageRating)
// ============================================================
runExplain(() => db.catalog_items.find(
  {
    status: "published",
    type: "movie",
    genres: "Drama",
    releaseYear: { $gte: 2015, $lte: 2024 },
    ageRating: { $lte: 12 }
  },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1, ageRating: 1, genres: 1 }
).sort({ releaseYear: -1, _id: 1 }).limit(20).explain("executionStats"),
"CONSULTA 2: Filtros catálogo sin $text (movie, Drama, 2015-2024, age<=12)"
);

// ============================================================
// CONSULTA 3: Filtro por idioma + año (catálogo)
// Índice: ix_catalog_language (status, audioLanguages, releaseYear)
// ============================================================
runExplain(() => db.catalog_items.find(
  { status: "published", audioLanguages: "es", ageRating: { $lte: 12 } },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1 }
).sort({ releaseYear: -1, _id: 1 }).limit(20).explain("executionStats"),
"CONSULTA 3: Filtro por idioma (es, age<=12)"
);

// ============================================================
// CONSULTA 4: findOne de serie por _id (lectura atómica)
// Índice: _id (pk implícito)
// ============================================================
runExplain(() => db.catalog_items.findOne(
  { _id: "ser_000201", status: "published", ageRating: { $lte: 12 } },
  { title: 1, type: 1, "seasons.$": 1 }
).explain("executionStats"),
"CONSULTA 4: findOne serie por _id (ser_000201)"
);

// ============================================================
// CONSULTA 5: "Continuar viendo" - agregación compleja
// Índices: ix_watch_profile_recent (profileId, lastActivityAt)
//          _id en catalog_items para $lookup
// ============================================================
runExplain(() => db.watch_activity.aggregate([
  { $match: { accountId: 1042, profileId: 3087 } },
  { $sort: { lastActivityAt: -1 } },
  { $group: { _id: "$contentId", last: { $first: "$$ROOT" } } },
  { $replaceRoot: { newRoot: "$last" } },
  { $match: { completed: false } },
  { $sort: { lastActivityAt: -1 } },
  { $lookup: {
      from: "catalog_items",
      localField: "contentId",
      foreignField: "_id",
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
]).explain("executionStats"),
"CONSULTA 5: Continuar viendo (profileId=3087, accountId=1042)"
);

// ============================================================
// CONSULTA 6: "Mi lista" con detección de retirados
// Índices: ix_lists_profile_added (profileId, addedAt)
//          _id en catalog_items para $lookup
// ============================================================
runExplain(() => db.user_lists.aggregate([
  { $match: { accountId: 1042, profileId: 3087 } },
  { $sort: { addedAt: -1 } },
  { $skip: 0 },
  { $limit: 20 },
  { $lookup: {
      from: "catalog_items",
      localField: "contentId",
      foreignField: "_id",
      pipeline: [{ $project: { title: 1, type: 1, coverUrl: 1, status: 1 } }],
      as: "item"
  } },
  { $unwind: "$item" },
  { $addFields: { isWithdrawn: { $eq: ["$item.status", "withdrawn"] } } }
]).explain("executionStats"),
"CONSULTA 6: Mi lista (profileId=3087, accountId=1042)"
);

// ============================================================
// CONSULTA 7: Informe consumo por plan y tipo (cross-DB)
// Índice: ix_watch_report (startedAt, planId, contentType)
// ============================================================
runExplain(() => db.watch_activity.aggregate([
  { $match: {
      startedAt: { $gte: ISODate("2026-10-01T00:00:00Z"), $lt: ISODate("2026-11-01T00:00:00Z") }
  } },
  { $group: {
      _id: { planId: "$planId", contentType: "$contentType" },
      totalSeconds: { $sum: "$watchedSeconds" },
      sessions: { $sum: 1 },
      completed: { $sum: { $cond: ["$completed", 1, 0] } },
      profiles: { $addToSet: "$profileId" }
  } },
  { $project: {
      _id: 0,
      planId: "$_id.planId",
      contentType: "$_id.contentType",
      minutesWatched: { $round: [{ $divide: ["$totalSeconds", 60] }, 2] },
      sessions: 1,
      completed: 1,
      distinctProfiles: { $size: "$profiles" }
  } },
  { $sort: { planId: 1, contentType: 1 } }
]).explain("executionStats"),
"CONSULTA 7: Informe consumo Oct 2026 (startedAt range + group by planId+contentType)"
);

// ============================================================
// CONSULTA 8: Login administrador (email único CI)
// Índice: ux_admin_email_ci (email, collation strength 2)
// ============================================================
runExplain(() => db.admin_users.findOne(
  { email: "admin@cineconecta.example", isActive: true },
  { collation: { locale: "en", strength: 2 } }
).explain("executionStats"),
"CONSULTA 8: Login admin (email CI + isActive)"
);