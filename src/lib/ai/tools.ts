import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";

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
  | "iframe";

export interface CreateKlipInput {
  name: string;
  type: KlipType;
  description?: string;
  config?: {
    x_field?: string;
    y_field?: string;
    group_by?: string;
    colors?: string[];
    show_legend?: boolean;
    show_grid?: boolean;
  };
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
  conversationId?: string
) {
  const supabase = createAdminClient();

  const insertData: Record<string, unknown> = {
    name: input.name,
    type: input.type,
    description: input.description || null,
    config: input.config || {},
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

export async function executePreviewData(
  input: PreviewDataInput,
  _userId: string
) {
  const supabase = createAdminClient();
  const limit = input.limit ?? 10;

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
        const rows = await executeDatabricksQuery(config, input.query, limit);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          rows,
          columns,
          row_count: rows.length,
          limited_to: limit,
        };
      }

      case "postgresql": {
        throw new Error("PostgreSQL wordt binnenkort ondersteund");
      }

      default: {
        throw new Error(`Niet-ondersteund databrontype: ${typeSlug}`);
      }
    }
  }

  // Fallback: no data_source_id provided, try Supabase RPC for local queries
  const safeQuery = input.query.replace(/;\s*$/, "");
  const limitedQuery = `SELECT * FROM (${safeQuery}) AS _preview LIMIT ${limit}`;

  const { data, error } = await supabase.rpc("execute_readonly_query", {
    query_text: limitedQuery,
  });

  if (error) {
    throw new Error(`Query uitvoering mislukt: ${error.message}`);
  }

  return {
    rows: data,
    row_count: Array.isArray(data) ? data.length : 0,
    limited_to: limit,
  };
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
