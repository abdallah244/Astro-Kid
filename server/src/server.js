import 'dotenv/config';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { purgeExpiredSessions } from './auth/session.js';
import { buildApp } from './app.js';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);

await purgeExpiredSessions(db);
const purgeInterval = setInterval(() => {
  purgeExpiredSessions(db).catch(() => {});
}, 24 * 60 * 60 * 1000);
purgeInterval.unref();

const app = await buildApp({ db, config });

const shutdown = async () => {
  clearInterval(purgeInterval);
  await app.close();
  await db.end();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
