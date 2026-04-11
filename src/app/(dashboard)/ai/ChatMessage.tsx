"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/hooks/useAIChat";
import ToolCallCard from "./ToolCallCard";

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

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
          <p className="whitespace-pre-wrap text-sm text-white">{message.content}</p>
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
            <div className="whitespace-pre-wrap text-sm text-hero-grey-black leading-relaxed">
              {message.content}
            </div>
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
      </div>
    </div>
  );
}
