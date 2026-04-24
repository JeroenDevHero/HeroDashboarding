"use client";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KlipChart from "./KlipChart";
import type { KlipChartConfig } from "./KlipChart";

interface KlipConfig extends KlipChartConfig {
  sample_data?: Record<string, unknown>[];
}

interface Klip {
  id: string;
  name: string;
  type: string;
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
  area_chart: "info",
  pie_chart: "success",
  scatter_chart: "info",
  radar_chart: "info",
  combo_chart: "info",
  sparkline: "info",
  funnel: "info",
  treemap: "info",
  waterfall_chart: "info",
  heatmap: "info",
  slope_chart: "info",
  small_multiples: "info",
  box_plot: "info",
  sankey: "info",
  table: "success",
  status_board: "success",
  kpi_tile: "warning",
  number_comparison: "warning",
  metric_card: "warning",
  gauge: "warning",
  progress_bar: "warning",
  bullet_chart: "warning",
  timeline: "success",
  text_widget: "success",
  iframe: "success",
  map: "info",
};

export default function KlipCard({ klip, onEdit, onDelete }: KlipCardProps) {
  const sampleData = klip.config?.sample_data;
  const hasData = sampleData && sampleData.length > 0;
  const hasComponents =
    Array.isArray(klip.config?.components) && klip.config.components.length > 0;

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
      <div className="flex-1 min-h-0">
        {hasData ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              minHeight: hasComponents ? 260 : 200,
            }}
          >
            <KlipChart
              type={klip.type}
              data={sampleData}
              config={klip.config}
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
