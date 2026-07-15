// Tracking endpoints:
//   POST /api/track-conversion   (server-to-server webhook from pay.clicker.co.il)
//   POST /api/track-click        (optional, called by the browser tracking script)
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';
import { recordConversion } from '../conversions.js';

export const trackRouter = Router();

/** Constant-time string comparison that won't throw on length mismatch. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function clientIpHash(req) {
  // req.ip is proxy-aware via `trust proxy`; don't hand-parse XFF (spoofable).
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (!ip) return null;
  // Store only a salted hash — never the raw IP.
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
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

    // Record via the shared helper (resolves affiliate, applies the effective
    // per-affiliate/global commission rate, idempotent on order_id).
    const result = await recordConversion({ ref, orderId, amount });
    if (!result.matched) {
      // Unknown / stale cookie. Not an error the payment gateway should retry.
      return res.status(200).json({ matched: false, reason: result.reason });
    }
    return res.status(result.duplicate ? 200 : 201).json({
      matched: true,
      duplicate: result.duplicate,
      conversion: result.conversion,
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
