import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db } from './client.js';

export async function runMigrations() {
  await migrate(db, {
    migrationsFolder: new URL('./migrations', import.meta.url).pathname,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigrations();
}
