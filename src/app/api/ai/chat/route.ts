import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  executeCreateKlip,
  executePreviewData,
  executeListDatasources,
} from "@/lib/ai/tools";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Je bent de Hero AI Assistent. Je helpt gebruikers bij het maken van dashboard-visualisaties (klips).

Mogelijkheden:
- Maak staafdiagrammen, lijndiagrammen, taartdiagrammen, vlakdiagrammen, cijfer-widgets en tabellen
- Bekijk beschikbare databronnen
- Preview data met SQL queries
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
      "Maakt een nieuwe visualisatie-klip aan op het dashboard. Gebruik dit wanneer de gebruiker een grafiek, tabel of cijfer-widget wil maken.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "De titel van de klip",
        },
        type: {
          type: "string",
          enum: ["bar", "line", "pie", "area", "number", "table"],
          description:
            "Het type visualisatie: bar (staafdiagram), line (lijndiagram), pie (taartdiagram), area (vlakdiagram), number (cijfer-widget), table (tabel)",
        },
        description: {
          type: "string",
          description: "Een beschrijving van wat de klip toont",
        },
        config: {
          type: "object",
          description: "Configuratie voor de visualisatie",
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
        query: {
          type: "string",
          description: "SQL query om data op te halen voor de klip",
        },
        datasource_id: {
          type: "string",
          description: "ID van de databron (optioneel)",
        },
      },
      required: ["title", "type", "description"],
    },
  },
  {
    name: "preview_data",
    description:
      "Bekijk een voorbeeld van data uit een SQL query. Gebruik dit om data te verkennen voordat je een klip aanmaakt.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "SQL query om uit te voeren",
        },
        datasource_id: {
          type: "string",
          description: "ID van de databron (optioneel)",
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
      "Toon alle beschikbare databronnen van de gebruiker. Gebruik dit om te zien welke databronnen er zijn.",
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
    const { messages, conversationId: _conversationId } = body as {
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
                          user.id
                        );
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

                for await (const contEvent of continuationStream) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify(contEvent)}\n\n`
                    )
                  );
                }
              }
            }
          }

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
