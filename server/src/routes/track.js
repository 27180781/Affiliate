// Tracking endpoints:
//   POST /api/track-conversion   (server-to-server webhook from pay.clicker.co.il)
//   POST /api/track-click        (optional, called by the browser tracking script)
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';

export const trackRouter = Router();

/** Constant-time string comparison that won't throw on length mismatch. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Round to 2 decimals using integer cents to avoid float drift. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clientIpHash(req) {
  const fwd = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = fwd || req.socket?.remoteAddress || '';
  if (!ip) return null;
  // Store only a salted hash — never the raw IP.
  return createHash('sha256').update(`${config.jwtSecret}:${ip}`).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
//  POST /api/track-conversion
//  Auth: shared secret in the `x-webhook-secret` header.
//  Body: { order_id, purchase_amount, ref }   (ref = clicker_affiliate cookie value)
// ---------------------------------------------------------------------------
trackRouter.post('/track-conversion', async (req, res, next) => {
  try {
    const provided = req.headers['x-webhook-secret'] ?? '';
    if (!safeEqual(provided, config.webhookSecret)) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const body = req.body ?? {};
    const orderId = body.order_id != null ? String(body.order_id).trim() : '';
    // Accept several field names for the affiliate reference / cookie value.
    const refRaw = body.ref ?? body.clicker_affiliate ?? body.affiliate_ref ?? '';
    const ref = String(refRaw).trim().toUpperCase();
    const amount = Number(body.purchase_amount);

    if (!orderId) {
      return res.status(400).json({ error: 'order_id is required' });
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'purchase_amount must be a non-negative number' });
    }

    // No affiliate cookie → organic sale. Acknowledge without recording.
    if (!ref) {
      return res.status(200).json({ matched: false, reason: 'no_ref' });
    }

    // Resolve the referral code to an affiliate.
    const { rows: affRows } = await query(
      'SELECT id FROM affiliates WHERE custom_ref_code = $1 AND role = $2',
      [ref, 'affiliate']
    );
    const affiliate = affRows[0];
    if (!affiliate) {
      // Unknown / stale cookie. Not an error the payment gateway should retry.
      return res.status(200).json({ matched: false, reason: 'unknown_ref' });
    }

    const commission = round2(amount * config.commissionRate);

    // Idempotency: order_id is UNIQUE. If it already exists, return it as-is.
    const existing = await query(
      'SELECT id, affiliate_id, order_id, purchase_amount, commission_amount, status FROM conversions WHERE order_id = $1',
      [orderId]
    );
    if (existing.rows[0]) {
      return res.status(200).json({ matched: true, duplicate: true, conversion: existing.rows[0] });
    }

    const conversion = await withTransaction(async (client) => {
      const insert = await client.query(
        `INSERT INTO conversions (affiliate_id, order_id, purchase_amount, commission_amount, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (order_id) DO NOTHING
         RETURNING id, affiliate_id, order_id, purchase_amount, commission_amount, status, created_at`,
        [affiliate.id, orderId, round2(amount), commission]
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

    return res.status(conversion.created ? 201 : 200).json({
      matched: true,
      duplicate: !conversion.created,
      conversion: conversion.row,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
//  POST /api/track-click   (optional; public, called by the browser script)
//  Body: { ref, landing_url, referrer }
// ---------------------------------------------------------------------------
trackRouter.post('/track-click', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const ref = String(body.ref ?? '').trim().toUpperCase();
    if (!ref || !/^[A-Z0-9]{4,32}$/.test(ref)) {
      return res.status(204).end(); // silently ignore junk — this is fire-and-forget
    }

    const { rows } = await query(
      'SELECT id FROM affiliates WHERE custom_ref_code = $1',
      [ref]
    );
    const affiliateId = rows[0]?.id ?? null;
    if (!affiliateId) return res.status(204).end();

    await query(
      `INSERT INTO clicks (affiliate_id, ref_code, landing_url, referrer, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        affiliateId,
        ref,
        (body.landing_url ?? '').toString().slice(0, 2048) || null,
        (body.referrer ?? '').toString().slice(0, 2048) || null,
        (req.headers['user-agent'] ?? '').toString().slice(0, 512) || null,
        clientIpHash(req),
      ]
    );
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});
