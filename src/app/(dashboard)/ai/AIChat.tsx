"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAIChat } from "@/lib/hooks/useAIChat";
import type { ChatMessage as ChatMessageType, ToolCall } from "@/lib/hooks/useAIChat";
import Button from "@/components/ui/Button";
import ChatMessage from "./ChatMessage";

export type { ToolCall };

interface AIChatProps {
  conversationId: string | null;
  initialMessages: ChatMessageType[];
  onConversationCreated?: (id: string) => void;
  onFirstMessage?: (conversationId: string, content: string) => void;
}

export default function AIChat({
  conversationId,
  initialMessages,
  onConversationCreated,
  onFirstMessage,
}: AIChatProps) {
  const { messages, isLoading, toolStatus, sendMessage, clearMessages, setMessages } =
    useAIChat(conversationId || undefined, initialMessages);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevConversationIdRef = useRef<string | null>(conversationId);

  // When conversationId or initialMessages change, reset messages
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      setMessages(initialMessages);
      prevConversationIdRef.current = conversationId;
    }
  }, [conversationId, initialMessages, setMessages]);

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
    const content = inputValue.trim();

    // If this is the first user message in the conversation, notify the parent
    // so it can update the title
    const isFirstMessage = messages.length === 0;

    sendMessage(content);
    setInputValue("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    if (isFirstMessage && conversationId && onFirstMessage) {
      onFirstMessage(conversationId, content);
    }
  }, [inputValue, isLoading, sendMessage, messages.length, conversationId, onFirstMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Expose last klip tool call for parent to use in preview panel
  const lastKlipToolCall = (() => {
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
  })();

  // Make lastKlipToolCall available to parent via a ref-like pattern
  // We'll expose it through a callback in the parent instead

  return (
    <div className="flex flex-1 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
      {/* Messages area */}
      <div className="flex-1 overflow-auto p-4">
        {!conversationId ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-rounded text-[40px] text-hero-grey-light">
                chat
              </span>
              <p className="mt-2 text-sm text-hero-grey-regular">
                Selecteer een gesprek of start een nieuw gesprek.
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
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

            {/* Tool execution indicator */}
            {isLoading && toolStatus?.executing && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-hero-blue-hairline px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-hero-blue">
                    <span className="material-symbols-rounded text-[16px] animate-spin">
                      progress_activity
                    </span>
                    <span>{getToolLabel(toolStatus.currentTool)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {isLoading &&
              !toolStatus?.executing &&
              messages.length > 0 &&
              (messages[messages.length - 1].role === "user" ||
                messages[messages.length - 1].content === "") && (
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
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={conversationId ? "Beschrijf je klip..." : "Selecteer eerst een gesprek..."}
            rows={1}
            disabled={isLoading || !conversationId}
            className="flex-1 resize-none rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm outline-none transition-colors focus:border-hero-blue-bold disabled:opacity-50"
          />
          <Button
            variant="primary"
            size="md"
            icon="send"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading || !conversationId}
            loading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exported: get last klip tool call from messages (used by parent)    */
/* ------------------------------------------------------------------ */

export function getLastKlipToolCall(messages: ChatMessageType[]): ToolCall | null {
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
/* Helper: human-readable label for tool execution status             */
/* ------------------------------------------------------------------ */

function getToolLabel(tool: string | null): string {
  switch (tool) {
    case "list_datasources":
      return "Databronnen ophalen...";
    case "preview_data":
      return "Data opvragen...";
    case "create_klip":
      return "Klip aanmaken...";
    default:
      return "Bezig...";
  }
}
