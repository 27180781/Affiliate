// Centralised configuration, sourced from environment variables.
import dotenv from 'dotenv';
dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Parse TRUST_PROXY into a value Express understands:
//   unset            → trust loopback + private/overlay ranges (recommended)
//   an integer       → that many proxy hops
//   'true' / 'false' → boolean
//   anything else    → passed through as a custom subnet/preset list
function parseTrustProxy(raw) {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return 'loopback, linklocal, uniquelocal';
  }
  const v = raw.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

// Comma-separated list of allowed CORS origins. Supports exact origins and
// a wildcard for any clicker.co.il subdomain (handled in index.js).
const corsOrigins = (process.env.CORS_ORIGINS ??
  'https://affiliate.clicker.co.il')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Secrets are REQUIRED in every environment and fail closed. For local dev you
// may opt in to weak built-in fallbacks by explicitly setting
// ALLOW_INSECURE_DEV_SECRETS=true — never do this in a deployed environment.
const allowInsecureDevSecrets =
  String(process.env.ALLOW_INSECURE_DEV_SECRETS ?? 'false').toLowerCase() === 'true';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),

  // PostgreSQL — either a single DATABASE_URL or discrete PG* vars.
  databaseUrl: process.env.DATABASE_URL,
  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: parseInt(process.env.PGPORT ?? '5432', 10),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'affiliate',
  },
  // Enable TLS to the DB (managed Postgres). Set PGSSL=true to turn on.
  pgSsl: String(process.env.PGSSL ?? 'false').toLowerCase() === 'true',
  // Optional CA (PEM contents) to verify the DB certificate against.
  pgSslCa: process.env.PGSSL_CA || undefined,
  // Explicit, loud opt-out of certificate verification (NOT recommended — only
  // for providers with self-signed certs and no CA available).
  pgSslNoVerify: String(process.env.PGSSL_NO_VERIFY ?? 'false').toLowerCase() === 'true',

  // Auth. Fail closed unless an explicit dev opt-in is set.
  jwtSecret: required('JWT_SECRET', allowInsecureDevSecrets ? 'dev-insecure-secret-change-me' : undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  // Shared secret the payment gateway (pay.clicker.co.il) must send with the
  // conversion webhook. Required in every environment.
  webhookSecret: required('WEBHOOK_SECRET', allowInsecureDevSecrets ? 'dev-insecure-webhook-secret' : undefined),

  // Commission rate applied to purchase_amount (0.20 = 20%).
  commissionRate: parseFloat(process.env.COMMISSION_RATE ?? '0.20'),

  // Dedicated salt for hashing client IPs in the clicks table (never the raw IP,
  // never reuse the JWT secret). Falls back to a static salt if unset.
  ipHashSalt: process.env.IP_HASH_SALT ?? process.env.JWT_SECRET ?? 'clicker-ip-hash-salt',

  // Express `trust proxy`. Default: trust loopback + private/overlay ranges, so
  // req.ip is the first PUBLIC address in X-Forwarded-For regardless of how many
  // (private) proxy hops front the API. This is correct for both the 1-hop
  // (edge → API) and 2-hop (edge → dashboard nginx → API) paths, and — because
  // the real client IP is appended to the RIGHT of any client-forged XFF value —
  // it cannot be spoofed. Override with an integer hop count or a custom subnet
  // list via TRUST_PROXY only if you know your exact topology.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // Root domain used to build referral links shown in the dashboard.
  rootDomain: process.env.ROOT_DOMAIN ?? 'clicker.co.il',

  // Optional explicit public base URL for the click beacon in the tracking
  // script. If unset, it is derived from the request host at serve time.
  publicApiBase: process.env.PUBLIC_API_BASE || '',

  corsOrigins,
};
