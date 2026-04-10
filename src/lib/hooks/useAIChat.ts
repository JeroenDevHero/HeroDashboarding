"use client";

import { useState, useCallback, useRef } from "react";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolStatus {
  executing: boolean;
  currentTool: string | null;
}

interface StreamEvent {
  type: string;
  index?: number;
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
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useAIChat(conversationId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus>({
    executing: false,
    currentTool: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

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

      // Build the messages array for the API (all messages in conversation)
      const apiMessages = [
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user" as const, content: content.trim() },
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
          body: JSON.stringify({ messages: apiMessages, conversationId }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `API fout: ${response.status} - ${errorText}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Geen response stream beschikbaar");

        const decoder = new TextDecoder();
        let buffer = "";

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
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              switch (event.type) {
                case "content_block_start": {
                  if (event.content_block?.type === "tool_use") {
                    currentToolCallId = event.content_block.id || "";
                    currentToolCallName = event.content_block.name || "";
                    currentToolCallInput = "";
                  }
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
                  } else if (
                    event.delta?.type === "input_json_delta" &&
                    event.delta.partial_json
                  ) {
                    currentToolCallInput += event.delta.partial_json;
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
                  break;
                }

                case "tool_execution_start": {
                  const tools = (event as unknown as { tools: string[] }).tools;
                  setToolStatus({
                    executing: true,
                    currentTool: tools?.[0] ?? null,
                  });
                  break;
                }

                case "tool_execution_result": {
                  const toolName = (event as unknown as { tool_name: string }).tool_name;
                  setToolStatus({
                    executing: false,
                    currentTool: toolName,
                  });
                  break;
                }
              }
            } catch {
              // Skip unparseable events
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // User cancelled the request
          return;
        }

        const errorContent =
          error instanceof Error
            ? `Er is een fout opgetreden: ${error.message}`
            : "Er is een onbekende fout opgetreden.";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: errorContent }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        setToolStatus({ executing: false, currentTool: null });
        abortControllerRef.current = null;
      }
    },
    [messages, isLoading, conversationId]
  );

  const clearMessages = useCallback(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, toolStatus, sendMessage, clearMessages };
}
