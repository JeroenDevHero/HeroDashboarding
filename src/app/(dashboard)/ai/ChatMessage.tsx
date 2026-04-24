"use client";

import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/lib/hooks/useAIChat";
import ToolCallCard from "./ToolCallCard";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";
import { submitFeedback } from "@/lib/actions/feedback";

interface ChatMessageProps {
  message: ChatMessageType;
  conversationId?: string;
  isFinal?: boolean;
}

export default function ChatMessage({
  message,
  conversationId,
  isFinal,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [feedback, setFeedback] = useState<null | 1 | -1>(null);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function sendFeedback(rating: 1 | -1) {
    if (feedbackPending || !conversationId) return;
    setFeedbackPending(true);
    // Optimistic update so the user gets instant feedback
    setFeedback(rating);
    try {
      await submitFeedback({
        conversation_id: conversationId,
        rating,
      });
    } catch {
      // Roll back optimistic state on failure
      setFeedback(null);
    } finally {
      setFeedbackPending(false);
    }
  }

  async function handleCopy() {
    if (!message.content) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        // Fallback for older browsers / insecure contexts
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-hero-blue px-4 py-2.5">
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex gap-2 flex-wrap">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt={`Bijlage ${i + 1}`}
                  className="max-h-48 max-w-full rounded-lg"
                />
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap text-sm text-white">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%]">
        <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          {message.content ? (
            <MarkdownRenderer
              content={message.content}
              className="text-hero-grey-black"
            />
          ) : (
            !message.toolCalls?.length && (
              <div className="flex items-center gap-2 text-sm text-hero-grey-regular">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium" />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:150ms]" />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-hero-blue-medium [animation-delay:300ms]" />
              </div>
            )
          )}
        </div>
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}

        {/* Action bar — copy is available on every assistant reply with content;
            feedback stays limited to the final reply so users only rate the
            answer they actually see. */}
        {message.content && (
          <div className="mt-1.5 flex items-center gap-1 px-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`rounded p-1 transition-colors cursor-pointer hover:text-hero-blue ${
                copied ? "text-emerald-600" : "text-hero-grey-regular"
              }`}
              aria-label={copied ? "Gekopieerd" : "Kopieer antwoord"}
              title={
                copied
                  ? "Gekopieerd naar klembord"
                  : "Kopieer antwoord om te delen met collega"
              }
            >
              <span className="material-symbols-rounded text-[16px]">
                {copied ? "check" : "content_copy"}
              </span>
            </button>
            {isFinal && conversationId && (
              <>
                <button
                  type="button"
                  disabled={feedbackPending}
                  onClick={() => sendFeedback(1)}
                  className={`rounded p-1 text-hero-grey-regular transition-colors cursor-pointer hover:text-emerald-600 disabled:opacity-50 ${
                    feedback === 1 ? "text-emerald-600" : ""
                  }`}
                  aria-label="Dit antwoord is goed"
                  title="Dit antwoord is goed"
                >
                  <span className="material-symbols-rounded text-[16px]">
                    thumb_up
                  </span>
                </button>
                <button
                  type="button"
                  disabled={feedbackPending}
                  onClick={() => sendFeedback(-1)}
                  className={`rounded p-1 text-hero-grey-regular transition-colors cursor-pointer hover:text-red-500 disabled:opacity-50 ${
                    feedback === -1 ? "text-red-500" : ""
                  }`}
                  aria-label="Dit antwoord klopt niet"
                  title="Dit antwoord klopt niet"
                >
                  <span className="material-symbols-rounded text-[16px]">
                    thumb_down
                  </span>
                </button>
              </>
            )}
            {copied && (
              <span className="ml-1 text-[10px] text-emerald-600">
                Gekopieerd
              </span>
            )}
            {!copied && feedback && (
              <span className="ml-1 text-[10px] text-hero-grey-regular">
                Bedankt voor je feedback
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
