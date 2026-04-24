import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichCatalogWithAI } from "@/lib/datasources/enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large schemas

/**
 * Kick off AI-driven semantic enrichment of a data source's catalog.
 * Long-running by design — clients should trigger and poll for completion
 * via the catalog itself (semantic_description_source = 'ai-generated' rows).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = (await request.json()) as {
    data_source_id?: string;
    force?: boolean;
  };
  if (!body.data_source_id) {
    return NextResponse.json(
      { error: "data_source_id is verplicht" },
      { status: 400 }
    );
  }

  // Verify ownership via RLS-protected query
  const { data: owned } = await supabase
    .from("data_sources")
    .select("id")
    .eq("id", body.data_source_id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json(
      { error: "Databron niet gevonden" },
      { status: 404 }
    );
  }

  try {
    const result = await enrichCatalogWithAI(body.data_source_id, {
      force: body.force === true,
    });
    return NextResponse.json({ status: "completed", ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout bij verrijken";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
