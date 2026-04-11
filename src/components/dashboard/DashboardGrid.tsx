"use client";

import { useMemo } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  type Layout,
  type ResponsiveLayouts,
} from "react-grid-layout";
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
  type: string;
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
  onLayoutChange?: (layouts: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  editable?: boolean;
}

export default function DashboardGrid({
  items,
  onLayoutChange,
  editable = false,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layouts = useMemo<ResponsiveLayouts>(() => {
    const lg: Layout = items.map((item) => ({
      i: item.id,
      x: item.layout.x,
      y: item.layout.y,
      w: item.layout.w,
      h: item.layout.h,
      minW: 2,
      minH: 2,
    }));
    return { lg, md: lg, sm: lg, xs: lg };
  }, [items]);

  const handleLayoutChange = (currentLayout: Layout) => {
    if (!onLayoutChange) return;
    const mapped = currentLayout.map((item) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
    onLayoutChange(mapped);
  };

  if (!mounted || width === 0) {
    return <div ref={containerRef} className="min-h-[200px]" />;
  }

  return (
    <div ref={containerRef}>
      <ResponsiveGridLayout
        className="dashboard-grid"
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
        cols={{ lg: 12, md: 9, sm: 6, xs: 3 }}
        rowHeight={80}
        dragConfig={{ enabled: editable, handle: ".drag-handle" }}
        resizeConfig={{ enabled: editable, handles: ["se"] }}
        containerPadding={[0, 0]}
        margin={[16, 16]}
        onLayoutChange={handleLayoutChange}
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
    </div>
  );
}
