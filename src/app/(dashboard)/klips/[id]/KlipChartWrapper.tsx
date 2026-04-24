"use client";

import KlipChart from "@/components/klip/KlipChart";
import type { KlipChartConfig } from "@/components/klip/KlipChart";

interface KlipChartWrapperProps {
  type: string;
  data: Record<string, unknown>[];
  config: KlipChartConfig;
}

export default function KlipChartWrapper({ type, data, config }: KlipChartWrapperProps) {
  // Composite klips (with extra components) grow vertically so the totals row
  // below the main chart remains readable. Simple single-chart klips keep a
  // fixed height for a tidy layout.
  const components = config.components ?? [];
  const hasComponents = components.length > 0;

  // Calculate how many "rows" the components occupy in the 2-col grid.
  const rowUnits = components.reduce(
    (acc, c) => acc + (c.span === "half" ? 0.5 : 1),
    0
  );
  const componentRows = Math.ceil(rowUnits);

  // Base height for the main chart; add a per-row height for components.
  const height = hasComponents ? 320 + componentRows * 130 + 16 : 320;

  return (
    <div style={{ width: "100%", height }}>
      <KlipChart type={type} data={data} config={config} />
    </div>
  );
}
