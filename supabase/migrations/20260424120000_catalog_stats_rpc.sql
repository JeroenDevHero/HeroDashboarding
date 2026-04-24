-- =============================================================================
-- Catalog stats RPC — fuel the /datasources "Verrijking" progress indicator
-- =============================================================================
-- Returns one row per requested data source, aggregating total tables/columns,
-- how many columns got AI-enriched descriptions, how many embeddings are
-- stored, and the most recent enrichment timestamp. Lets the UI poll a single
-- cheap query instead of firing multiple counts per data source.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_catalog_stats(
  p_data_source_ids UUID[]
)
RETURNS TABLE (
  data_source_id UUID,
  total_tables INTEGER,
  total_columns INTEGER,
  enriched_columns INTEGER,
  ai_enriched_columns INTEGER,
  ai_enriched_tables INTEGER,
  embeddings_count INTEGER,
  last_enriched_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH catalog AS (
    SELECT
      dc.data_source_id,
      COUNT(*)::INTEGER AS total_columns,
      COUNT(DISTINCT (dc.schema_name, dc.table_name))::INTEGER AS total_tables,
      COUNT(*) FILTER (WHERE dc.semantic_description IS NOT NULL)::INTEGER AS enriched_columns,
      COUNT(*) FILTER (WHERE dc.semantic_description_source = 'ai-generated')::INTEGER AS ai_enriched_columns,
      COUNT(DISTINCT (dc.schema_name, dc.table_name)) FILTER (
        WHERE dc.semantic_description_source = 'ai-generated'
      )::INTEGER AS ai_enriched_tables,
      MAX(dc.updated_at) FILTER (
        WHERE dc.semantic_description_source = 'ai-generated'
      ) AS last_enriched_at
    FROM data_catalog dc
    WHERE dc.data_source_id = ANY(p_data_source_ids)
    GROUP BY dc.data_source_id
  ),
  embeddings AS (
    SELECT
      ce.data_source_id,
      COUNT(*)::INTEGER AS embeddings_count
    FROM catalog_embeddings ce
    WHERE ce.data_source_id = ANY(p_data_source_ids)
    GROUP BY ce.data_source_id
  )
  SELECT
    ds.id AS data_source_id,
    COALESCE(c.total_tables, 0) AS total_tables,
    COALESCE(c.total_columns, 0) AS total_columns,
    COALESCE(c.enriched_columns, 0) AS enriched_columns,
    COALESCE(c.ai_enriched_columns, 0) AS ai_enriched_columns,
    COALESCE(c.ai_enriched_tables, 0) AS ai_enriched_tables,
    COALESCE(e.embeddings_count, 0) AS embeddings_count,
    c.last_enriched_at
  FROM data_sources ds
  LEFT JOIN catalog c ON c.data_source_id = ds.id
  LEFT JOIN embeddings e ON e.data_source_id = ds.id
  WHERE ds.id = ANY(p_data_source_ids);
$$;

GRANT EXECUTE ON FUNCTION get_catalog_stats(UUID[])
  TO authenticated, service_role;
