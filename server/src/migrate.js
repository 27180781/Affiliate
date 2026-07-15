// Applies db/schema.sql (and optionally db/seed.sql) to the configured database.
// Usage:
//   node src/migrate.js          # schema only
//   node src/migrate.js --seed   # schema + demo seed data
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In local dev the SQL lives at repo-root/db (../../db from here). Inside the
// container it is baked in and located via DB_DIR (see server/Dockerfile).
const dbDir = process.env.DB_DIR ? resolve(process.env.DB_DIR) : resolve(__dirname, '../../db');

async function run() {
  const withSeed = process.argv.includes('--seed');

  const schema = readFileSync(resolve(dbDir, 'schema.sql'), 'utf8');
  console.log('[migrate] applying schema.sql …');
  await pool.query(schema);
  console.log('[migrate] schema applied.');

  if (withSeed) {
    const seed = readFileSync(resolve(dbDir, 'seed.sql'), 'utf8');
    console.log('[migrate] applying seed.sql …');
    await pool.query(seed);
    console.log('[migrate] seed applied.');
  }

  await pool.end();
  console.log('[migrate] done.');
}

run().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
