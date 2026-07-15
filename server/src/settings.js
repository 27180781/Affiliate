// Global, admin-editable settings (single-row `settings` table).
// A short in-process cache avoids a DB round-trip on every webhook/click while
// still reflecting admin changes within a few seconds.
import { query } from './db.js';
import { config } from './config.js';

let cache = null;
let cacheExpires = 0;
const TTL_MS = 5000;

function normalize(row) {
  return {
    defaultCommissionRate: Number(row.default_commission_rate),
    cookieDays: Number(row.cookie_days),
    attribution: row.attribution === 'first' ? 'first' : 'last',
    updatedAt: row.updated_at,
  };
}

/** Read the settings row (cached). Falls back to env/defaults if the row is missing. */
export async function getSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache && now < cacheExpires) return cache;

  const { rows } = await query(
    'SELECT default_commission_rate, cookie_days, attribution, updated_at FROM settings WHERE id = 1'
  );
  cache = rows[0]
    ? normalize(rows[0])
    : { defaultCommissionRate: config.commissionRate, cookieDays: 30, attribution: 'last', updatedAt: null };
  cacheExpires = now + TTL_MS;
  return cache;
}

/** Update settings (only provided fields change). Returns the new settings. */
export async function updateSettings({ defaultCommissionRate, cookieDays, attribution }) {
  const { rows } = await query(
    `UPDATE settings
        SET default_commission_rate = COALESCE($1, default_commission_rate),
            cookie_days             = COALESCE($2, cookie_days),
            attribution             = COALESCE($3, attribution),
            updated_at              = now()
      WHERE id = 1
      RETURNING default_commission_rate, cookie_days, attribution, updated_at`,
    [defaultCommissionRate ?? null, cookieDays ?? null, attribution ?? null]
  );
  cache = normalize(rows[0]);
  cacheExpires = Date.now() + TTL_MS;
  return cache;
}
