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

  // Number of reverse proxies in front of the API (Express `trust proxy`).
  // Local/compose: 1. CapRover edge + client nginx /api proxy: 2.
  trustProxy: parseInt(process.env.TRUST_PROXY ?? '1', 10),

  // Root domain used to build referral links shown in the dashboard.
  rootDomain: process.env.ROOT_DOMAIN ?? 'clicker.co.il',

  corsOrigins,
};
