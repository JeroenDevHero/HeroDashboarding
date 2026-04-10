"use client";

import type { ToolCall } from "@/lib/hooks/useAIChat";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const toolMeta: Record<
  string,
  { icon: string; label: string; getSummary: (input: Record<string, unknown>) => string }
> = {
  create_klip: {
    icon: "insert_chart",
    label: "Klip aangemaakt",
    getSummary: (input) =>
      (input.title as string) || (input.name as string) || "Nieuwe klip",
  },
  preview_data: {
    icon: "table_chart",
    label: "Data preview",
    getSummary: (input) => {
      const query = (input.query as string) || "";
      return query.length > 60 ? query.slice(0, 60) + "..." : query || "Query uitgevoerd";
    },
  },
  list_datasources: {
    icon: "database",
    label: "Databronnen opgehaald",
    getSummary: () => "Beschikbare databronnen",
  },
};

const fallbackMeta = {
  icon: "build",
  label: "Tool uitgevoerd",
  getSummary: (input: Record<string, unknown>) => {
    const keys = Object.keys(input);
    return keys.length > 0 ? keys.join(", ") : "Geen parameters";
  },
};

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const meta = toolMeta[toolCall.name] || {
    ...fallbackMeta,
    label: toolCall.name,
  };

  const summary = meta.getSummary(toolCall.input);

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-hero-blue-soft bg-hero-blue-hairline px-3 py-2 mt-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-hero-blue-soft">
        <span className="material-symbols-rounded text-[16px] text-hero-blue">
          {meta.icon}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-hero-blue">{meta.label}</p>
        <p className="truncate text-[11px] text-hero-grey-regular">{summary}</p>
      </div>
    </div>
  );
}
