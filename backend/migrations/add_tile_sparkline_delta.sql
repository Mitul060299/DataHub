-- Add sparkline_data and delta_pct to dashboard_tiles
ALTER TABLE dashboard_tiles
  ADD COLUMN IF NOT EXISTS sparkline_data JSONB,
  ADD COLUMN IF NOT EXISTS delta_pct DOUBLE PRECISION;
