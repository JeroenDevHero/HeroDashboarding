import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeCreateKlip,
  executeUpdateKlip,
  executePreviewData,
  executeListDatasources,
  executeGetDataCatalog,
  executeGetDataIntelligence,
  executeGetKnowledgeContext,
  executeSaveKnowledge,
  executeGetVisualKnowledge,
} from "@/lib/ai/tools";
import { learnFromKlipCreation } from "@/lib/datasources/intelligence";
import { ensureCatalogPopulated } from "@/lib/datasources/catalog";

export const dynamic = "force-dynamic";

/**
 * Save conversation progress incrementally.
 * Writes messages + a _meta entry with the current status to the DB so that
 * progress is never lost when a stream disconnects or the user navigates away.
 */
async function saveConversationProgress(
  conversationId: string,
  userId: string,
  messages: { role: string; content: string | unknown[]; tool_calls?: { id: string; name: string; input: Record<string, unknown>; result?: unknown }[] }[],
  status: "in_progress" | "completed" | "error",
  createdKlipIds: string[] = []
) {
  const supabase = createAdminClient();

  // Strip images from content before saving — base64 data is too large for DB
  const extractTextContent = (content: string | unknown[]): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const textBlock = content.find((b: unknown) => (b as { type: string }).type === "text") as { text?: string } | undefined;
      return textBlock?.text || "";
    }
    return "";
  };

  const messagesJsonb: Record<string, unknown>[] = messages.map((m) => ({
    role: m.role,
    content: extractTextContent(m.content),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    timestamp: new Date().toISOString(),
  }));

  // Append a _meta entry so the client can detect conversation status
  messagesJsonb.push({
    role: "_meta",
    status,
    timestamp: new Date().toISOString(),
  });

  const updateData: Record<string, unknown> = {
    messages: messagesJsonb,
    updated_at: new Date().toISOString(),
  };
  if (createdKlipIds.length > 0) {
    updateData.created_klip_ids = createdKlipIds;
  }

  await supabase
    .from("ai_conversations")
    .update(updateData)
    .eq("id", conversationId)
    .eq("user_id", userId);
}

const AI_MODEL = "claude-opus-4-6";

const BASE_SYSTEM_PROMPT = `Je bent de Hero AI Assistent, aangedreven door ${AI_MODEL} (Anthropic). Je helpt gebruikers bij het maken van dashboard-visualisaties (klips) op basis van ECHTE bedrijfsdata.

STRENGE REGELS:
- Gebruik UITSLUITEND data uit de gekoppelde databronnen. Verzin NOOIT data, feiten, of voorbeelden.
- Als je iets niet weet, zeg dat eerlijk. Maak GEEN aannames over het bedrijf, vestigingen, klanten of producten.
- Elk feit dat je noemt MOET afkomstig zijn uit een query-resultaat of de kennisbank hieronder.

Werkwijze:
1. De kennisbank, databronnen, data catalog en intelligence zijn HIERONDER al meegeleverd - je hoeft ze NIET meer op te halen via tools
2. Gebruik preview_data om data te bekijken voordat je een klip aanmaakt
3. Maak de klip aan met create_klip
4. Klaar - bevestig het resultaat

BELANGRIJK: Ga DIRECT aan de slag. Roep NIET list_datasources, get_data_catalog, get_data_intelligence of get_knowledge_context aan - die data staat al hieronder.

Opmaak:
- Gebruik ALTIJD nette, leesbare Nederlandse namen (geen veldnamen met underscores)
- Getallen worden automatisch geformateerd met punten bij duizendtallen
- Stel geschikte grafiektypen voor op basis van de data
- Maak het werk altijd helemaal af

Type-selectie:
- Een enkel groot getal (KPI) -> kpi_tile (met comparison_value voor trend)
- Getal met mini-grafiekje -> metric_card (met comparison_value + trend via sample_data)
- Twee getallen vergelijken -> number_comparison
- Categorien vergelijken -> bar_chart (gebruik horizontal: true als labels lang zijn)
- Trend over tijd -> line_chart of area_chart
- Meerdere metrieken over tijd -> line_chart/area_chart met y_fields array
- Delen van geheel -> pie_chart (max 6-8 items, gebruik donut: true voor modern uiterlijk)
- Staaf + lijn combinatie -> combo_chart (bar_field + line_field, dual_axis als schalen verschillen)
- Score op meerdere dimensies -> radar_chart
- Spreiding/correlatie -> scatter_chart
- Proces met afname per stap -> funnel
- Hiërarchie/proportie -> treemap
- Opeenvolgende veranderingen -> waterfall_chart
- Waarde op schaal (0-100) -> gauge, progress_bar, of bullet_chart
- Status overzicht (groen/geel/rood) -> status_board
- Chronologische events -> timeline
- Voor/na vergelijking -> slope_chart
- Data matrix met intensiteit -> heatmap
- Zelfde grafiek per groep -> small_multiples

Multi-series:
- Als de gebruiker meerdere metrieken in één grafiek wil, gebruik y_fields (array) in plaats van y_field
- Zet ALTIJD show_legend: true bij multi-series charts (y_fields met 2+ velden)
- Zet ALTIJD show_legend: true bij pie_chart
- Gebruik stacked: true als de waarden optelbaar zijn (bijv. omzet per categorie)

Wijzigen van bestaande klips:
- Als een klip eerder in DIT gesprek is aangemaakt, gebruik dan update_klip (met het klip_id) om te wijzigen
- Maak NOOIT een nieuwe klip aan als de gebruiker een bestaande wil aanpassen
- De klip_id staat in het resultaat van eerdere create_klip of update_klip tool-calls
- Bij update_klip worden alleen de meegegeven velden overschreven, de rest blijft behouden
- Er wordt automatisch een versie-snapshot bewaard zodat de gebruiker terug kan

Config best practices - geef ALTIJD mee:
- x_field: het label/categorie veld (VERPLICHT voor charts)
- y_field of y_fields: het/de waarde-veld(en) (VERPLICHT voor charts)
- show_legend: true voor multi-series en pie charts
- colors: passende kleuren (gebruik Hero kleuren: #073889, #F46015, #10B981, #8B5CF6, #EC4899, #F59E0B)

Sample data structuur per type:
- Charts (bar/line/area/pie/scatter/radar): [{x_field: "label", y_field: 123, ...}]
- KPI/gauge/progress: gebruik config.value, config.comparison_value, config.target
- Table: [{col1: "val", col2: 123, ...}]
- Status board: [{name: "Service", status: "ok"}, ...]
- Timeline: [{date: "2024-01", title: "Event", description: "..."}]
- Funnel: [{stage: "Stap 1", value: 1000}, {stage: "Stap 2", value: 600}]
- Heatmap: [{x_field: "Row", col1: 10, col2: 20, ...}]

Data-query regels:
- preview_data haalt ALLE rijen op die je SQL query retourneert — er is GEEN kunstmatige rij-limiet. Schrijf correcte SQL met de juiste WHERE, GROUP BY en aggregatie.
- Gebruik voor datumfilters ALTIJD expliciete datums gebaseerd op de huidige datum, bijv:
  - "deze maand" = WHERE datum >= DATE_TRUNC('month', CURRENT_DATE()) AND datum < DATE_ADD(DATE_TRUNC('month', CURRENT_DATE()), 1)
  - "vorige maand" = WHERE datum >= ADD_MONTHS(DATE_TRUNC('month', CURRENT_DATE()), -1) AND datum < DATE_TRUNC('month', CURRENT_DATE())
- Controleer de kolom-types in de catalog: als een datumkolom een STRING is, cast dan correct (bijv. CAST(kolom AS DATE))
- Tel NOOIT preview-rijen als je het totaal wilt weten — gebruik altijd COUNT/SUM in je SQL

Kennisbank:
- Als de gebruiker feitelijke informatie deelt over het bedrijf, sla dit op via save_knowledge`;

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "create_klip",
    description:
      "Maakt een nieuwe visualisatie-klip aan op het dashboard. Gebruik dit wanneer de gebruiker een grafiek, tabel of KPI-tegel wil maken. De klip wordt opgeslagen met name, type, en config in de klips tabel.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "De naam van de klip",
        },
        type: {
          type: "string",
          enum: [
            "kpi_tile",
            "bar_chart",
            "line_chart",
            "area_chart",
            "pie_chart",
            "gauge",
            "table",
            "sparkline",
            "scatter_chart",
            "funnel",
            "map",
            "number_comparison",
            "progress_bar",
            "heatmap",
            "combo_chart",
            "text_widget",
            "iframe",
            "radar_chart",
            "treemap",
            "waterfall_chart",
            "sankey",
            "bullet_chart",
            "box_plot",
            "slope_chart",
            "small_multiples",
            "metric_card",
            "status_board",
            "timeline",
          ],
          description:
            "Het type visualisatie. Keuze-gids: " +
            "kpi_tile = groot getal met trend (omzet, KPI). " +
            "metric_card = getal + sparkline + vergelijking. " +
            "number_comparison = twee getallen naast elkaar met verschil%. " +
            "bar_chart = staafdiagram (ondersteunt y_fields voor multi-series, stacked, horizontal). " +
            "line_chart = lijndiagram (ondersteunt y_fields voor meerdere lijnen). " +
            "area_chart = vlakdiagram (ondersteunt y_fields, stacked). " +
            "pie_chart = taartdiagram (ondersteunt donut modus). " +
            "combo_chart = staaf + lijn gecombineerd (bar_field + line_field, dual_axis). " +
            "scatter_chart = spreidingsdiagram (x numeriek, y numeriek). " +
            "radar_chart = radardiagram (meerdere dimensies). " +
            "gauge = halfcirkel meter met naald (0-100 of custom min/max). " +
            "progress_bar = voortgangsbalk met kleurzones. " +
            "bullet_chart = horizontale bar met target en ranges. " +
            "sparkline = kleine trendlijn zonder assen. " +
            "funnel = trechterdiagram (stages met afname). " +
            "treemap = vlakken proportioneel aan waarde. " +
            "waterfall_chart = watervaldiagram (toenames/afnames). " +
            "heatmap = kleurintensiteit matrix. " +
            "table = datatabel. " +
            "status_board = grid van status-indicatoren (groen/geel/rood). " +
            "timeline = verticale tijdlijn met events. " +
            "slope_chart = voor-na vergelijking met lijnen. " +
            "box_plot = box-and-whisker (min/q1/median/q3/max). " +
            "small_multiples = grid van mini-charts per groep. " +
            "sankey = stroomdiagram (bron -> doel met waarde). " +
            "text_widget = tekst/markdown. " +
            "iframe = externe URL embedden.",
        },
        description: {
          type: "string",
          description: "Een beschrijving van wat de klip toont",
        },
        config: {
          type: "object",
          description: "Configuratie voor de visualisatie (opgeslagen als JSONB). Geef ALTIJD de juiste config-velden mee per type.",
          properties: {
            x_field: {
              type: "string",
              description: "Het veld voor de X-as / categorie / label",
            },
            y_field: {
              type: "string",
              description: "Het veld voor de Y-as (enkele metriek)",
            },
            y_fields: {
              type: "array",
              items: { type: "string" },
              description: "Meerdere Y-velden voor multi-series charts (bar, line, area). Gebruik dit als je meerdere metrieken wilt tonen.",
            },
            group_by: {
              type: "string",
              description: "Veld om op te groeperen (voor small_multiples)",
            },
            colors: {
              type: "array",
              items: { type: "string" },
              description: "Kleuren voor de visualisatie (hex codes)",
            },
            show_legend: {
              type: "boolean",
              description: "Toon legenda (aanbevolen voor multi-series)",
            },
            show_grid: {
              type: "boolean",
              description: "Toon rasterlijnen",
            },
            stacked: {
              type: "boolean",
              description: "Gestapelde weergave voor bar/area charts",
            },
            horizontal: {
              type: "boolean",
              description: "Horizontale weergave voor bar charts",
            },
            donut: {
              type: "boolean",
              description: "Donut modus voor pie charts (ring i.p.v. taart)",
            },
            value: {
              type: "number",
              description: "Enkele waarde voor kpi_tile/gauge/progress_bar/metric_card/bullet_chart",
            },
            min: {
              type: "number",
              description: "Minimum waarde voor gauge/progress_bar",
            },
            max: {
              type: "number",
              description: "Maximum waarde voor gauge/progress_bar/bullet_chart",
            },
            target: {
              type: "number",
              description: "Doelwaarde voor gauge/progress_bar/bullet_chart",
            },
            thresholds: {
              type: "array",
              items: { type: "number" },
              description: "Drempelwaarden voor kleurzones (gauge/progress_bar/bullet_chart)",
            },
            comparison_value: {
              type: "number",
              description: "Vergelijkingswaarde voor kpi_tile/metric_card/number_comparison (bijv. vorige periode)",
            },
            comparison_label: {
              type: "string",
              description: "Label voor de vergelijking (bijv. 'vorige maand')",
            },
            prefix: {
              type: "string",
              description: "Prefix voor getalweergave (bijv. 'EUR ' of '$')",
            },
            suffix: {
              type: "string",
              description: "Suffix voor getalweergave (bijv. '%' of ' kg')",
            },
            bar_field: {
              type: "string",
              description: "Veld voor staafgedeelte in combo_chart",
            },
            line_field: {
              type: "string",
              description: "Veld voor lijngedeelte in combo_chart",
            },
            dual_axis: {
              type: "boolean",
              description: "Twee Y-assen voor combo_chart (links: bar, rechts: lijn)",
            },
            smooth: {
              type: "boolean",
              description: "Vloeiende lijnen voor line_chart",
            },
            dimension_field: {
              type: "string",
              description: "Dimensie-veld voor radar_chart",
            },
            stage_field: {
              type: "string",
              description: "Stage-veld voor funnel / bron-veld voor sankey",
            },
            size_field: {
              type: "string",
              description: "Grootte-veld voor scatter_chart bubbels",
            },
            date_field: {
              type: "string",
              description: "Datumveld voor timeline",
            },
            title_field: {
              type: "string",
              description: "Titelveld voor timeline",
            },
            description_field: {
              type: "string",
              description: "Beschrijvingsveld voor timeline",
            },
            status_field: {
              type: "string",
              description: "Statusveld voor status_board (waarden: ok/warning/error/green/yellow/red)",
            },
            before_field: {
              type: "string",
              description: "Voor-veld voor slope_chart",
            },
            after_field: {
              type: "string",
              description: "Na-veld voor slope_chart",
            },
            chart_type: {
              type: "string",
              description: "Sub-chart type voor small_multiples (bijv. 'line_chart', 'bar_chart')",
            },
            content: {
              type: "string",
              description: "Tekst/markdown content voor text_widget",
            },
            url: {
              type: "string",
              description: "URL voor iframe widget",
            },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                },
              },
              description: "Kolom-definities voor table type",
            },
          },
        },
        query_id: {
          type: "string",
          description:
            "UUID van een bestaande data_source_query om aan de klip te koppelen (optioneel)",
        },
        ai_prompt: {
          type: "string",
          description:
            "Het originele AI-prompt dat tot deze klip leidde (wordt automatisch ingevuld)",
        },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "update_klip",
    description:
      "Wijzig een BESTAANDE klip. Gebruik dit wanneer de gebruiker een klip wil aanpassen die al eerder in dit gesprek is aangemaakt. Dit update de klip in-place in plaats van een nieuwe aan te maken. Er wordt automatisch een versie-snapshot bewaard zodat de gebruiker terug kan.",
    input_schema: {
      type: "object" as const,
      properties: {
        klip_id: {
          type: "string",
          description: "UUID van de bestaande klip die gewijzigd moet worden",
        },
        name: {
          type: "string",
          description: "Nieuwe naam (optioneel, alleen als de naam wijzigt)",
        },
        type: {
          type: "string",
          enum: [
            "kpi_tile", "bar_chart", "line_chart", "area_chart", "pie_chart",
            "gauge", "table", "sparkline", "scatter_chart", "funnel", "map",
            "number_comparison", "progress_bar", "heatmap", "combo_chart",
            "text_widget", "iframe", "radar_chart", "treemap", "waterfall_chart",
            "sankey", "bullet_chart", "box_plot", "slope_chart", "small_multiples",
            "metric_card", "status_board", "timeline",
          ],
          description: "Nieuw type (optioneel, alleen als het type wijzigt)",
        },
        description: {
          type: "string",
          description: "Nieuwe beschrijving (optioneel)",
        },
        config: {
          type: "object",
          description: "Configuratie-velden die gewijzigd moeten worden. Wordt gemerged met bestaande config.",
        },
        query_id: {
          type: "string",
          description: "Nieuwe query_id (optioneel)",
        },
      },
      required: ["klip_id"],
    },
  },
  {
    name: "preview_data",
    description:
      "Bekijk een voorbeeld van data uit een query. Gebruik dit om data te verkennen voordat je een klip aanmaakt.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "SQL query om uit te voeren",
        },
        data_source_id: {
          type: "string",
          description: "UUID van de data_source om tegen te queryen (optioneel)",
        },
        limit: {
          type: "number",
          description: "Optioneel: maximum aantal rijen. Standaard GEEN limiet voor Databricks — de SQL query bepaalt zelf hoeveel rijen er terugkomen. Geef dit alleen mee als je expliciet wilt beperken.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_datasources",
    description:
      "Toon alle beschikbare databronnen (data_sources) van de gebruiker. Gebruik dit om te zien welke databronnen er zijn.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_data_catalog",
    description:
      "Haal de volledige datastructuur op van een databron: alle tabellen, kolommen, types en voorbeelddata. Gebruik dit ALTIJD voordat je queries schrijft, zodat je de juiste tabel- en kolomnamen kent.",
    input_schema: {
      type: "object" as const,
      properties: {
        data_source_id: {
          type: "string",
          description: "UUID van de databron",
        },
      },
      required: ["data_source_id"],
    },
  },
  {
    name: "get_data_intelligence",
    description:
      "Haal slimme inzichten op over een databron: populaire queries, kolom-statistieken, en bewezen patronen. Gebruik dit na get_data_catalog om te zien welke queries al succesvol zijn geweest.",
    input_schema: {
      type: "object" as const,
      properties: {
        data_source_id: {
          type: "string",
          description: "UUID van de databron",
        },
      },
      required: ["data_source_id"],
    },
  },
  {
    name: "get_knowledge_context",
    description:
      "Haal alle bedrijfskennis op uit de kennisbank. Gebruik dit ALTIJD aan het begin van een gesprek om context te krijgen over het bedrijf, definities, en afspraken.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "save_knowledge",
    description:
      "Sla nieuwe bedrijfskennis op in de kennisbank. Gebruik dit wanneer de gebruiker feitelijke informatie deelt die relevant is voor toekomstige analyses.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Korte titel van het kennisitem",
        },
        content: {
          type: "string",
          description: "De volledige kennis/informatie",
        },
        category: {
          type: "string",
          enum: [
            "algemeen",
            "bedrijf",
            "data",
            "klanten",
            "producten",
            "processen",
            "definities",
          ],
          description: "Categorie",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Relevante tags",
        },
      },
      required: ["title", "content", "category"],
    },
  },
];

/**
 * Summarize a tool result for conversation persistence so Claude retains
 * context about what tools were previously called and what they returned.
 */
function summarizeToolResult(toolName: string, result: unknown): string {
  if (toolName === "get_data_catalog") {
    return typeof result === "string"
      ? `catalog opgehaald (${result.split("\n").filter((l) => l.startsWith("Tabel:")).length} tabellen)`
      : "catalog opgehaald";
  }
  if (toolName === "get_data_intelligence") {
    return typeof result === "string"
      ? `data intelligence opgehaald (${result.split("\n").filter((l) => l.startsWith("- \"")).length} patronen)`
      : "data intelligence opgehaald";
  }
  if (toolName === "get_knowledge_context") {
    return typeof result === "string"
      ? `kennisbank opgehaald (${result.split("---").length} items)`
      : "kennisbank opgehaald";
  }
  if (!result || typeof result !== "object") return "voltooid";
  const r = result as Record<string, unknown>;
  switch (toolName) {
    case "list_datasources":
      return `${Array.isArray(r) ? r.length : "?"} databronnen gevonden`;
    case "preview_data":
      return `${r.row_count || "?"} rijen opgehaald`;
    case "create_klip":
      return `klip "${r.name || "?"}" aangemaakt`;
    case "update_klip":
      return `klip "${r.name || "?"}" bijgewerkt`;
    case "save_knowledge":
      return `kennis "${r.title || "?"}" opgeslagen`;
    default:
      return "voltooid";
  }
}

export async function POST(request: Request) {
  try {
    // Authenticate via Supabase
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
    const { messages, conversationId: incomingConversationId, klipId } = body as {
      messages: {
        role: string;
        content: string | { type: string; source?: { type: string; media_type: string; data: string }; text?: string }[];
        tool_calls?: { id: string; name: string; input: Record<string, unknown>; result?: unknown }[];
      }[];
      conversationId?: string;
      klipId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Berichten zijn vereist" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure we have a conversation ID. If the client sent one, use it.
    // Otherwise, create a new conversation row so we can save progress from the start.
    let conversationId = incomingConversationId;
    if (!conversationId) {
      const adminSupa = createAdminClient();
      const { data: newConv } = await adminSupa
        .from("ai_conversations")
        .insert({
          user_id: user.id,
          title: klipId ? "Klip chat" : "Nieuw gesprek",
          context_type: "klip_builder",
          context_id: klipId || null,
          messages: [],
        })
        .select("id")
        .single();
      if (newConv) {
        conversationId = newConv.id;
      }
    }

    // Save the user message(s) immediately so they survive a disconnect
    if (conversationId) {
      saveConversationProgress(
        conversationId,
        user.id,
        messages,
        "in_progress"
      ).catch((err) =>
        console.error("[AI Chat] Failed to save initial messages:", err)
      );
    }

    // Validate API key is present
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service niet geconfigureerd" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic();

    // Pre-load ALL context so Claude doesn't need to call tools for discovery
    // This eliminates 4+ tool rounds and prevents Railway proxy timeout
    console.log("[AI Chat] Pre-loading context...");
    const preloadStart = Date.now();

    // Fetch datasources + Klipfolio discovery + visual knowledge in parallel
    const adminSupa = createAdminClient();
    const [knowledgeContext, datasourcesList, klipfolioDiscovery, visualKnowledge] = await Promise.all([
      executeGetKnowledgeContext().catch(() => "Geen kennisbank items gevonden."),
      executeListDatasources(user.id).catch(() => []),
      Promise.resolve(
        adminSupa
          .from("klipfolio_discovery")
          .select("knowledge_text")
          .eq("id", "latest")
          .maybeSingle()
      ).then((r) => (r.data?.knowledge_text as string) || "").catch(() => ""),
      executeGetVisualKnowledge().catch(() => ""),
    ]);

    const dsArray = Array.isArray(datasourcesList) ? datasourcesList : [];
    const dsIds = dsArray.map((d: Record<string, unknown>) => d.id as string);

    // Auto-discover catalog for datasources that have no catalog yet
    if (dsIds.length > 0) {
      await Promise.all(
        dsIds.map((id) =>
          ensureCatalogPopulated(id).catch((err) =>
            console.error(`[AI Chat] Auto-catalog failed for ${id}:`, err)
          )
        )
      );
    }

    // Fetch catalog + intelligence for all datasources in parallel
    const [catalogSummaries, intelligenceSummaries] = await Promise.all([
      dsIds.length > 0
        ? Promise.all(dsIds.map((id) => executeGetDataCatalog(id).catch(() => ""))).then((r) => r.filter(Boolean).join("\n\n") || "Geen catalog beschikbaar.")
        : Promise.resolve("Geen databronnen geconfigureerd."),
      dsIds.length > 0
        ? Promise.all(dsIds.map((id) => executeGetDataIntelligence(id).catch(() => ""))).then((r) => r.filter(Boolean).join("\n\n") || "Geen intelligence beschikbaar.")
        : Promise.resolve("Geen intelligence beschikbaar."),
    ]);

    console.log(`[AI Chat] Context pre-loaded in ${Date.now() - preloadStart}ms`);

    // Look up existing klips in this conversation so AI can use update_klip
    let conversationKlipsText = "";
    if (conversationId) {
      try {
        const convKlipAdmin = createAdminClient();
        const { data: existingKlips } = await convKlipAdmin
          .from("klips")
          .select("id, name, type")
          .eq("ai_conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (existingKlips && existingKlips.length > 0) {
          conversationKlipsText = `\n--- KLIPS IN DIT GESPREK (gebruik update_klip om te wijzigen) ---\n` +
            existingKlips.map((k: Record<string, unknown>) =>
              `- "${k.name}" (id: ${k.id}, type: ${k.type})`
            ).join("\n");
        }
      } catch (err) {
        console.error("[AI Chat] Failed to fetch conversation klips:", err);
      }
    }

    // If a specific klipId was provided, fetch that klip's details so the AI knows what to modify
    let focusKlipText = "";
    if (klipId) {
      try {
        const klipAdmin = createAdminClient();
        const { data: focusKlip } = await klipAdmin
          .from("klips")
          .select("id, name, type, description, config, query_id, ai_prompt")
          .eq("id", klipId)
          .single();

        if (focusKlip) {
          const cfg = focusKlip.config as Record<string, unknown>;
          focusKlipText = `\n--- HUIDIGE KLIP (focus van dit gesprek) ---
Je bespreekt wijzigingen voor deze specifieke klip. Gebruik update_klip met klip_id "${focusKlip.id}" om wijzigingen door te voeren.
- Naam: ${focusKlip.name}
- Type: ${focusKlip.type}
- Beschrijving: ${focusKlip.description || "Geen"}
- Query ID: ${focusKlip.query_id || "Niet gekoppeld"}
- AI prompt: ${focusKlip.ai_prompt || "Geen"}
- Config: ${JSON.stringify(cfg, null, 2)}`;
        }
      } catch (err) {
        console.error("[AI Chat] Failed to fetch focus klip:", err);
      }
    }

    // Build enriched system prompt with all context
    const datasourcesText = Array.isArray(datasourcesList)
      ? datasourcesList.map((d: Record<string, unknown>) =>
          `- ${d.name} (id: ${d.id}, type: ${(d as Record<string, unknown>).data_source_types ? ((d as Record<string, unknown>).data_source_types as Record<string, unknown>).slug : "onbekend"})`
        ).join("\n")
      : "Geen databronnen gevonden.";

    const enrichedSystemPrompt = `${BASE_SYSTEM_PROMPT}
${focusKlipText}
${conversationKlipsText}

--- KENNISBANK ---
${knowledgeContext}
${klipfolioDiscovery ? `\n--- KLIPFOLIO OMGEVING (bestaande dashboards & klips) ---\n${klipfolioDiscovery}` : ""}
${visualKnowledge ? `\n--- BESCHIKBARE VISUALISATIETYPEN ---\n${visualKnowledge}` : ""}

--- DATABRONNEN ---
${datasourcesText}

--- DATA CATALOG (tabellen en kolommen) ---
${catalogSummaries}

--- DATA INTELLIGENCE (bewezen patronen) ---
${intelligenceSummaries}`;

    // Cast messages to the expected Anthropic format
    // Content can be a string or a multi-content array (for images)
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content as string | Anthropic.Messages.ContentBlockParam[],
    }));

    // Start streaming response from Claude - now with full context pre-loaded
    const stream = await anthropic.messages.stream({
      model: AI_MODEL,
      max_tokens: 16384,
      system: enrichedSystemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    });

    // Build SSE stream
    const encoder = new TextEncoder();
    const MAX_TOOL_ROUNDS = 5;

    const readable = new ReadableStream({
      async start(controller) {
        console.log("[AI Chat] Stream started");

        // Send conversation_init as the very first event so the client knows the ID
        if (conversationId) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "conversation_init", conversation_id: conversationId })}\n\n`
            )
          );
        }

        // Send keepalive as proper SSE data events every 3 seconds
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: {"type":"keepalive"}\n\n`));
          } catch {
            clearInterval(keepalive);
          }
        }, 3000);

        const createdKlipIds: string[] = [];
        let lastPreviewResult: unknown = null;
        let lastPreviewInput: { query: string; data_source_id?: string } | null = null;
        const allMessages = [...messages];

        // Recover preview data so reworks (user modifying a klip) still have sample_data.
        // Strategy 1: Check incoming messages for tool_calls with preview_data results
        for (let mi = messages.length - 1; mi >= 0; mi--) {
          const msg = messages[mi];
          if (msg.tool_calls) {
            for (let ti = msg.tool_calls.length - 1; ti >= 0; ti--) {
              const tc = msg.tool_calls[ti];
              if (tc.name === "preview_data" && tc.result) {
                const r = tc.result as Record<string, unknown>;
                if (r.rows && Array.isArray(r.rows) && (r.rows as unknown[]).length > 0) {
                  lastPreviewResult = tc.result;
                  lastPreviewInput = tc.input as { query: string; data_source_id?: string };
                  console.log("[AI Chat] Recovered preview data from message tool_calls");
                  break;
                }
              }
            }
            if (lastPreviewResult) break;
          }
        }

        // Strategy 2: Fallback to DB - check existing klips in this conversation
        if (!lastPreviewResult && conversationId) {
          try {
            const prevKlipAdmin = createAdminClient();
            const { data: existingKlips } = await prevKlipAdmin
              .from("klips")
              .select("config")
              .eq("ai_conversation_id", conversationId)
              .order("created_at", { ascending: false })
              .limit(1);

            if (existingKlips?.[0]?.config) {
              const prevConfig = existingKlips[0].config as Record<string, unknown>;
              if (prevConfig.sample_data && Array.isArray(prevConfig.sample_data) && (prevConfig.sample_data as unknown[]).length > 0) {
                lastPreviewResult = { rows: prevConfig.sample_data };
                console.log("[AI Chat] Recovered preview data from previous klip in DB");
              }
            }
          } catch (err) {
            console.error("[AI Chat] Failed to recover preview data from DB:", err);
          }
        }

        try {
          let currentMessages: Anthropic.Messages.MessageParam[] = [...anthropicMessages];
          let currentStream = stream;

          for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
            console.log(`[AI Chat] Round ${round} starting`);

            // Stream events from the current stream to the client
            for await (const event of currentStream) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
            }

            const finalMessage = await currentStream.finalMessage();
            console.log(`[AI Chat] Round ${round} done, stop_reason: ${finalMessage.stop_reason}, content blocks: ${finalMessage.content.length}`);

            // Check if there are tool_use content blocks
            const toolUseBlocks = finalMessage.content.filter(
              (block): block is Anthropic.Messages.ToolUseBlock =>
                block.type === "tool_use"
            );

            if (toolUseBlocks.length === 0) {
              // No more tools needed - collect text for persistence
              const textBlocks = finalMessage.content.filter(
                (block): block is Anthropic.Messages.TextBlock =>
                  block.type === "text"
              );
              if (textBlocks.length > 0) {
                allMessages.push({
                  role: "assistant",
                  content: textBlocks.map((b) => b.text).join(""),
                });
              }
              break;
            }

            // Send custom event so client knows tools are being executed
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "tool_execution_start",
                  tools: toolUseBlocks.map((t) => t.name),
                })}\n\n`
              )
            );

            // Execute each tool call
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

            for (const toolBlock of toolUseBlocks) {
              let result: unknown;
              let isError = false;

              try {
                console.log(`[AI Chat] Executing tool: ${toolBlock.name}`);
                switch (toolBlock.name) {
                  case "create_klip":
                    result = await executeCreateKlip(
                      toolBlock.input as Parameters<
                        typeof executeCreateKlip
                      >[0],
                      user.id,
                      conversationId,
                      lastPreviewResult
                    );
                    // Track created klip IDs for conversation persistence
                    if (
                      result &&
                      typeof result === "object" &&
                      "id" in (result as Record<string, unknown>)
                    ) {
                      createdKlipIds.push(
                        (result as Record<string, unknown>).id as string
                      );
                    }
                    // Auto-learn from klip creation
                    if (result && !isError && lastPreviewInput) {
                      const lastUserMsg = messages.filter((m) => m.role === "user").pop();
                      const lastUserText = typeof lastUserMsg?.content === "string"
                        ? lastUserMsg.content
                        : Array.isArray(lastUserMsg?.content)
                          ? (lastUserMsg.content.find((b: { type: string; text?: string }) => b.type === "text") as { text?: string } | undefined)?.text || ""
                          : "";
                      learnFromKlipCreation({
                        dataSourceId: lastPreviewInput.data_source_id || "",
                        naturalLanguage: lastUserText,
                        sqlQuery: lastPreviewInput.query || "",
                        klipType: (toolBlock.input as Record<string, unknown>).type as string,
                        config: ((toolBlock.input as Record<string, unknown>).config as Record<string, unknown>) || {},
                      }).catch((err) =>
                        console.error("[intelligence] Learn failed:", err)
                      );
                    }
                    break;
                  case "update_klip":
                    result = await executeUpdateKlip(
                      toolBlock.input as Parameters<typeof executeUpdateKlip>[0],
                      user.id,
                      lastPreviewResult
                    );
                    // Track updated klip ID
                    if (
                      result &&
                      typeof result === "object" &&
                      "id" in (result as Record<string, unknown>)
                    ) {
                      const updatedId = (result as Record<string, unknown>).id as string;
                      if (!createdKlipIds.includes(updatedId)) {
                        createdKlipIds.push(updatedId);
                      }
                    }
                    break;
                  case "preview_data":
                    result = await executePreviewData(
                      toolBlock.input as Parameters<
                        typeof executePreviewData
                      >[0],
                      user.id
                    );
                    // Track preview data and input so create_klip can attach it & learn from it
                    if (result && !isError) {
                      lastPreviewResult = result;
                      lastPreviewInput = toolBlock.input as { query: string; data_source_id?: string };
                    }
                    break;
                  case "list_datasources":
                    result = await executeListDatasources(user.id);
                    break;
                  case "get_data_catalog": {
                    const catDsId = (
                      toolBlock.input as { data_source_id: string }
                    ).data_source_id;
                    // Auto-discover if catalog is empty
                    await ensureCatalogPopulated(catDsId).catch((err) =>
                      console.error("[AI Chat] Auto-catalog in tool failed:", err)
                    );
                    result = await executeGetDataCatalog(catDsId);
                    break;
                  }
                  case "get_data_intelligence":
                    result = await executeGetDataIntelligence(
                      (
                        toolBlock.input as { data_source_id: string }
                      ).data_source_id
                    );
                    break;
                  case "get_knowledge_context":
                    result = await executeGetKnowledgeContext();
                    break;
                  case "save_knowledge":
                    result = await executeSaveKnowledge(
                      toolBlock.input as {
                        title: string;
                        content: string;
                        category: string;
                        tags?: string[];
                      },
                      user.id
                    );
                    break;
                  default:
                    result = { error: `Onbekende tool: ${toolBlock.name}` };
                    isError = true;
                }
              } catch (error) {
                console.error(`Tool ${toolBlock.name} failed:`, error instanceof Error ? error.message : error);
                result = {
                  error:
                    error instanceof Error
                      ? error.message
                      : "Onbekende fout bij uitvoering",
                };
                isError = true;
              }

              // Send progress event per tool
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "tool_execution_result",
                    tool_name: toolBlock.name,
                    success: !isError,
                  })}\n\n`
                )
              );

              // Send tool result to client for preview
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "tool_result",
                    tool_use_id: toolBlock.id,
                    tool_name: toolBlock.name,
                    result: result,
                    is_error: isError,
                  })}\n\n`
                )
              );

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: JSON.stringify(result),
                is_error: isError,
              });
            }

            // Build a comprehensive assistant message that includes tool context for persistence
            let assistantText = "";
            for (const block of finalMessage.content) {
              if (block.type === "text") assistantText += block.text;
            }

            // Capture structured tool calls with results for DB persistence
            const structuredToolCalls = toolUseBlocks.map((tb, i) => {
              let resultObj: unknown;
              try {
                resultObj = JSON.parse(toolResults[i].content as string);
              } catch {
                resultObj = null;
              }
              return {
                id: tb.id,
                name: tb.name,
                input: tb.input as Record<string, unknown>,
                result: resultObj,
              };
            });

            const toolSummaries = structuredToolCalls
              .map((tc) => {
                const summary = summarizeToolResult(tc.name, tc.result);
                return `[Tool: ${tc.name} - ${summary}]`;
              })
              .join("\n");

            if (toolSummaries) {
              assistantText += (assistantText ? "\n\n" : "") + toolSummaries;
            }

            if (assistantText || structuredToolCalls.length > 0) {
              allMessages.push({
                role: "assistant",
                content: assistantText,
                tool_calls: structuredToolCalls,
              });
            }

            // Save progress after each tool round so nothing is lost on disconnect
            if (conversationId) {
              saveConversationProgress(
                conversationId,
                user.id,
                allMessages,
                "in_progress",
                createdKlipIds
              ).catch((err) =>
                console.error("[AI Chat] Failed to save round progress:", err)
              );
            }

            // Continue conversation with tool results
            currentMessages = [
              ...currentMessages,
              { role: "assistant" as const, content: finalMessage.content },
              { role: "user" as const, content: toolResults },
            ];

            currentStream = await anthropic.messages.stream({
              model: AI_MODEL,
              max_tokens: 16384,
              system: enrichedSystemPrompt,
              tools: TOOLS,
              messages: currentMessages,
            });
          }

          // Final save with "completed" status
          if (conversationId) {
            saveConversationProgress(
              conversationId,
              user.id,
              allMessages,
              "completed",
              createdKlipIds
            ).catch((err) => {
              console.error("Failed to persist AI conversation:", err);
            });
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("[AI Chat] Stream error:", error instanceof Error ? error.message : error);

          // Save whatever we have so far with "error" status
          if (conversationId) {
            saveConversationProgress(
              conversationId,
              user.id,
              allMessages,
              "error",
              createdKlipIds
            ).catch((err) => {
              console.error("Failed to save error state:", err);
            });
          }

          const errorMessage =
            error instanceof Error ? error.message : "Stream fout";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } finally {
          clearInterval(keepalive);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Interne serverfout";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
