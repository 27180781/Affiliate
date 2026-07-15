// Admin-only management endpoints.
import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// GET /api/admin/affiliates → every affiliate with live balances
adminRouter.get('/affiliates', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.name, a.email, a.custom_ref_code, a.role, a.created_at,
              COALESCE(c.total_conversions, 0)                                   AS total_conversions,
              COALESCE(c.total_earnings, 0)                                      AS total_earnings,
              COALESCE(c.pending_balance, 0)                                     AS pending_balance,
              COALESCE(c.total_paid, 0)                                          AS total_paid
         FROM affiliates a
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
    const limit = Math.min(parseInt(req.query.limit ?? '100', 10) || 100, 500);
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
      // Lock the row so concurrent pay clicks can't double-decrement.
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
      const { rows } = await client.query(
        `UPDATE conversions SET status = 'paid'
          WHERE affiliate_id = $1 AND status IN ('pending','approved')
        RETURNING commission_amount`,
        [id]
      );
      const paidCount = rows.length;
      await client.query('UPDATE affiliates SET pending_balance = 0 WHERE id = $1', [id]);
      return { paidCount };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
