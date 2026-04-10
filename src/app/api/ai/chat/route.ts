import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeCreateKlip,
  executePreviewData,
  executeListDatasources,
} from "@/lib/ai/tools";

export const dynamic = "force-dynamic";

/**
 * Persist the conversation messages to ai_conversations.messages (JSONB).
 * Creates a new row if no conversationId is provided, otherwise upserts.
 */
async function persistConversation(
  userId: string,
  conversationId: string | undefined,
  messages: { role: string; content: string }[],
  createdKlipIds: string[] = []
) {
  const supabase = createAdminClient();

  const messagesJsonb = messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: new Date().toISOString(),
  }));

  if (conversationId) {
    // Update existing conversation
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
  } else {
    // Create new conversation
    const insertData: Record<string, unknown> = {
      user_id: userId,
      messages: messagesJsonb,
      context_type: "klip_builder",
    };
    if (createdKlipIds.length > 0) {
      insertData.created_klip_ids = createdKlipIds;
    }
    await supabase.from("ai_conversations").insert(insertData);
  }
}

const SYSTEM_PROMPT = `Je bent de Hero AI Assistent. Je helpt gebruikers bij het maken van dashboard-visualisaties (klips).

Mogelijkheden:
- Maak staafdiagrammen, lijndiagrammen, taartdiagrammen, vlakdiagrammen, KPI-tegels, tabellen en meer
- Bekijk beschikbare databronnen (data_sources)
- Preview data via queries
- Maak klips aan op basis van data

Richtlijnen:
- Stel verhelderende vragen over welke data de gebruiker wil zien
- Stel geschikte grafiektypen voor op basis van de data
- Gebruik altijd Nederlandse labels en beschrijvingen
- Geef duidelijke uitleg bij elke stap`;

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
];

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
    const { messages, conversationId } = body as {
      messages: { role: string; content: string }[];
      conversationId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Berichten zijn vereist" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
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

    // Cast messages to the expected Anthropic format
    const anthropicMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Start streaming response from Claude
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: anthropicMessages,
    });

    // Build SSE stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const createdKlipIds: string[] = [];
        const allMessages = [...messages]; // Track messages for persistence

        try {
          for await (const event of stream) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );

            // If we get a message_stop, check for tool use and execute tools
            if (event.type === "message_stop") {
              const finalMessage = await stream.finalMessage();

              // Check if there are tool_use content blocks
              const toolUseBlocks = finalMessage.content.filter(
                (block): block is Anthropic.Messages.ToolUseBlock =>
                  block.type === "tool_use"
              );

              if (toolUseBlocks.length > 0) {
                // Execute each tool call
                const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
                  [];

                for (const toolBlock of toolUseBlocks) {
                  let result: unknown;
                  let isError = false;

                  try {
                    switch (toolBlock.name) {
                      case "create_klip":
                        result = await executeCreateKlip(
                          toolBlock.input as Parameters<
                            typeof executeCreateKlip
                          >[0],
                          user.id,
                          conversationId
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
                        break;
                      case "preview_data":
                        result = await executePreviewData(
                          toolBlock.input as Parameters<
                            typeof executePreviewData
                          >[0],
                          user.id
                        );
                        break;
                      case "list_datasources":
                        result = await executeListDatasources(user.id);
                        break;
                      default:
                        result = { error: `Onbekende tool: ${toolBlock.name}` };
                        isError = true;
                    }
                  } catch (error) {
                    result = {
                      error:
                        error instanceof Error
                          ? error.message
                          : "Onbekende fout bij uitvoering",
                    };
                    isError = true;
                  }

                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: toolBlock.id,
                    content: JSON.stringify(result),
                    is_error: isError,
                  });
                }

                // Continue the conversation with tool results
                const continuationMessages: Anthropic.Messages.MessageParam[] =
                  [
                    ...anthropicMessages,
                    { role: "assistant" as const, content: finalMessage.content },
                    { role: "user" as const, content: toolResults },
                  ];

                const continuationStream = await anthropic.messages.stream({
                  model: "claude-sonnet-4-20250514",
                  max_tokens: 4096,
                  system: SYSTEM_PROMPT,
                  tools: TOOLS,
                  messages: continuationMessages,
                });

                let continuationText = "";
                for await (const contEvent of continuationStream) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(contEvent)}\n\n`
                    )
                  );
                  // Collect final assistant text for persistence
                  if (
                    contEvent.type === "content_block_delta" &&
                    "delta" in contEvent &&
                    contEvent.delta.type === "text_delta" &&
                    "text" in contEvent.delta
                  ) {
                    continuationText += contEvent.delta.text;
                  }
                }

                // Add assistant response to messages for persistence
                if (continuationText) {
                  allMessages.push({
                    role: "assistant",
                    content: continuationText,
                  });
                }
              } else {
                // No tool use - collect the text content for persistence
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
              }
            }
          }

          // Persist conversation to ai_conversations table
          persistConversation(
            user.id,
            conversationId,
            allMessages,
            createdKlipIds
          ).catch((err) => {
            console.error("Failed to persist AI conversation:", err);
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Stream fout";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
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
