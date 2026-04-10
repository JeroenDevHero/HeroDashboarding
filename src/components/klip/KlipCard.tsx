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
  sample_data?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface Klip {
  id: string;
  name: string;
  type: "bar_chart" | "line_chart" | "pie_chart" | "area_chart" | "number" | "table";
  description?: string;
  config: KlipConfig;
}

interface KlipCardProps {
  klip: Klip;
  onEdit?: () => void;
  onDelete?: () => void;
}

const typeBadgeVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  bar_chart: "info",
  line_chart: "info",
  pie_chart: "success",
  area_chart: "info",
  number: "warning",
  table: "success",
};

/** Map DB enum type to chart render type */
const chartTypeMap: Record<string, "bar" | "line" | "pie" | "area" | "number" | "table"> = {
  bar_chart: "bar",
  line_chart: "line",
  pie_chart: "pie",
  area_chart: "area",
  number: "number",
  table: "table",
};

export default function KlipCard({ klip, onEdit, onDelete }: KlipCardProps) {
  const renderType = chartTypeMap[klip.type] ?? "bar";
  const sampleData = klip.config?.sample_data;
  const hasData = sampleData && sampleData.length > 0;

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
      title={klip.name}
      subtitle={klip.description}
      headerAction={headerAction}
      className="h-full flex flex-col"
    >
      <div className="flex-1">
        {hasData ? (
          <div style={{ width: "100%", height: 200 }}>
            <KlipChart
              type={renderType}
              data={sampleData}
              config={{
                x_field: klip.config.x_field,
                y_field: klip.config.y_field,
                colors: klip.config.colors,
                show_legend: klip.config.show_legend ?? false,
                show_grid: klip.config.show_grid ?? true,
                prefix: klip.config.prefix,
                suffix: klip.config.suffix,
                columns: klip.config.columns,
              }}
            />
          </div>
        ) : (
          <EmptyState
            icon="bar_chart"
            title="Geen data"
            description="Koppel een databron om deze klip te vullen."
          />
        )}
      </div>
    </Card>
  );
}
