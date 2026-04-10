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
} from "recharts";

interface KlipChartConfig {
  x_field?: string;
  y_field?: string;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  prefix?: string;
  suffix?: string;
  columns?: { key: string; label: string }[];
}

interface KlipChartProps {
  type: "bar" | "line" | "pie" | "area" | "number" | "table";
  data: Record<string, unknown>[];
  config: KlipChartConfig;
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
];

function getColors(custom?: string[]) {
  return custom && custom.length > 0 ? custom : CHART_COLORS;
}

export default function KlipChart({ type, data, config }: KlipChartProps) {
  const {
    x_field = "name",
    y_field = "value",
    colors,
    show_legend = false,
    show_grid = true,
    prefix = "",
    suffix = "",
    columns,
  } = config;

  const palette = getColors(colors);

  if (type === "number") {
    const val = data?.[0]?.[y_field] ?? data?.[0]?.value ?? 0;
    return (
      <div className="flex items-center justify-center h-full min-h-[80px]">
        <span className="text-3xl font-bold text-hero-grey-black">
          {prefix}
          {typeof val === "number" ? val.toLocaleString() : String(val)}
          {suffix}
        </span>
      </div>
    );
  }

  if (type === "table") {
    const cols =
      columns && columns.length > 0
        ? columns
        : data.length > 0
          ? Object.keys(data[0]).map((k) => ({ key: k, label: k }))
          : [];

    return (
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-hero-grey-light">
              {cols.map((col) => (
                <th
                  key={col.key}
                  className="text-left py-2 px-2 font-medium text-hero-grey-regular"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-hero-grey-light/50 last:border-0"
              >
                {cols.map((col) => (
                  <td
                    key={col.key}
                    className="py-1.5 px-2 text-hero-grey-black"
                  >
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis
            dataKey={x_field}
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #D8D9DC",
            }}
          />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Bar dataKey={y_field} radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis
            dataKey={x_field}
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #D8D9DC",
            }}
          />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Line
            type="monotone"
            dataKey={y_field}
            stroke={palette[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: palette[0] }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          {show_grid && <CartesianGrid strokeDasharray="3 3" stroke="#E9F4F8" />}
          <XAxis
            dataKey={x_field}
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9496A1" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #D8D9DC",
            }}
          />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Area
            type="monotone"
            dataKey={y_field}
            stroke={palette[0]}
            fill={palette[0]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #D8D9DC",
            }}
          />
          {show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Pie
            data={data}
            dataKey={y_field}
            nameKey={x_field}
            cx="50%"
            cy="50%"
            outerRadius="80%"
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

  return null;
}
