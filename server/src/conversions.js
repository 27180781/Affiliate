// Shared conversion-recording logic used by both the payment webhook
// (routes/track.js) and manual admin entry (routes/admin.js).
import { query, withTransaction } from './db.js';
import { getSettings } from './settings.js';

/** Round to 2 decimals using integer cents to avoid float drift. */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Record a conversion for an affiliate identified by ref code OR id.
 * Computes commission from the affiliate's own rate, falling back to the
 * global default. Idempotent on order_id.
 *
 * Returns one of:
 *   { matched:false, reason:'unknown_ref' }
 *   { matched:true, duplicate:true,  conversion }   (order_id already existed)
 *   { matched:true, duplicate:false, conversion, rate }  (newly created)
 */
export async function recordConversion({ ref, affiliateId, orderId, amount }) {
  // Resolve the affiliate (by id if given, else by referral code).
  let affiliate;
  if (affiliateId) {
    const { rows } = await query(
      'SELECT id, commission_rate FROM affiliates WHERE id = $1 AND role = $2',
      [affiliateId, 'affiliate']
    );
    affiliate = rows[0];
  } else {
    const { rows } = await query(
      'SELECT id, commission_rate FROM affiliates WHERE custom_ref_code = $1 AND role = $2',
      [ref, 'affiliate']
    );
    affiliate = rows[0];
  }
  if (!affiliate) return { matched: false, reason: 'unknown_ref' };

  const settings = await getSettings();
  const rate =
    affiliate.commission_rate != null ? Number(affiliate.commission_rate) : settings.defaultCommissionRate;

  const purchase = round2(amount);
  const commission = round2(purchase * rate);

  // Idempotency: order_id is UNIQUE. If it already exists, return it as-is.
  const existing = await query(
    'SELECT id, affiliate_id, order_id, purchase_amount, commission_amount, status, created_at FROM conversions WHERE order_id = $1',
    [orderId]
  );
  if (existing.rows[0]) {
    return { matched: true, duplicate: true, conversion: existing.rows[0] };
  }

  const result = await withTransaction(async (client) => {
    const insert = await client.query(
      `INSERT INTO conversions (affiliate_id, order_id, purchase_amount, commission_amount, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (order_id) DO NOTHING
       RETURNING id, affiliate_id, order_id, purchase_amount, commission_amount, status, created_at`,
      [affiliate.id, orderId, purchase, commission]
    );

    // Lost an idempotency race (row inserted concurrently) → fetch & return.
    if (insert.rows.length === 0) {
      const again = await client.query(
        'SELECT id, affiliate_id, order_id, purchase_amount, commission_amount, status, created_at FROM conversions WHERE order_id = $1',
        [orderId]
      );
      return { row: again.rows[0], created: false };
    }

    // Keep the denormalised aggregate caches in step.
    await client.query(
      `UPDATE affiliates
          SET total_earnings  = total_earnings  + $1,
              pending_balance = pending_balance + $1
        WHERE id = $2`,
      [commission, affiliate.id]
    );

    return { row: insert.rows[0], created: true };
  });

  return { matched: true, duplicate: !result.created, conversion: result.row, rate };
}
