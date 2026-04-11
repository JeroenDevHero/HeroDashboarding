"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ToolStatus {
  executing: boolean;
  currentTool: string | null;
  phase?: "loading_context" | "streaming" | "tool_exec";
}

type ConnectionStatus = "idle" | "connected" | "disconnected" | "error";

interface StreamEvent {
  type: string;
  conversation_id?: string;
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
  };
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  tool_use_id?: string;
  tool_name?: string;
  result?: unknown;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getToolLabel(tool: string | null): string {
  switch (tool) {
    case "update_klip":
      return "Klip bijwerken...";
    case "preview_data":
      return "Data opvragen...";
    case "list_datasources":
      return "Databronnen ophalen...";
    default:
      return "Bezig...";
  }
}

interface KlipChatProps {
  klipId: string;
  klipName: string;
}

export default function KlipChat({ klipId, klipName }: KlipChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({
    executing: false,
    currentTool: null,
  });
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [conversationId, setConversationId] = useState<string | undefined>();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, connectionStatus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
  }, [inputValue]);

  const clearActivityTimeout = useCallback(() => {
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = null;
    }
  }, []);

  const resetActivityTimeout = useCallback(
    (onTimeout: () => void) => {
      clearActivityTimeout();
      activityTimeoutRef.current = setTimeout(() => {
        onTimeout();
      }, 45_000);
    },
    [clearActivityTimeout]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setConnectionStatus("idle");
      setToolStatus({
        executing: true,
        currentTool: null,
        phase: "loading_context",
      });

      const apiMessages = [
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user" as const, content: content.trim() },
      ];

      const assistantMessageId = generateId();
      let assistantContent = "";

      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      try {
        abortControllerRef.current = new AbortController();

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            conversationId,
            klipId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API fout: ${response.status} - ${errorText}`);
        }

        setConnectionStatus("connected");
        setToolStatus({
          executing: false,
          currentTool: null,
          phase: "streaming",
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Geen response stream beschikbaar");

        const decoder = new TextDecoder();
        let buffer = "";

        const handleTimeout = () => {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          setConnectionStatus("disconnected");
          setIsLoading(false);
          setToolStatus({ executing: false, currentTool: null });
        };

        resetActivityTimeout(handleTimeout);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (
              !trimmed ||
              trimmed.startsWith(":") ||
              !trimmed.startsWith("data: ")
            )
              continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              switch (event.type) {
                case "conversation_init": {
                  if (event.conversation_id) {
                    setConversationId(event.conversation_id);
                  }
                  break;
                }

                case "keepalive": {
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "content_block_delta": {
                  if (event.delta?.type === "text_delta" && event.delta.text) {
                    assistantContent += event.delta.text;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, content: assistantContent }
                          : msg
                      )
                    );
                    resetActivityTimeout(handleTimeout);
                  }
                  break;
                }

                case "content_block_start":
                case "content_block_stop": {
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "tool_execution_start": {
                  const tools = (event as unknown as { tools: string[] }).tools;
                  setToolStatus({
                    executing: true,
                    currentTool: tools?.[0] ?? null,
                  });
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "tool_execution_result": {
                  const toolName = (
                    event as unknown as { tool_name: string }
                  ).tool_name;
                  setToolStatus({
                    executing: false,
                    currentTool: toolName,
                  });
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "error": {
                  setConnectionStatus("error");
                  break;
                }
              }
            } catch {
              // Skip unparseable events
            }
          }
        }

        setConnectionStatus("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (connectionStatus !== "disconnected") {
            setConnectionStatus("disconnected");
          }
          return;
        }

        setConnectionStatus("error");
        const errorContent =
          error instanceof Error
            ? `Er is een fout opgetreden: ${error.message}`
            : "Er is een onbekende fout opgetreden.";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content || errorContent }
              : msg
          )
        );
      } finally {
        clearActivityTimeout();
        setIsLoading(false);
        setToolStatus({ executing: false, currentTool: null });
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      isLoading,
      conversationId,
      klipId,
      connectionStatus,
      resetActivityTimeout,
      clearActivityTimeout,
    ]
  );

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    const content = inputValue.trim();
    sendMessage(content);
    setInputValue("");
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

  const showDisconnectBanner =
    connectionStatus === "disconnected" || connectionStatus === "error";

  return (
    <div className="mt-6">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-card)] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(7,56,137,0.08)] transition-colors hover:bg-hero-blue-hairline cursor-pointer"
      >
        <span className="material-symbols-rounded text-[20px] text-hero-blue">
          chat
        </span>
        <span className="text-sm font-medium text-hero-grey-black">
          Chat over wijzigingen
        </span>
        <span className="ml-auto material-symbols-rounded text-[18px] text-hero-grey-regular transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          expand_more
        </span>
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="mt-2 flex flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)] overflow-hidden" style={{ height: 420 }}>
          {/* Messages */}
          <div className="flex-1 overflow-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-rounded text-[36px] text-hero-grey-light">
                    chat
                  </span>
                  <p className="mt-2 text-sm text-hero-grey-regular">
                    Bespreek wijzigingen voor &ldquo;{klipName}&rdquo;
                  </p>
                  <p className="mt-1 text-xs text-hero-grey-regular">
                    Vraag de AI om het type, de data of het uiterlijk aan te passen.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                        msg.role === "user"
                          ? "rounded-br-md bg-hero-blue text-white"
                          : "rounded-bl-md bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]"
                      }`}
                    >
                      {msg.content ? (
                        <p
                          className={`whitespace-pre-wrap text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "text-white"
                              : "text-hero-grey-black"
                          }`}
                        >
                          {msg.content}
                        </p>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:150ms]" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Context loading indicator */}
                {isLoading && toolStatus?.phase === "loading_context" && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-hero-blue-hairline px-3.5 py-2">
                      <div className="flex items-center gap-2 text-xs text-hero-blue">
                        <span className="material-symbols-rounded text-[14px] animate-spin">
                          progress_activity
                        </span>
                        <span>Context laden...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tool execution indicator */}
                {isLoading &&
                  toolStatus?.executing &&
                  toolStatus?.phase !== "loading_context" && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-md bg-hero-blue-hairline px-3.5 py-2">
                        <div className="flex items-center gap-2 text-xs text-hero-blue">
                          <span className="material-symbols-rounded text-[14px] animate-spin">
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
                      <div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2 shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:150ms]" />
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}

                {/* Disconnect banner */}
                {showDisconnectBanner && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <span className="material-symbols-rounded text-amber-600 text-[16px]">
                      {connectionStatus === "error" ? "error" : "wifi_off"}
                    </span>
                    <p className="text-xs text-amber-800 flex-1">
                      {connectionStatus === "error"
                        ? "Er is een fout opgetreden."
                        : "Verbinding verbroken."}
                    </p>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-hero-grey-light p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Beschrijf de gewenste wijziging..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm outline-none transition-colors focus:border-hero-blue-bold disabled:opacity-50"
              />
              <Button
                variant="primary"
                size="sm"
                icon="send"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                loading={isLoading}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
