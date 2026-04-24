-- =============================================================================
-- seed_catalog_semantic_from_comment — fill semantic_description from the
-- Postgres column comment ONLY on rows that don't already have a curated or
-- AI-generated description. Used by analyzePostgresSource after an idempotent
-- catalog refresh, so re-running "Catalog" never wipes existing enrichment.
-- =============================================================================

CREATE OR REPLACE FUNCTION seed_catalog_semantic_from_comment(
  p_data_source_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE data_catalog
  SET
    semantic_description = column_description,
    semantic_description_source = 'db-comment',
    updated_at = NOW()
  WHERE data_source_id = p_data_source_id
    AND semantic_description IS NULL
    AND column_description IS NOT NULL
    AND LENGTH(BTRIM(column_description)) > 0;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_catalog_semantic_from_comment(UUID)
  TO authenticated, service_role;
