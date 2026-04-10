import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Authenticate via Supabase server client
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { data_source_id, query, limit } = body as {
      data_source_id: string;
      query: string;
      limit?: number;
    };

    if (!data_source_id || !query) {
      return NextResponse.json(
        { error: "data_source_id en query zijn vereist" },
        { status: 400 }
      );
    }

    // 3. Fetch the data source config using admin client (bypass RLS, contains secrets)
    const admin = createAdminClient();
    const { data: dataSource, error: dsError } = await admin
      .from("data_sources")
      .select(
        `
        *,
        data_source_type:data_source_types (*)
      `
      )
      .eq("id", data_source_id)
      .single();

    if (dsError || !dataSource) {
      return NextResponse.json(
        { error: "Databron niet gevonden" },
        { status: 404 }
      );
    }

    if (!dataSource.is_active) {
      return NextResponse.json(
        { error: "Databron is niet actief" },
        { status: 400 }
      );
    }

    // 4. Execute the query based on data source type
    const typeSlug = dataSource.data_source_type?.slug;
    let rows: Record<string, unknown>[];

    switch (typeSlug) {
      case "databricks": {
        const config = dataSource.connection_config as DatabricksConfig;
        rows = await executeDatabricksQuery(config, query, limit);
        break;
      }

      case "postgresql": {
        return NextResponse.json(
          { error: "PostgreSQL wordt binnenkort ondersteund" },
          { status: 501 }
        );
      }

      default: {
        return NextResponse.json(
          { error: `Niet-ondersteund type: ${typeSlug}` },
          { status: 400 }
        );
      }
    }

    // 5. Build column list from first row
    const columns =
      rows.length > 0 ? Object.keys(rows[0]) : [];

    return NextResponse.json({
      data: rows,
      columns,
      row_count: rows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
