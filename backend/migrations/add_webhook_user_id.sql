-- Migration: Add user_id to webhooks table for per-user access scoping
-- Run once against the application database.

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks (user_id);
