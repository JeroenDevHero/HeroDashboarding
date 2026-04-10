import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeCreateKlip,
  executePreviewData,
  executeListDatasources,
  executeGetDataCatalog,
  executeGetDataIntelligence,
  executeGetKnowledgeContext,
  executeSaveKnowledge,
  executeGetVisualKnowledge,
} from "@/lib/ai/tools";
import { learnFromKlipCreation } from "@/lib/datasources/intelligence";

export const dynamic = "force-dynamic";

/**
 * Save conversation progress incrementally.
 * Writes messages + a _meta entry with the current status to the DB so that
 * progress is never lost when a stream disconnects or the user navigates away.
 */
async function saveConversationProgress(
  conversationId: string,
  userId: string,
  messages: { role: string; content: string; tool_calls?: { id: string; name: string; input: Record<string, unknown>; result?: unknown }[] }[],
  status: "in_progress" | "completed" | "error",
  createdKlipIds: string[] = []
) {
  const supabase = createAdminClient();

  const messagesJsonb: Record<string, unknown>[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
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

const BASE_SYSTEM_PROMPT = `Je bent de Hero AI Assistent, aangedreven door Claude Opus 4.6 (het nieuwste en krachtigste AI-model van Anthropic). Je helpt gebruikers bij het maken van dashboard-visualisaties (klips) op basis van ECHTE bedrijfsdata.

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
          ],
          description:
            "Het type visualisatie: bar_chart (staafdiagram), line_chart (lijndiagram), pie_chart (taartdiagram), area_chart (vlakdiagram), kpi_tile (KPI-tegel), table (tabel), gauge, sparkline, scatter_chart, funnel, map, number_comparison, progress_bar, heatmap, combo_chart, text_widget, iframe",
        },
        description: {
          type: "string",
          description: "Een beschrijving van wat de klip toont",
        },
        config: {
          type: "object",
          description: "Configuratie voor de visualisatie (opgeslagen als JSONB)",
          properties: {
            x_field: {
              type: "string",
              description: "Het veld voor de X-as",
            },
            y_field: {
              type: "string",
              description: "Het veld voor de Y-as",
            },
            group_by: {
              type: "string",
              description: "Veld om op te groeperen",
            },
            colors: {
              type: "array",
              items: { type: "string" },
              description: "Kleuren voor de visualisatie (hex codes)",
            },
            show_legend: {
              type: "boolean",
              description: "Toon legenda",
            },
            show_grid: {
              type: "boolean",
              description: "Toon rasterlijnen",
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
          description: "Maximum aantal rijen om te tonen (standaard 10)",
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
    const { messages, conversationId: incomingConversationId } = body as {
      messages: {
        role: string;
        content: string;
        tool_calls?: { id: string; name: string; input: Record<string, unknown>; result?: unknown }[];
      }[];
      conversationId?: string;
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
          title: "Nieuw gesprek",
          context_type: "klip_builder",
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

    // Build enriched system prompt with all context
    const datasourcesText = Array.isArray(datasourcesList)
      ? datasourcesList.map((d: Record<string, unknown>) =>
          `- ${d.name} (id: ${d.id}, type: ${(d as Record<string, unknown>).data_source_types ? ((d as Record<string, unknown>).data_source_types as Record<string, unknown>).slug : "onbekend"})`
        ).join("\n")
      : "Geen databronnen gevonden.";

    const enrichedSystemPrompt = `${BASE_SYSTEM_PROMPT}

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
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Start streaming response from Claude - now with full context pre-loaded
    const stream = await anthropic.messages.stream({
      model: "claude-opus-4-6",
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
                      learnFromKlipCreation({
                        dataSourceId: lastPreviewInput.data_source_id || "",
                        naturalLanguage: lastUserMsg?.content || "",
                        sqlQuery: lastPreviewInput.query || "",
                        klipType: (toolBlock.input as Record<string, unknown>).type as string,
                        config: ((toolBlock.input as Record<string, unknown>).config as Record<string, unknown>) || {},
                      }).catch((err) =>
                        console.error("[intelligence] Learn failed:", err)
                      );
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
                  case "get_data_catalog":
                    result = await executeGetDataCatalog(
                      (
                        toolBlock.input as { data_source_id: string }
                      ).data_source_id
                    );
                    break;
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
              model: "claude-opus-4-6",
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
