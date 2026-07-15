// Admin-only management endpoints.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getSettings, updateSettings } from '../settings.js';
import { recordConversion } from '../conversions.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// Strictly parse a commission rate (0..1). Rejects booleans, arrays, empty
// strings, null — anything that Number() would silently coerce to a valid
// number. Returns NaN for invalid input.
function parseRate(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
  return NaN;
}

// GET /api/admin/affiliates → every affiliate with live balances + rate + clicks
adminRouter.get('/affiliates', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.name, a.email, a.custom_ref_code, a.role, a.created_at,
              a.commission_rate,
              COALESCE(c.total_conversions, 0)                                   AS total_conversions,
              COALESCE(c.total_earnings, 0)                                      AS total_earnings,
              COALESCE(c.pending_balance, 0)                                     AS pending_balance,
              COALESCE(c.total_paid, 0)                                          AS total_paid,
              COALESCE(k.total_clicks, 0)                                        AS total_clicks
         FROM affiliates a
         LEFT JOIN (
              SELECT affiliate_id, COUNT(*)::int AS total_clicks
                FROM clicks GROUP BY affiliate_id
         ) k ON k.affiliate_id = a.id
         LEFT JOIN (
              SELECT affiliate_id,
                     COUNT(*)::int                                                       AS total_conversions,
                     SUM(commission_amount)                                              AS total_earnings,
                     SUM(commission_amount) FILTER (WHERE status IN ('pending','approved')) AS pending_balance,
                     SUM(commission_amount) FILTER (WHERE status = 'paid')               AS total_paid
                FROM conversions
               GROUP BY affiliate_id
         ) c ON c.affiliate_id = a.id
        WHERE a.role = 'affiliate'
        ORDER BY pending_balance DESC, a.created_at DESC`
    );
    res.json({ affiliates: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/conversions?status=&limit=&offset= → central conversion list
adminRouter.get('/conversions', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);
    const status = req.query.status;

    const params = [];
    let where = '';
    if (status && ['pending', 'approved', 'paid'].includes(status)) {
      params.push(status);
      where = `WHERE c.status = $${params.length}`;
    }
    params.push(limit, offset);

    const { rows } = await query(
      `SELECT c.id, c.order_id, c.purchase_amount, c.commission_amount, c.status, c.created_at,
              c.affiliate_id, a.name AS affiliate_name, a.email AS affiliate_email,
              a.custom_ref_code
         FROM conversions c
         JOIN affiliates a ON a.id = c.affiliate_id
         ${where}
        ORDER BY c.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ conversions: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/conversions/:id/pay → mark a single conversion as paid
adminRouter.post('/conversions/:id/pay', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (client) => {
      // Lock the AFFILIATE row first (consistent lock order with pay-all, which
      // locks affiliate → conversions), otherwise the two paths can deadlock.
      const owner = await client.query('SELECT affiliate_id FROM conversions WHERE id = $1', [id]);
      if (!owner.rows[0]) return { notFound: true };
      await client.query('SELECT 1 FROM affiliates WHERE id = $1 FOR UPDATE', [owner.rows[0].affiliate_id]);

      // Then lock the conversion row so concurrent pay clicks can't double-decrement.
      const { rows } = await client.query(
        'SELECT id, affiliate_id, commission_amount, status FROM conversions WHERE id = $1 FOR UPDATE',
        [id]
      );
      const conv = rows[0];
      if (!conv) return { notFound: true };
      if (conv.status === 'paid') return { conversion: conv, alreadyPaid: true };

      const upd = await client.query(
        `UPDATE conversions SET status = 'paid' WHERE id = $1
         RETURNING id, order_id, purchase_amount, commission_amount, status, created_at, affiliate_id`,
        [id]
      );
      // Move the amount out of the affiliate's pending balance.
      await client.query(
        `UPDATE affiliates
            SET pending_balance = GREATEST(pending_balance - $1, 0)
          WHERE id = $2`,
        [conv.commission_amount, conv.affiliate_id]
      );
      return { conversion: upd.rows[0] };
    });

    if (updated.notFound) return res.status(404).json({ error: 'Conversion not found' });
    return res.json({ conversion: updated.conversion, alreadyPaid: Boolean(updated.alreadyPaid) });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/affiliates/:id/pay-all → mark all of an affiliate's dues as paid
adminRouter.post('/affiliates/:id/pay-all', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await withTransaction(async (client) => {
      // Lock the affiliate row first so a concurrent /track-conversion credit
      // committed during this transaction is preserved rather than overwritten.
      await client.query('SELECT 1 FROM affiliates WHERE id = $1 FOR UPDATE', [id]);
      const { rows } = await client.query(
        `UPDATE conversions SET status = 'paid'
          WHERE affiliate_id = $1 AND status IN ('pending','approved')
        RETURNING commission_amount`,
        [id]
      );
      const paidCount = rows.length;
      // Recompute the denormalised balance from the source-of-truth table
      // instead of an absolute "= 0" (which could clobber a concurrent credit).
      await client.query(
        `UPDATE affiliates
            SET pending_balance = COALESCE((
                  SELECT SUM(commission_amount) FROM conversions
                   WHERE affiliate_id = $1 AND status IN ('pending','approved')
                ), 0)
          WHERE id = $1`,
        [id]
      );
      return { paidCount };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
//  Global settings (default commission rate + cookie retention days)
// ---------------------------------------------------------------------------

// GET /api/admin/settings
adminRouter.get('/settings', async (_req, res, next) => {
  try {
    const s = await getSettings({ fresh: true });
    res.json({ settings: s });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/settings  { default_commission_rate?, cookie_days? }
adminRouter.put('/settings', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    let rate;
    let days;
    let attribution;

    if (body.default_commission_rate !== undefined) {
      rate = parseRate(body.default_commission_rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        return res.status(400).json({ error: 'default_commission_rate must be a number between 0 and 1' });
      }
    }
    if (body.cookie_days !== undefined) {
      days = parseInt(body.cookie_days, 10);
      if (!Number.isInteger(days) || days < 1 || days > 730) {
        return res.status(400).json({ error: 'cookie_days must be an integer between 1 and 730' });
      }
    }
    if (body.attribution !== undefined) {
      attribution = String(body.attribution);
      if (!['last', 'first'].includes(attribution)) {
        return res.status(400).json({ error: "attribution must be 'last' or 'first'" });
      }
    }

    const s = await updateSettings({ defaultCommissionRate: rate, cookieDays: days, attribution });
    res.json({ settings: s });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
//  Per-affiliate commission rate
// ---------------------------------------------------------------------------

// PATCH /api/admin/affiliates/:id  { commission_rate: number|null, name?: string }
adminRouter.patch('/affiliates/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const sets = [];
    const params = [];

    if ('commission_rate' in body) {
      const raw = body.commission_rate;
      if (raw === null || raw === '') {
        params.push(null);
        sets.push(`commission_rate = $${params.length}`); // null → use global default
      } else {
        const rate = parseRate(raw);
        if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
          return res.status(400).json({ error: 'commission_rate must be a number between 0 and 1, or null' });
        }
        params.push(rate);
        sets.push(`commission_rate = $${params.length}`);
      }
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      params.push(body.name.trim());
      sets.push(`name = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE affiliates SET ${sets.join(', ')}
        WHERE id = $${params.length} AND role = 'affiliate'
        RETURNING id, name, email, custom_ref_code, commission_rate`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Affiliate not found' });
    res.json({ affiliate: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
//  Manual conversion entry (when there is no automated payment webhook yet)
// ---------------------------------------------------------------------------

// POST /api/admin/conversions  { affiliate_id? , ref? , order_id, purchase_amount }
adminRouter.post('/conversions', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const orderId = body.order_id != null ? String(body.order_id).trim() : '';
    const amount = Number(body.purchase_amount);
    const ref = body.ref ? String(body.ref).trim().toUpperCase() : undefined;
    const affiliateId = body.affiliate_id ? String(body.affiliate_id) : undefined;

    if (!orderId) return res.status(400).json({ error: 'order_id is required' });
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'purchase_amount must be a non-negative number' });
    }
    if (!ref && !affiliateId) {
      return res.status(400).json({ error: 'affiliate_id or ref is required' });
    }

    const result = await recordConversion({ ref, affiliateId, orderId, amount });
    if (!result.matched) return res.status(404).json({ error: 'Affiliate not found' });
    return res.status(result.duplicate ? 200 : 201).json({
      duplicate: result.duplicate,
      conversion: result.conversion,
    });
  } catch (err) {
    next(err);
  }
});
