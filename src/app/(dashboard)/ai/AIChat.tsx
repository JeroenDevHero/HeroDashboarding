"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAIChat } from "@/lib/hooks/useAIChat";
import type { ChatMessage as ChatMessageType, ToolCall, ConnectionStatus, ImageAttachment } from "@/lib/hooks/useAIChat";
import Button from "@/components/ui/Button";
import ChatMessage from "./ChatMessage";

export type { ToolCall };

interface AIChatProps {
  conversationId: string | null;
  initialMessages: ChatMessageType[];
  wasInProgress?: boolean;
  onConversationCreated?: (id: string) => void;
  onFirstMessage?: (conversationId: string, content: string) => void;
  onToolCallUpdate?: (toolCall: ToolCall) => void;
}

export default function AIChat({
  conversationId,
  initialMessages,
  wasInProgress = false,
  onConversationCreated,
  onFirstMessage,
  onToolCallUpdate,
}: AIChatProps) {
  const {
    messages,
    isLoading,
    toolStatus,
    connectionStatus,
    activeConversationId,
    sendMessage,
    clearMessages,
    setMessages,
    retryLastMessage,
  } = useAIChat(conversationId || undefined, initialMessages);
  const [inputValue, setInputValue] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [showInProgressBanner, setShowInProgressBanner] = useState(wasInProgress);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevConversationIdRef = useRef<string | null>(conversationId);

  // When conversationId or initialMessages change, reset messages
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      setMessages(initialMessages);
      prevConversationIdRef.current = conversationId;
    }
  }, [conversationId, initialMessages, setMessages]);

  // Notify parent when the server creates/assigns a conversation ID
  useEffect(() => {
    if (activeConversationId && activeConversationId !== conversationId && onConversationCreated) {
      onConversationCreated(activeConversationId);
    }
  }, [activeConversationId, conversationId, onConversationCreated]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, connectionStatus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }, [inputValue]);

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // Max 4 images at a time
    const toProcess = imageFiles.slice(0, 4 - pendingImages.length);

    for (const file of toProcess) {
      if (file.size > 5 * 1024 * 1024) {
        // Skip files > 5MB silently (could add toast later)
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // dataUrl = "data:image/png;base64,..."
        const [meta, base64] = dataUrl.split(",");
        const mediaType = meta.match(/data:(image\/\w+);/)?.[1] as ImageAttachment["mediaType"] | undefined;
        if (base64 && mediaType) {
          setPendingImages((prev) => {
            if (prev.length >= 4) return prev;
            return [...prev, { base64, mediaType }];
          });
        }
      };
      reader.readAsDataURL(file);
    }
  }, [pendingImages.length]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      // Reset so the same file can be selected again
      e.target.value = "";
    }
  }, [processFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      processFiles(imageFiles);
    }
  }, [processFiles]);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    const content = inputValue.trim();

    // If this is the first user message in the conversation, notify the parent
    // so it can update the title
    const isFirstMessage = messages.length === 0;

    sendMessage(content, pendingImages.length > 0 ? pendingImages : undefined);
    setInputValue("");
    setPendingImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    if (isFirstMessage && conversationId && onFirstMessage) {
      onFirstMessage(conversationId, content);
    }
  }, [inputValue, isLoading, sendMessage, pendingImages, messages.length, conversationId, onFirstMessage]);

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
  const lastKlipToolCall = useMemo(() => getLastKlipToolCall(messages), [messages]);

  // Notify parent of tool call changes for preview
  useEffect(() => {
    if (onToolCallUpdate && lastKlipToolCall) {
      onToolCallUpdate(lastKlipToolCall);
    }
  }, [messages, onToolCallUpdate, lastKlipToolCall]);

  const showDisconnectBanner = connectionStatus === "disconnected" || connectionStatus === "error";

  /** Continue an in-progress conversation that was interrupted by navigation */
  const handleContinueInProgress = useCallback(() => {
    setShowInProgressBanner(false);
    // Find the last user message content
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const content = lastUserMsg.content;
      // Remove the last user message (and any trailing empty assistant message)
      // so that sendMessage can re-add it cleanly without duplication
      setMessages((prev) => {
        let trimmed = [...prev];
        // Remove trailing empty assistant message if present
        if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "assistant" && !trimmed[trimmed.length - 1].content) {
          trimmed = trimmed.slice(0, -1);
        }
        // Remove the last user message
        if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === "user") {
          trimmed = trimmed.slice(0, -1);
        }
        return trimmed;
      });
      // Small delay for state to settle, then re-send
      setTimeout(() => {
        sendMessage(content);
      }, 150);
    }
  }, [messages, setMessages, sendMessage]);

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

            {/* Context loading indicator */}
            {isLoading && toolStatus?.phase === "loading_context" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-hero-blue-hairline px-4 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-hero-blue">
                    <span className="material-symbols-rounded text-[16px] animate-spin">
                      progress_activity
                    </span>
                    <span>Context laden (databronnen, catalog, kennisbank)...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tool execution indicator */}
            {isLoading && toolStatus?.executing && toolStatus?.phase !== "loading_context" && (
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

            {/* In-progress banner (conversation was interrupted by navigation) */}
            {showInProgressBanner && !isLoading && (
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                <span className="material-symbols-rounded text-blue-600 text-[20px]">
                  info
                </span>
                <p className="text-sm text-blue-800 flex-1">
                  Dit gesprek was nog bezig. Wil je doorgaan?
                </p>
                <Button variant="primary" size="sm" icon="refresh" onClick={handleContinueInProgress}>
                  Doorgaan
                </Button>
              </div>
            )}

            {/* Disconnect / error banner */}
            {showDisconnectBanner && (
              <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                <span className="material-symbols-rounded text-amber-600 text-[20px]">
                  {connectionStatus === "error" ? "error" : "wifi_off"}
                </span>
                <p className="text-sm text-amber-800 flex-1">
                  {connectionStatus === "error"
                    ? "Er is een fout opgetreden. Je kunt het opnieuw proberen."
                    : "De verbinding is verbroken."}
                </p>
                <Button variant="primary" size="sm" icon="refresh" onClick={retryLastMessage}>
                  Doorgaan
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-hero-grey-light p-4">
        {/* Thumbnail preview strip */}
        {pendingImages.length > 0 && (
          <div className="mb-2 flex gap-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="group relative h-16 w-16 rounded-lg overflow-hidden border border-hero-grey-light">
                <img
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt={`Upload ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="material-symbols-rounded text-[14px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || !conversationId || pendingImages.length >= 4}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-input)] border border-hero-grey-light text-hero-grey-regular transition-colors hover:border-hero-blue-bold hover:text-hero-blue disabled:opacity-50"
            title="Afbeelding toevoegen"
          >
            <span className="material-symbols-rounded text-[20px]">attach_file</span>
          </button>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
