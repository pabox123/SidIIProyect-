
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

db.createCollection("counters");

