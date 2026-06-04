-- Migration 002: Follow-up reminders + activity log
-- Run this in Supabase SQL Editor

-- 1. Add follow_up_at column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS ix_leads_follow_up ON leads(follow_up_at);

-- 2. Create lead_activities table (notes / call log)
CREATE TABLE IF NOT EXISTS lead_activities (
    id            VARCHAR(36) PRIMARY KEY,
    lead_id       VARCHAR(36) NOT NULL,
    tenant_id     VARCHAR(36) NOT NULL,
    note          TEXT,
    activity_type VARCHAR(50) DEFAULT 'note',
    created_by    VARCHAR(255),
    created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_activities_lead    ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS ix_activities_tenant  ON lead_activities(tenant_id);
CREATE INDEX IF NOT EXISTS ix_activities_lead_created ON lead_activities(lead_id, created_at);
