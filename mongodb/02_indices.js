db.catalog_items.createIndex({ title: "text" }, { default_language: "spanish", name: "ix_catalog_text_title" });
db.catalog_items.createIndex(
  { status: 1, type: 1, genres: 1, releaseYear: -1, _id: 1, ageRating: 1 },
  { name: "ix_catalog_browse" }
);
db.catalog_items.createIndex(
  { status: 1, audioLanguages: 1, releaseYear: -1 },
  { name: "ix_catalog_language" }
);
db.catalog_items.createIndex(
  { "seasons.episodes.episodeId": 1 },
  { unique: true, partialFilterExpression: { type: "series" }, name: "ux_catalog_episode_id" }
);

db.user_lists.createIndex({ profileId: 1, contentId: 1 }, { unique: true, name: "ux_lists_profile_content" });
db.user_lists.createIndex({ profileId: 1, addedAt: -1 }, { name: "ix_lists_profile_added" });

db.watch_activity.createIndex({ profileId: 1, lastActivityAt: -1 }, { name: "ix_watch_profile_recent" });
db.watch_activity.createIndex({ profileId: 1, contentId: 1, lastActivityAt: -1 }, { name: "ix_watch_profile_content" });
db.watch_activity.createIndex({ startedAt: 1, planId: 1, contentType: 1 }, { name: "ix_watch_report" });

db.admin_users.createIndex(
  { email: 1 },
  { unique: true, collation: { locale: "en", strength: 2 }, name: "ux_admin_email_ci" }
);
