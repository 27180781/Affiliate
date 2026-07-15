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

const app = express();

// Behind CapRover's nginx/HAProxy → trust the proxy for correct client IPs
// and secure-cookie handling.
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// --- CORS ------------------------------------------------------------------
// Allow the affiliate dashboard origin plus any *.clicker.co.il subdomain
// (the tracking script's /api/track-click calls come from those subdomains).
const rootDomain = config.rootDomain;
function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server / curl (e.g. the webhook)
  if (config.corsOrigins.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'https:' && config.env === 'production') return false;
    return hostname === rootDomain || hostname.endsWith(`.${rootDomain}`);
  } catch {
    return false;
  }
}
app.use(
  cors({
    origin(origin, cb) {
      return isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

// --- Rate limiting ---------------------------------------------------------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

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
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/affiliate', apiLimiter, affiliateRouter);
app.use('/api/admin', apiLimiter, adminRouter);
app.use('/api', apiLimiter, trackRouter); // /api/track-conversion, /api/track-click

// 404 for unmatched API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

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
