// PostgreSQL connection pool + small query helpers.
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// Ensure NUMERIC columns come back as JS numbers rather than strings so the
// JSON we return to clients is numeric. (pg type OID 1700 = NUMERIC.)
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

export const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl, ssl: config.pgSsl ? { rejectUnauthorized: false } : false }
    : { ...config.pg, ssl: config.pgSsl ? { rejectUnauthorized: false } : false }
);

pool.on('error', (err) => {
  // A pooled idle client threw — log and let pg recreate it.
  console.error('[db] unexpected idle client error', err);
});

/** Run a parameterised query. Always use $1,$2… placeholders (never string concat). */
export function query(text, params) {
  return pool.query(text, params);
}

/** Run a set of statements inside a single transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
