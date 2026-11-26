// Generar solo watch_activity para 60000 sesiones
const N_USERS = 10000;
const N_SESSIONS = 60000;
const BATCH_SIZE = 1000;

const plans = [1, 2, 3];
const contentTypes = ['movie', 'series', 'documentary'];
const statuses = ['closed', 'closed', 'closed', 'paused', 'open'];

const publishedCatalog = db.catalog_items.find({ status: 'published' }, { _id: 1, type: 1, seasons: 1, durationMinutes: 1 }).toArray();

if (publishedCatalog.length === 0) throw new Error('No hay catálogo publicado para generar sesiones');

print(`\n=== Generando watch_activity: ${N_SESSIONS} sesiones ===`);

let sessionSeq = 1;
const sessions = [];
const START_RANGE = new Date('2025-01-01T00:00:00Z');
const END_RANGE = new Date('2026-12-31T23:59:59Z');

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

for (let s = 0; s < N_SESSIONS; s++) {
  const accountId = randomInt(1, N_USERS);
  const profileId = randomInt((accountId - 1) * 4 + 1, accountId * 4);
  const item = randomItem(publishedCatalog);
  const contentId = item._id;
  const contentType = item.type;
  const planId = randomItem(plans);
  const subscriptionId = randomInt(100000, 999999);
  const startedAt = randomDate(START_RANGE, END_RANGE);
  const durationMinutes = item.durationMinutes || (contentType === 'series' ? 45 : contentType === 'movie' ? 100 : 70);
  const durationSeconds = durationMinutes * 60;
  const watchedPct = Math.random();
  const watchedSeconds = Math.round(durationSeconds * (contentType === 'movie' ? watchedPct * 0.9 : watchedPct * 0.85));
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

print('\n=== Verificando conteo ===');
print(`watch_activity: ${db.watch_activity.countDocuments()}`);