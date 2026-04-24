import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Aggregated stats for one data source's catalog and enrichment progress.
 * Totals are counted from `data_catalog`; embedding count comes from
 * `catalog_embeddings`. Values that don't exist yet come back as 0 so the UI
 * can always render a stable row.
 */
export interface CatalogStats {
  data_source_id: string;
  total_tables: number;
  total_columns: number;
  enriched_columns: number;
  ai_enriched_columns: number;
  ai_enriched_tables: number;
  embeddings_count: number;
  last_enriched_at: string | null;
}

/**
 * Fetch catalog stats for one or more data sources via the
 * `get_catalog_stats` RPC. Silently returns an empty array on failure so
 * callers (server components) can degrade gracefully.
 */
export async function getCatalogStats(
  dataSourceIds: string[]
): Promise<CatalogStats[]> {
  if (dataSourceIds.length === 0) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_catalog_stats", {
    p_data_source_ids: dataSourceIds,
  });

  if (error) {
    console.error("[stats] get_catalog_stats RPC failed:", error.message);
    return [];
  }

  return (data ?? []) as CatalogStats[];
}
