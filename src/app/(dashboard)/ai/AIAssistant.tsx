"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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
  suggestedQuestions?: string[];
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
  suggestedQuestions = [],
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
  const [previewToolCalls, setPreviewToolCalls] = useState<ToolCall[]>([]);
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

        // Extract last klip batch for preview
        setPreviewToolCalls(findLastKlipBatch(mapped));
      } else {
        setActiveMessages([]);
        setPreviewToolCalls([]);
      }
    } catch (error) {
      console.error("Fout bij laden gesprek:", error);
      setActiveMessages([]);
      setPreviewToolCalls([]);
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
      setPreviewToolCalls([]);
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
            setPreviewToolCalls([]);
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
            suggestedQuestions={suggestedQuestions}
            onConversationCreated={handleConversationCreated}
            onFirstMessage={handleFirstMessage}
            onToolCallUpdate={(tcs) => setPreviewToolCalls(tcs)}
          />
        )}

        {/* Right: Preview panel */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          {previewToolCalls.length > 0 ? (
            <PreviewPanel toolCalls={previewToolCalls} />
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
/* Helper: find the last batch of klip-related tool calls             */
/* Scans newest-first for an assistant turn that contains any klip    */
/* tool calls and returns ALL klips from that turn at once so         */
/* multi-klip generations show side-by-side in the preview.           */
/* ------------------------------------------------------------------ */

function findLastKlipBatch(messages: ChatMessage[]): ToolCall[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg.toolCalls || msg.toolCalls.length === 0) continue;
    const relevant = msg.toolCalls.filter(
      (tc) =>
        tc.name === "create_klip" ||
        tc.name === "update_klip" ||
        tc.name === "preview_data"
    );
    if (relevant.length === 0) continue;
    const klips = relevant.filter(
      (tc) => tc.name === "create_klip" || tc.name === "update_klip"
    );
    if (klips.length > 0) return klips;
    return [relevant[relevant.length - 1]];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Helper: icon for a given chart type (shown on each preview card)    */
/* ------------------------------------------------------------------ */

function iconForType(type: string | undefined): string {
  switch (type) {
    case "bar":
    case "bar_chart":
    case "waterfall_chart":
      return "bar_chart";
    case "line":
    case "line_chart":
    case "sparkline":
      return "show_chart";
    case "area":
    case "area_chart":
      return "area_chart";
    case "pie":
    case "pie_chart":
      return "pie_chart";
    case "table":
      return "table_chart";
    case "kpi_tile":
    case "number":
    case "metric_card":
    case "number_comparison":
      return "analytics";
    case "gauge":
    case "progress_bar":
    case "bullet_chart":
      return "speed";
    case "scatter_chart":
      return "scatter_plot";
    case "funnel":
      return "filter_alt";
    case "heatmap":
      return "grid_on";
    case "timeline":
      return "timeline";
    case "radar_chart":
      return "radar";
    case "treemap":
      return "view_quilt";
    case "map":
      return "map";
    default:
      return "insights";
  }
}

/* ------------------------------------------------------------------ */
/* Extract renderable klip info from a tool call                       */
/* ------------------------------------------------------------------ */

interface KlipPreviewData {
  title: string;
  chartType: string;
  sampleData: Record<string, unknown>[];
  fullConfig: Record<string, unknown>;
  hasResult: boolean;
  isUpdate: boolean;
}

function extractKlipPreview(toolCall: ToolCall): KlipPreviewData {
  const input = toolCall.input;
  const resultData = toolCall.result as Record<string, unknown> | undefined;
  const config = (resultData?.config || input.config || {}) as Record<string, unknown>;
  const sampleData = (config.sample_data as Record<string, unknown>[]) || [];
  const chartType = (resultData?.type as string) || (input.type as string) || "bar";
  const title = (resultData?.name as string) || (input.name as string) || "Klip preview";
  const fullConfig: Record<string, unknown> = {
    ...config,
    show_grid: (config.show_grid as boolean) ?? true,
  };
  delete fullConfig.sample_data;
  return {
    title,
    chartType,
    sampleData,
    fullConfig,
    hasResult: !!resultData,
    isUpdate: toolCall.name === "update_klip",
  };
}

/* ------------------------------------------------------------------ */
/* Preview panel: renders one or more klips, or a data table preview. */
/* ------------------------------------------------------------------ */

function PreviewPanel({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  if (toolCalls.length === 0) return null;

  // Data preview (only when no klips in the batch)
  const first = toolCalls[0];
  if (toolCalls.length === 1 && first.name === "preview_data") {
    return <DataPreview toolCall={first} />;
  }

  const klips = toolCalls.filter(
    (tc) => tc.name === "create_klip" || tc.name === "update_klip"
  );

  if (klips.length === 1) {
    return <SingleKlipPreview toolCall={klips[0]} />;
  }

  return (
    <>
      <MultiKlipGallery toolCalls={klips} onFocus={setFocusedIndex} />
      {focusedIndex !== null && klips[focusedIndex] && (
        <FocusedKlipOverlay
          toolCall={klips[focusedIndex]}
          total={klips.length}
          index={focusedIndex}
          onClose={() => setFocusedIndex(null)}
          onPrev={() =>
            setFocusedIndex((i) =>
              i === null ? null : (i - 1 + klips.length) % klips.length
            )
          }
          onNext={() =>
            setFocusedIndex((i) =>
              i === null ? null : (i + 1) % klips.length
            )
          }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Single klip preview (legacy full-size behaviour)                    */
/* ------------------------------------------------------------------ */

function SingleKlipPreview({ toolCall }: { toolCall: ToolCall }) {
  const { title, chartType, sampleData, fullConfig, hasResult, isUpdate } =
    extractKlipPreview(toolCall);

  return (
    <div className="flex flex-1 flex-col p-5">
      <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
        {title}
        {isUpdate && (
          <span className="ml-2 text-xs font-normal text-hero-grey-regular">
            (bijgewerkt)
          </span>
        )}
      </h3>
      <div style={{ width: "100%", height: 300 }}>
        {sampleData.length > 0 ? (
          <KlipChart
            type={chartType}
            data={sampleData}
            config={fullConfig as import("@/components/klip/KlipChart").KlipChartConfig}
          />
        ) : !hasResult ? (
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
                Klip succesvol {isUpdate ? "bijgewerkt" : "aangemaakt"}!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-klip gallery — 2-column responsive grid of klip cards        */
/* ------------------------------------------------------------------ */

function MultiKlipGallery({
  toolCalls,
  onFocus,
}: {
  toolCalls: ToolCall[];
  onFocus: (index: number) => void;
}) {
  const readyCount = toolCalls.filter((tc) => !!tc.result).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-hero-grey-light/70 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-hero-grey-black">
            {toolCalls.length} klips in voorbeeld
          </h3>
          <p className="mt-0.5 text-[11px] text-hero-grey-regular">
            Klik op een klip om te vergroten
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-hero-blue-hairline px-2.5 py-1 text-[11px] font-medium text-hero-blue">
          {readyCount < toolCalls.length && (
            <span className="material-symbols-rounded animate-spin text-[14px]">
              progress_activity
            </span>
          )}
          <span>
            {readyCount}/{toolCalls.length} klaar
          </span>
        </div>
      </div>

      {/* Grid (container-query driven: 2 cols once panel is wide enough) */}
      <div className="@container min-h-0 flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 gap-3 @[520px]:grid-cols-2">
          {toolCalls.map((tc, idx) => (
            <KlipGalleryCard
              key={tc.id || idx}
              toolCall={tc}
              index={idx}
              onClick={() => onFocus(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single card in the gallery                                          */
/* ------------------------------------------------------------------ */

function KlipGalleryCard({
  toolCall,
  index,
  onClick,
}: {
  toolCall: ToolCall;
  index: number;
  onClick: () => void;
}) {
  const { title, chartType, sampleData, fullConfig, hasResult, isUpdate } =
    extractKlipPreview(toolCall);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
      className="group animate-in fade-in slide-in-from-bottom-2 flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hero-grey-light bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-hero-blue-medium hover:shadow-[0_6px_18px_rgba(7,56,137,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-hero-blue cursor-pointer"
    >
      {/* Card header */}
      <div className="flex items-center gap-2 border-b border-hero-grey-light/70 bg-gradient-to-b from-white to-hero-blue-hairline/40 px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-hero-blue-hairline text-hero-blue">
          <span className="material-symbols-rounded text-[14px]">
            {iconForType(chartType)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-hero-grey-black">
            {title}
          </p>
          {isUpdate && (
            <p className="text-[10px] text-hero-grey-regular">bijgewerkt</p>
          )}
        </div>
        <span className="material-symbols-rounded text-[16px] text-hero-grey-regular opacity-0 transition-opacity group-hover:opacity-100">
          open_in_full
        </span>
      </div>

      {/* Chart body */}
      <div className="flex items-center justify-center p-2" style={{ height: 200 }}>
        {sampleData.length > 0 ? (
          <div className="h-full w-full">
            <KlipChart
              type={chartType}
              data={sampleData}
              config={fullConfig as import("@/components/klip/KlipChart").KlipChartConfig}
            />
          </div>
        ) : !hasResult ? (
          <div className="flex items-center gap-2 text-hero-grey-regular">
            <span className="material-symbols-rounded animate-spin text-[16px] text-hero-blue">
              progress_activity
            </span>
            <span className="text-xs">Klip wordt voorbereid...</span>
          </div>
        ) : (
          <div className="text-center">
            <span className="material-symbols-rounded text-[24px] text-emerald-500">
              check_circle
            </span>
            <p className="mt-1 text-[11px] text-hero-grey-regular">
              Klip opgeslagen
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Focused klip overlay — renders the selected klip at full size      */
/* with prev/next navigation across the batch.                        */
/* ------------------------------------------------------------------ */

function FocusedKlipOverlay({
  toolCall,
  total,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  toolCall: ToolCall;
  total: number;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { title, chartType, sampleData, fullConfig, hasResult, isUpdate } =
    extractKlipPreview(toolCall);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hero-grey-light px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-hero-blue-hairline text-hero-blue">
              <span className="material-symbols-rounded text-[18px]">
                {iconForType(chartType)}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-hero-grey-black">
                {title}
                {isUpdate && (
                  <span className="ml-2 text-xs font-normal text-hero-grey-regular">
                    (bijgewerkt)
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-hero-grey-regular">
                Klip {index + 1} van {total}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              className="flex h-8 w-8 items-center justify-center rounded-md text-hero-grey-regular transition-colors hover:bg-hero-blue-hairline hover:text-hero-blue cursor-pointer"
              title="Vorige klip"
              disabled={total < 2}
            >
              <span className="material-symbols-rounded text-[18px]">
                chevron_left
              </span>
            </button>
            <button
              type="button"
              onClick={onNext}
              className="flex h-8 w-8 items-center justify-center rounded-md text-hero-grey-regular transition-colors hover:bg-hero-blue-hairline hover:text-hero-blue cursor-pointer"
              title="Volgende klip"
              disabled={total < 2}
            >
              <span className="material-symbols-rounded text-[18px]">
                chevron_right
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-md text-hero-grey-regular transition-colors hover:bg-hero-grey-light/70 hover:text-hero-grey-black cursor-pointer"
              title="Sluiten (Esc)"
            >
              <span className="material-symbols-rounded text-[20px]">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 p-6">
          <div style={{ width: "100%", height: "60vh", minHeight: 360 }}>
            {sampleData.length > 0 ? (
              <KlipChart
                type={chartType}
                data={sampleData}
                config={fullConfig as import("@/components/klip/KlipChart").KlipChartConfig}
              />
            ) : !hasResult ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-hero-grey-regular">
                  Klip wordt voorbereid...
                </p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-rounded text-[40px] text-emerald-500">
                    check_circle
                  </span>
                  <p className="mt-2 text-sm text-hero-grey-regular">
                    Klip opgeslagen
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Data preview (SQL rows)                                             */
/* ------------------------------------------------------------------ */

function DataPreview({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input;
  const resultData = toolCall.result as Record<string, unknown> | undefined;
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
