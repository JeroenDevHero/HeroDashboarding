"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getConversation,
  createConversation,
  deleteConversation,
  updateConversationTitle,
} from "@/lib/actions/ai";
import type { ChatMessage, ToolCall } from "@/lib/hooks/useAIChat";
import ConversationSidebar from "./ConversationSidebar";
import AIChat from "./AIChat";
import EmptyState from "@/components/ui/EmptyState";
import KlipChart from "@/components/klip/KlipChart";

interface ConversationListItem {
  id: string;
  user_id: string;
  title: string | null;
  context_type: string;
  context_id: string | null;
  created_klip_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

interface AIAssistantProps {
  initialConversations: ConversationListItem[];
  initialConversationId?: string;
}

/**
 * Detect whether a loaded conversation was still in progress.
 * Checks for a _meta entry with status "in_progress", or as a fallback,
 * if the last real message is from the user with no assistant reply.
 */
function isConversationInProgress(
  messages: { role: string; content?: string; status?: string }[]
): boolean {
  // Check _meta entries (server writes these)
  const meta = messages.filter((m) => m.role === "_meta");
  if (meta.length > 0) {
    const lastMeta = meta[meta.length - 1];
    return lastMeta.status === "in_progress";
  }
  // Fallback: if the last real message is from the user (AI never responded)
  const realMessages = messages.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );
  if (realMessages.length > 0) {
    return realMessages[realMessages.length - 1].role === "user";
  }
  return false;
}

export default function AIAssistant({
  initialConversations,
  initialConversationId,
}: AIAssistantProps) {
  const [conversations, setConversations] = useState(initialConversations);

  // If a specific conversation ID was passed (e.g. from rebuild flow), use that.
  // Otherwise default to the first conversation.
  const defaultConversationId = initialConversationId
    && initialConversations.some((c) => c.id === initialConversationId)
    ? initialConversationId
    : initialConversations.length > 0
      ? initialConversations[0].id
      : null;

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    defaultConversationId
  );
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [previewToolCall, setPreviewToolCall] = useState<ToolCall | null>(null);
  const [wasInProgress, setWasInProgress] = useState(false);

  // Load messages for the initially selected conversation
  useEffect(() => {
    if (activeConversationId && initialConversations.length > 0) {
      loadConversationMessages(activeConversationId);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversationMessages = useCallback(async (id: string) => {
    setIsLoadingMessages(true);
    setWasInProgress(false);
    try {
      const conversation = await getConversation(id);
      if (conversation?.messages) {
        // Check if conversation was in progress before mapping
        const inProgress = isConversationInProgress(
          conversation.messages as { role: string; content?: string; status?: string }[]
        );
        setWasInProgress(inProgress);

        // Filter out _meta entries before mapping to ChatMessage format
        const realMessages = (
          conversation.messages as { id?: string; role: string; content: string; tool_calls?: unknown[] }[]
        ).filter((m) => m.role !== "_meta");

        // Map persisted messages to ChatMessage format, including tool results
        const mapped: ChatMessage[] = realMessages.map(
          (m) => ({
            id: m.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            role: m.role as "user" | "assistant",
            content: m.content || "",
            toolCalls: m.tool_calls
              ? (m.tool_calls as { id: string; name: string; input: Record<string, unknown>; result?: unknown }[]).map(
                  (tc) => ({
                    id: tc.id,
                    name: tc.name,
                    input: tc.input || {},
                    result: tc.result,
                  })
                )
              : undefined,
          })
        );
        setActiveMessages(mapped);

        // Extract last klip tool call for preview
        const lastKlipTc = findLastKlipToolCall(mapped);
        setPreviewToolCall(lastKlipTc);
      } else {
        setActiveMessages([]);
        setPreviewToolCall(null);
      }
    } catch (error) {
      console.error("Fout bij laden gesprek:", error);
      setActiveMessages([]);
      setPreviewToolCall(null);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConversationId) return;
      setActiveConversationId(id);
      loadConversationMessages(id);
    },
    [activeConversationId, loadConversationMessages]
  );

  const handleNewConversation = useCallback(async () => {
    try {
      const newConv = await createConversation("klip_builder");
      const listItem: ConversationListItem = {
        id: newConv.id,
        user_id: newConv.user_id,
        title: newConv.title,
        context_type: newConv.context_type,
        context_id: newConv.context_id,
        created_klip_ids: newConv.created_klip_ids,
        created_at: newConv.created_at,
        updated_at: newConv.updated_at,
      };
      setConversations((prev) => [listItem, ...prev]);
      setActiveConversationId(newConv.id);
      setActiveMessages([]);
      setPreviewToolCall(null);
      setWasInProgress(false);
    } catch (error) {
      console.error("Fout bij aanmaken gesprek:", error);
    }
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));

        if (activeConversationId === id) {
          // Select the next available conversation
          const remaining = conversations.filter((c) => c.id !== id);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            loadConversationMessages(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setActiveMessages([]);
            setPreviewToolCall(null);
            setWasInProgress(false);
          }
        }
      } catch (error) {
        console.error("Fout bij verwijderen gesprek:", error);
      }
    },
    [activeConversationId, conversations, loadConversationMessages]
  );

  const handleFirstMessage = useCallback(
    async (conversationId: string, content: string) => {
      // Auto-set title from first message (truncated to 50 chars)
      const title = content.length > 50 ? content.slice(0, 47) + "..." : content;
      try {
        await updateConversationTitle(conversationId, title);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, title, updated_at: new Date().toISOString() }
              : c
          )
        );
      } catch (error) {
        console.error("Fout bij bijwerken titel:", error);
      }
    },
    []
  );

  /** When the server creates a conversation ID (for a chat that started without one) */
  const handleConversationCreated = useCallback(
    (id: string) => {
      if (id !== activeConversationId) {
        setActiveConversationId(id);
        // Add to sidebar if not already there
        setConversations((prev) => {
          if (prev.some((c) => c.id === id)) return prev;
          return [
            {
              id,
              user_id: "",
              title: "Nieuw gesprek",
              context_type: "klip_builder",
              context_id: null,
              created_klip_ids: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            ...prev,
          ];
        });
      }
    },
    [activeConversationId]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          AI Assistent
        </h1>
        <p className="mt-1 text-sm text-hero-grey-regular">
          Beschrijf wat je wilt zien en ik maak de visualisatie voor je.
        </p>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left: Conversation sidebar */}
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />

        {/* Center: Chat panel */}
        {isLoadingMessages ? (
          <div className="flex flex-1 items-center justify-center rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
            <div className="flex flex-col items-center gap-2">
              <span className="material-symbols-rounded text-[24px] text-hero-blue animate-spin">
                progress_activity
              </span>
              <p className="text-sm text-hero-grey-regular">Gesprek laden...</p>
            </div>
          </div>
        ) : (
          <AIChat
            key={activeConversationId || "empty"}
            conversationId={activeConversationId}
            initialMessages={activeMessages}
            wasInProgress={wasInProgress}
            onConversationCreated={handleConversationCreated}
            onFirstMessage={handleFirstMessage}
            onToolCallUpdate={(tc) => setPreviewToolCall(tc)}
          />
        )}

        {/* Right: Preview panel */}
        <div className="flex flex-1 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          {previewToolCall ? (
            <PreviewPanel toolCall={previewToolCall} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon="preview"
                title="Klip preview"
                description="Klip preview verschijnt hier"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper: find last klip-related tool call in messages                */
/* ------------------------------------------------------------------ */

function findLastKlipToolCall(messages: ChatMessage[]): ToolCall | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.toolCalls) {
      for (let j = msg.toolCalls.length - 1; j >= 0; j--) {
        const tc = msg.toolCalls[j];
        if (tc.name === "create_klip" || tc.name === "preview_data") {
          return tc;
        }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Preview panel: renders a klip chart or data table based on the     */
/* tool call that was invoked.                                        */
/* ------------------------------------------------------------------ */

function PreviewPanel({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input;
  const resultData = toolCall.result as Record<string, unknown> | undefined;

  if (toolCall.name === "create_klip") {
    // The result is the created klip object from Supabase
    const config = (resultData?.config || input.config || {}) as Record<string, unknown>;
    const sampleData = (config.sample_data as Record<string, unknown>[]) || [];
    const chartType = (resultData?.type as string) || (input.type as string) || "bar";
    const title = (resultData?.name as string) || (input.name as string) || "Klip preview";

    return (
      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
          {title}
        </h3>
        <div style={{ width: "100%", height: 300 }}>
          {sampleData.length > 0 ? (
            <KlipChart
              type={chartType as "bar" | "line" | "pie" | "area" | "number" | "table"}
              data={sampleData}
              config={{
                x_field: (config.x_field as string) || (input.x_field as string),
                y_field: (config.y_field as string) || (input.y_field as string),
                colors: config.colors as string[] | undefined,
                show_legend: (config.show_legend as boolean) ?? false,
                show_grid: (config.show_grid as boolean) ?? true,
              }}
            />
          ) : !resultData ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-hero-grey-regular">
                Klip wordt voorbereid...
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <span className="material-symbols-rounded text-[32px] text-hero-green">
                  check_circle
                </span>
                <p className="mt-2 text-sm text-hero-grey-regular">
                  Klip succesvol aangemaakt!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (toolCall.name === "preview_data") {
    // Data rows come from the tool result, not the tool input
    const rows = (resultData?.rows as Record<string, unknown>[]) || [];
    const query = (input.query as string) || "";

    return (
      <div className="flex flex-1 flex-col overflow-hidden p-5">
        <h3 className="mb-1 text-sm font-semibold text-hero-grey-black">
          Data preview
        </h3>
        {query && (
          <p className="mb-3 truncate font-mono text-[11px] text-hero-grey-regular">
            {query}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hero-grey-light">
                  {Object.keys(rows[0]).map((key) => (
                    <th
                      key={key}
                      className="sticky top-0 bg-white px-2 py-2 text-left font-medium text-hero-grey-regular"
                    >
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-hero-grey-light/50 last:border-0"
                  >
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-2 py-1.5 text-hero-grey-black">
                        {String(val ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !resultData ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-rounded text-[16px] animate-spin text-hero-blue">
                  progress_activity
                </span>
                <p className="text-sm text-hero-grey-regular">
                  Data wordt opgehaald...
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-hero-grey-regular">
                Geen data beschikbaar.
              </p>
            </div>
          )}
        </div>
        {rows.length > 0 && (
          <p className="mt-2 text-[11px] text-hero-grey-regular">
            {rows.length} {rows.length === 1 ? "rij" : "rijen"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState
        icon="preview"
        title="Preview"
        description="Geen preview beschikbaar voor deze actie."
      />
    </div>
  );
}
