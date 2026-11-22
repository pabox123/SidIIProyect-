
db.catalog_items.findOne(
  { _id: "ser_000201", status: "published", ageRating: { $lte: 12 },
    "seasons.episodes.episodeId": "epi_0002001" },
  { title: 1, type: 1, "seasons.$": 1 }
)

// Consulta 1: búsqueda por título, filtros y paginación
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

// Consulta 2: explain para comprobar el uso del índice y el orden por _id
db.catalog_items.find(
  {
    status: "published",
    type: "movie",
    genres: "Drama",
    releaseYear: { $gte: 2015, $lte: 2024 },
    ageRating: { $lte: 12 }
  },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1, ageRating: 1, genres: 1 }
).sort({ releaseYear: -1, _id: 1 }).skip(0).limit(20)
  .explain("executionStats")

// Consulta 3: filtro por idioma con paginación
db.catalog_items.find(
  { status: "published", audioLanguages: "es", ageRating: { $lte: 12 } },
  { title: 1, type: 1, coverUrl: 1, releaseYear: 1 }
).sort({ releaseYear: -1, _id: 1 }).skip(0).limit(20)

// Consulta 4: abrir una serie; temporadas y episodios se consultan embebidos
db.catalog_items.findOne({ _id: "ser_000201", status: "published", ageRating: { $lte: 12 } })

// Consulta 5
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

// Consulta 6
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

// Consulta 7
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

// Consulta 8
db.admin_users.findOne(
  { email: "admin@cineconecta.example", isActive: true },
  { collation: { locale: "en", strength: 2 } }
)
