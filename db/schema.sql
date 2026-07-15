-- ============================================================================
--  Clicker Affiliate System — PostgreSQL schema
--  Safe to run repeatedly (idempotent): uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email column

-- ---------------------------------------------------------------------------
--  Enum for conversion lifecycle
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversion_status') THEN
        CREATE TYPE conversion_status AS ENUM ('pending', 'approved', 'paid');
    END IF;
END$$;

-- ---------------------------------------------------------------------------
--  affiliates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliates (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT            NOT NULL,
    email           CITEXT          UNIQUE NOT NULL,
    password_hash   TEXT            NOT NULL,
    -- The public referral code embedded in ?ref=... links.
    custom_ref_code TEXT            UNIQUE NOT NULL,
    role            TEXT            NOT NULL DEFAULT 'affiliate'
                                    CHECK (role IN ('affiliate', 'admin')),
    -- Denormalised aggregate caches (source of truth is the conversions table).
    total_earnings  NUMERIC(12, 2)  NOT NULL DEFAULT 0,   -- lifetime commissions, any status
    pending_balance NUMERIC(12, 2)  NOT NULL DEFAULT 0,   -- commissions not yet paid out
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  conversions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversions (
    id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id      UUID              NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    -- order_id is unique so the payment webhook is idempotent (no double credit).
    order_id          TEXT              UNIQUE NOT NULL,
    purchase_amount   NUMERIC(12, 2)    NOT NULL CHECK (purchase_amount >= 0),
    commission_amount NUMERIC(12, 2)    NOT NULL CHECK (commission_amount >= 0),
    status            conversion_status NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversions_affiliate  ON conversions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_conversions_status     ON conversions(status);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON conversions(created_at DESC);

-- ---------------------------------------------------------------------------
--  clicks (optional click tracking — powers the "total clicks" KPI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clicks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID        REFERENCES affiliates(id) ON DELETE CASCADE,
    ref_code     TEXT        NOT NULL,
    landing_url  TEXT,
    referrer     TEXT,
    user_agent   TEXT,
    ip_hash      TEXT,       -- hashed, never store raw IP
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clicks_affiliate  ON clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_clicks_created_at ON clicks(created_at DESC);
