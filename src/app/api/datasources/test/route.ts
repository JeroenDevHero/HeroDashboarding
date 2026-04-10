import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  testDatabricksConnection,
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
    const { data_source_id } = body as { data_source_id: string };

    if (!data_source_id) {
      return NextResponse.json(
        { error: "data_source_id is vereist" },
        { status: 400 }
      );
    }

    // 3. Fetch the data source + type using admin client (contains secrets)
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

    // 4. Test the connection based on type
    const typeSlug = dataSource.data_source_type?.slug;
    let result: { success: boolean; message: string };

    switch (typeSlug) {
      case "databricks": {
        const config = dataSource.connection_config as DatabricksConfig;
        result = await testDatabricksConnection(config);
        break;
      }

      case "postgresql": {
        result = {
          success: false,
          message: "PostgreSQL wordt binnenkort ondersteund",
        };
        break;
      }

      default: {
        result = {
          success: false,
          message: `Niet-ondersteund type: ${typeSlug}`,
        };
      }
    }

    // 5. Update the data source status in Supabase
    await admin
      .from("data_sources")
      .update({
        last_refresh_status: result.success ? "success" : "error",
        last_refresh_at: new Date().toISOString(),
        last_refresh_error: result.success ? null : result.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data_source_id);

    // 6. Return result
    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
