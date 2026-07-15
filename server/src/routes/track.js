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
//  Click tracking (public, called by the browser script). Two entry points:
//    GET  /api/track-click?ref=..&u=..&r=..   → image pixel (no CORS preflight)
//    POST /api/track-click  { ref, landing_url, referrer }
//  Both are fire-and-forget; junk/unknown refs are silently ignored.
// ---------------------------------------------------------------------------

// 1x1 transparent GIF for the image-pixel response.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function recordClick(req, data) {
  const ref = String(data.ref ?? '').trim().toUpperCase();
  if (!ref || !/^[A-Z0-9]{4,32}$/.test(ref)) return;

  const { rows } = await query('SELECT id FROM affiliates WHERE custom_ref_code = $1', [ref]);
  const affiliateId = rows[0]?.id ?? null;
  if (!affiliateId) return;

  await query(
    `INSERT INTO clicks (affiliate_id, ref_code, landing_url, referrer, user_agent, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      affiliateId,
      ref,
      (data.landing_url ?? '').toString().slice(0, 2048) || null,
      (data.referrer ?? '').toString().slice(0, 2048) || null,
      (req.headers['user-agent'] ?? '').toString().slice(0, 512) || null,
      clientIpHash(req),
    ]
  );
}

// Image-pixel beacon — a plain GET, so browsers make no CORS preflight and
// cross-subdomain click tracking "just works".
trackRouter.get('/track-click', async (req, res) => {
  try {
    await recordClick(req, {
      ref: req.query.ref,
      landing_url: req.query.u ?? req.query.landing_url,
      referrer: req.query.r ?? req.query.referrer,
    });
  } catch {
    /* never fail a tracking pixel */
  }
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(PIXEL);
});

// JSON POST variant (kept for server-side / programmatic callers).
trackRouter.post('/track-click', async (req, res, next) => {
  try {
    await recordClick(req, req.body ?? {});
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});
