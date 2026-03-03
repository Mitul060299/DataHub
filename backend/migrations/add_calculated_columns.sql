CREATE TABLE IF NOT EXISTS calculated_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES dataset_meta(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  formula TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'dynamic',
  cached_value TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dataset_id, name)
);
