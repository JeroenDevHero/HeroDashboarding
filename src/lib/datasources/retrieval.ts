import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTableDocument,
  embedMany,
  embedOne,
  hashContent,
  type CatalogTableDocumentInput,
} from "@/lib/ai/embeddings";
import { getCatalogForSource } from "@/lib/datasources/catalog";

// ---------------------------------------------------------------------------
// Indexing — build/refresh catalog embeddings for a data source
// ---------------------------------------------------------------------------

/**
 * Construct one document per table from the catalog rows and embed them.
 * Only re-embeds tables whose content hash has changed since last run, so
 * repeated calls are cheap.
 *
 * Silently skips embedding when OPENAI_API_KEY is absent (so catalog analysis
 * keeps working — the AI chat just falls back to a heuristic summary).
 */
export async function refreshCatalogEmbeddings(
  dataSourceId: string
): Promise<{
  tables: number;
  embedded: number;
  skipped: number;
  reason?: string;
}> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      tables: 0,
      embedded: 0,
      skipped: 0,
      reason: "OPENAI_API_KEY ontbreekt — embeddings overgeslagen.",
    };
  }

  const supabase = createAdminClient();
  const catalog = await getCatalogForSource(dataSourceId);
  if (catalog.length === 0) {
    return { tables: 0, embedded: 0, skipped: 0 };
  }

  // Group catalog rows by (schema, table)
  const byTable = new Map<string, CatalogTableDocumentInput>();
  for (const row of catalog) {
    const key = `${row.schema_name}.${row.table_name}`;
    if (!byTable.has(key)) {
      byTable.set(key, {
        schema_name: row.schema_name,
        table_name: row.table_name,
        table_description: row.table_description,
        columns: [],
      });
    }
    byTable.get(key)!.columns.push({
      column_name: row.column_name,
      column_type: row.column_type,
      description: row.semantic_description || row.column_description,
      sample_values: Array.isArray(row.sample_values) ? row.sample_values : null,
    });
  }

  // Fetch existing hashes to skip unchanged tables
  const { data: existing } = await supabase
    .from("catalog_embeddings")
    .select("schema_name, table_name, content_hash")
    .eq("data_source_id", dataSourceId);

  const existingHashes = new Map<string, string>();
  for (const row of existing ?? []) {
    existingHashes.set(`${row.schema_name}.${row.table_name}`, row.content_hash);
  }

  const toEmbed: {
    key: string;
    schema_name: string;
    table_name: string;
    content: string;
    content_hash: string;
  }[] = [];
  let skipped = 0;

  for (const [key, doc] of byTable) {
    const content = buildTableDocument(doc);
    const content_hash = hashContent(content);
    if (existingHashes.get(key) === content_hash) {
      skipped++;
      continue;
    }
    toEmbed.push({
      key,
      schema_name: doc.schema_name,
      table_name: doc.table_name,
      content,
      content_hash,
    });
  }

  if (toEmbed.length === 0) {
    return { tables: byTable.size, embedded: 0, skipped };
  }

  // Batch embed
  const vectors = await embedMany(toEmbed.map((t) => t.content));

  // Upsert rows. pgvector wants the vector as a bracketed string like "[0.1,0.2,...]"
  // when passed via JSON, so format it that way.
  const rows = toEmbed.map((t, i) => ({
    data_source_id: dataSourceId,
    schema_name: t.schema_name,
    table_name: t.table_name,
    content: t.content,
    content_hash: t.content_hash,
    embedding: `[${vectors[i].join(",")}]`,
    updated_at: new Date().toISOString(),
  }));

  // Supabase upsert in chunks to avoid hitting payload limits.
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("catalog_embeddings")
      .upsert(chunk, { onConflict: "data_source_id,schema_name,table_name" });
    if (error) {
      throw new Error(
        `Embeddings upsert faalde op chunk ${i / CHUNK}: ${error.message}`
      );
    }
  }

  return { tables: byTable.size, embedded: toEmbed.length, skipped };
}

// ---------------------------------------------------------------------------
// Retrieval — top-K relevant tables for a user query
// ---------------------------------------------------------------------------

export interface MatchedTable {
  schema_name: string;
  table_name: string;
  similarity: number;
}

/**
 * Return the top-K most semantically relevant tables for a natural-language
 * query, scoped to one data source. Returns an empty array when OpenAI is
 * unavailable so callers can fall back to the full catalog.
 */
export async function searchRelevantTables(
  dataSourceId: string,
  query: string,
  topK = 20
): Promise<MatchedTable[]> {
  if (!process.env.OPENAI_API_KEY) return [];

  let vector: number[];
  try {
    vector = await embedOne(query);
  } catch (err) {
    console.error("[retrieval] embed query failed:", err);
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("match_catalog_tables", {
    p_data_source_id: dataSourceId,
    p_query_embedding: `[${vector.join(",")}]`,
    p_match_count: topK,
  });
  if (error) {
    console.error("[retrieval] match_catalog_tables RPC failed:", error.message);
    return [];
  }
  return (data ?? []) as MatchedTable[];
}
