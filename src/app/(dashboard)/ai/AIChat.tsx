"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAIChat } from "@/lib/hooks/useAIChat";
import type { ToolCall } from "@/lib/hooks/useAIChat";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KlipChart from "@/components/klip/KlipChart";
import ChatMessage from "./ChatMessage";

export default function AIChat() {
  const { messages, isLoading, sendMessage, clearMessages } = useAIChat();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Find the last klip-related tool call for the preview panel
  const lastKlipToolCall = useMemo((): ToolCall | null => {
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
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-hero-grey-black">
            AI Assistent
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Beschrijf wat je wilt zien en ik maak de visualisatie voor je.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon="add_comment"
          onClick={clearMessages}
        >
          Nieuw gesprek
        </Button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: Chat panel */}
        <div className="flex w-1/2 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          {/* Messages area */}
          <div className="flex-1 overflow-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-rounded text-[40px] text-hero-grey-light">
                    chat
                  </span>
                  <p className="mt-2 text-sm text-hero-grey-regular">
                    Start een gesprek om een klip te maken.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                {/* Typing indicator when loading and last message is from user */}
                {isLoading &&
                  messages.length > 0 &&
                  messages[messages.length - 1].role === "user" && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:150ms]" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="border-t border-hero-grey-light p-4">
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Beschrijf je klip..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm outline-none transition-colors focus:border-hero-blue-bold disabled:opacity-50"
              />
              <Button
                variant="primary"
                size="md"
                icon="send"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                loading={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Right: Preview panel */}
        <div className="flex w-1/2 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          {lastKlipToolCall ? (
            <PreviewPanel toolCall={lastKlipToolCall} />
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
/* Preview panel: renders a klip chart or data table based on the     */
/* tool call that was invoked.                                        */
/* ------------------------------------------------------------------ */

function PreviewPanel({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input;

  if (toolCall.name === "create_klip") {
    const chartType = (input.chart_type as string) || (input.type as string) || "bar";
    const data = (input.data as Record<string, unknown>[]) || [];
    const config = (input.config as Record<string, unknown>) || {};
    const title = (input.title as string) || (input.name as string) || "Klip preview";

    return (
      <div className="flex flex-1 flex-col p-5">
        <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
          {title}
        </h3>
        <div className="flex-1 min-h-0">
          {data.length > 0 ? (
            <KlipChart
              type={chartType as "bar" | "line" | "pie" | "area" | "number" | "table"}
              data={data}
              config={{
                x_field: (config.x_field as string) || (input.x_field as string),
                y_field: (config.y_field as string) || (input.y_field as string),
                colors: config.colors as string[] | undefined,
                show_legend: (config.show_legend as boolean) ?? false,
                show_grid: (config.show_grid as boolean) ?? true,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-hero-grey-regular">
                Klip wordt voorbereid...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (toolCall.name === "preview_data") {
    const rows = (input.data as Record<string, unknown>[]) ||
      (input.rows as Record<string, unknown>[]) || [];
    const query = (input.query as string) || "";

    return (
      <div className="flex flex-1 flex-col overflow-hidden p-5">
        <h3 className="mb-1 text-sm font-semibold text-hero-grey-black">
          Data preview
        </h3>
        {query && (
          <p className="mb-3 truncate text-[11px] font-mono text-hero-grey-regular">
            {query}
          </p>
        )}
        <div className="flex-1 overflow-auto min-h-0">
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
                      <td
                        key={j}
                        className="px-2 py-1.5 text-hero-grey-black"
                      >
                        {String(val ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

  // Fallback for unknown tool calls
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
