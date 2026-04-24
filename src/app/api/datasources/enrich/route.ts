import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichCatalogWithAI } from "@/lib/datasources/enrichment";

export const dynamic = "force-dynamic";
// We intentionally keep the HTTP handler short — the heavy lifting is kicked
// off fire-and-forget so progress can be polled via /api/datasources/catalog-stats.
export const maxDuration = 60;

/**
 * Kick off AI-driven semantic enrichment of a data source's catalog.
 * Returns immediately; the enrichment runs in the background. Progress can be
 * observed via GET /api/datasources/catalog-stats (ai_enriched_columns grows
 * while the job is running).
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

  const dataSourceId = body.data_source_id;
  const force = body.force === true;

  // Fire-and-forget. Enrichment for hundreds of tables can easily take
  // 15-30 minutes, which would far exceed any reasonable HTTP timeout.
  // The UI polls /api/datasources/catalog-stats for live progress.
  void (async () => {
    try {
      const result = await enrichCatalogWithAI(dataSourceId, { force });
      console.log(
        `[enrich] Done for ${dataSourceId}: ${result.tablesProcessed} tables, ${result.columnsUpdated} columns`
      );
    } catch (err) {
      console.error(
        `[enrich] Background enrichment failed for ${dataSourceId}:`,
        err instanceof Error ? err.message : err
      );
    }
  })();

  return NextResponse.json({ status: "started" });
}
