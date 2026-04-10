import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isKlipfolioConfigured } from "@/lib/klipfolio/client";
import { discoverKlipfolioEnvironment, generateKnowledgeText } from "@/lib/klipfolio/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Discovery can take a while

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
    }

    if (!isKlipfolioConfigured()) {
      return NextResponse.json(
        { error: "Klipfolio is niet geconfigureerd. Stel KLIPFOLIO_API_KEY en KLIPFOLIO_USER_ID in." },
        { status: 503 }
      );
    }

    const result = await discoverKlipfolioEnvironment();
    const knowledgeText = generateKnowledgeText(result);

    // Store discovery result in Supabase for future reference
    try {
      await supabase.from("klipfolio_discovery").upsert(
        {
          id: "latest",
          result: result as unknown as Record<string, unknown>,
          knowledge_text: knowledgeText,
          discovered_at: result.discoveredAt,
          discovered_by: user.id,
        },
        { onConflict: "id" }
      );
    } catch {
      // Table might not exist — that's fine
    }

    return NextResponse.json({
      result,
      knowledgeText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Interne serverfout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
