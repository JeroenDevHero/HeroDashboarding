import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCatalogStats } from "@/lib/datasources/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/datasources/catalog-stats?ids=uuid,uuid,uuid
 * Returns catalog + enrichment progress for each requested data source.
 * Used by the datasources page to live-poll the "Verrijking"-column while a
 * background enrichment job is running.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "ids query parameter is verplicht" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

  if (ids.length === 0) {
    return NextResponse.json({ stats: [] });
  }

  // Ownership filter: only return stats for data sources the caller can see.
  const { data: visible } = await supabase
    .from("data_sources")
    .select("id")
    .in("id", ids);

  const allowedIds = (visible ?? []).map((r) => r.id);
  if (allowedIds.length === 0) {
    return NextResponse.json({ stats: [] });
  }

  const stats = await getCatalogStats(allowedIds);
  return NextResponse.json({ stats });
}
