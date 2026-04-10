"use client";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KlipChart from "./KlipChart";

interface KlipConfig {
  x_field?: string;
  y_field?: string;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  prefix?: string;
  suffix?: string;
  columns?: { key: string; label: string }[];
}

interface Klip {
  id: string;
  title: string;
  type: "bar" | "line" | "pie" | "area" | "number" | "table";
  description?: string;
  cached_data?: Record<string, unknown>[] | null;
  config: KlipConfig;
}

interface KlipCardProps {
  klip: Klip;
  onEdit?: () => void;
  onDelete?: () => void;
}

const typeBadgeVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  bar: "info",
  line: "info",
  pie: "success",
  area: "info",
  number: "warning",
  table: "success",
};

export default function KlipCard({ klip, onEdit, onDelete }: KlipCardProps) {
  const hasData = klip.cached_data && klip.cached_data.length > 0;

  const headerAction = (
    <div className="flex items-center gap-1">
      <Badge variant={typeBadgeVariant[klip.type] ?? "info"}>{klip.type}</Badge>
      {onEdit && (
        <Button variant="ghost" size="sm" icon="edit" onClick={onEdit} />
      )}
      {onDelete && (
        <Button variant="ghost" size="sm" icon="delete" onClick={onDelete} />
      )}
    </div>
  );

  return (
    <Card
      title={klip.title}
      subtitle={klip.description}
      headerAction={headerAction}
      className="h-full flex flex-col"
    >
      <div className="flex-1 min-h-0">
        {hasData ? (
          <div className="h-full min-h-[120px]">
            <KlipChart
              type={klip.type}
              data={klip.cached_data!}
              config={klip.config}
            />
          </div>
        ) : (
          <EmptyState
            icon="bar_chart"
            title="No data yet"
            description="Connect a data source or run a query to populate this klip."
          />
        )}
      </div>
    </Card>
  );
}
