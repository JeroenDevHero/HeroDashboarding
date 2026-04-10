"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface ConversationItem {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "Zojuist";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "dag" : "dagen"} geleden`;
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationSidebarProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  return (
    <div className="flex w-64 shrink-0 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
      {/* Header with new conversation button */}
      <div className="border-b border-hero-grey-light p-3">
        <Button
          variant="primary"
          size="sm"
          icon="add"
          onClick={onNew}
          className="w-full"
        >
          Nieuw gesprek
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <span className="material-symbols-rounded text-[32px] text-hero-grey-light">
              forum
            </span>
            <p className="mt-2 text-xs text-hero-grey-regular">
              Start je eerste gesprek
            </p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isConfirmingDelete = confirmDeleteId === conv.id;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`group relative flex w-full flex-col px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "border-l-2 border-l-hero-blue bg-hero-blue-hairline"
                      : "border-l-2 border-l-transparent hover:bg-hero-blue-hairline/50"
                  }`}
                >
                  <span
                    className={`truncate text-xs font-medium ${
                      isActive
                        ? "text-hero-blue"
                        : "text-hero-grey-black"
                    }`}
                  >
                    {conv.title || "Nieuw gesprek"}
                  </span>
                  <span className="mt-0.5 text-[11px] text-hero-grey-regular">
                    {timeAgo(conv.updated_at)}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    onBlur={() => setConfirmDeleteId(null)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition-all ${
                      isConfirmingDelete
                        ? "bg-red-500 text-white opacity-100"
                        : "text-hero-grey-regular opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    }`}
                    title={isConfirmingDelete ? "Klik nogmaals om te verwijderen" : "Verwijderen"}
                  >
                    <span className="material-symbols-rounded text-[16px]">
                      {isConfirmingDelete ? "check" : "delete"}
                    </span>
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
