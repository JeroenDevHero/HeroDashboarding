"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Treemap,
  FunnelChart,
  Funnel,
  LabelList,
  ComposedChart,
} from "recharts";

// ---------------------------------------------------------------------------
// Config interface — supports all 27 klip types
// ---------------------------------------------------------------------------

export interface KlipChartConfig {
  // Core fields (bar, line, area, pie, scatter)
  x_field?: string;
  y_field?: string;
  y_fields?: string[];
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  prefix?: string;
  suffix?: string;
  columns?: { key: string; label: string }[];

  // Multi-series & grouping
  stacked?: boolean;
  horizontal?: boolean;
  group_by?: string;
  smooth?: boolean;

  // Pie / donut
  donut?: boolean;
  inner_radius?: number;

  // Combo chart
  bar_field?: string;
  line_field?: string;
  dual_axis?: boolean;

  // KPI / gauge / progress / bullet
  value?: number;
  min?: number;
  max?: number;
  target?: number;
  thresholds?: number[];
  comparison_value?: number;
  comparison_label?: string;
  trend_data?: number[];

  // Scatter
  size_field?: string;

  // Radar
  dimension_field?: string;

  // Funnel
  stage_field?: string;

  // Timeline
  date_field?: string;
  title_field?: string;
  description_field?: string;

  // Status board
  status_field?: string;

  // Slope chart
  before_field?: string;
  after_field?: string;

  // Small multiples
  chart_type?: string;

  // Text widget
  content?: string;

  // Iframe
  url?: string;

  // Catch-all for future extensions
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Supported types
// ---------------------------------------------------------------------------

type KlipType =
  | "kpi_tile" | "bar_chart" | "line_chart" | "area_chart" | "pie_chart"
  | "gauge" | "table" | "sparkline" | "scatter_chart" | "funnel" | "map"
  | "number_comparison" | "progress_bar" | "heatmap" | "combo_chart"
  | "text_widget" | "iframe" | "radar_chart" | "treemap" | "waterfall_chart"
  | "sankey" | "bullet_chart" | "box_plot" | "slope_chart" | "small_multiples"
  | "metric_card" | "status_board" | "timeline";

/** Backward-compat aliases (old render-type names) */
const typeAliases: Record<string, KlipType> = {
  bar: "bar_chart",
  line: "line_chart",
  pie: "pie_chart",
  area: "area_chart",
  number: "kpi_tile",
};

interface KlipChartProps {
  type: string;
  data: Record<string, unknown>[];
  config: KlipChartConfig;
}

// ---------------------------------------------------------------------------
// Palette & formatting helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

const FIXED_COLORS = [
  "#073889", "#F46015", "#10B981", "#8B5CF6", "#EC4899", "#F59E0B",
  "#06B6D4", "#EF4444", "#6366F1", "#14B8A6",
];

function getColors(custom?: string[]) {
  return custom && custom.length > 0 ? custom : CHART_COLORS;
}

function getFixedColors(custom?: string[]) {
  return custom && custom.length > 0 ? custom : FIXED_COLORS;
}

function formatNumber(val: unknown): string {
  if (typeof val === "number") {
    return val.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  }
  if (typeof val === "string" && !isNaN(Number(val)) && val.trim() !== "") {
    return Number(val).toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  }
  return String(val ?? "");
}

function formatLabel(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "number") return formatNumber(val);
  return String(val);
}

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return Number(val) || 0;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tooltipFormatter = (value: any, name: any) => [
  formatNumber(value),
  formatLabel(String(name ?? "")),
];

const yAxisFormatter = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString("nl-NL", { notation: "compact" as const, maximumFractionDigits: 1 })
    : String(value);

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #D8D9DC",
};

// ---------------------------------------------------------------------------
// Helper: resolve all y-fields from config
// ---------------------------------------------------------------------------

function getYFields(config: KlipChartConfig): string[] {
  if (config.y_fields && config.y_fields.length > 0) return config.y_fields;
  if (config.y_field) return [config.y_field];
  return ["value"];
}

// ---------------------------------------------------------------------------
// Shared Cartesian axis props
// ---------------------------------------------------------------------------

function cartesianAxes(xField: string, config: KlipChartConfig, horizontal?: boolean) {
  const xProps = {
    dataKey: horizontal ? undefined : xField,
    tick: { fontSize: 11, fill: "#9496A1" } as const,
    axisLine: false,
    tickLine: false,
  };
  const yProps = {
    dataKey: horizontal ? xField : undefined,
    tick: { fontSize: 11, fill: "#9496A1" } as const,
    axisLine: false,
    tickLine: false,
    tickFormatter: horizontal ? undefined : yAxisFormatter,
  };
  return { xProps, yProps, showGrid: config.show_grid !== false };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function KlipChart({ type: rawType, data, config }: KlipChartProps) {
  const type: string = typeAliases[rawType] ?? rawType;
  const {
    x_field = "name",
    prefix = "",
    suffix = "",
    show_legend = false,
    columns,
  } = config;
  const palette = getColors(config.colors);
  const fixedPalette = getFixedColors(config.colors);
  const yFields = getYFields(config);

  // ========== KPI TILE ==========
  if (type === "kpi_tile") {
    const val = config.value ?? toNum(data?.[0]?.[yFields[0]] ?? data?.[0]?.value ?? 0);
    const comp = config.comparison_value;
    const compLabel = config.comparison_label ?? "vorige periode";
    let trend: "up" | "down" | "neutral" = "neutral";
    let pct = 0;
    if (comp != null && comp !== 0) {
      pct = ((val - comp) / Math.abs(comp)) * 100;
      trend = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
    }
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[80px] gap-1">
        <span className="text-3xl font-bold text-hero-grey-black">
          {prefix}{formatNumber(val)}{suffix}
        </span>
        {comp != null && (
          <div className={`flex items-center gap-1 text-xs ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-hero-grey-regular"}`}>
            <span className="material-symbols-rounded text-[16px]">
              {trend === "up" ? "trending_up" : trend === "down" ? "trending_down" : "trending_flat"}
            </span>
            <span>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}% vs {compLabel}</span>
          </div>
        )}
      </div>
    );
  }

  // ========== NUMBER COMPARISON ==========
  if (type === "number_comparison") {
    const items = data.length >= 2
      ? data.slice(0, 2)
      : [data[0] || {}, { [yFields[0]]: config.comparison_value ?? 0 }];
    const v1 = toNum(items[0]?.[yFields[0]] ?? items[0]?.value);
    const v2 = toNum(items[1]?.[yFields[0]] ?? items[1]?.value);
    const diff = v2 !== 0 ? ((v1 - v2) / Math.abs(v2)) * 100 : 0;
    const label1 = String(items[0]?.[x_field] ?? "Huidig");
    const label2 = String(items[1]?.[x_field] ?? "Vorig");
    return (
      <div className="flex items-center justify-center h-full gap-8 min-h-[80px]">
        <div className="text-center">
          <div className="text-2xl font-bold text-hero-grey-black">{prefix}{formatNumber(v1)}{suffix}</div>
          <div className="text-xs text-hero-grey-regular mt-1">{label1}</div>
        </div>
        <div className={`text-center px-3 py-1 rounded-full text-sm font-medium ${diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
          {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-hero-grey-regular">{prefix}{formatNumber(v2)}{suffix}</div>
          <div className="text-xs text-hero-grey-regular mt-1">{label2}</div>
        </div>
      </div>
    );
  }

  // ========== METRIC CARD ==========
  if (type === "metric_card") {
    const val = config.value ?? toNum(data?.[0]?.[yFields[0]] ?? data?.[0]?.value ?? 0);
    const comp = config.comparison_value;
    const compLabel = config.comparison_label ?? "vorige periode";
    const trendData = config.trend_data ?? data.map((d) => toNum(d[yFields[0]] ?? d.value));
    let trend: "up" | "down" | "neutral" = "neutral";
    let pct = 0;
    if (comp != null && comp !== 0) {
      pct = ((val - comp) / Math.abs(comp)) * 100;
      trend = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
    }
    const sparkData = trendData.map((v, i) => ({ i, v }));
    return (
      <div className="flex flex-col h-full min-h-[80px] p-2">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-2xl font-bold text-hero-grey-black">
              {prefix}{formatNumber(val)}{suffix}
            </span>
            {comp != null && (
              <div className={`flex items-center gap-1 text-xs mt-0.5 ${trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-hero-grey-regular"}`}>
                <span className="material-symbols-rounded text-[14px]">
                  {trend === "up" ? "trending_up" : trend === "down" ? "trending_down" : "trending_flat"}
                </span>
                {pct >= 0 ? "+" : ""}{pct.toFixed(1)}% vs {compLabel}
              </div>
            )}
          </div>
        </div>
        {sparkData.length > 1 && (
          <div className="flex-1 mt-2" style={{ minHeight: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="v" stroke={palette[0]} fill={palette[0]} fillOpacity={0.1} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  // ========== GAUGE ==========
  if (type === "gauge") {
    const val = config.value ?? toNum(data?.[0]?.[yFields[0]] ?? data?.[0]?.value ?? 0);
    const min = config.min ?? 0;
    const max = config.max ?? 100;
    const target = config.target;
    const pct = Math.max(0, Math.min(1, (val - min) / (max - min || 1)));
    const angle = -90 + pct * 180;
    const thresholds = config.thresholds ?? [max * 0.33, max * 0.66];
    const getColor = () => {
      if (val <= thresholds[0]) return "#EF4444";
      if (val <= (thresholds[1] ?? max)) return "#F59E0B";
      return "#10B981";
    };
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[80px]">
        <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
          {/* Background arc */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round" />
          {/* Value arc */}
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={getColor()} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${pct * 251.3} 251.3`} />
          {/* Needle */}
          <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
            stroke="#374151" strokeWidth="2" strokeLinecap="round" />
          <circle cx="100" cy="100" r="4" fill="#374151" />
          {/* Target marker */}
          {target != null && (() => {
            const tPct = Math.max(0, Math.min(1, (target - min) / (max - min || 1)));
            const tAngle = -90 + tPct * 180;
            const tx = 100 + 70 * Math.cos((tAngle * Math.PI) / 180);
            const ty = 100 + 70 * Math.sin((tAngle * Math.PI) / 180);
            return <line x1={tx} y1={ty} x2={100 + 50 * Math.cos((tAngle * Math.PI) / 180)} y2={100 + 50 * Math.sin((tAngle * Math.PI) / 180)} stroke="#6B7280" strokeWidth="2" strokeDasharray="3 2" />;
          })()}
          {/* Min / Max labels */}
          <text x="20" y="115" textAnchor="middle" fontSize="10" fill="#9CA3AF">{formatNumber(min)}</text>
          <text x="180" y="115" textAnchor="middle" fontSize="10" fill="#9CA3AF">{formatNumber(max)}</text>
        </svg>
        <span className="text-xl font-bold text-hero-grey-black -mt-1">
          {prefix}{formatNumber(val)}{suffix}
        </span>
      </div>
    );
  }

  // ========== PROGRESS BAR ==========
  if (type === "progress_bar") {
    const val = config.value ?? toNum(data?.[0]?.[yFields[0]] ?? data?.[0]?.value ?? 0);
    const max = config.max ?? 100;
    const target = config.target;
    const pct = Math.max(0, Math.min(100, (val / (max || 1)) * 100));
    const thresholds = config.thresholds ?? [33, 66];
    const getColor = () => {
      if (pct <= thresholds[0]) return "bg-red-500";
      if (pct <= (thresholds[1] ?? 66)) return "bg-yellow-500";
      return "bg-emerald-500";
    };
    return (
      <div className="flex flex-col justify-center h-full min-h-[60px] px-2 gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold text-hero-grey-black">{prefix}{formatNumber(val)}{suffix}</span>
          <span className="text-xs text-hero-grey-regular">van {formatNumber(max)}</span>
        </div>
        <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`absolute top-0 left-0 h-full rounded-full transition-all ${getColor()}`} style={{ width: `${pct}%` }} />
          {target != null && (
            <div className="absolute top-0 h-full w-0.5 bg-gray-600" style={{ left: `${Math.min(100, (target / (max || 1)) * 100)}%` }} />
          )}
        </div>
      </div>
    );
  }

  // ========== BULLET CHART ==========
  if (type === "bullet_chart") {
    const val = config.value ?? toNum(data?.[0]?.[yFields[0]] ?? data?.[0]?.value ?? 0);
    const max = config.max ?? 100;
    const target = config.target ?? max * 0.8;
    const thresholds = config.thresholds ?? [max * 0.33, max * 0.66, max];
    const pct = (v: number) => Math.min(100, (v / (max || 1)) * 100);
    return (
      <div className="flex flex-col justify-center h-full min-h-[60px] px-2 gap-1">
        <div className="relative w-full h-8 bg-gray-50 rounded overflow-hidden">
          {/* Range bands */}
          <div className="absolute top-0 left-0 h-full bg-gray-200" style={{ width: `${pct(thresholds[2] ?? max)}%` }} />
          <div className="absolute top-0 left-0 h-full bg-gray-300" style={{ width: `${pct(thresholds[1] ?? max * 0.66)}%` }} />
          <div className="absolute top-0 left-0 h-full bg-gray-400" style={{ width: `${pct(thresholds[0] ?? max * 0.33)}%` }} />
          {/* Value bar */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 h-3 bg-hero-blue rounded" style={{ width: `${pct(val)}%` }} />
          {/* Target line */}
          <div className="absolute top-0 h-full w-0.5 bg-red-500" style={{ left: `${pct(target)}%` }} />
        </div>
        <div className="flex justify-between text-xs text-hero-grey-regular">
          <span>{prefix}{formatNumber(val)}{suffix}</span>
          <span>Doel: {formatNumber(target)}</span>
        </div>
      </div>
    );
  }

  // ========== SPARKLINE ==========
  if (type === "sparkline") {
    const sparkData = data.length > 0 ? data : (config.trend_data ?? []).map((v, i) => ({ i, value: v }));
    const field = yFields[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Area type="monotone" dataKey={field} stroke={palette[0]} fill={palette[0]} fillOpacity={0.1} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ========== TABLE ==========
  if (type === "table") {
    const cols =
      columns && columns.length > 0
        ? columns
        : data.length > 0
          ? Object.keys(data[0]).map((k) => ({ key: k, label: formatLabel(k) }))
          : [];
    return (
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-hero-grey-light">
              {cols.map((col) => (
                <th key={col.key} className="text-left py-2 px-2 font-medium text-hero-grey-regular">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-hero-grey-light/50 last:border-0">
                {cols.map((col) => (
                  <td key={col.key} className="py-1.5 px-2 text-hero-grey-black">
                    {formatCell(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ========== BAR CHART (multi-series + stacked + horizontal) ==========
  if (type === "bar_chart") {
    const { xProps, yProps, showGrid } = cartesianAxes(x_field, config, config.horizontal);
    const ChartComp = config.horizontal ? BarChart : BarChart;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ChartComp data={data} layout={config.horizontal ? "vertical" : "horizontal"}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          {config.horizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
              <YAxis {...yProps} type="category" width={80} />
            </>
          ) : (
            <>
              <XAxis {...xProps} />
              <YAxis {...yProps} tickFormatter={yAxisFormatter} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} labelFormatter={(l) => String(l)} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          {yFields.map((field, idx) => (
            <Bar
              key={field}
              dataKey={field}
              name={formatLabel(field)}
              fill={fixedPalette[idx % fixedPalette.length]}
              radius={[4, 4, 0, 0] as [number, number, number, number]}
              stackId={config.stacked ? "stack" : undefined}
            >
              {yFields.length === 1 && data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Bar>
          ))}
        </ChartComp>
      </ResponsiveContainer>
    );
  }

  // ========== LINE CHART (multi-series + smooth) ==========
  if (type === "line_chart") {
    const { xProps, yProps, showGrid } = cartesianAxes(x_field, config);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis {...xProps} />
          <YAxis {...yProps} tickFormatter={yAxisFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} labelFormatter={(l) => String(l)} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          {yFields.map((field, idx) => (
            <Line
              key={field}
              type={config.smooth ? "monotone" : "monotone"}
              dataKey={field}
              name={formatLabel(field)}
              stroke={fixedPalette[idx % fixedPalette.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: fixedPalette[idx % fixedPalette.length] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // ========== AREA CHART (multi-series + stacked) ==========
  if (type === "area_chart") {
    const { xProps, yProps, showGrid } = cartesianAxes(x_field, config);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis {...xProps} />
          <YAxis {...yProps} tickFormatter={yAxisFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} labelFormatter={(l) => String(l)} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          {yFields.map((field, idx) => (
            <Area
              key={field}
              type="monotone"
              dataKey={field}
              name={formatLabel(field)}
              stroke={fixedPalette[idx % fixedPalette.length]}
              fill={fixedPalette[idx % fixedPalette.length]}
              fillOpacity={0.15}
              strokeWidth={2}
              stackId={config.stacked ? "stack" : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // ========== PIE CHART (+ donut) ==========
  if (type === "pie_chart") {
    const innerRadius = config.donut ? (config.inner_radius ?? 60) : 0;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          <Pie
            data={data}
            dataKey={yFields[0]}
            nameKey={x_field}
            cx="50%"
            cy="50%"
            outerRadius="80%"
            innerRadius={config.donut ? `${innerRadius}%` : undefined}
            strokeWidth={1}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ========== SCATTER CHART ==========
  if (type === "scatter_chart") {
    const yField = yFields[0];
    const sizeField = config.size_field;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          {config.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis dataKey={x_field} name={formatLabel(x_field)} tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} type="number" />
          <YAxis dataKey={yField} name={formatLabel(yField)} tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Scatter data={data} fill={palette[0]}>
            {sizeField && data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // ========== RADAR CHART ==========
  if (type === "radar_chart") {
    const dimField = config.dimension_field ?? x_field;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#E9F4F8" />
          <PolarAngleAxis dataKey={dimField} tick={{ fontSize: 10, fill: "#9496A1" }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: "#9496A1" }} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          {yFields.map((field, idx) => (
            <Radar
              key={field}
              name={formatLabel(field)}
              dataKey={field}
              stroke={fixedPalette[idx % fixedPalette.length]}
              fill={fixedPalette[idx % fixedPalette.length]}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // ========== COMBO CHART (bar + line) ==========
  if (type === "combo_chart") {
    const barField = config.bar_field ?? yFields[0];
    const lineField = config.line_field ?? (yFields[1] ?? yFields[0]);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          {config.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis dataKey={x_field} tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
          {config.dual_axis && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
          )}
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} labelFormatter={(l) => String(l)} />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} formatter={formatLabel} />}
          <Bar dataKey={barField} name={formatLabel(barField)} fill={fixedPalette[0]} radius={[4, 4, 0, 0]} yAxisId="left" />
          <Line
            type="monotone"
            dataKey={lineField}
            name={formatLabel(lineField)}
            stroke={fixedPalette[1]}
            strokeWidth={2}
            dot={{ r: 3 }}
            yAxisId={config.dual_axis ? "right" : "left"}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // ========== FUNNEL ==========
  if (type === "funnel") {
    const stageField = config.stage_field ?? x_field;
    const valueField = yFields[0];
    const funnelData = data.map((d, i) => ({
      name: String(d[stageField] ?? d.name ?? `Stage ${i + 1}`),
      value: toNum(d[valueField] ?? d.value),
      fill: palette[i % palette.length],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
          <Funnel dataKey="value" data={funnelData} isAnimationActive>
            <LabelList position="right" fill="#374151" fontSize={11} dataKey="name" />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  // ========== TREEMAP ==========
  if (type === "treemap") {
    const treeData = data.map((d, i) => ({
      name: String(d[x_field] ?? d.name ?? `Item ${i + 1}`),
      size: toNum(d[yFields[0]] ?? d.value),
      fill: fixedPalette[i % fixedPalette.length],
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={treeData}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke="#fff"
          content={({ x, y, width: w, height: h, name, fill }: { x: number; y: number; width: number; height: number; name?: string; fill?: string }) => (
            <g>
              <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
              {w > 40 && h > 20 && (
                <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#fff" fontWeight={500}>
                  {name}
                </text>
              )}
            </g>
          )}
        />
      </ResponsiveContainer>
    );
  }

  // ========== WATERFALL CHART ==========
  if (type === "waterfall_chart") {
    let runningTotal = 0;
    const waterfallData = data.map((d, i) => {
      const val = toNum(d[yFields[0]] ?? d.value);
      const start = runningTotal;
      runningTotal += val;
      return {
        name: String(d[x_field] ?? `Item ${i + 1}`),
        value: val,
        start,
        end: runningTotal,
        fill: i === data.length - 1 ? fixedPalette[2] : val >= 0 ? fixedPalette[0] : fixedPalette[7],
      };
    });
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={waterfallData}>
          {config.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9496A1" }} axisLine={false} tickLine={false} tickFormatter={yAxisFormatter} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [formatNumber(v), "Waarde"]} />
          {/* Invisible base */}
          <Bar dataKey="start" stackId="waterfall" fill="transparent" />
          {/* Visible bar */}
          <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
            {waterfallData.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ========== HEATMAP ==========
  if (type === "heatmap") {
    const allValues = data.flatMap((d) =>
      Object.entries(d).filter(([k]) => k !== x_field).map(([, v]) => toNum(v))
    );
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const range = maxVal - minVal || 1;
    const colKeys = data.length > 0 ? Object.keys(data[0]).filter((k) => k !== x_field) : [];
    const getOpacity = (v: number) => 0.15 + 0.85 * ((v - minVal) / range);
    return (
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left py-1 px-2 text-hero-grey-regular font-medium">{formatLabel(x_field)}</th>
              {colKeys.map((k) => (
                <th key={k} className="text-center py-1 px-2 text-hero-grey-regular font-medium">{formatLabel(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <td className="py-1 px-2 text-hero-grey-black font-medium">{String(row[x_field] ?? "")}</td>
                {colKeys.map((k) => {
                  const v = toNum(row[k]);
                  return (
                    <td key={k} className="text-center py-1 px-2 rounded" style={{ backgroundColor: `rgba(7, 56, 137, ${getOpacity(v)})`, color: getOpacity(v) > 0.5 ? "#fff" : "#374151" }}>
                      {formatNumber(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ========== STATUS BOARD ==========
  if (type === "status_board") {
    const statusField = config.status_field ?? "status";
    const nameField = x_field;
    const statusColors: Record<string, string> = {
      ok: "bg-emerald-500", good: "bg-emerald-500", green: "bg-emerald-500", actief: "bg-emerald-500", online: "bg-emerald-500",
      warning: "bg-yellow-500", yellow: "bg-yellow-500", waarschuwing: "bg-yellow-500",
      error: "bg-red-500", red: "bg-red-500", fout: "bg-red-500", offline: "bg-red-500", critical: "bg-red-500",
    };
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1">
        {data.map((d, i) => {
          const status = String(d[statusField] ?? "unknown").toLowerCase();
          const dotColor = statusColors[status] ?? "bg-gray-400";
          return (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
              <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
              <span className="text-xs text-hero-grey-black truncate">{String(d[nameField] ?? `Item ${i + 1}`)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ========== TIMELINE ==========
  if (type === "timeline") {
    const dateField = config.date_field ?? "date";
    const titleField = config.title_field ?? x_field;
    const descField = config.description_field ?? "description";
    return (
      <div className="flex flex-col gap-0 pl-4 overflow-auto max-h-64">
        {data.map((d, i) => (
          <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Vertical line */}
            {i < data.length - 1 && <div className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-200" />}
            {/* Dot */}
            <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${fixedPalette[i % fixedPalette.length] === "#073889" ? "bg-hero-blue" : ""}`}
              style={{ backgroundColor: fixedPalette[i % fixedPalette.length] }} />
            <div>
              <div className="text-xs text-hero-grey-regular">{String(d[dateField] ?? "")}</div>
              <div className="text-sm font-medium text-hero-grey-black">{String(d[titleField] ?? "")}</div>
              {d[descField] != null && <div className="text-xs text-hero-grey-regular mt-0.5">{String(d[descField])}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ========== TEXT WIDGET ==========
  if (type === "text_widget") {
    const content = config.content ?? String(data?.[0]?.content ?? data?.[0]?.text ?? "");
    return (
      <div className="p-3 text-sm text-hero-grey-black prose prose-sm max-w-none whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  // ========== IFRAME ==========
  if (type === "iframe") {
    const url = config.url ?? String(data?.[0]?.url ?? "");
    if (!url) return <div className="flex items-center justify-center h-full text-sm text-hero-grey-regular">Geen URL opgegeven</div>;
    return (
      <iframe
        src={url}
        className="w-full h-full border-0 rounded"
        sandbox="allow-scripts allow-same-origin"
        title="Embedded content"
      />
    );
  }

  // ========== BOX PLOT ==========
  if (type === "box_plot") {
    const boxData = data.map((d) => ({
      name: String(d[x_field] ?? d.name ?? ""),
      min: toNum(d.min ?? d[yFields[0]]),
      q1: toNum(d.q1 ?? 0),
      median: toNum(d.median ?? 0),
      q3: toNum(d.q3 ?? 0),
      max: toNum(d.max ?? 0),
    }));
    const allVals = boxData.flatMap((b) => [b.min, b.max]);
    const yMin = Math.min(...allVals);
    const yMax = Math.max(...allVals);
    const yRange = yMax - yMin || 1;
    const toY = (v: number) => 180 - ((v - yMin) / yRange) * 160;
    const boxWidth = Math.min(40, Math.max(20, 200 / boxData.length));
    return (
      <div className="flex items-end justify-center h-full p-2">
        <svg viewBox={`0 0 ${boxData.length * (boxWidth + 20) + 20} 200`} className="w-full max-h-full">
          {boxData.map((b, i) => {
            const cx = 20 + i * (boxWidth + 20) + boxWidth / 2;
            const color = fixedPalette[i % fixedPalette.length];
            return (
              <g key={i}>
                {/* Whisker line */}
                <line x1={cx} y1={toY(b.min)} x2={cx} y2={toY(b.max)} stroke={color} strokeWidth={1} />
                {/* Min/max caps */}
                <line x1={cx - boxWidth / 4} y1={toY(b.min)} x2={cx + boxWidth / 4} y2={toY(b.min)} stroke={color} strokeWidth={1.5} />
                <line x1={cx - boxWidth / 4} y1={toY(b.max)} x2={cx + boxWidth / 4} y2={toY(b.max)} stroke={color} strokeWidth={1.5} />
                {/* Box */}
                <rect x={cx - boxWidth / 2} y={toY(b.q3)} width={boxWidth} height={toY(b.q1) - toY(b.q3)} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.5} rx={2} />
                {/* Median */}
                <line x1={cx - boxWidth / 2} y1={toY(b.median)} x2={cx + boxWidth / 2} y2={toY(b.median)} stroke={color} strokeWidth={2} />
                {/* Label */}
                <text x={cx} y={195} textAnchor="middle" fontSize={10} fill="#9496A1">{b.name}</text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // ========== SLOPE CHART ==========
  if (type === "slope_chart") {
    const beforeField = config.before_field ?? yFields[0] ?? "before";
    const afterField = config.after_field ?? (yFields[1] ?? "after");
    const allVals = data.flatMap((d) => [toNum(d[beforeField]), toNum(d[afterField])]);
    const yMin = Math.min(...allVals);
    const yMax = Math.max(...allVals);
    const yRange = yMax - yMin || 1;
    const toY = (v: number) => 20 + (1 - (v - yMin) / yRange) * 160;
    return (
      <div className="flex items-center justify-center h-full p-4">
        <svg viewBox="0 0 300 200" className="w-full max-h-full">
          {/* Column labels */}
          <text x={40} y={15} textAnchor="middle" fontSize={11} fill="#9496A1" fontWeight={500}>{formatLabel(beforeField)}</text>
          <text x={260} y={15} textAnchor="middle" fontSize={11} fill="#9496A1" fontWeight={500}>{formatLabel(afterField)}</text>
          {data.map((d, i) => {
            const bv = toNum(d[beforeField]);
            const av = toNum(d[afterField]);
            const color = fixedPalette[i % fixedPalette.length];
            return (
              <g key={i}>
                <line x1={50} y1={toY(bv)} x2={250} y2={toY(av)} stroke={color} strokeWidth={2} />
                <circle cx={50} cy={toY(bv)} r={4} fill={color} />
                <circle cx={250} cy={toY(av)} r={4} fill={color} />
                <text x={10} y={toY(bv) + 4} fontSize={10} fill="#374151">{formatNumber(bv)}</text>
                <text x={260} y={toY(av) + 4} fontSize={10} fill="#374151">{formatNumber(av)}</text>
                <text x={150} y={toY((bv + av) / 2) - 6} textAnchor="middle" fontSize={9} fill="#6B7280">
                  {String(d[x_field] ?? d.name ?? `Item ${i + 1}`)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // ========== SMALL MULTIPLES ==========
  if (type === "small_multiples") {
    const groupField = config.group_by ?? x_field;
    const subType = config.chart_type ?? "line_chart";
    const groups = [...new Set(data.map((d) => String(d[groupField] ?? "")))];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1 h-full overflow-auto">
        {groups.map((group, idx) => {
          const groupData = data.filter((d) => String(d[groupField]) === group);
          return (
            <div key={group} className="border border-gray-100 rounded-lg p-2">
              <div className="text-xs font-medium text-hero-grey-regular mb-1 truncate">{group}</div>
              <div style={{ height: 60 }}>
                <KlipChart
                  type={subType}
                  data={groupData}
                  config={{ ...config, show_legend: false, show_grid: false }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ========== SANKEY (simplified as flow table) ==========
  if (type === "sankey") {
    const sourceField = x_field;
    const targetField = config.stage_field ?? "target";
    const valueField = yFields[0];
    const maxVal = Math.max(...data.map((d) => toNum(d[valueField])));
    return (
      <div className="overflow-auto max-h-64 p-1">
        <div className="flex flex-col gap-1">
          {data.map((d, i) => {
            const val = toNum(d[valueField]);
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-right text-hero-grey-black truncate">{String(d[sourceField] ?? "")}</span>
                <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden relative">
                  <div className="absolute top-0 left-0 h-full rounded" style={{ width: `${pct}%`, backgroundColor: fixedPalette[i % fixedPalette.length], opacity: 0.7 }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">{formatNumber(val)}</span>
                </div>
                <span className="w-20 text-hero-grey-black truncate">{String(d[targetField] ?? "")}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== MAP (placeholder) ==========
  if (type === "map") {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-hero-grey-regular">
        <span className="material-symbols-rounded text-[32px] mb-2">map</span>
        <span className="text-sm">Kaartweergave - binnenkort beschikbaar</span>
      </div>
    );
  }

  // ========== FALLBACK ==========
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[80px] text-hero-grey-regular">
      <span className="material-symbols-rounded text-[24px] mb-1">help_outline</span>
      <span className="text-xs">Type &quot;{rawType}&quot; wordt niet herkend</span>
    </div>
  );
}
