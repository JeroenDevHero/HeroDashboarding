import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getKlipfolioTabs,
  getKlipfolioKlips,
  getKlipfolioDatasources,
  isKlipfolioConfigured,
} from "@/lib/klipfolio/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // 1. Authenticate via Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
    }

    // 2. Check Klipfolio config
    if (!isKlipfolioConfigured()) {
      return NextResponse.json(
        { error: "Klipfolio is niet geconfigureerd. Stel KLIPFOLIO_API_KEY en KLIPFOLIO_USER_ID in." },
        { status: 503 }
      );
    }

    // 3. Parse query params
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // 4. Proxy to Klipfolio
    switch (resource) {
      case "tabs": {
        const result = await getKlipfolioTabs(limit, offset);
        return NextResponse.json(result);
      }
      case "klips": {
        const result = await getKlipfolioKlips(limit, offset);
        return NextResponse.json(result);
      }
      case "datasources": {
        const result = await getKlipfolioDatasources(limit, offset);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: "Ongeldig resource type. Gebruik: tabs, klips, of datasources" },
          { status: 400 }
        );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
