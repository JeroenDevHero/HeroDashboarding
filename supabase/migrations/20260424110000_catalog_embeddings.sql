-- =============================================================================
-- Catalog embeddings — semantic retrieval for data catalog
-- =============================================================================
-- To avoid blowing Claude's context window when a data source has hundreds of
-- tables, we embed each table (name + description + columns + samples) using
-- OpenAI's text-embedding-3-small (1536 dims) and retrieve only the top-K
-- relevant tables per user query via cosine similarity.
-- =============================================================================

-- pgvector is a trusted Supabase extension; install into the "extensions"
-- schema to keep search_path clean.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS catalog_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (data_source_id, schema_name, table_name)
);

CREATE INDEX IF NOT EXISTS idx_catalog_embeddings_source
  ON catalog_embeddings(data_source_id);

-- HNSW index for fast approximate nearest-neighbour search using cosine
-- distance. m=16, ef_construction=64 are sensible defaults for ~thousands
-- of vectors; bump if the catalog grows to 10k+ tables.
CREATE INDEX IF NOT EXISTS idx_catalog_embeddings_hnsw
  ON catalog_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE catalog_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read catalog embeddings"
  ON catalog_embeddings;
CREATE POLICY "Authenticated users can read catalog embeddings"
  ON catalog_embeddings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Writes go exclusively through the service role (admin client from analyze).

-- ---------------------------------------------------------------------------
-- RPC: match_catalog_tables
-- Returns the top-K most semantically relevant tables for a given embedding,
-- scoped to a specific data source.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_catalog_tables(
  p_data_source_id UUID,
  p_query_embedding extensions.vector(1536),
  p_match_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  schema_name TEXT,
  table_name TEXT,
  similarity REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    e.schema_name,
    e.table_name,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM catalog_embeddings e
  WHERE e.data_source_id = p_data_source_id
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION match_catalog_tables(UUID, extensions.vector(1536), INTEGER)
  TO authenticated, service_role;
