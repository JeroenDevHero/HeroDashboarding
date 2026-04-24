-- =============================================================================
-- Business Central on Supabase support
-- =============================================================================
-- This migration introduces everything needed to plug the dashboard app
-- directly into the BC-synced Supabase database while hiding the schema from
-- end users:
--   1. New data_source_types row: supabase-bc
--   2. semantic_entities — business concepts (Omzet, Debiteur, ...) that map
--      plain-language terms to concrete SQL templates for the AI
--   3. query_feedback — 👍/👎 signals on AI answers so bad patterns stop
--      polluting the context over time
--   4. Extra column on query_patterns: quality_score (derived from feedback)
--   5. Extra columns on data_catalog: table_description, semantic_description
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. New data_source_types
-- -----------------------------------------------------------------------------
INSERT INTO data_source_types (name, slug, description, icon)
VALUES (
  'Business Central (Supabase)',
  'supabase-bc',
  'Business Central-data gesynchroniseerd naar Supabase PostgreSQL. Read-only via dedicated rol.',
  'storage'
)
ON CONFLICT (slug) DO NOTHING;

-- Ensure vanilla postgresql type exists (may already be there from seed)
INSERT INTO data_source_types (name, slug, description, icon)
VALUES (
  'PostgreSQL',
  'postgresql',
  'Directe verbinding met een PostgreSQL database',
  'storage'
)
ON CONFLICT (slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. semantic_entities — business-concept layer
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  synonyms TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  sql_template TEXT NOT NULL,
  required_tables TEXT[] NOT NULL DEFAULT '{}',
  default_filters TEXT,
  created_by_type TEXT NOT NULL DEFAULT 'user'
    CHECK (created_by_type IN ('system', 'ai-suggested', 'user')),
  confidence NUMERIC NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (data_source_id, name)
);

CREATE INDEX IF NOT EXISTS idx_semantic_entities_data_source
  ON semantic_entities(data_source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_entities_synonyms
  ON semantic_entities USING GIN (synonyms);

ALTER TABLE semantic_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view semantic entities"
  ON semantic_entities;
CREATE POLICY "Authenticated users can view semantic entities"
  ON semantic_entities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage semantic entities"
  ON semantic_entities;
CREATE POLICY "Authenticated users can manage semantic entities"
  ON semantic_entities FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Atomic increment function for use counter
CREATE OR REPLACE FUNCTION increment_semantic_use_count(entity_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE semantic_entities
  SET use_count = use_count + 1,
      last_used_at = now()
  WHERE id = entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_semantic_use_count(UUID)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. query_feedback — thumbs up / down + free-text
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
  klip_id UUID REFERENCES klips(id) ON DELETE SET NULL,
  query_pattern_id UUID REFERENCES query_patterns(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_feedback_conversation
  ON query_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_query_feedback_klip
  ON query_feedback(klip_id);
CREATE INDEX IF NOT EXISTS idx_query_feedback_pattern
  ON query_feedback(query_pattern_id);
CREATE INDEX IF NOT EXISTS idx_query_feedback_user
  ON query_feedback(user_id);

ALTER TABLE query_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read all feedback" ON query_feedback;
CREATE POLICY "Users can read all feedback"
  ON query_feedback FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert their own feedback" ON query_feedback;
CREATE POLICY "Users can insert their own feedback"
  ON query_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own feedback" ON query_feedback;
CREATE POLICY "Users can delete their own feedback"
  ON query_feedback FOR DELETE
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. query_patterns.quality_score + automatic update from feedback
-- -----------------------------------------------------------------------------
ALTER TABLE query_patterns
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_query_patterns_quality
  ON query_patterns(data_source_id, quality_score DESC, use_count DESC);

CREATE OR REPLACE FUNCTION update_query_pattern_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.query_pattern_id IS NOT NULL THEN
    UPDATE query_patterns
    SET quality_score = quality_score + NEW.rating
    WHERE id = NEW.query_pattern_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_query_feedback_update_pattern_quality
  ON query_feedback;
CREATE TRIGGER trg_query_feedback_update_pattern_quality
  AFTER INSERT ON query_feedback
  FOR EACH ROW EXECUTE FUNCTION update_query_pattern_quality();

-- -----------------------------------------------------------------------------
-- 5. data_catalog table description + AI-written semantic description
-- -----------------------------------------------------------------------------
ALTER TABLE data_catalog
  ADD COLUMN IF NOT EXISTS table_description TEXT,
  ADD COLUMN IF NOT EXISTS semantic_description TEXT,
  ADD COLUMN IF NOT EXISTS semantic_description_source TEXT
    CHECK (semantic_description_source IN ('db-comment', 'ai-generated', 'user'));

COMMENT ON COLUMN data_catalog.table_description IS
  'Free-form table-level description (from DB COMMENT ON TABLE, or manual).';
COMMENT ON COLUMN data_catalog.semantic_description IS
  'Business-facing explanation of the column in plain Dutch — what it means for the user, not for the developer.';
COMMENT ON COLUMN data_catalog.semantic_description_source IS
  'Where the semantic_description came from so we can re-run AI enrichment without overwriting human curation.';

-- -----------------------------------------------------------------------------
-- 6. data_sources: friendly last_refresh_error + schema_size for sizing
-- -----------------------------------------------------------------------------
ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS last_refresh_error TEXT;

COMMIT;
