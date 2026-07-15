import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { affiliateRouter } from './routes/affiliate.js';
import { adminRouter } from './routes/admin.js';
import { trackRouter } from './routes/track.js';
import { publicRouter } from './routes/public.js';

const app = express();

// Behind CapRover's edge nginx (and, for the dashboard, the client image's own
// nginx /api proxy) → trust the configured number of proxy hops so req.ip and
// the rate limiters key on the real client, not a constant proxy address.
app.set('trust proxy', config.trustProxy);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// --- CORS ------------------------------------------------------------------
// Two policies:
//  1. Strict app CORS — only the explicit dashboard origin(s) in CORS_ORIGINS.
//     (The dashboard normally calls /api same-origin via nginx, so this only
//      matters for split hosting.)
//  2. Wide, NON-credentialed CORS for the public /api/track-click beacon, which
//     is fired by the tracking script from any *.clicker.co.il subdomain.
// Auth uses a Bearer header (not cookies), so credentials are never needed.
const rootDomain = config.rootDomain;

function subdomainOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && config.env === 'production') return cb(new Error('Not allowed by CORS'));
    if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) return cb(null, true);
  } catch {
    /* fall through */
  }
  return cb(new Error('Not allowed by CORS'));
}

// App CORS: allow any explicitly-listed origin (CORS_ORIGINS, e.g. a custom
// non-clicker domain) AND any clicker.co.il subdomain the dashboard may run on.
// This is safe because auth is a Bearer header, not cookies — no credentials
// ride along, so a subdomain can't act on a logged-in user's behalf.
function appOrigin(origin, cb) {
  // No Origin header = server-to-server (curl, the webhook) → allow.
  if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
  return subdomainOrigin(origin, cb);
}

const appCors = cors({ origin: appOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'] });
const clickCors = cors({ origin: subdomainOrigin, methods: ['POST', 'OPTIONS'] });
// Public, cacheable endpoints (tracking script + config) — readable from anywhere.
const publicCors = cors({ origin: subdomainOrigin, methods: ['GET', 'OPTIONS'] });

// --- Rate limiting ---------------------------------------------------------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
// The webhook is authenticated by a shared secret and driven by the payment
// gateway, which may legitimately burst → give it a generous, separate budget.
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false });
const clickLimiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });

// --- Health check (used by CapRover / uptime probes) -----------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'clicker-affiliate-api', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

// --- Routes ----------------------------------------------------------------
// Public config + dynamic tracking script (cacheable; wide CORS, no limiter).
app.use(publicCors, publicRouter); // GET /api/config, GET /clicker-affiliate.js

app.use('/api/auth', appCors, authLimiter, authRouter);
app.use('/api/affiliate', appCors, apiLimiter, affiliateRouter);
app.use('/api/admin', appCors, apiLimiter, adminRouter);

// Tracking: apply per-path CORS + rate limiting as middleware, then let the
// single trackRouter (mounted at /api) handle the routes. The webhook is
// server-to-server (strict CORS, generous limiter); the click beacon is a
// public browser call from any *.clicker.co.il subdomain (wide CORS, own limiter).
app.use('/api/track-conversion', appCors, webhookLimiter);
app.use('/api/track-click', clickCors, clickLimiter);
app.use('/api', trackRouter); // /api/track-conversion, /api/track-click

// 404 for unmatched API routes
app.use('/api', appCors, (_req, res) => res.status(404).json({ error: 'Not found' }));

// --- Central error handler -------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start -----------------------------------------------------------------
const server = app.listen(config.port, () => {
  console.log(`[server] clicker-affiliate-api listening on :${config.port} (${config.env})`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down …`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
