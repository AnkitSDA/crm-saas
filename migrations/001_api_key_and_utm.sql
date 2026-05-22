-- =====================================================================
-- CRM v1.1 migration: per-tenant api_key + UTM/gclid attribution
-- Run this ONCE in Supabase SQL Editor BEFORE deploying the new backend.
-- Safe to run on existing data - all new columns are nullable or backfilled.
-- =====================================================================

-- 1. Tenants: add api_key column, backfill for existing tenants, then enforce NOT NULL + UNIQUE
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_key VARCHAR(80);

-- Backfill: generate a random key for every existing tenant that doesn't have one.
-- 'crm_' prefix + 43-char base64 chunk (matches Python secrets.token_urlsafe(32)).
UPDATE tenants
SET api_key = 'crm_' || translate(
    encode(gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
)
WHERE api_key IS NULL;

ALTER TABLE tenants ALTER COLUMN api_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_api_key ON tenants(api_key);


-- 2. Leads: add attribution columns (all nullable - old leads stay valid)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source   VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium   VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term     VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content  VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid        VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fbclid       VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page VARCHAR(500);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer     VARCHAR(500);


-- 3. Indexes to keep dashboard queries fast as data grows
CREATE INDEX IF NOT EXISTS ix_leads_tenant_id    ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS ix_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS ix_leads_phone        ON leads(phone);
CREATE INDEX IF NOT EXISTS ix_leads_email        ON leads(email);
CREATE INDEX IF NOT EXISTS ix_leads_assigned_to  ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS ix_leads_utm_source   ON leads(utm_source);
CREATE INDEX IF NOT EXISTS ix_leads_utm_campaign ON leads(utm_campaign);
CREATE INDEX IF NOT EXISTS ix_leads_gclid        ON leads(gclid);
CREATE INDEX IF NOT EXISTS ix_leads_tenant_created ON leads(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users(tenant_id);


-- 4. Verification queries - run these after the migration to confirm
-- SELECT id, name, slug, api_key FROM tenants;
-- \d leads
