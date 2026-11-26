// Create collections with validators only (no secondary indexes)
db = db.getSiblingDB('cineconecta');

// catalog_items
try {
  db.createCollection('catalog_items', {
    validationLevel: 'strict',
    validationAction: 'error',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'type', 'title', 'synopsis', 'releaseYear', 'genres', 'productionCountries', 'audioLanguages', 'subtitleLanguages', 'ageRating', 'coverUrl', 'status', 'schemaVersion', 'createdAt', 'updatedAt'],
        properties: {
          _id: { bsonType: 'string', pattern: '^(mov|ser|doc)_[0-9]{6,}$' },
          type: { enum: ['movie', 'series', 'documentary'] },
          title: { bsonType: 'string', minLength: 1, maxLength: 200 },
          synopsis: { bsonType: 'string', minLength: 1 },
          releaseYear: { bsonType: 'number', minimum: 1888, maximum: 2100 },
          genres: { bsonType: 'array', minItems: 1, uniqueItems: true, items: { bsonType: 'string', minLength: 1 } },
          productionCountries: { bsonType: 'array', minItems: 1, uniqueItems: true, items: { bsonType: 'string', pattern: '^[A-Z]{2}$' } },
          audioLanguages: { bsonType: 'array', minItems: 1, uniqueItems: true, items: { bsonType: 'string', pattern: '^[a-z]{2,3}(-[A-Z]{2})?$' } },
          subtitleLanguages: { bsonType: 'array', uniqueItems: true, items: { bsonType: 'string', pattern: '^[a-z]{2,3}(-[A-Z]{2})?$' } },
          ageRating: { enum: [0, 7, 12, 16, 18] },
          coverUrl: { bsonType: 'string', pattern: '^https?://' },
          status: { enum: ['draft', 'published', 'withdrawn'] },
          schemaVersion: { bsonType: 'number', minimum: 1 },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
          publishedAt: { bsonType: 'date' },
          withdrawnAt: { bsonType: 'date' }
        },
        oneOf: [
          { title: 'Película', required: ['durationMinutes', 'directors', 'cast'], not: { required: ['seasons'] }, properties: { type: { enum: ['movie'] }, durationMinutes: { bsonType: 'number', minimum: 1 }, directors: { bsonType: 'array', minItems: 1, items: { bsonType: 'string', minLength: 1 } }, cast: { bsonType: 'array', minItems: 1, items: { bsonType: 'object', required: ['name'], properties: { name: { bsonType: 'string', minLength: 1 }, character: { bsonType: 'string', minLength: 1 } } } } } },
          { title: 'Serie', required: ['seasons'], properties: { type: { enum: ['series'] }, seasons: { bsonType: 'array', minItems: 1, items: { bsonType: 'object', required: ['seasonNumber', 'description', 'episodes'], properties: { seasonNumber: { bsonType: 'number', minimum: 1 }, description: { bsonType: 'string', minLength: 1 }, episodes: { bsonType: 'array', minItems: 1, items: { bsonType: 'object', required: ['episodeId', 'number', 'title', 'synopsis', 'durationMinutes'], properties: { episodeId: { bsonType: 'string', pattern: '^epi_[0-9]{6,}$' }, number: { bsonType: 'number', minimum: 1 }, title: { bsonType: 'string', minLength: 1 }, synopsis: { bsonType: 'string', minLength: 1 }, durationMinutes: { bsonType: 'number', minimum: 1 } } } } } } } },
          { title: 'Documental', required: ['durationMinutes', 'directors', 'topics'], not: { required: ['seasons'] }, properties: { type: { enum: ['documentary'] }, durationMinutes: { bsonType: 'number', minimum: 1 }, directors: { bsonType: 'array', minItems: 1, items: { bsonType: 'string', minLength: 1 } }, topics: { bsonType: 'array', minItems: 1, items: { bsonType: 'string', minLength: 1 } }, interviewees: { bsonType: 'array', items: { bsonType: 'object', required: ['name'], properties: { name: { bsonType: 'string', minLength: 1 }, role: { bsonType: 'string' } } } }, sources: { bsonType: 'array', items: { bsonType: 'object', required: ['name'], properties: { name: { bsonType: 'string', minLength: 1 }, institution: { bsonType: 'string' } } } } } }
        ]
      }
    }
  });
  print('catalog_items created');
} catch (e) {
  if (e.codeName !== 'NamespaceExists') throw e;
  print('catalog_items already exists');
}

// user_lists
try {
  db.createCollection('user_lists', {
    validationLevel: 'strict',
    validationAction: 'error',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['accountId', 'profileId', 'contentId', 'addedAt'],
        properties: {
          accountId: { bsonType: 'int', minimum: 1 },
          profileId: { bsonType: 'int', minimum: 1 },
          contentId: { bsonType: 'string', pattern: '^(mov|ser|doc)_[0-9]{6,}$' },
          addedAt: { bsonType: 'date' }
        }
      }
    }
  });
  print('user_lists created');
} catch (e) {
  if (e.codeName !== 'NamespaceExists') throw e;
  print('user_lists already exists');
}

// watch_activity
try {
  db.createCollection('watch_activity', {
    validationLevel: 'strict',
    validationAction: 'error',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['accountId', 'profileId', 'contentId', 'contentType', 'planId', 'subscriptionId', 'startedAt', 'lastActivityAt', 'durationSeconds', 'watchedSeconds', 'lastPositionSeconds', 'status', 'completed'],
        properties: {
          _id: { bsonType: 'objectId' },
          accountId: { bsonType: 'int', minimum: 1 },
          profileId: { bsonType: 'int', minimum: 1 },
          contentId: { bsonType: 'string', pattern: '^(mov|ser|doc)_[0-9]{6,}$' },
          contentType: { enum: ['movie', 'series', 'documentary'] },
          episodeId: { bsonType: 'string', pattern: '^epi_[0-9]{6,}$' },
          seasonNumber: { bsonType: 'int', minimum: 1 },
          episodeNumber: { bsonType: 'int', minimum: 1 },
          planId: { bsonType: 'int', minimum: 1 },
          subscriptionId: { bsonType: 'int', minimum: 1 },
          startedAt: { bsonType: 'date' },
          endedAt: { bsonType: 'date' },
          lastActivityAt: { bsonType: 'date' },
          durationSeconds: { bsonType: ['int', 'long', 'double'], minimum: 1 },
          watchedSeconds: { bsonType: ['int', 'long', 'double'], minimum: 0 },
          lastPositionSeconds: { bsonType: ['int', 'long', 'double'], minimum: 0 },
          playSegments: { bsonType: 'array', items: { bsonType: 'object', required: ['from', 'to'], properties: { from: { bsonType: ['int', 'long', 'double'], minimum: 0 }, to: { bsonType: ['int', 'long', 'double'], minimum: 0 } } } },
          status: { enum: ['open', 'paused', 'closed'] },
          completed: { bsonType: 'bool' },
          completionReason: { enum: ['manual', 'threshold_90'] }
        },
        oneOf: [
          { properties: { contentType: { enum: ['movie', 'documentary'] } }, not: { required: ['episodeId', 'seasonNumber', 'episodeNumber'] } },
          { properties: { contentType: { enum: ['series'] } }, required: ['episodeId', 'seasonNumber', 'episodeNumber'] }
        ]
      }
    }
  });
  print('watch_activity created');
} catch (e) {
  if (e.codeName !== 'NamespaceExists') throw e;
  print('watch_activity already exists');
}

// admin_users
try {
  db.createCollection('admin_users', {
    validationLevel: 'strict',
    validationAction: 'error',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['email', 'fullName', 'passwordHash', 'roles', 'isActive', 'createdAt'],
        properties: {
          email: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
          fullName: { bsonType: 'string', minLength: 1, maxLength: 150 },
          passwordHash: { bsonType: 'string', minLength: 60 },
          roles: { bsonType: 'array', minItems: 1, uniqueItems: true, items: { enum: ['catalog_admin', 'report_viewer'] } },
          isActive: { bsonType: 'bool' },
          createdAt: { bsonType: 'date' },
          lastLoginAt: { bsonType: 'date' }
        }
      }
    }
  });
  print('admin_users created');
} catch (e) {
  if (e.codeName !== 'NamespaceExists') throw e;
  print('admin_users already exists');
}

// counters
try {
  db.createCollection('counters');
  print('counters created');
} catch (e) {
  if (e.codeName !== 'NamespaceExists') throw e;
  print('counters already exists');
}

print('All collections created (validators only, no secondary indexes)');