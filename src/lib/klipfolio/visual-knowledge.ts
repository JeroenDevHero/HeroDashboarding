// ============================================================================
// Visual Knowledge Base — All visualization options for Hero Dashboards
// ============================================================================
// This file contains comprehensive knowledge about:
// 1. All Klipfolio visual types and their Hero equivalents
// 2. All additional visual types Hero supports beyond Klipfolio
// 3. Recommended libraries and implementation approaches
// 4. Best practices for each visualization type

export interface VisualTypeDefinition {
  id: string;
  name: string;
  nameNl: string;
  category: VisualCategory;
  description: string;
  bestFor: string[];
  implementation: ImplementationInfo;
  klipfolioEquivalent?: string[];
  heroConfig: HeroConfigHint;
}

export type VisualCategory =
  | "chart"
  | "kpi"
  | "table"
  | "map"
  | "comparison"
  | "distribution"
  | "flow"
  | "time"
  | "custom";

export interface ImplementationInfo {
  library: "recharts" | "nivo" | "visx" | "echarts" | "d3" | "custom";
  component?: string;
  complexity: "simple" | "moderate" | "complex";
  realtimeCapable: boolean;
}

export interface HeroConfigHint {
  dataFormat: string;
  requiredFields: string[];
  optionalFields: string[];
  exampleConfig: Record<string, unknown>;
}

// ============================================================================
// COMPLETE VISUAL TYPE REGISTRY
// ============================================================================

export const VISUAL_TYPES: VisualTypeDefinition[] = [
  // ---------- CHARTS: Basic ----------
  {
    id: "bar_chart",
    name: "Bar Chart",
    nameNl: "Staafdiagram",
    category: "chart",
    description: "Horizontal or vertical bars comparing values across categories",
    bestFor: ["Categorievergelijking", "Ranking", "Distributie over groepen"],
    implementation: {
      library: "recharts",
      component: "BarChart",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["bar-chart", "column-chart", "stacked-bar-chart", "grouped-bar"],
    heroConfig: {
      dataFormat: "array of { category, value } objects",
      requiredFields: ["category_field", "value_field"],
      optionalFields: ["group_field", "stacked", "horizontal", "colors"],
      exampleConfig: {
        type: "bar_chart",
        chart_options: { stacked: false, horizontal: false },
      },
    },
  },
  {
    id: "line_chart",
    name: "Line Chart",
    nameNl: "Lijndiagram",
    category: "time",
    description: "Lines showing trends over time or continuous data",
    bestFor: ["Trends over tijd", "Meerdere reeksen vergelijken", "Continudata"],
    implementation: {
      library: "recharts",
      component: "LineChart",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["line-chart", "multi-line"],
    heroConfig: {
      dataFormat: "array of { date, value, series? } objects",
      requiredFields: ["x_field", "y_field"],
      optionalFields: ["series_field", "smooth", "dots", "area_fill"],
      exampleConfig: {
        type: "line_chart",
        chart_options: { smooth: true, dots: false },
      },
    },
  },
  {
    id: "area_chart",
    name: "Area Chart",
    nameNl: "Vlakdiagram",
    category: "time",
    description: "Filled areas showing volume/magnitude over time",
    bestFor: ["Volume trends", "Gestapelde totalen", "Deel van geheel over tijd"],
    implementation: {
      library: "recharts",
      component: "AreaChart",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["area-chart", "stacked-area-chart"],
    heroConfig: {
      dataFormat: "array of { date, value, series? } objects",
      requiredFields: ["x_field", "y_field"],
      optionalFields: ["series_field", "stacked", "gradient", "opacity"],
      exampleConfig: {
        type: "area_chart",
        chart_options: { stacked: true, gradient: true },
      },
    },
  },
  {
    id: "pie_chart",
    name: "Pie / Donut Chart",
    nameNl: "Taart / Donut diagram",
    category: "distribution",
    description: "Circular chart showing proportions of a whole",
    bestFor: ["Verdeling tonen", "Marktaandeel", "Budgetverdeling"],
    implementation: {
      library: "recharts",
      component: "PieChart",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["pie-chart", "donut-chart"],
    heroConfig: {
      dataFormat: "array of { name, value } objects",
      requiredFields: ["name_field", "value_field"],
      optionalFields: ["donut", "inner_radius", "colors", "label_format"],
      exampleConfig: {
        type: "pie_chart",
        chart_options: { donut: true, inner_radius: 60 },
      },
    },
  },
  {
    id: "scatter_chart",
    name: "Scatter Plot",
    nameNl: "Spreidingsdiagram",
    category: "distribution",
    description: "Points plotting two variables to show correlation",
    bestFor: ["Correlatie analyseren", "Outlier detectie", "Cluster patronen"],
    implementation: {
      library: "recharts",
      component: "ScatterChart",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["scatter-chart", "bubble-chart"],
    heroConfig: {
      dataFormat: "array of { x, y, size?, color? } objects",
      requiredFields: ["x_field", "y_field"],
      optionalFields: ["size_field", "color_field", "bubble_mode"],
      exampleConfig: {
        type: "scatter_chart",
        chart_options: { bubble_mode: false },
      },
    },
  },
  {
    id: "combo_chart",
    name: "Combo Chart",
    nameNl: "Combinatiediagram",
    category: "chart",
    description: "Mixed bar and line chart for different metrics on same axis",
    bestFor: ["Twee metriek vergelijken", "Volume + trend", "Primair + secundair as"],
    implementation: {
      library: "recharts",
      component: "ComposedChart",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["combo-chart"],
    heroConfig: {
      dataFormat: "array of { category, value1, value2 } objects",
      requiredFields: ["x_field", "bar_field", "line_field"],
      optionalFields: ["dual_axis", "bar_colors", "line_colors"],
      exampleConfig: {
        type: "combo_chart",
        chart_options: { dual_axis: true },
      },
    },
  },

  // ---------- CHARTS: Advanced ----------
  {
    id: "funnel",
    name: "Funnel Chart",
    nameNl: "Trechterdiagram",
    category: "flow",
    description: "Funnel showing conversion/drop-off through stages",
    bestFor: ["Sales funnel", "Conversie analyse", "Proces drop-off"],
    implementation: {
      library: "recharts",
      component: "FunnelChart",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["funnel-chart"],
    heroConfig: {
      dataFormat: "array of { stage, value } objects ordered by stage",
      requiredFields: ["stage_field", "value_field"],
      optionalFields: ["colors", "show_percentages", "show_dropoff"],
      exampleConfig: {
        type: "funnel",
        chart_options: { show_percentages: true, show_dropoff: true },
      },
    },
  },
  {
    id: "gauge",
    name: "Gauge Chart",
    nameNl: "Meterdiagram",
    category: "kpi",
    description: "Circular gauge showing progress toward a target",
    bestFor: ["Voortgang naar doel", "Score indicator", "Bereik tonen"],
    implementation: {
      library: "recharts",
      component: "RadialBarChart",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["gauge"],
    heroConfig: {
      dataFormat: "single value with min/max/target",
      requiredFields: ["value"],
      optionalFields: ["min", "max", "target", "thresholds", "colors"],
      exampleConfig: {
        type: "gauge",
        chart_options: { min: 0, max: 100, thresholds: [30, 70] },
      },
    },
  },
  {
    id: "heatmap",
    name: "Heatmap",
    nameNl: "Heatmap",
    category: "distribution",
    description: "Color-coded matrix showing value intensity across two dimensions",
    bestFor: ["Patronen in 2D data", "Tijdspatronen (uur x dag)", "Correlatiematrix"],
    implementation: {
      library: "nivo",
      component: "HeatMap",
      complexity: "moderate",
      realtimeCapable: false,
    },
    klipfolioEquivalent: ["heatmap"],
    heroConfig: {
      dataFormat: "array of { x, y, value } objects",
      requiredFields: ["x_field", "y_field", "value_field"],
      optionalFields: ["color_scheme", "min_color", "max_color"],
      exampleConfig: {
        type: "heatmap",
        chart_options: { color_scheme: "blues" },
      },
    },
  },
  {
    id: "radar_chart",
    name: "Radar Chart",
    nameNl: "Radardiagram",
    category: "comparison",
    description: "Spider/radar chart for multi-dimensional comparison",
    bestFor: ["Multi-dimensionale vergelijking", "Performance profiel", "Skill assessment"],
    implementation: {
      library: "recharts",
      component: "RadarChart",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "array of { dimension, value, series? } objects",
      requiredFields: ["dimension_field", "value_field"],
      optionalFields: ["series_field", "fill", "grid_type"],
      exampleConfig: {
        type: "radar_chart",
        chart_options: { fill: true },
      },
    },
  },
  {
    id: "treemap",
    name: "Treemap",
    nameNl: "Treemap",
    category: "distribution",
    description: "Nested rectangles showing hierarchical data proportionally",
    bestFor: ["Hiarchische verdeling", "Budget breakdown", "Ruimteverdeling"],
    implementation: {
      library: "recharts",
      component: "Treemap",
      complexity: "moderate",
      realtimeCapable: false,
    },
    klipfolioEquivalent: ["treemap"],
    heroConfig: {
      dataFormat: "tree of { name, value, children? } objects",
      requiredFields: ["name_field", "value_field"],
      optionalFields: ["color_field", "depth", "label_format"],
      exampleConfig: {
        type: "treemap",
        chart_options: { depth: 2 },
      },
    },
  },
  {
    id: "waterfall_chart",
    name: "Waterfall Chart",
    nameNl: "Watervalgrafiek",
    category: "chart",
    description: "Shows cumulative effect of sequentially introduced positive/negative values",
    bestFor: ["Winst-verlies analyse", "Budget wijzigingen", "Cumulatief effect"],
    implementation: {
      library: "recharts",
      component: "BarChart",
      complexity: "complex",
      realtimeCapable: false,
    },
    klipfolioEquivalent: ["waterfall-chart"],
    heroConfig: {
      dataFormat: "array of { category, value, type: 'increase'|'decrease'|'total' }",
      requiredFields: ["category_field", "value_field"],
      optionalFields: ["type_field", "colors", "connector_lines"],
      exampleConfig: {
        type: "waterfall_chart",
        chart_options: { connector_lines: true },
      },
    },
  },

  // ---------- KPI / METRICS ----------
  {
    id: "kpi_tile",
    name: "KPI Tile",
    nameNl: "KPI Tegel",
    category: "kpi",
    description: "Single number display with optional comparison and trend",
    bestFor: ["Hoofdmetriek tonen", "Scorecard", "Quick stats"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["number-block"],
    heroConfig: {
      dataFormat: "single value with optional comparison",
      requiredFields: ["value"],
      optionalFields: ["label", "prefix", "suffix", "decimals", "comparison_value", "comparison_label", "trend_direction"],
      exampleConfig: {
        type: "kpi_tile",
        number_format: { prefix: "\u20AC", decimals: 0 },
      },
    },
  },
  {
    id: "sparkline",
    name: "Sparkline",
    nameNl: "Sparkline",
    category: "kpi",
    description: "Tiny inline chart showing trend alongside a number",
    bestFor: ["Compact trend indicator", "Dashboard header", "Tabel inline grafiek"],
    implementation: {
      library: "recharts",
      component: "LineChart",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["sparkline", "win-loss"],
    heroConfig: {
      dataFormat: "array of numbers or { date, value } objects",
      requiredFields: ["values"],
      optionalFields: ["color", "show_area", "height", "reference_line"],
      exampleConfig: {
        type: "sparkline",
        chart_options: { show_area: true, height: 40 },
      },
    },
  },
  {
    id: "number_comparison",
    name: "Number Comparison",
    nameNl: "Getallenvergelijking",
    category: "kpi",
    description: "Two numbers side-by-side with change percentage",
    bestFor: ["Period-over-period", "Doel vs werkelijk", "YoY vergelijking"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["number-block"],
    heroConfig: {
      dataFormat: "{ current, previous, label }",
      requiredFields: ["current_value", "previous_value"],
      optionalFields: ["label", "format", "positive_is_good"],
      exampleConfig: {
        type: "number_comparison",
        chart_options: { positive_is_good: true },
      },
    },
  },
  {
    id: "progress_bar",
    name: "Progress Bar",
    nameNl: "Voortgangsbalk",
    category: "kpi",
    description: "Horizontal bar showing progress toward a goal",
    bestFor: ["Doelvoortgang", "Capaciteitsgebruik", "Completion rate"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["progress-bar", "bullet-chart"],
    heroConfig: {
      dataFormat: "{ value, target, label }",
      requiredFields: ["value", "target"],
      optionalFields: ["label", "color", "thresholds"],
      exampleConfig: {
        type: "progress_bar",
        chart_options: { thresholds: [50, 80] },
      },
    },
  },

  // ---------- TABLES ----------
  {
    id: "table",
    name: "Data Table",
    nameNl: "Databel",
    category: "table",
    description: "Sortable, filterable data table with optional formatting",
    bestFor: ["Gedetailleerde data", "Sorteerbare lijsten", "Drill-down data"],
    implementation: {
      library: "custom",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["table", "pivot-table", "leaderboard"],
    heroConfig: {
      dataFormat: "array of row objects",
      requiredFields: ["columns"],
      optionalFields: ["sortable", "filterable", "pagination", "row_highlight", "conditional_formatting"],
      exampleConfig: {
        type: "table",
        columns: [{ key: "name", label: "Naam", sortable: true }],
      },
    },
  },

  // ---------- MAPS ----------
  {
    id: "map",
    name: "Map / Geo Visualization",
    nameNl: "Kaart / Geo Visualisatie",
    category: "map",
    description: "Geographic visualization with markers, regions, or choropleth",
    bestFor: ["Locatie data", "Regionale analyse", "Store/kantoor overzicht"],
    implementation: {
      library: "custom",
      component: "Leaflet/Mapbox",
      complexity: "complex",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["map", "geo-map"],
    heroConfig: {
      dataFormat: "array of { lat, lng, value?, label? } objects",
      requiredFields: ["lat_field", "lng_field"],
      optionalFields: ["value_field", "label_field", "map_style", "cluster"],
      exampleConfig: {
        type: "map",
        chart_options: { cluster: true },
      },
    },
  },

  // ---------- NIEUWE TYPES (beyond Klipfolio) ----------
  {
    id: "sankey",
    name: "Sankey Diagram",
    nameNl: "Sankey Diagram",
    category: "flow",
    description: "Flow diagram showing how values move between categories",
    bestFor: ["User flow", "Budget flow", "Conversie paden", "Energieverdeling"],
    implementation: {
      library: "nivo",
      component: "Sankey",
      complexity: "complex",
      realtimeCapable: false,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "{ nodes: [{ id }], links: [{ source, target, value }] }",
      requiredFields: ["nodes", "links"],
      optionalFields: ["colors", "alignment", "label_format"],
      exampleConfig: {
        type: "sankey",
        chart_options: { alignment: "justify" },
      },
    },
  },
  {
    id: "bullet_chart",
    name: "Bullet Chart",
    nameNl: "Bullet Chart",
    category: "comparison",
    description: "Compact chart showing actual vs target with qualitative ranges",
    bestFor: ["KPI vs doel", "Performance dashboard", "Compacte vergelijking"],
    implementation: {
      library: "custom",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["bullet-chart"],
    heroConfig: {
      dataFormat: "{ actual, target, ranges: [poor, satisfactory, good] }",
      requiredFields: ["actual", "target"],
      optionalFields: ["ranges", "label", "orientation"],
      exampleConfig: {
        type: "bullet_chart",
        chart_options: { ranges: [30, 70, 100] },
      },
    },
  },
  {
    id: "box_plot",
    name: "Box Plot",
    nameNl: "Boxplot",
    category: "distribution",
    description: "Statistical box-and-whisker plot showing data distribution",
    bestFor: ["Statistische verdeling", "Outlier analyse", "Vergelijking van verdelingen"],
    implementation: {
      library: "visx",
      component: "BoxPlot",
      complexity: "complex",
      realtimeCapable: false,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "array of { group, min, q1, median, q3, max, outliers? }",
      requiredFields: ["group_field", "values"],
      optionalFields: ["show_outliers", "orientation"],
      exampleConfig: {
        type: "box_plot",
        chart_options: { show_outliers: true },
      },
    },
  },
  {
    id: "slope_chart",
    name: "Slope Chart",
    nameNl: "Helling Diagram",
    category: "comparison",
    description: "Shows ranking changes between two time periods",
    bestFor: ["Ranking verandering", "Before/after vergelijking", "Period comparison"],
    implementation: {
      library: "custom",
      complexity: "moderate",
      realtimeCapable: false,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "array of { name, before, after }",
      requiredFields: ["name_field", "before_field", "after_field"],
      optionalFields: ["highlight_names", "colors"],
      exampleConfig: {
        type: "slope_chart",
        chart_options: {},
      },
    },
  },
  {
    id: "small_multiples",
    name: "Small Multiples",
    nameNl: "Kleine Veelvouden",
    category: "comparison",
    description: "Grid of small charts for comparing patterns across categories",
    bestFor: ["Multi-regio vergelijking", "Product performance grid", "Trend vergelijking"],
    implementation: {
      library: "recharts",
      complexity: "complex",
      realtimeCapable: true,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "array of { category, data: [{ x, y }] }",
      requiredFields: ["category_field", "x_field", "y_field"],
      optionalFields: ["chart_type", "columns", "shared_axis"],
      exampleConfig: {
        type: "small_multiples",
        chart_options: { chart_type: "line", columns: 3 },
      },
    },
  },
  {
    id: "metric_card",
    name: "Metric Card",
    nameNl: "Metriek Kaart",
    category: "kpi",
    description: "Rich card with number, sparkline, trend, and context in one component",
    bestFor: ["Executive dashboard", "KPI overzicht", "At-a-glance metrics"],
    implementation: {
      library: "custom",
      complexity: "moderate",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["number-block", "sparkline"],
    heroConfig: {
      dataFormat: "{ value, trend_data: number[], comparison, label }",
      requiredFields: ["value", "label"],
      optionalFields: ["trend_data", "comparison_value", "comparison_label", "prefix", "suffix", "icon"],
      exampleConfig: {
        type: "metric_card",
        chart_options: { show_sparkline: true, show_comparison: true },
      },
    },
  },
  {
    id: "status_board",
    name: "Status Board",
    nameNl: "Statusbord",
    category: "kpi",
    description: "Grid of status indicators (green/yellow/red) for monitoring",
    bestFor: ["Systeem monitoring", "Service health", "Project status overzicht"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: [],
    heroConfig: {
      dataFormat: "array of { name, status, value?, message? }",
      requiredFields: ["name_field", "status_field"],
      optionalFields: ["value_field", "message_field", "columns"],
      exampleConfig: {
        type: "status_board",
        chart_options: { columns: 4 },
      },
    },
  },
  {
    id: "timeline",
    name: "Timeline",
    nameNl: "Tijdlijn",
    category: "time",
    description: "Chronological events or milestones on a timeline",
    bestFor: ["Project milestones", "Evenementen", "Historisch overzicht"],
    implementation: {
      library: "custom",
      complexity: "moderate",
      realtimeCapable: false,
    },
    klipfolioEquivalent: ["timeline"],
    heroConfig: {
      dataFormat: "array of { date, title, description?, status? }",
      requiredFields: ["date_field", "title_field"],
      optionalFields: ["description_field", "status_field", "orientation"],
      exampleConfig: {
        type: "timeline",
        chart_options: { orientation: "horizontal" },
      },
    },
  },

  // ---------- TEXT / EMBED ----------
  {
    id: "text_widget",
    name: "Text / Markdown Widget",
    nameNl: "Tekst Widget",
    category: "custom",
    description: "Rich text or markdown content block for annotations",
    bestFor: ["Annotaties", "Instructies", "Context informatie"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: false,
    },
    klipfolioEquivalent: ["text-block"],
    heroConfig: {
      dataFormat: "string (markdown)",
      requiredFields: ["content"],
      optionalFields: ["format"],
      exampleConfig: {
        type: "text_widget",
        chart_options: { format: "markdown" },
      },
    },
  },
  {
    id: "iframe",
    name: "Embed / iFrame",
    nameNl: "Embed / iFrame",
    category: "custom",
    description: "Embedded external content via URL",
    bestFor: ["Externe tools", "Live webpagina", "Video/presentatie"],
    implementation: {
      library: "custom",
      complexity: "simple",
      realtimeCapable: true,
    },
    klipfolioEquivalent: ["html-block", "image"],
    heroConfig: {
      dataFormat: "string (URL)",
      requiredFields: ["url"],
      optionalFields: ["height", "sandbox"],
      exampleConfig: {
        type: "iframe",
        chart_options: { sandbox: true },
      },
    },
  },
];

// ============================================================================
// LIBRARY RECOMMENDATIONS
// ============================================================================

export const LIBRARY_RECOMMENDATIONS = {
  recharts: {
    name: "Recharts",
    strengths: [
      "Beste React integratie",
      "Eenvoudige API",
      "Goede TypeScript support",
      "Animaties out-of-the-box",
      "Responsive",
    ],
    bestFor: [
      "bar_chart", "line_chart", "area_chart", "pie_chart",
      "scatter_chart", "combo_chart", "radar_chart", "treemap",
      "funnel", "sparkline",
    ],
    limitations: ["Geen Sankey", "Geen boxplot", "Beperkte geo"],
  },
  nivo: {
    name: "Nivo",
    strengths: [
      "Prachtige standaard styling",
      "Server-side rendering",
      "Uitgebreide charttypen",
      "Goede legenda/tooltip",
    ],
    bestFor: [
      "heatmap", "sankey", "treemap", "pie_chart",
      "bar_chart", "line_chart",
    ],
    limitations: ["Grotere bundle size", "Minder flexibel dan D3"],
  },
  visx: {
    name: "Visx (Airbnb)",
    strengths: [
      "Low-level D3 primitives als React componenten",
      "Maximale controle",
      "Kleine bundle per chart",
    ],
    bestFor: [
      "box_plot", "custom visuals", "complexe interactieve charts",
    ],
    limitations: ["Steile leercurve", "Meer code per chart"],
  },
  echarts: {
    name: "ECharts (Apache)",
    strengths: [
      "Meeste charttypen beschikbaar",
      "Uitstekende performance met grote datasets",
      "Ingebouwde kaarten",
      "3D support",
    ],
    bestFor: [
      "map", "sankey", "gauge", "heatmap",
      "box_plot", "grote datasets",
    ],
    limitations: ["Niet native React", "Wrapper nodig", "Grote bundle"],
  },
};

// ============================================================================
// AI VISUAL SUGGESTIONS
// ============================================================================

export interface VisualSuggestion {
  forDataPattern: string;
  suggestedTypes: string[];
  reasoning: string;
}

export const AI_VISUAL_SUGGESTIONS: VisualSuggestion[] = [
  {
    forDataPattern: "single_number",
    suggestedTypes: ["kpi_tile", "metric_card", "gauge"],
    reasoning: "Enkele waardes zijn het meest impactvol als groot getal met context (trend, vergelijking).",
  },
  {
    forDataPattern: "time_series",
    suggestedTypes: ["line_chart", "area_chart", "sparkline"],
    reasoning: "Tijdreeksen worden het best weergegeven met lijn- of vlakdiagrammen voor trendherkenning.",
  },
  {
    forDataPattern: "categories_with_values",
    suggestedTypes: ["bar_chart", "pie_chart", "treemap"],
    reasoning: "Categoriale data met waarden: gebruik bars voor vergelijking, pie voor verdeling.",
  },
  {
    forDataPattern: "two_variables_correlation",
    suggestedTypes: ["scatter_chart", "heatmap"],
    reasoning: "Twee numerieke variabelen: scatter voor correlatie, heatmap voor dichte data.",
  },
  {
    forDataPattern: "funnel_stages",
    suggestedTypes: ["funnel", "bar_chart"],
    reasoning: "Stapsgewijze conversie/drop-off data past het best bij een trechterdiagram.",
  },
  {
    forDataPattern: "multi_dimensional",
    suggestedTypes: ["radar_chart", "small_multiples", "heatmap"],
    reasoning: "Meerdere dimensies vergelijken: radar voor profiel, small multiples voor patronen.",
  },
  {
    forDataPattern: "flow_between_categories",
    suggestedTypes: ["sankey"],
    reasoning: "Stromen tussen categorien worden het duidelijkst met een Sankey diagram.",
  },
  {
    forDataPattern: "status_monitoring",
    suggestedTypes: ["status_board", "gauge", "kpi_tile"],
    reasoning: "Real-time monitoring past bij statusborden met kleurcodes.",
  },
  {
    forDataPattern: "ranking_over_time",
    suggestedTypes: ["slope_chart", "bar_chart", "table"],
    reasoning: "Rankingveranderingen zijn visueel sterk als slope chart of animerend staafdiagram.",
  },
  {
    forDataPattern: "hierarchical_data",
    suggestedTypes: ["treemap", "sankey"],
    reasoning: "Hierarchische data toont verhoudingen het best als treemap.",
  },
  {
    forDataPattern: "actual_vs_target",
    suggestedTypes: ["bullet_chart", "gauge", "progress_bar"],
    reasoning: "Werkelijk vs doel: bullet chart is de meest informatiedichte optie.",
  },
  {
    forDataPattern: "tabular_detail",
    suggestedTypes: ["table"],
    reasoning: "Wanneer gebruikers detail-level data nodig hebben, is een tabel de beste keuze.",
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getVisualType(id: string): VisualTypeDefinition | undefined {
  return VISUAL_TYPES.find((v) => v.id === id);
}

export function getVisualTypesByCategory(category: VisualCategory): VisualTypeDefinition[] {
  return VISUAL_TYPES.filter((v) => v.category === category);
}

export function suggestVisualsForData(pattern: string): VisualSuggestion | undefined {
  return AI_VISUAL_SUGGESTIONS.find((s) => s.forDataPattern === pattern);
}

export function getKlipfolioToHeroMapping(): Record<string, VisualTypeDefinition> {
  const mapping: Record<string, VisualTypeDefinition> = {};
  for (const visual of VISUAL_TYPES) {
    if (visual.klipfolioEquivalent) {
      for (const kfType of visual.klipfolioEquivalent) {
        mapping[kfType] = visual;
      }
    }
  }
  return mapping;
}

/**
 * Generate a comprehensive visual knowledge text for AI prompts.
 */
export function generateVisualKnowledgeText(): string {
  const lines: string[] = [];

  lines.push("# Hero Dashboard Visualisatie-opties");
  lines.push("");
  lines.push(`Totaal ${VISUAL_TYPES.length} visualisatietypen beschikbaar.`);
  lines.push("");

  const categories = [...new Set(VISUAL_TYPES.map((v) => v.category))];

  for (const cat of categories) {
    const types = getVisualTypesByCategory(cat);
    const catLabels: Record<string, string> = {
      chart: "Grafieken",
      kpi: "KPI / Metrieken",
      table: "Tabellen",
      map: "Kaarten",
      comparison: "Vergelijkingen",
      distribution: "Verdelingen",
      flow: "Stroomdiagrammen",
      time: "Tijdreeksen",
      custom: "Overig",
    };

    lines.push(`## ${catLabels[cat] || cat}`);
    for (const t of types) {
      lines.push(`- **${t.nameNl}** (${t.id}): ${t.description}`);
      lines.push(`  Best voor: ${t.bestFor.join(", ")}`);
      if (t.klipfolioEquivalent && t.klipfolioEquivalent.length > 0) {
        lines.push(`  Klipfolio equivalent: ${t.klipfolioEquivalent.join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
