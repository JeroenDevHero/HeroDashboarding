"use client";

import KlipChart from "@/components/klip/KlipChart";
import type { KlipChartConfig } from "@/components/klip/KlipChart";

interface KlipChartWrapperProps {
  type: string;
  data: Record<string, unknown>[];
  config: KlipChartConfig;
}

export default function KlipChartWrapper({ type, data, config }: KlipChartWrapperProps) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <KlipChart type={type} data={data} config={config} />
    </div>
  );
}
