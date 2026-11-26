// mongosh: use cineconecta; load('04_create_collections_and_indexes.js')
// Script consolidado de creación de colecciones e índices para CineConecta.
// Idempotente: usa try/catch para evitar errores si la colección ya existe.
// Nivel de validación: strict + error (rechaza documentos inválidos al insertar/actualizar).

// ============================================================
// 1. COLECCIONES CON VALIDACIÓN $jsonSchema
// ============================================================

// ----- catalog_items -----
// Polimorfismo de esquema vía oneOf: movie / series / documentary.
// Campos base obligatorios para todos los tipos; campos específicos por rama.
// NOTA: La unicidad de seasonNumber dentro de una serie y de episode.number
// dentro de su temporada NO se puede expresar en $jsonSchema (Mongo no valida
// unicidad entre elementos de un array anidado). Esas reglas se aplican en la
// capa de aplicación antes de persistir. El validator sí exige episodeId con
// patrón ^epi_[0-9]{6,}$ y el índice único parcial ux_catalog_episode_id
// garantiza unicidad global de episodeId.
try {
  db.createCollection("catalog_items", {
    validationLevel: "strict",
    validationAction: "error",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "_id", "type", "title", "synopsis", "releaseYear", "genres",
          "productionCountries", "audioLanguages", "subtitleLanguages",
          "ageRating", "coverUrl", "status", "schemaVersion",
          "createdAt", "updatedAt"
        ],
        properties: {
          _id: { bsonType: "string", pattern: "^(mov|ser|doc)_[0-9]{6,}$" },
          type: { enum: ["movie", "series", "documentary"] },
          title: { bsonType: "string", minLength: 1, maxLength: 200 },
          synopsis: { bsonType: "string", minLength: 1 },
          releaseYear: { bsonType: "number", minimum: 1888, maximum: 2100 },
          genres: {
            bsonType: "array", minItems: 1, uniqueItems: true,
            items: { bsonType: "string", minLength: 1 }
          },
          productionCountries: {
            bsonType: "array", minItems: 1, uniqueItems: true,
            items: { bsonType: "string", pattern: "^[A-Z]{2}$" }
          },
          audioLanguages: {
            bsonType: "array", minItems: 1, uniqueItems: true,
            items: { bsonType: "string", pattern: "^[a-z]{2,3}(-[A-Z]{2}|-[0-9]{3})?$" }
          },
          subtitleLanguages: {
            bsonType: "array", uniqueItems: true,
            items: { bsonType: "string", pattern: "^[a-z]{2,3}(-[A-Z]{2}|-[0-9]{3})?$" }
          },
          ageRating: { enum: [0, 7, 12, 16, 18] },
          coverUrl: { bsonType: "string", pattern: "^https?://" },
          status: { enum: ["draft", "published", "withdrawn"] },
          schemaVersion: { bsonType: "number", minimum: 1 },
          createdAt: { bsonType: "date" },
          updatedAt: { bsonType: "date" },
          publishedAt: { bsonType: "date" },
          withdrawnAt: { bsonType: "date" }
        },
        oneOf: [
          {
            title: "Película",
            required: ["durationMinutes", "directors", "cast"],
            not: { required: ["seasons"] },
            properties: {
              type: { enum: ["movie"] },
              durationMinutes: { bsonType: "number", minimum: 1 },
              directors: {
                bsonType: "array", minItems: 1,
                items: { bsonType: "string", minLength: 1 }
              },
              cast: {
                bsonType: "array", minItems: 1,
                items: {
                  bsonType: "object",
                  required: ["name"],
                  properties: {
                    name: { bsonType: "string", minLength: 1 },
                    character: { bsonType: "string", minLength: 1 }
                  }
                }
              }
            }
          },
          {
            title: "Serie",
            required: ["seasons"],
            properties: {
              type: { enum: ["series"] },
              seasons: {
                bsonType: "array", minItems: 1,
                items: {
                  bsonType: "object",
                  required: ["seasonNumber", "description", "episodes"],
                  properties: {
                    seasonNumber: { bsonType: "number", minimum: 1 },
                    description: { bsonType: "string", minLength: 1 },
                    episodes: {
                      bsonType: "array", minItems: 1,
                      items: {
                        bsonType: "object",
                        required: ["episodeId", "number", "title", "synopsis", "durationMinutes"],
                        properties: {
                          episodeId: { bsonType: "string", pattern: "^epi_[0-9]{6,}$" },
                          number: { bsonType: "number", minimum: 1 },
                          title: { bsonType: "string", minLength: 1 },
                          synopsis: { bsonType: "string", minLength: 1 },
                          durationMinutes: { bsonType: "number", minimum: 1 }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            title: "Documental",
            required: ["durationMinutes", "directors", "topics"],
            not: { required: ["seasons"] },
            properties: {
              type: { enum: ["documentary"] },
              durationMinutes: { bsonType: "number", minimum: 1 },
              directors: {
                bsonType: "array", minItems: 1,
                items: { bsonType: "string", minLength: 1 }
              },
              topics: {
                bsonType: "array", minItems: 1,
                items: { bsonType: "string", minLength: 1 }
              },
              interviewees: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  required: ["name"],
                  properties: {
                    name: { bsonType: "string", minLength: 1 },
                    role: { bsonType: "string" }
                  }
                }
              },
              sources: {
                bsonType: "array",
                items: {
                  bsonType: "object",
                  required: ["name"],
                  properties: {
                    name: { bsonType: "string", minLength: 1 },
                    institution: { bsonType: "string" }
                  }
                }
              }
            }
          }
        ]
      }
    }
  });
  print("Colección 'catalog_items' creada (o ya existente).");
} catch (e) {
  if (e.codeName !== "NamespaceExists") {
    throw e;
  }
  print("Colección 'catalog_items' ya existe, se omite creación.");
}

// ----- user_lists -----
// "Mi lista" por perfil. Índice único compuesto (profileId, contentId) evita duplicados.
// contentId referencia a catalog_items._id; validación de patrón idéntico.
try {
  db.createCollection("user_lists", {
    validationLevel: "strict",
    validationAction: "error",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["accountId", "profileId", "contentId", "addedAt"],
        properties: {
          accountId: { bsonType: "int", minimum: 1 },
          profileId: { bsonType: "int", minimum: 1 },
          contentId: { bsonType: "string", pattern: "^(mov|ser|doc)_[0-9]{6,}$" },
          addedAt: { bsonType: "date" }
        }
      }
    }
  });
  print("Colección 'user_lists' creada (o ya existente).");
} catch (e) {
  if (e.codeName !== "NamespaceExists") {
    throw e;
  }
  print("Colección 'user_lists' ya existe, se omite creación.");
}

// ----- watch_activity -----
// Sesiones de reproducción. oneOf valida que movie/documentary NO tengan
// episodeId/seasonNumber/episodeNumber, y que series SÍ los tengan obligatorios.
// planId y subscriptionId capturan el plan vigente en el momento de la sesión
// (vienen de la BD relacional). playSegments registra tramos vistos para
// calcular watchedSeconds excluyendo saltos.
try {
  db.createCollection("watch_activity", {
    validationLevel: "strict",
    validationAction: "error",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "accountId", "profileId", "contentId", "contentType", "planId",
          "subscriptionId", "startedAt", "lastActivityAt", "durationSeconds",
          "watchedSeconds", "lastPositionSeconds", "status", "completed"
        ],
        properties: {
          _id: { bsonType: "objectId" },
          accountId: { bsonType: "int", minimum: 1 },
          profileId: { bsonType: "int", minimum: 1 },
          contentId: { bsonType: "string", pattern: "^(mov|ser|doc)_[0-9]{6,}$" },
          contentType: { enum: ["movie", "series", "documentary"] },
          episodeId: { bsonType: "string", pattern: "^epi_[0-9]{6,}$" },
          seasonNumber: { bsonType: "int", minimum: 1 },
          episodeNumber: { bsonType: "int", minimum: 1 },
          planId: { bsonType: "int", minimum: 1 },
          subscriptionId: { bsonType: "int", minimum: 1 },
          startedAt: { bsonType: "date" },
          endedAt: { bsonType: "date" },
          lastActivityAt: { bsonType: "date" },
          durationSeconds: { bsonType: ["int", "long", "double"], minimum: 1 },
          watchedSeconds: { bsonType: ["int", "long", "double"], minimum: 0 },
          lastPositionSeconds: { bsonType: ["int", "long", "double"], minimum: 0 },
          playSegments: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["from", "to"],
              properties: {
                from: { bsonType: ["int", "long", "double"], minimum: 0 },
                to: { bsonType: ["int", "long", "double"], minimum: 0 }
              }
            }
          },
          status: { enum: ["open", "paused", "closed"] },
          completed: { bsonType: "bool" },
          completionReason: { enum: ["manual", "threshold_90"] }
        },
        oneOf: [
          {
            properties: { contentType: { enum: ["movie", "documentary"] } },
            not: { required: ["episodeId", "seasonNumber", "episodeNumber"] }
          },
          {
            properties: { contentType: { enum: ["series"] } },
            required: ["episodeId", "seasonNumber", "episodeNumber"]
          }
        ]
      }
    }
  });
  print("Colección 'watch_activity' creada (o ya existente).");
} catch (e) {
  if (e.codeName !== "NamespaceExists") {
    throw e;
  }
  print("Colección 'watch_activity' ya existe, se omite creación.");
}

// ----- admin_users -----
// Usuarios administradores, dominio separado de cuentas de clientes (BD relacional).
// passwordHash espera bcrypt (minLength 60). roles: catalog_admin | report_viewer.
try {
  db.createCollection("admin_users", {
    validationLevel: "strict",
    validationAction: "error",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["email", "fullName", "passwordHash", "roles", "isActive", "createdAt"],
        properties: {
          email: { bsonType: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
          fullName: { bsonType: "string", minLength: 1, maxLength: 150 },
          passwordHash: { bsonType: "string", minLength: 60 },
          roles: {
            bsonType: "array",
            minItems: 1,
            uniqueItems: true,
            items: { enum: ["catalog_admin", "report_viewer"] }
          },
          isActive: { bsonType: "bool" },
          createdAt: { bsonType: "date" },
          lastLoginAt: { bsonType: "date" }
        }
      }
    }
  });
  print("Colección 'admin_users' creada (o ya existente).");
} catch (e) {
  if (e.codeName !== "NamespaceExists") {
    throw e;
  }
  print("Colección 'admin_users' ya existe, se omite creación.");
}

// ----- counters -----
// Secuencias atómicas para IDs estables (mov_, ser_, doc_, epi_).
// Sin validación: solo la aplicación la toca.
try {
  db.createCollection("counters");
  print("Colección 'counters' creada (o ya existente).");
} catch (e) {
  if (e.codeName !== "NamespaceExists") {
    throw e;
  }
  print("Colección 'counters' ya existe, se omite creación.");
}

// ============================================================
// 2. ÍNDICES PARA CONSULTAS PRINCIPALES
// ============================================================

// ----- catalog_items -----
// Índice de texto para búsqueda por título (consulta 1).
db.catalog_items.createIndex(
  { title: "text" },
  { default_language: "spanish", name: "ix_catalog_text_title" }
);

// Índice compuesto para navegación/filtros de catálogo (consultas 1, 2, 3).
// Cubre: status + type + genres (igualdad), releaseYear (rango + orden),
// _id (desempate), ageRating (filtro). Permite index-only scan con proyección.
db.catalog_items.createIndex(
  { status: 1, type: 1, genres: 1, releaseYear: -1, _id: 1, ageRating: 1 },
  { name: "ix_catalog_browse" }
);

// Índice alternativo para filtros solo por idioma/año (consulta 3).
db.catalog_items.createIndex(
  { status: 1, audioLanguages: 1, releaseYear: -1 },
  { name: "ix_catalog_language" }
);

// Índice único parcial para episodeId global en series.
// Evita episodios duplicados entre series y dentro de una misma serie.
db.catalog_items.createIndex(
  { "seasons.episodes.episodeId": 1 },
  { unique: true, partialFilterExpression: { type: "series" }, name: "ux_catalog_episode_id" }
);

// ----- user_lists -----
// Único por perfil + contenido: impide duplicados en "Mi lista".
db.user_lists.createIndex(
  { profileId: 1, contentId: 1 },
  { unique: true, name: "ux_lists_profile_content" }
);

// Orden por fecha de adición para paginación de la lista.
db.user_lists.createIndex(
  { profileId: 1, addedAt: -1 },
  { name: "ix_lists_profile_added" }
);

// ----- watch_activity -----
// "Continuar viendo": match por perfil + sort por última actividad (consulta 5).
db.watch_activity.createIndex(
  { profileId: 1, lastActivityAt: -1 },
  { name: "ix_watch_profile_recent" }
);

// Historial por perfil + contenido: soporte para consultas de reprise.
db.watch_activity.createIndex(
  { profileId: 1, contentId: 1, lastActivityAt: -1 },
  { name: "ix_watch_profile_content" }
);

// Informe de consumo por plan y tipo: rango temporal + planId + contentType (consulta 7).
db.watch_activity.createIndex(
  { startedAt: 1, planId: 1, contentType: 1 },
  { name: "ix_watch_report" }
);

// ----- admin_users -----
// Email único case-insensitive para login de administradores.
db.admin_users.createIndex(
  { email: 1 },
  { unique: true, collation: { locale: "en", strength: 2 }, name: "ux_admin_email_ci" }
);

print("Índices creados (o ya existentes).");
print("Script completado.");