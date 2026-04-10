"use client";

import KlipChart from "@/components/klip/KlipChart";

interface KlipChartWrapperProps {
  type: string;
  data: Record<string, unknown>[];
  config: {
    x_field?: string;
    y_field?: string;
    colors?: string[];
    show_legend?: boolean;
    show_grid?: boolean;
    prefix?: string;
    suffix?: string;
    columns?: { key: string; label: string }[];
  };
}

export default function KlipChartWrapper({ type, data, config }: KlipChartWrapperProps) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <KlipChart
        type={type as Parameters<typeof KlipChart>[0]["type"]}
        data={data}
        config={config}
      />
    </div>
  );
}
