"use client";

import { useMemo } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
// CSS is loaded globally via globals.css (node_modules CSS imports are
// unreliable in Next.js App Router with Tailwind v4).
import KlipCard from "@/components/klip/KlipCard";

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

interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GridItem {
  id: string;
  klip: Klip;
  layout: LayoutItem;
}

interface DashboardGridProps {
  items: GridItem[];
  onLayoutChange?: (layout: Layout) => void;
  editable?: boolean;
}

export default function DashboardGrid({
  items,
  onLayoutChange,
  editable = false,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layouts = useMemo(() => {
    const lg = items.map((item) => ({
      i: item.id,
      x: item.layout.x,
      y: item.layout.y,
      w: item.layout.w,
      h: item.layout.h,
      minW: 2,
      minH: 2,
    }));
    return { lg };
  }, [items]);

  return (
    <div ref={containerRef}>
      {mounted && (
        <ResponsiveGridLayout
          className="dashboard-grid"
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
          cols={{ lg: 12, md: 9, sm: 6, xs: 3 }}
          rowHeight={80}
          dragConfig={{
            enabled: editable,
            handle: ".drag-handle",
          }}
          resizeConfig={{
            enabled: editable,
            handles: ["se"],
          }}
          containerPadding={[0, 0]}
          margin={[16, 16]}
          onLayoutChange={(layout) => onLayoutChange?.(layout)}
        >
          {items.map((item) => (
            <div key={item.id} className="relative h-full overflow-hidden">
              {editable && (
                <div className="drag-handle absolute top-0 left-0 right-0 h-6 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="material-symbols-rounded text-[16px] text-hero-grey-regular">
                    drag_indicator
                  </span>
                </div>
              )}
              <KlipCard klip={item.klip} />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
