-- Migration: add user_id to import_tables and import_connections for ownership enforcement
ALTER TABLE import_tables ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE import_connections ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_import_tables_user_id ON import_tables (user_id);
CREATE INDEX IF NOT EXISTS idx_import_connections_user_id ON import_connections (user_id);
