import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCatalogForSource,
  analyzeDatabricksSource,
} from "@/lib/datasources/catalog";
import { type DatabricksConfig } from "@/lib/datasources/databricks";

export const dynamic = "force-dynamic";

/**
 * GET /api/datasources/catalog?data_source_id=<uuid>
 * Returns the catalog entries for a data source, grouped by table.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Niet geautoriseerd" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const dataSourceId = searchParams.get("data_source_id");

    if (!dataSourceId) {
      return new Response(
        JSON.stringify({ error: "data_source_id is vereist" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify user owns the data source
    const { data: owned, error: ownedError } = await supabase
      .from("data_sources")
      .select("id")
      .eq("id", dataSourceId)
      .eq("created_by", user.id)
      .single();

    if (ownedError || !owned) {
      return new Response(
        JSON.stringify({ error: "Databron niet gevonden" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const entries = await getCatalogForSource(dataSourceId);

    // Group by table
    const grouped: Record<
      string,
      { catalog_name: string; schema_name: string; table_name: string; columns: typeof entries }
    > = {};

    for (const entry of entries) {
      const key = `${entry.catalog_name}.${entry.schema_name}.${entry.table_name}`;
      if (!grouped[key]) {
        grouped[key] = {
          catalog_name: entry.catalog_name,
          schema_name: entry.schema_name,
          table_name: entry.table_name,
          columns: [],
        };
      }
      grouped[key].columns.push(entry);
    }

    return new Response(
      JSON.stringify({ tables: Object.values(grouped) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/datasources/catalog
 * Triggers a catalog refresh for a data source.
 * Body: { data_source_id: string }
 * Returns immediately with { status: "analyzing" }.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Niet geautoriseerd" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { data_source_id: dataSourceId } = body as {
      data_source_id?: string;
    };

    if (!dataSourceId) {
      return new Response(
        JSON.stringify({ error: "data_source_id is vereist" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify user owns the data source
    const { data: owned, error: ownedError } = await supabase
      .from("data_sources")
      .select("id")
      .eq("id", dataSourceId)
      .eq("created_by", user.id)
      .single();

    if (ownedError || !owned) {
      return new Response(
        JSON.stringify({ error: "Databron niet gevonden" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch full config with admin client
    const admin = createAdminClient();
    const { data: dataSource, error: fetchError } = await admin
      .from("data_sources")
      .select(
        `
        *,
        data_source_type:data_source_types (*)
      `
      )
      .eq("id", dataSourceId)
      .single();

    if (fetchError || !dataSource) {
      return new Response(
        JSON.stringify({ error: "Databron niet gevonden" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const typeSlug = dataSource.data_source_type?.slug;

    if (typeSlug === "databricks") {
      const config = dataSource.connection_config as DatabricksConfig;
      // Fire-and-forget: don't block the response
      analyzeDatabricksSource(dataSourceId, config).catch((err) =>
        console.error("Catalog refresh failed:", err)
      );
    } else {
      return new Response(
        JSON.stringify({
          error: `Catalog analyse niet ondersteund voor type: ${typeSlug}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "analyzing" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
