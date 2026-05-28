-- Migration: add project_id column to audit_logs
-- Run this against the production database (Supabase / PostgreSQL).
-- Safe to run multiple times (uses IF NOT EXISTS / DO block).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE audit_logs
            ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id
            ON audit_logs (project_id);
    END IF;
END$$;
