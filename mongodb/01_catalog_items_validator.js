// mongosh: use cineconecta; load('01_catalog_items_validator.js')

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
        _id:  { bsonType: "string", pattern: "^(mov|ser|doc)_[0-9]{6,}$" },
        type: { enum: ["movie", "series", "documentary"] },
        title:    { bsonType: "string", minLength: 1, maxLength: 200 },
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
          items: { bsonType: "string", pattern: "^[a-z]{2,3}(-[A-Z]{2})?$" }
        },
        subtitleLanguages: {
          bsonType: "array", uniqueItems: true,
          items: { bsonType: "string", pattern: "^[a-z]{2,3}(-[A-Z]{2})?$" }
        },
        ageRating: { enum: [0, 7, 12, 16, 18] },
        coverUrl:  { bsonType: "string", pattern: "^https?://" },
        status:    { enum: ["draft", "published", "withdrawn"] },
        schemaVersion: { bsonType: "number", minimum: 1 },
        createdAt:   { bsonType: "date" },
        updatedAt:   { bsonType: "date" },
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
                  name:      { bsonType: "string", minLength: 1 },
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
                  description:  { bsonType: "string", minLength: 1 },
                  episodes: {
                    bsonType: "array", minItems: 1,
                    items: {
                      bsonType: "object",
                      required: ["episodeId", "number", "title", "synopsis", "durationMinutes"],
                      properties: {
                        episodeId:       { bsonType: "string", pattern: "^epi_[0-9]{6,}$" },
                        number:          { bsonType: "number", minimum: 1 },
                        title:           { bsonType: "string", minLength: 1 },
                        synopsis:        { bsonType: "string", minLength: 1 },
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
                  name:        { bsonType: "string", minLength: 1 },
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
