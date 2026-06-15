/// <reference types="node" />

import { defineConfig } from 'drizzle-kit';

const port = Number(process.env.PGPORT ?? 5432);

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
      }
    : {
        host: process.env.PGHOST ?? 'localhost',
        port,
        database: process.env.PGDATABASE ?? 'postgres',
        user: process.env.PGUSER ?? 'postgres',
        password: process.env.PGPASSWORD ?? '',
      },
});
