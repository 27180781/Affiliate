// Authenticated affiliate self-service endpoints (dashboard data).
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { publicAffiliate } from './auth.js';

export const affiliateRouter = Router();

affiliateRouter.use(requireAuth);

// GET /api/affiliate/me → profile + ready-to-share referral link
affiliateRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM affiliates WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Affiliate not found' });
    const affiliate = publicAffiliate(rows[0]);
    const referralLink = `https://${config.rootDomain}/?ref=${encodeURIComponent(affiliate.custom_ref_code)}`;
    res.json({ affiliate, referralLink, rootDomain: config.rootDomain });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliate/stats → KPI card values, computed from source-of-truth tables
affiliateRouter.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*)                                                         AS total_conversions,
         COALESCE(SUM(commission_amount), 0)                              AS total_earnings,
         COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('pending','approved')), 0) AS pending_balance,
         COALESCE(SUM(commission_amount) FILTER (WHERE status = 'paid'), 0)                  AS total_paid
       FROM conversions
       WHERE affiliate_id = $1`,
      [req.user.id]
    );
    const clickRow = await query(
      'SELECT COUNT(*) AS total_clicks FROM clicks WHERE affiliate_id = $1',
      [req.user.id]
    );

    const s = rows[0];
    res.json({
      totalClicks: Number(clickRow.rows[0].total_clicks),
      totalConversions: Number(s.total_conversions),
      totalEarnings: Number(s.total_earnings),
      pendingBalance: Number(s.pending_balance),
      totalPaid: Number(s.total_paid),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliate/conversions?limit=&offset= → recent referred conversions
affiliateRouter.get('/conversions', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);
    const { rows } = await query(
      `SELECT id, order_id, purchase_amount, commission_amount, status, created_at
         FROM conversions
        WHERE affiliate_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ conversions: rows });
  } catch (err) {
    next(err);
  }
});
