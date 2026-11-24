// Carga sintética alineada con sql/04_datos_sinteticos.sql y el mapa oficial.

const catalog = [
  {
    // Publicado con clasificación 16: el perfil 7 (máximo 7) debe recibir rechazo
    _id: "mov_000102", type: "movie", title: "La última estación",
    synopsis: "Una ingeniera vuelve a su pueblo para recuperar la estación ferroviaria.", releaseYear: 2024,
    genres: ["Drama", "Misterio"], productionCountries: ["CO", "MX"], audioLanguages: ["es"], subtitleLanguages: ["en", "pt"],
    ageRating: 16, coverUrl: "https://cdn.cineconecta.example/covers/mov_000102.jpg", durationMinutes: 112,
    directors: ["Lucía Rojas"], cast: [{ name: "Mateo Gil", character: "Simón" }], status: "published", schemaVersion: 1,
    createdAt: ISODate("2026-02-01T10:00:00Z"), updatedAt: ISODate("2026-02-05T10:00:00Z"), publishedAt: ISODate("2026-02-05T10:00:00Z")
  },
  {
    _id: "mov_000103", type: "movie", title: "Órbita de sal",
    synopsis: "Dos científicas investigan señales bajo el hielo antártico.", releaseYear: 2025,
    genres: ["Ciencia ficción", "Aventura"], productionCountries: ["CL", "AR"], audioLanguages: ["es", "en"], subtitleLanguages: ["es", "fr"],
    ageRating: 18, coverUrl: "https://cdn.cineconecta.example/covers/mov_000103.jpg", durationMinutes: 126,
    directors: ["Nicolás Vera"], cast: [{ name: "Eva Luna", character: "Inés" }], status: "draft", schemaVersion: 1,
    createdAt: ISODate("2026-03-01T10:00:00Z"), updatedAt: ISODate("2026-03-02T10:00:00Z")
  },
  {
    _id: "ser_000202", type: "series", title: "Río de regreso",
    synopsis: "Una familia busca un futuro común a orillas del río Magdalena.", releaseYear: 2025,
    genres: ["Drama", "Familia"], productionCountries: ["CO"], audioLanguages: ["es"], subtitleLanguages: ["en", "es"],
    ageRating: 7, coverUrl: "https://cdn.cineconecta.example/covers/ser_000202.jpg",
    seasons: [
      { seasonNumber: 1, description: "El regreso al pueblo.", episodes: [
        { episodeId: "epi_0002005", number: 1, title: "La orilla", synopsis: "El primer día de vuelta cambia los planes.", durationMinutes: 42 },
        { episodeId: "epi_0002006", number: 2, title: "La creciente", synopsis: "Una creciente amenaza los cultivos.", durationMinutes: 44 },
        { episodeId: "epi_0002007", number: 3, title: "El puente", synopsis: "La comunidad reconstruye su puente.", durationMinutes: 43 }
      ] },
      { seasonNumber: 2, description: "Nuevos acuerdos y viejos secretos.", episodes: [
        { episodeId: "epi_0002008", number: 1, title: "La cosecha", synopsis: "La cosecha reúne a la familia.", durationMinutes: 45 },
        { episodeId: "epi_0002009", number: 2, title: "Aguas claras", synopsis: "Una decisión abre una nueva etapa.", durationMinutes: 46 },
        { episodeId: "epi_0002010", number: 3, title: "El retorno", synopsis: "El pueblo celebra su futuro.", durationMinutes: 47 }
      ] }
    ], status: "published", schemaVersion: 1,
    createdAt: ISODate("2026-04-01T10:00:00Z"), updatedAt: ISODate("2026-04-10T10:00:00Z"), publishedAt: ISODate("2026-04-10T10:00:00Z")
  },
  {
    _id: "doc_000302", type: "documentary", title: "Semillas del páramo",
    synopsis: "Agricultores andinos protegen las fuentes de agua y sus semillas nativas.", releaseYear: 2023,
    genres: ["Documental", "Naturaleza"], productionCountries: ["CO", "EC"], audioLanguages: ["es"], subtitleLanguages: ["en", "fr"],
    ageRating: 0, coverUrl: "https://cdn.cineconecta.example/covers/doc_000302.jpg", durationMinutes: 78,
    directors: ["Sara Cárdenas"], topics: ["Agua", "Agricultura", "Biodiversidad"],
    interviewees: [{ name: "Rosa Quispe", role: "Agricultora" }], sources: [{ name: "Archivo Andino", institution: "Universidad Nacional" }],
    status: "published", schemaVersion: 1, createdAt: ISODate("2026-01-10T10:00:00Z"), updatedAt: ISODate("2026-01-15T10:00:00Z"), publishedAt: ISODate("2026-01-15T10:00:00Z")
  },
  {
    _id: "doc_000303", type: "documentary", title: "Voces que quedan",
    synopsis: "Memorias de músicos que preservan los sonidos del Caribe.", releaseYear: 2020,
    genres: ["Documental", "Música"], productionCountries: ["CO", "ES"], audioLanguages: ["es"], subtitleLanguages: ["en"],
    ageRating: 12, coverUrl: "https://cdn.cineconecta.example/covers/doc_000303.jpg", durationMinutes: 68,
    directors: ["Pilar Méndez"], topics: ["Música", "Memoria"], interviewees: [{ name: "Alma Díaz" }], sources: [{ name: "Fonoteca Caribe" }],
    status: "withdrawn", schemaVersion: 1, createdAt: ISODate("2026-02-10T10:00:00Z"), updatedAt: ISODate("2026-09-01T10:00:00Z"),
    publishedAt: ISODate("2026-02-15T10:00:00Z"), withdrawnAt: ISODate("2026-09-01T10:00:00Z")
  }
];

// revisar unicidad de seasonNumber y de number por temporada
for (const item of catalog.filter(x => x.type === "series")) {
  const seasons = item.seasons.map(s => s.seasonNumber);
  if (new Set(seasons).size !== seasons.length) throw new Error(`seasonNumber duplicado: ${item._id}`);
  for (const season of item.seasons) {
    const numbers = season.episodes.map(e => e.number);
    if (new Set(numbers).size !== numbers.length) throw new Error(`episode.number duplicado: ${item._id}/${season.seasonNumber}`);
  }
}
db.catalog_items.insertMany(catalog);

db.user_lists.insertMany([
  { accountId: NumberInt(1), profileId: NumberInt(1), contentId: "mov_000102", addedAt: ISODate("2026-11-11T12:00:00Z") },
  { accountId: NumberInt(2), profileId: NumberInt(3), contentId: "ser_000202", addedAt: ISODate("2026-11-13T12:00:00Z") },
  { accountId: NumberInt(3), profileId: NumberInt(7), contentId: "doc_000302", addedAt: ISODate("2026-11-16T12:00:00Z") },
  { accountId: NumberInt(10), profileId: NumberInt(20), contentId: "doc_000303", addedAt: ISODate("2026-08-20T12:00:00Z") }
]);

const sessions = [];
let activitySequence = 1;
function session(accountId, profileId, contentId, contentType, planId, subscriptionId, startedAt, durationSeconds, watchedSeconds, lastPositionSeconds, status, completed, completionReason, episode) {
  const started = ISODate(startedAt);
  const sessionDoc = {
    _id: ObjectId(`69200000000000000000${String(activitySequence++).padStart(4, "0")}`), accountId: NumberInt(accountId), profileId: NumberInt(profileId), contentId, contentType,
    planId: NumberInt(planId), subscriptionId: NumberInt(subscriptionId), startedAt: started,
    lastActivityAt: new Date(started.getTime() + 30 * 60000), durationSeconds, watchedSeconds, lastPositionSeconds,
    playSegments: [{ from: 0, to: Math.min(watchedSeconds, lastPositionSeconds) }], status, completed
  };
  if (status === "closed") sessionDoc.endedAt = sessionDoc.lastActivityAt;
  if (completionReason) sessionDoc.completionReason = completionReason;
  if (episode) Object.assign(sessionDoc, episode);
  sessions.push(sessionDoc);
}

// Cuentas 1, 2, 3: sesiones con suscripción vigente a la fecha de cada reproducción
session(1, 1, "mov_000102", "movie", 1, 1, "2026-11-12T20:00:00Z", 6720, 4200, 5100, "closed", true, "manual");
session(1, 1, "mov_000102", "movie", 1, 1, "2026-11-19T20:00:00Z", 6720, 2400, 3900, "paused", false);
session(2, 2, "ser_000202", "series", 2, 2, "2026-11-14T19:00:00Z", 2520, 2350, 2400, "closed", true, "threshold_90", { episodeId: "epi_0002005", seasonNumber: NumberInt(1), episodeNumber: NumberInt(1) });
session(3, 6, "doc_000302", "documentary", 3, 3, "2026-11-17T18:00:00Z", 4680, 2100, 3300, "paused", false);

// Cuenta 5 / perfil 10
session(5, 10, "mov_000102", "movie", 1, 5, "2026-01-15T20:00:00Z", 6720, 4000, 5000, "closed", true, "manual");
session(5, 10, "ser_000202", "series", 2, 6, "2026-02-15T20:00:00Z", 2640, 2400, 2500, "closed", true, "threshold_90", { episodeId: "epi_0002006", seasonNumber: NumberInt(1), episodeNumber: NumberInt(2) });
session(5, 10, "doc_000302", "documentary", 3, 7, "2026-03-15T20:00:00Z", 4680, 1800, 2600, "paused", false);
session(5, 10, "mov_000102", "movie", 3, 8, "2026-11-18T20:00:00Z", 6720, 4000, 5000, "closed", true, "manual");

// cuentas vigentes, actividad del perfil inactivo 22
session(10, 20, "ser_000202", "series", 2, 11, "2026-11-10T19:00:00Z", 2520, 1500, 2200, "paused", false, null, { episodeId: "epi_0002008", seasonNumber: NumberInt(2), episodeNumber: NumberInt(1) });
session(5, 11, "doc_000303", "documentary", 2, 6, "2026-02-20T19:00:00Z", 4080, 4000, 4050, "closed", true, "threshold_90");
session(10, 22, "mov_000102", "movie", 2, 11, "2026-11-10T19:00:00Z", 4080, 4000, 4050, "closed", true, "threshold_90");
session(13, 25, "doc_000302", "documentary", 2, 15, "2026-11-18T18:00:00Z", 4680, 3000, 3900, "paused", false);
session(14, 27, "ser_000202", "series", 3, 16, "2026-11-19T19:00:00Z", 2760, 2500, 2600, "closed", true, "manual", { episodeId: "epi_0002009", seasonNumber: NumberInt(2), episodeNumber: NumberInt(2) });
session(15, 29, "mov_000102", "movie", 2, 17, "2026-11-20T20:00:00Z", 6720, 3200, 4400, "paused", false);

db.watch_activity.insertMany(sessions);

const demoHash = "$2a$10$RpxcT2DZPshwmANBMILFmex8jpg9COHMlEvjtZBJS9D76fgPXZIr2";
db.admin_users.insertMany([
  { email: "admin@cineconecta.example", fullName: "Administración de catálogo", passwordHash: demoHash, roles: ["catalog_admin"], isActive: true, createdAt: ISODate("2026-01-05T12:00:00Z"), lastLoginAt: ISODate("2026-11-20T15:00:00Z") },
  { email: "reportes@cineconecta.example", fullName: "Consulta de reportes", passwordHash: demoHash, roles: ["report_viewer"], isActive: true, createdAt: ISODate("2026-01-06T12:00:00Z") }
]);

db.counters.updateOne({ _id: "mov" }, { $set: { nextValue: 104 } }, { upsert: true });
db.counters.updateOne({ _id: "ser" }, { $set: { nextValue: 203 } }, { upsert: true });
db.counters.updateOne({ _id: "doc" }, { $set: { nextValue: 304 } }, { upsert: true });
db.counters.updateOne({ _id: "epi" }, { $set: { nextValue: 2011 } }, { upsert: true });

print(`Carga completada: ${catalog.length} catálogo, 4 listas, ${sessions.length} sesiones, 2 admins y 4 counters.`);
