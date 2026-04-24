import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";
import {
  executePostgresQuery,
  type PostgresConfig,
} from "@/lib/datasources/postgres";
import { getCatalogSummary } from "@/lib/datasources/catalog";
import { getDataIntelligence } from "@/lib/datasources/intelligence";
import { getKnowledgeContext } from "@/lib/actions/knowledge";
import { getSemanticEntitiesSummary } from "@/lib/datasources/semantic";
import { generateVisualKnowledgeText } from "@/lib/klipfolio/visual-knowledge";

/** Valid klip_type enum values matching the Postgres enum */
export type KlipType =
  | "kpi_tile"
  | "bar_chart"
  | "line_chart"
  | "area_chart"
  | "pie_chart"
  | "gauge"
  | "table"
  | "sparkline"
  | "scatter_chart"
  | "funnel"
  | "map"
  | "number_comparison"
  | "progress_bar"
  | "heatmap"
  | "combo_chart"
  | "text_widget"
  | "iframe"
  | "radar_chart"
  | "treemap"
  | "waterfall_chart"
  | "sankey"
  | "bullet_chart"
  | "box_plot"
  | "slope_chart"
  | "small_multiples"
  | "metric_card"
  | "status_board"
  | "timeline";

export interface CreateKlipInput {
  name: string;
  type: KlipType;
  description?: string;
  config?: Record<string, unknown>;
  query_id?: string;
  ai_prompt?: string;
}

export interface PreviewDataInput {
  query: string;
  data_source_id?: string;
  limit?: number;
}

export async function executeCreateKlip(
  input: CreateKlipInput,
  userId: string,
  conversationId?: string,
  previewData?: unknown
) {
  const supabase = createAdminClient();

  // Merge sample_data into config when preview data is available
  const config: Record<string, unknown> = {
    ...(input.config || {}),
  };

  if (previewData && typeof previewData === 'object' && 'rows' in (previewData as Record<string, unknown>)) {
    config.sample_data = (previewData as Record<string, unknown>).rows;
  }

  // Auto-enable legend for multi-series charts
  if (config.y_fields && Array.isArray(config.y_fields) && (config.y_fields as string[]).length > 1) {
    if (config.show_legend === undefined) {
      config.show_legend = true;
    }
  }

  const insertData: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    description: input.description || null,
    config,
    created_by: userId,
    ai_generated: true,
    ai_prompt: input.ai_prompt || null,
  };

  // Only set query_id if provided (it's a FK to data_source_queries)
  if (input.query_id) {
    insertData.query_id = input.query_id;
  }

  // Link to AI conversation if available
  if (conversationId) {
    insertData.ai_conversation_id = conversationId;
  }

  const { data: klip, error } = await supabase
    .from("klips")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Klip aanmaken mislukt: ${error.message}`);
  }

  return klip;
}

export interface UpdateKlipInput {
  klip_id: string;
  name?: string;
  type?: KlipType;
  description?: string;
  config?: Record<string, unknown>;
  query_id?: string;
}

export async function executeUpdateKlip(
  input: UpdateKlipInput,
  userId: string,
  previewData?: unknown
) {
  const supabase = createAdminClient();

  // First fetch the existing klip to merge config
  const { data: existing, error: fetchError } = await supabase
    .from("klips")
    .select("*")
    .eq("id", input.klip_id)
    .single();

  if (fetchError || !existing) {
    throw new Error(`Klip niet gevonden: ${fetchError?.message || "onbekend"}`);
  }

  // Save a version snapshot before updating
  await supabase.from("klip_versions").insert({
    klip_id: existing.id,
    version_data: {
      name: existing.name,
      type: existing.type,
      description: existing.description,
      config: existing.config,
      query_id: existing.query_id,
    },
    created_by: userId,
  });

  // Merge new config with existing config
  const existingConfig = (existing.config as Record<string, unknown>) || {};
  const newConfig: Record<string, unknown> = {
    ...existingConfig,
    ...(input.config || {}),
  };

  // Update sample_data from preview if available
  if (previewData && typeof previewData === 'object' && 'rows' in (previewData as Record<string, unknown>)) {
    newConfig.sample_data = (previewData as Record<string, unknown>).rows;
  }

  // Auto-enable legend for multi-series charts
  if (newConfig.y_fields && Array.isArray(newConfig.y_fields) && (newConfig.y_fields as string[]).length > 1) {
    if (newConfig.show_legend === undefined) {
      newConfig.show_legend = true;
    }
  }

  const updateData: Record<string, unknown> = {
    config: newConfig,
    updated_at: new Date().toISOString(),
  };

  if (input.name) updateData.name = input.name;
  if (input.type) updateData.type = input.type;
  if (input.description !== undefined) updateData.description = input.description || null;
  if (input.query_id) updateData.query_id = input.query_id;

  const { data: klip, error } = await supabase
    .from("klips")
    .update(updateData)
    .eq("id", input.klip_id)
    .select()
    .single();

  if (error) {
    throw new Error(`Klip bijwerken mislukt: ${error.message}`);
  }

  return klip;
}

export async function executePreviewData(
  input: PreviewDataInput,
  _userId: string
) {
  const supabase = createAdminClient();

  // If a data_source_id is provided, execute against that external data source
  if (input.data_source_id) {
    const { data: dataSource, error: dsError } = await supabase
      .from("data_sources")
      .select(
        `
        *,
        data_source_type:data_source_types (*)
      `
      )
      .eq("id", input.data_source_id)
      .single();

    if (dsError || !dataSource) {
      throw new Error("Databron niet gevonden");
    }

    if (!dataSource.is_active) {
      throw new Error("Databron is niet actief");
    }

    const typeSlug = dataSource.data_source_type?.slug;

    switch (typeSlug) {
      case "databricks": {
        const config = dataSource.connection_config as DatabricksConfig;
        // No artificial limit — the SQL query itself controls the result size.
        // Databricks has a safety cap of 10000 rows to prevent runaway queries.
        const rows = await executeDatabricksQuery(config, input.query);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          rows,
          columns,
          row_count: rows.length,
        };
      }

      case "postgresql":
      case "supabase-bc": {
        const config = dataSource.connection_config as PostgresConfig;
        const rows = await executePostgresQuery(config, input.query);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          rows,
          columns,
          row_count: rows.length,
        };
      }

      default: {
        throw new Error(`Niet-ondersteund databrontype: ${typeSlug}`);
      }
    }
  }

  // Fallback: no data_source_id provided, try Supabase RPC for local queries
  // Keep a safety limit here since local queries may lack aggregation
  const safeQuery = input.query.replace(/;\s*$/, "");
  const fallbackLimit = input.limit ?? 10000;
  const limitedQuery = `SELECT * FROM (${safeQuery}) AS _preview LIMIT ${fallbackLimit}`;

  const { data, error } = await supabase.rpc("execute_readonly_query", {
    query_text: limitedQuery,
  });

  if (error) {
    throw new Error(`Query uitvoering mislukt: ${error.message}`);
  }

  return {
    rows: data,
    row_count: Array.isArray(data) ? data.length : 0,
  };
}

export async function executeGetDataCatalog(
  dataSourceId: string
): Promise<string> {
  return getCatalogSummary(dataSourceId);
}

export async function executeGetDataIntelligence(
  dataSourceId: string
): Promise<string> {
  return getDataIntelligence(dataSourceId);
}

export async function executeGetKnowledgeContext(): Promise<string> {
  return getKnowledgeContext();
}

export async function executeSaveKnowledge(
  input: { title: string; content: string; category: string; tags?: string[] },
  userId: string
): Promise<unknown> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("knowledge_base")
    .insert({
      title: input.title,
      content: input.content,
      category: input.category,
      tags: input.tags || [],
      source: "AI Assistent",
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Kennis opslaan mislukt: ${error.message}`);
  }

  return data;
}

export async function executeGetVisualKnowledge(): Promise<string> {
  return generateVisualKnowledgeText();
}

export async function executeGetSemanticEntities(
  dataSourceId: string
): Promise<string> {
  return getSemanticEntitiesSummary(dataSourceId);
}

export async function executeListDatasources(userId: string) {
  const supabase = createAdminClient();

  // Query data_sources joined with data_source_types for type info
  const { data, error } = await supabase
    .from("data_sources")
    .select(
      "id, name, is_active, last_refresh_status, created_at, updated_at, data_source_types(id, name, slug)"
    )
    .eq("created_by", userId)
    .order("name");

  if (error) {
    throw new Error(`Databronnen ophalen mislukt: ${error.message}`);
  }

  return data || [];
}
