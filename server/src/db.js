// PostgreSQL connection pool + small query helpers.
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// Ensure NUMERIC columns come back as JS numbers rather than strings so the
// JSON we return to clients is numeric. (pg type OID 1700 = NUMERIC.)
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

// TLS config for the DB connection. When enabled, verify the server certificate
// by default (optionally against PGSSL_CA); only skip verification when an
// operator explicitly sets PGSSL_NO_VERIFY=true.
function sslConfig() {
  if (!config.pgSsl) return false;
  if (config.pgSslNoVerify) return { rejectUnauthorized: false };
  return config.pgSslCa
    ? { rejectUnauthorized: true, ca: config.pgSslCa }
    : { rejectUnauthorized: true };
}

export const pool = new Pool(
  config.databaseUrl
    ? { connectionString: config.databaseUrl, ssl: sslConfig() }
    : { ...config.pg, ssl: sslConfig() }
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
