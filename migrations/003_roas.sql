-- Migration 003: ROAS tracking (deal value + ad spend)
-- Run in Supabase SQL Editor

ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS ad_spends (
    id         VARCHAR(36) PRIMARY KEY,
    tenant_id  VARCHAR(36) NOT NULL,
    month      VARCHAR(7)  NOT NULL,
    source     VARCHAR(50) NOT NULL,
    amount     DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_spends_tenant       ON ad_spends(tenant_id);
CREATE INDEX IF NOT EXISTS ix_spends_tenant_month ON ad_spends(tenant_id, month);
