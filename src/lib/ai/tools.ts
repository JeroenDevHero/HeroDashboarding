import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateKlipInput {
  title: string;
  type: "bar" | "line" | "pie" | "area" | "number" | "table";
  description: string;
  config?: {
    x_field?: string;
    y_field?: string;
    group_by?: string;
    colors?: string[];
    show_legend?: boolean;
    show_grid?: boolean;
  };
  query?: string;
  datasource_id?: string;
}

export interface PreviewDataInput {
  query: string;
  datasource_id?: string;
  limit?: number;
}

export async function executeCreateKlip(
  input: CreateKlipInput,
  userId: string
) {
  const supabase = createAdminClient();

  const { data: klip, error } = await supabase
    .from("klips")
    .insert({
      title: input.title,
      type: input.type,
      description: input.description || null,
      config: input.config || {},
      query: input.query || null,
      datasource_id: input.datasource_id || null,
      user_id: userId,
    })
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

  // If a datasource_id is provided, fetch the datasource config and execute
  // against that source. For now, we execute SQL directly via Supabase's
  // rpc or raw query capabilities using the admin client.
  if (input.datasource_id) {
    const { data: datasource, error: dsError } = await supabase
      .from("datasources")
      .select("*")
      .eq("id", input.datasource_id)
      .single();

    if (dsError || !datasource) {
      throw new Error("Databron niet gevonden");
    }
  }

  // Execute the query with a LIMIT to prevent excessive data retrieval
  const safeQuery = input.query.replace(/;\s*$/, "");
  const limitedQuery = `SELECT * FROM (${safeQuery}) AS _preview LIMIT ${limit}`;

  const { data, error } = await supabase.rpc("execute_readonly_query", {
    query_text: limitedQuery,
  });

  if (error) {
    // Fallback: try direct query if the RPC function doesn't exist
    // This allows preview even without the custom function
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

  const { data, error } = await supabase
    .from("datasources")
    .select("id, name, type, created_at, updated_at")
    .eq("user_id", userId)
    .order("name");

  if (error) {
    throw new Error(`Databronnen ophalen mislukt: ${error.message}`);
  }

  return data || [];
}
