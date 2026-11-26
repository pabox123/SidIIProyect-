// Carga masiva de datos sintéticos para mediciones de optimización MongoDB (K-06)
// Parametrizable con variables de mongosh:
//   --eval "var n_catalog = 5000; var n_users = 10000; var n_sessions = 50000;"
// IDs a partir de rangos altos para no chocar con datos base (05_datos_sinteticos.js).
// Ejecutar: mongosh "mongodb://localhost:27017/cineconecta" --eval "var n_catalog=5000; var n_users=10000; var n_sessions=50000" mongodb/06_datos_volumen.js

// ============================================================
// CONFIGURACIÓN (defaults)
// ============================================================
const N_CATALOG = typeof n_catalog !== 'undefined' ? n_catalog : 5000;
const N_USERS = typeof n_users !== 'undefined' ? n_users : 10000;
const N_SESSIONS = typeof n_sessions !== 'undefined' ? n_sessions : 50000;
const BATCH_SIZE = 1000;

const GENRES = ['Drama', 'Comedia', 'Acción', 'Ciencia ficción', 'Terror', 'Documental', 'Familia', 'Romance', 'Thriller', 'Misterio', 'Aventura', 'Animación'];
const COUNTRIES = ['CO', 'MX', 'AR', 'CL', 'PE', 'ES', 'US', 'FR', 'BR', 'EC', 'BO', 'UY', 'PY', 'VE', 'CR'];
const AUDIO_LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'zh'];
const SUB_LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'zh', 'es-419', 'en-US', 'fr-FR'];
const TOPICS = ['Historia', 'Ciencia', 'Naturaleza', 'Tecnología', 'Sociedad', 'Cultura', 'Política', 'Economía', 'Salud', 'Medio ambiente'];
const DIRECTORS = ['Ana Martínez', 'Carlos Ruiz', 'Laura Gómez', 'Pedro López', 'María García', 'Juan Pérez', 'Sofía Herrera', 'Diego Torres', 'Elena Jiménez', 'Pablo Moreno'];
const ACTORS = ['Andrés Castro', 'Marcela Rojas', 'Héctor Vargas', 'Valentina Muñoz', 'Ricardo Silva', 'Camila Ortiz', 'Fernando Díaz', 'Isabel Navarro', 'Javier Molina', 'Lucía Romero'];
const ROLES = ['Protagonista', 'Antagonista', 'Secundario', 'Cameo', 'Narrador'];
const INSTITUTIONS = ['Universidad Nacional', 'Instituto de Investigaciones', 'Archivo Histórico', 'Fundación Cultural', 'Centro de Estudios', 'Academia de Ciencias'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomItems(arr, min, max) {
  const n = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const AGE_RATINGS = [0, 7, 12, 16, 18];
const CONTENT_TYPES = ['movie', 'series', 'documentary'];
const STATUSES = ['published', 'published', 'published', 'published', 'draft', 'withdrawn']; // 80% published

// ============================================================
// 1. CATÁLOGO VOLUMEN
// ============================================================
print(`\n=== Generando catálogo: ${N_CATALOG} items ===`);
const catalog = [];
const startId = { mov: 10000, ser: 10000, doc: 10000 };
const episodeCounter = { ser: 10000 };

for (let i = 0; i < N_CATALOG; i++) {
  const type = randomItem(CONTENT_TYPES);
  const prefix = type === 'movie' ? 'mov' : type === 'series' ? 'ser' : 'doc';
  const idNum = String(startId[prefix]++).padStart(6, '0');
  const _id = `${prefix}_${idNum}`;
  const year = randomInt(2000, 2026);
  const status = randomItem(STATUSES);
  const now = new Date();
  const createdAt = randomDate(new Date('2020-01-01'), now);
  const updatedAt = randomDate(createdAt, now);
  let publishedAt, withdrawnAt;
  if (status === 'published') publishedAt = randomDate(createdAt, now);
  if (status === 'withdrawn') { publishedAt = randomDate(createdAt, now); withdrawnAt = randomDate(publishedAt, now); }

  const base = {
    _id, type, title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${idNum}`,
    synopsis: `Sinopsis generada para ${_id}. Contenido de prueba para mediciones de optimización.`,
    releaseYear: year,
    genres: randomItems(GENRES, 1, 3),
    productionCountries: randomItems(COUNTRIES, 1, 2),
    audioLanguages: randomItems(AUDIO_LANGS, 1, 2),
    subtitleLanguages: randomItems(SUB_LANGS, 1, 3),
    ageRating: randomItem(AGE_RATINGS),
    coverUrl: `https://cdn.cineconecta.example/covers/${_id}.jpg`,
    status, schemaVersion: 1, createdAt, updatedAt,
    ...(publishedAt && { publishedAt }),
    ...(withdrawnAt && { withdrawnAt })
  };

  if (type === 'movie') {
    catalog.push({
      ...base,
      durationMinutes: randomInt(80, 180),
      directors: randomItems(DIRECTORS, 1, 2),
      cast: randomItems(ACTORS, 2, 5).map(name => ({ name, character: randomItem(ROLES) }))
    });
  } else if (type === 'series') {
    const seasons = [];
    const nSeasons = randomInt(1, 4);
    for (let s = 1; s <= nSeasons; s++) {
      const episodes = [];
      const nEpisodes = randomInt(6, 12);
      for (let e = 1; e <= nEpisodes; e++) {
        const epNum = String(episodeCounter.ser++).padStart(7, '0');
        episodes.push({
          episodeId: `epi_${epNum}`,
          number: e,
          title: `Episodio ${e}`,
          synopsis: `Sinopsis del episodio ${e} de la temporada ${s}`,
          durationMinutes: randomInt(35, 55)
        });
      }
      seasons.push({
        seasonNumber: s,
        description: `Temporada ${s} de la serie ${_id}`,
        episodes
      });
    }
    catalog.push({ ...base, seasons });
  } else { // documentary
    catalog.push({
      ...base,
      durationMinutes: randomInt(45, 120),
      directors: randomItems(DIRECTORS, 1, 2),
      topics: randomItems(TOPICS, 2, 4),
      interviewees: randomItems(ACTORS, 1, 3).map(name => ({ name, role: randomItem(['Experto', 'Testigo', 'Investigador']) })),
      sources: randomItems(INSTITUTIONS, 1, 2).map(name => ({ name, institution: randomItem(INSTITUTIONS) }))
    });
  }

  // Insertar en lotes
  if (catalog.length >= BATCH_SIZE || i === N_CATALOG - 1) {
    db.catalog_items.insertMany(catalog, { ordered: false });
    print(`  Insertados ${i + 1} / ${N_CATALOG} items`);
    catalog.length = 0;
  }
}

// ============================================================
// 2. USUARIOS Y LISTAS (user_lists)
// ============================================================
print(`\n=== Generando user_lists para ${N_USERS} usuarios ===`);
const publishedIds = db.catalog_items.find({ status: 'published' }, { _id: 1 }).toArray().map(d => d._id);
if (publishedIds.length === 0) throw new Error('No hay contenidos publicados para generar listas');

for (let u = 1; u <= N_USERS; u++) {
  const accountId = u;
  const nProfiles = randomInt(1, 4);
  const lists = [];
  for (let p = 1; p <= nProfiles; p++) {
    const profileId = (u - 1) * 4 + p;
    const nItems = randomInt(0, 20);
    const userItems = [...publishedIds].sort(() => 0.5 - Math.random()).slice(0, nItems);
    for (const contentId of userItems) {
      lists.push({
        accountId: NumberInt(accountId),
        profileId: NumberInt(profileId),
        contentId,
        addedAt: randomDate(new Date('2026-01-01'), new Date())
      });
    }
    if (lists.length >= BATCH_SIZE) {
      db.user_lists.insertMany(lists, { ordered: false });
      lists.length = 0;
    }
  }
  if (lists.length) { db.user_lists.insertMany(lists, { ordered: false }); lists.length = 0; }
  if (u % 1000 === 0) print(`  Usuarios procesados: ${u} / ${N_USERS}`);
}

// ============================================================
// 3. SESIONES DE VISUALIZACIÓN (watch_activity)
// ============================================================
print(`\n=== Generando watch_activity: ${N_SESSIONS} sesiones ===`);
const plans = [1, 2, 3]; // Básico, Estándar, Premium
const contentTypes = ['movie', 'series', 'documentary'];
const statuses = ['closed', 'closed', 'closed', 'paused', 'open']; // 60% closed
const publishedCatalog = db.catalog_items.find({ status: 'published' }, { _id: 1, type: 1, seasons: 1, durationMinutes: 1 }).toArray();

if (publishedCatalog.length === 0) throw new Error('No hay catálogo publicado para generar sesiones');

let sessionSeq = 1;
const sessions = [];
const START_RANGE = new Date('2025-01-01T00:00:00Z');
const END_RANGE = new Date('2026-12-31T23:59:59Z');

for (let s = 0; s < N_SESSIONS; s++) {
  const accountId = randomInt(1, N_USERS);
  const profileId = randomInt((accountId - 1) * 4 + 1, accountId * 4);
  const item = randomItem(publishedCatalog);
  const contentId = item._id;
  const contentType = item.type;
  const planId = randomItem(plans);
  const subscriptionId = randomInt(100000, 999999); // IDs de suscripción simulados
  const startedAt = randomDate(START_RANGE, END_RANGE);
  const durationMinutes = item.durationMinutes || (contentType === 'series' ? 45 : contentType === 'movie' ? 100 : 70);
  const durationSeconds = durationMinutes * 60;
  const watchedPct = Math.random(); // 0-1
  const watchedSeconds = Math.round(durationSeconds * (contentType === 'movie' ? watchedPct * 0.9 : watchedPct * 0.85)); // series se ven menos completas
  const lastPositionSeconds = Math.min(watchedSeconds + randomInt(0, 300), durationSeconds - 1);
  const status = randomItem(statuses);
  const completed = status === 'closed' && watchedSeconds / durationSeconds >= 0.9;
  const completionReason = completed ? (watchedSeconds / durationSeconds >= 0.9 && watchedSeconds / durationSeconds < 1 ? 'threshold_90' : 'manual') : undefined;

  let episode = null;
  if (contentType === 'series' && item.seasons && item.seasons.length > 0) {
    const season = randomItem(item.seasons);
    const episodeObj = randomItem(season.episodes);
    episode = {
      episodeId: episodeObj.episodeId,
      seasonNumber: NumberInt(season.seasonNumber),
      episodeNumber: NumberInt(episodeObj.number)
    };
  }

  const sessionDoc = {
    accountId: NumberInt(accountId),
    profileId: NumberInt(profileId),
    contentId,
    contentType,
    ...(episode && episode),
    planId: NumberInt(planId),
    subscriptionId: NumberInt(subscriptionId),
    startedAt,
    lastActivityAt: new Date(startedAt.getTime() + Math.random() * durationSeconds * 1000),
    durationSeconds,
    watchedSeconds,
    lastPositionSeconds,
    playSegments: [{ from: 0, to: Math.min(watchedSeconds, lastPositionSeconds) }],
    status,
    completed,
    ...(completionReason && { completionReason }),
    ...(status === 'closed' && { endedAt: new Date(startedAt.getTime() + Math.random() * durationSeconds * 1000) })
  };

  sessions.push(sessionDoc);

  if (sessions.length >= BATCH_SIZE) {
    db.watch_activity.insertMany(sessions, { ordered: false });
    sessions.length = 0;
  }
  if ((s + 1) % 10000 === 0) print(`  Sesiones generadas: ${s + 1} / ${N_SESSIONS}`);
}
if (sessions.length) { db.watch_activity.insertMany(sessions, { ordered: false }); }

// ============================================================
// 4. ACTUALIZAR COUNTERS
// ============================================================
print('\n=== Actualizando contadores ===');
const maxMov = db.catalog_items.find({ _id: /^mov_/ }).sort({ _id: -1 }).limit(1).toArray()[0];
const maxSer = db.catalog_items.find({ _id: /^ser_/ }).sort({ _id: -1 }).limit(1).toArray()[0];
const maxDoc = db.catalog_items.find({ _id: /^doc_/ }).sort({ _id: -1 }).limit(1).toArray()[0];
const maxEpi = db.catalog_items.aggregate([
  { $match: { type: 'series' } },
  { $unwind: '$seasons' },
  { $unwind: '$seasons.episodes' },
  { $sort: { 'seasons.episodes.episodeId': -1 } },
  { $limit: 1 },
  { $project: { episodeId: '$seasons.episodes.episodeId' } }
]).toArray()[0];

if (maxMov) { const n = parseInt(maxMov._id.split('_')[1]); db.counters.updateOne({ _id: 'mov' }, { $set: { nextValue: n + 1 } }, { upsert: true }); }
if (maxSer) { const n = parseInt(maxSer._id.split('_')[1]); db.counters.updateOne({ _id: 'ser' }, { $set: { nextValue: n + 1 } }, { upsert: true }); }
if (maxDoc) { const n = parseInt(maxDoc._id.split('_')[1]); db.counters.updateOne({ _id: 'doc' }, { $set: { nextValue: n + 1 } }, { upsert: true }); }
if (maxEpi) { const n = parseInt(maxEpi.episodeId.split('_')[1]); db.counters.updateOne({ _id: 'epi' }, { $set: { nextValue: n + 1 } }, { upsert: true }); }

// ============================================================
// 5. REPORTE FINAL
// ============================================================
const stats = {
  catalog: db.catalog_items.countDocuments(),
  user_lists: db.user_lists.countDocuments(),
  watch_activity: db.watch_activity.countDocuments(),
  admin_users: db.admin_users.countDocuments()
};
print('\n=== RESUMEN VOLUMEN ===');
print(JSON.stringify(stats, null, 2));

// Tamaños de colecciones
const collStats = {};
for (const coll of ['catalog_items', 'user_lists', 'watch_activity', 'admin_users']) {
  const s = db[coll].stats();
  collStats[coll] = {
    count: s.count,
    sizeMB: (s.size / 1024 / 1024).toFixed(2),
    storageSizeMB: (s.storageSize / 1024 / 1024).toFixed(2),
    totalIndexSizeMB: (s.totalIndexSize / 1024 / 1024).toFixed(2)
  };
}
print('\n=== TAMAÑOS COLECCIONES ===');
print(JSON.stringify(collStats, null, 2));

// Tamaños de índices
print('\n=== DETALLE ÍNDICES ===');
for (const coll of ['catalog_items', 'user_lists', 'watch_activity', 'admin_users']) {
  const indexes = db[coll].getIndexes();
  print(`\n${coll}:`);
  for (const idx of indexes) {
    const size = db[coll].stats().indexSizes?.[idx.name];
    print(`  ${idx.name}: ${JSON.stringify(idx.key)}${size ? ` (${(size/1024/1024).toFixed(2)} MB)` : ''}`);
  }
}

print('\nCarga de volumen completada.');