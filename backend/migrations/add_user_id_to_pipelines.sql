-- Migration: add user_id to pipelines table for ownership enforcement
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pipelines_user_id ON pipelines (user_id);
