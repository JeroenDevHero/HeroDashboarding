"use client";

import { useState, useCallback, useRef } from "react";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export interface ImageAttachment {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
  toolCalls?: ToolCall[];
}

export interface ToolStatus {
  executing: boolean;
  currentTool: string | null;
  phase?: "loading_context" | "streaming" | "tool_exec";
}

export type ConnectionStatus = "idle" | "connected" | "disconnected" | "error";

interface StreamEvent {
  type: string;
  index?: number;
  conversation_id?: string;
  content_block?: {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: string;
  };
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  tool_use_id?: string;
  tool_name?: string;
  result?: unknown;
  is_error?: boolean;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useAIChat(conversationId?: string, initialMessages?: ChatMessage[]) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({
    executing: false,
    currentTool: null,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(conversationId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Clear the inactivity watchdog */
  const clearActivityTimeout = useCallback(() => {
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = null;
    }
  }, []);

  /** Reset the 45-second inactivity watchdog. If no meaningful data arrives, treat it as a disconnect. */
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
    async (content: string, images?: ImageAttachment[]) => {
      if (!content.trim() || isLoading) return;

      // Remember the last user message so we can retry it
      lastUserMessageRef.current = content.trim();

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        ...(images && images.length > 0 ? { images } : {}),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setConnectionStatus("idle");
      setToolStatus({ executing: true, currentTool: null, phase: "loading_context" });

      // Build the messages array for the API (all messages in conversation)
      // Include tool_calls so the server can recover preview data and context
      // For messages with images, send as multi-content array (Anthropic vision format)
      const buildContent = (msg: ChatMessage) => {
        if (msg.images && msg.images.length > 0) {
          return [
            ...msg.images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
            { type: "text" as const, text: msg.content },
          ];
        }
        return msg.content;
      };

      const apiMessages = [
        ...messages.map((msg) => ({
          role: msg.role,
          content: buildContent(msg),
          ...(msg.toolCalls && msg.toolCalls.length > 0
            ? {
                tool_calls: msg.toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  input: tc.input,
                  result: tc.result,
                })),
              }
            : {}),
        })),
        {
          role: "user" as const,
          content: images && images.length > 0
            ? [
                ...images.map((img) => ({
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
                })),
                { type: "text" as const, text: content.trim() },
              ]
            : content.trim(),
        },
      ];

      const assistantMessageId = generateId();
      let assistantContent = "";
      const toolCalls: ToolCall[] = [];

      // Track current content block for assembling tool calls
      let currentToolCallId = "";
      let currentToolCallName = "";
      let currentToolCallInput = "";

      // Add an empty assistant message that we'll update as we stream
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          toolCalls: [],
        },
      ]);

      try {
        abortControllerRef.current = new AbortController();

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            conversationId: activeConversationId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `API fout: ${response.status} - ${errorText}`
          );
        }

        // Context is loaded, now streaming
        setConnectionStatus("connected");
        setToolStatus({ executing: false, currentTool: null, phase: "streaming" });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Geen response stream beschikbaar");

        const decoder = new TextDecoder();
        let buffer = "";

        // Handle stream timeout
        const handleTimeout = () => {
          // Abort the fetch but don't clear messages
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          setConnectionStatus("disconnected");
          setIsLoading(false);
          setToolStatus({ executing: false, currentTool: null });
        };

        // Start the activity watchdog
        resetActivityTimeout(handleTimeout);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines, SSE comments (keepalive pings), and non-data lines
            if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              switch (event.type) {
                case "conversation_init": {
                  // Capture the conversation ID from the server
                  if (event.conversation_id) {
                    setActiveConversationId(event.conversation_id);
                  }
                  break;
                }

                case "keepalive": {
                  // Keepalive resets the watchdog but is not "meaningful" data
                  // We still reset it to prevent false timeouts during tool execution
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "content_block_start": {
                  if (event.content_block?.type === "tool_use") {
                    currentToolCallId = event.content_block.id || "";
                    currentToolCallName = event.content_block.name || "";
                    currentToolCallInput = "";
                  }
                  // Meaningful activity
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
                    // Meaningful activity - text is streaming
                    resetActivityTimeout(handleTimeout);
                  } else if (
                    event.delta?.type === "input_json_delta" &&
                    event.delta.partial_json
                  ) {
                    currentToolCallInput += event.delta.partial_json;
                    resetActivityTimeout(handleTimeout);
                  }
                  break;
                }

                case "content_block_stop": {
                  if (currentToolCallId) {
                    let parsedInput: Record<string, unknown> = {};
                    try {
                      parsedInput = currentToolCallInput
                        ? JSON.parse(currentToolCallInput)
                        : {};
                    } catch {
                      // Partial JSON, store as-is
                      parsedInput = { _raw: currentToolCallInput };
                    }

                    toolCalls.push({
                      id: currentToolCallId,
                      name: currentToolCallName,
                      input: parsedInput,
                    });

                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, toolCalls: [...toolCalls] }
                          : msg
                      )
                    );

                    // Reset tool call tracking
                    currentToolCallId = "";
                    currentToolCallName = "";
                    currentToolCallInput = "";
                  }
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
                  const toolName = (event as unknown as { tool_name: string }).tool_name;
                  setToolStatus({
                    executing: false,
                    currentTool: toolName,
                  });
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "tool_result": {
                  const toolUseId = event.tool_use_id;
                  const toolResult = event.result;
                  if (toolUseId) {
                    // Find and update the matching tool call with its result
                    const updatedToolCalls = toolCalls.map((tc) =>
                      tc.id === toolUseId ? { ...tc, result: toolResult } : tc
                    );
                    // Replace toolCalls array contents
                    toolCalls.length = 0;
                    toolCalls.push(...updatedToolCalls);

                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === assistantMessageId
                          ? { ...msg, toolCalls: [...toolCalls] }
                          : msg
                      )
                    );
                  }
                  resetActivityTimeout(handleTimeout);
                  break;
                }

                case "error": {
                  // Server-side error - the stream is ending, show error status
                  setConnectionStatus("error");
                  break;
                }
              }
            } catch {
              // Skip unparseable events
            }
          }
        }

        // Stream completed successfully
        setConnectionStatus("idle");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // If we set disconnected status (from timeout), keep messages and that status.
          // If user manually navigated away, also keep messages.
          // Don't clear messages in either case.
          if (connectionStatus !== "disconnected") {
            // User navigated away or manually cancelled - keep messages, mark disconnected
            setConnectionStatus("disconnected");
          }
          return;
        }

        // Network error or other fetch failure
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
    [messages, isLoading, activeConversationId, connectionStatus, resetActivityTimeout, clearActivityTimeout]
  );

  /** Retry the last user message (re-sends to get the AI to continue) */
  const retryLastMessage = useCallback(() => {
    if (lastUserMessageRef.current) {
      // Remove the last assistant message if it's empty or errored, so we get a clean retry
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      setConnectionStatus("idle");
      // Small delay to let state settle, then re-send
      setTimeout(() => {
        sendMessage(lastUserMessageRef.current);
      }, 100);
    }
  }, [sendMessage]);

  const clearMessages = useCallback(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    clearActivityTimeout();
    setMessages([]);
    setIsLoading(false);
    setConnectionStatus("idle");
  }, [clearActivityTimeout]);

  return {
    messages,
    isLoading,
    toolStatus,
    connectionStatus,
    activeConversationId,
    sendMessage,
    clearMessages,
    setMessages,
    retryLastMessage,
  };
}
