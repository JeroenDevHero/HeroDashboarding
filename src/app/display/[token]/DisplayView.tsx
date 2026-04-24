'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardGrid from '@/components/dashboard/DashboardGrid';

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

interface DashboardKlip {
  id: string;
  klip_id: string;
  dashboard_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  klip: Klip;
}

interface DisplayDashboard {
  id: string;
  name: string;
  description?: string | null;
  is_default?: boolean | null;
  theme?: string | null;
  auto_refresh_seconds?: number | null;
  dashboard_klips: DashboardKlip[];
}

interface DisplayViewProps {
  dashboard: DisplayDashboard;
}

export default function DisplayView({ dashboard }: DisplayViewProps) {
  const router = useRouter();
  const refreshSeconds = dashboard.auto_refresh_seconds ?? 300;

  // Auto-refresh the server-rendered data on an interval so screens stay
  // up-to-date without a page reload.
  useEffect(() => {
    if (!refreshSeconds || refreshSeconds <= 0) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [refreshSeconds, router]);

  const gridItems = dashboard.dashboard_klips.map((dk) => ({
    id: dk.klip_id,
    klip: dk.klip,
    layout: {
      x: dk.position_x,
      y: dk.position_y,
      w: dk.width,
      h: dk.height,
    },
  }));

  const isDark = dashboard.theme === 'dark';

  return (
    <div
      className={`min-h-screen w-screen overflow-auto p-6 ${
        isDark ? 'bg-hero-grey-black text-white' : 'bg-hero-blue-hairline'
      }`}
    >
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-6 flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <h1
              className={`truncate text-2xl font-semibold ${
                isDark ? 'text-white' : 'text-hero-grey-black'
              }`}
            >
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p
                className={`mt-1 truncate text-sm ${
                  isDark ? 'text-white/60' : 'text-hero-grey-regular'
                }`}
              >
                {dashboard.description}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 text-xs tabular-nums ${
              isDark ? 'text-white/50' : 'text-hero-grey-regular'
            }`}
          >
            {new Date().toLocaleString('nl-NL', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </header>

        {gridItems.length === 0 ? (
          <div
            className={`flex min-h-[40vh] items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed p-10 text-center ${
              isDark
                ? 'border-white/20 text-white/50'
                : 'border-hero-grey-light text-hero-grey-regular'
            }`}
          >
            Dit dashboard heeft nog geen klips.
          </div>
        ) : (
          <DashboardGrid items={gridItems} editable={false} />
        )}
      </div>
    </div>
  );
}
