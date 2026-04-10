// ============================================================================
// Klipfolio API — Deep Type Definitions
// ============================================================================
// Based on: https://apidocs.klipfolio.com/reference
// Verified endpoints: /tabs, /tabs/{id}/klip-instances, /klips, /klips/{id},
//   /klips/{id}/schema, /datasources, /datasources/{id}, /datasources/{id}/properties

// ---------- Core API Response Types ----------

export interface KlipfolioMeta {
  total: number;
  count?: number;
  status?: number;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface KlipfolioListResponse<T> {
  meta: KlipfolioMeta;
  data: T;
}

// ---------- Tab (Dashboard) Types ----------

export interface KlipfolioTab {
  id: string;
  name: string;
  description: string;
  active?: boolean;
  order?: number;
  date_created?: string;
  last_updated?: string;
}

export interface KlipfolioTabDetail extends KlipfolioTab {
  company?: string;
  created_by?: string;
  klips?: KlipfolioTabKlipEntry[];
}

export interface KlipfolioTabKlipEntry {
  id: string;
  klip_id: string;
  name: string;
  position?: number;
  row?: number;
  col?: number;
  size_x?: number;
  size_y?: number;
}

/**
 * Klip instance on a tab — returned by GET /tabs/{id}/klip-instances.
 * Each instance has its own ID plus a reference to the template klip.
 */
export interface KlipfolioKlipInstance {
  id: string;
  klip_id: string;
  name: string;
  region?: number;
  position?: number;
}

// ---------- Klip Types ----------

export interface KlipfolioKlip {
  id: string;
  name: string;
  description: string;
  created_by?: string;
  date_created?: string;
  last_updated?: string;
}

export interface KlipfolioKlipDetail extends KlipfolioKlip {
  component_type?: string;
  tab_id?: string;
  company?: string;
  datasources?: KlipfolioKlipDatasource[];
  properties?: Record<string, unknown>;
  formula?: string;
  share_rights?: KlipfolioShareRight[];
  active?: boolean;
  row?: number;
  col?: number;
  size_x?: number;
  size_y?: number;
}

export interface KlipfolioKlipDatasource {
  id: string;
  datasource_id: string;
  name?: string;
}

export interface KlipfolioShareRight {
  group_id: string;
  group_name: string;
  can_edit: boolean;
}

/**
 * Klip schema — returned by GET /klips/{id}/schema.
 * Contains the full visualization config: component type, formulas,
 * data source bindings, and layout/formatting settings.
 */
export interface KlipfolioKlipSchema {
  component_type?: string;
  datasource_instances?: Array<{
    id: string;
    datasource_id: string;
    name?: string;
  }>;
  formulas?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------- Datasource Types ----------

export interface KlipfolioDatasource {
  id: string;
  name: string;
  description: string;
  refresh_interval?: number;
  date_last_refresh?: string;
  is_dynamic?: boolean;
}

export interface KlipfolioDatasourceDetail extends KlipfolioDatasource {
  connector?: string;
  type?: string;
  company?: string;
  properties?: Record<string, unknown>;
  format?: string;
  url?: string;
  query?: string;
  disabled?: boolean;
  date_created?: string;
  last_updated?: string;
  active?: boolean;
  created_by?: string;
}

/**
 * Datasource properties — returned by GET /datasources/{id}/properties.
 * Contains connector-specific connection details (URL, query, credentials, etc.)
 */
export interface KlipfolioDatasourceProperties {
  datasource_id: string;
  properties: Record<string, unknown>;
}

// ---------- Mapped/Discovery Types ----------

export interface KlipfolioDiscoveryResult {
  discoveredAt: string;
  summary: {
    totalDashboards: number;
    totalKlips: number;
    totalDatasources: number;
    componentTypes: Record<string, number>;
    connectorTypes: Record<string, number>;
  };
  dashboards: KlipfolioDashboardMap[];
  orphanedKlips: KlipfolioKlipMap[];
  datasources: KlipfolioDatasourceMap[];
}

export interface KlipfolioDashboardMap {
  id: string;
  name: string;
  description: string;
  klips: KlipfolioKlipMap[];
}

export interface KlipfolioKlipMap {
  id: string;
  name: string;
  description: string;
  componentType: string;
  datasources: KlipfolioDatasourceRef[];
  properties?: Record<string, unknown>;
  position?: {
    row?: number;
    col?: number;
    sizeX?: number;
    sizeY?: number;
  };
}

export interface KlipfolioDatasourceRef {
  id: string;
  name: string;
  connector: string;
  format?: string;
  refreshInterval?: number;
}

export interface KlipfolioDatasourceMap {
  id: string;
  name: string;
  description: string;
  connector: string;
  format?: string;
  refreshInterval?: number;
  lastRefresh?: string;
  usedByKlips: string[];
}

// ============================================================================
// Schema Component Types — Low-level types found in /klips/{id}/schema
// These are the actual internal Klipfolio schema component types
// ============================================================================

export const KLIPFOLIO_SCHEMA_TYPES: Record<string, string> = {
  // Actual types found in Hero's Klipfolio environment:
  "gauge": "Meter (target vs werkelijk)",
  "panel-grid": "Paneel grid (samengestelde KPI's)",
  "table": "Tabel",
  "bar-or-line-chart": "Staaf- of lijndiagram",
  "number-block": "Getal / KPI",
  "pie-chart": "Taartdiagram",
  "sparkline": "Sparkline",
  "label": "Label / tekst",
  // Internal schema building blocks:
  "chart_series": "Grafiek data-reeks",
  "chart_axis": "Grafiek as",
  "chart_pie": "Taart component",
  "simple_value": "Enkele waarde",
  "mini_series": "Mini reeks (sparkline)",
  "mini_data": "Mini data",
  "series_data": "Reeks data",
  "series_labels": "Reeks labels",
  "table_col": "Tabel kolom",
  "table_headers": "Tabel headers",
  "table_results": "Tabel resultaten",
  "data_slot": "Data slot",
  "proxy": "Proxy component",
  "separator": "Scheidingslijn",
  "range": "Bereik",
};

// ============================================================================
// Component Type Mapping — ALL known Klipfolio component_type values
// ============================================================================

export const KLIPFOLIO_COMPONENT_TYPES: Record<string, string> = {
  // Charts — Basic
  "bar-chart": "Staafdiagram",
  "column-chart": "Kolomdiagram",
  "horizontal-bar": "Horizontaal staafdiagram",
  "stacked-bar-chart": "Gestapeld staafdiagram",
  "100-stacked-bar": "100% gestapeld staafdiagram",
  "grouped-bar": "Gegroepeerd staafdiagram",
  "line-chart": "Lijndiagram",
  "multi-line": "Multi-lijn",
  "area-chart": "Vlakdiagram",
  "stacked-area-chart": "Gestapeld vlakdiagram",
  "100-stacked-area": "100% gestapeld vlakdiagram",
  "pie-chart": "Taartdiagram",
  "donut-chart": "Donutdiagram",
  "scatter-chart": "Spreidingsdiagram",
  "bubble-chart": "Bellendiagram",
  "combo-chart": "Combinatiediagram",
  "column-line-combo": "Kolom-lijn combo",

  // Charts — Advanced
  "funnel-chart": "Trechterdiagram",
  "waterfall-chart": "Watervalgrafiek",
  "bullet-chart": "Bullet chart",
  "pareto-chart": "Paretodiagram",
  "radar-chart": "Radardiagram",
  "histogram": "Histogram",
  "box-plot": "Boxplot",
  "candlestick": "Candlestick",
  "sankey": "Sankey diagram",
  "timeline": "Tijdlijn",

  // KPI / Number Widgets
  "gauge": "Meter",
  "number-block": "Getal / KPI",
  "sparkline": "Sparkline",
  "win-loss": "Win/Loss sparkline",
  "progress-bar": "Voortgangsbalk",
  "indicator": "Indicator (pijl)",
  "ticker": "Ticker (scrollend)",
  "metric-list": "Metriekenlijst",
  "summary-block": "Samenvattingsblok",

  // Tables
  "table": "Tabel",
  "pivot-table": "Draaitabel",
  "leaderboard": "Ranglijst",
  "comparison-table": "Vergelijkingstabel",

  // Maps
  "map": "Kaart",
  "geo-map": "Geografische kaart",
  "heatmap": "Heatmap",
  "calendar-heatmap": "Kalender heatmap",
  "treemap": "Treemap",

  // Content
  "image": "Afbeelding",
  "text-block": "Tekstblok",
  "html-block": "HTML blok",
  "word-cloud": "Woordwolk",
};

// ============================================================================
// Connector Type Mapping — ALL known Klipfolio connector values
// ============================================================================

export const KLIPFOLIO_CONNECTOR_TYPES: Record<string, string> = {
  // Database
  db: "Database (SQL)",
  sql_query: "SQL Query",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mssql: "Microsoft SQL Server",
  xmla: "XMLA / OLAP",

  // Cloud Data Warehouses
  databricks: "Databricks",
  snowflake: "Snowflake",
  google_bigquery: "Google BigQuery",
  amazon_redshift: "Amazon Redshift",

  // REST / Web
  simple_rest: "REST API",
  rest_api: "REST API",
  json: "JSON",
  xml: "XML",
  csv: "CSV",
  ftp: "FTP/SFTP",

  // Google
  google_analytics: "Google Analytics",
  google_analytics_4: "Google Analytics 4",
  google_spreadsheets: "Google Sheets",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
  google_ads: "Google Ads",
  google_adwords: "Google AdWords",

  // Social / Marketing
  facebook: "Facebook",
  facebook_ads: "Facebook Ads",
  instagram: "Instagram",
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  hubspot: "HubSpot",
  mailchimp: "Mailchimp",
  marketo: "Marketo",
  survey_monkey: "SurveyMonkey",

  // CRM / Business
  salesforce: "Salesforce",
  quickbooks: "QuickBooks",
  xero: "Xero",
  shopify: "Shopify",
  stripe: "Stripe",
  zendesk: "Zendesk",
  jira: "Jira",

  // File / Storage
  box: "Box",
  dropbox: "Dropbox",
  excel: "Excel / CSV",

  // Analytics / Other
  comscore: "comScore",
  omniture: "Adobe Analytics (Omniture)",
  radian6: "Radian6",
  searchMetrics: "SearchMetrics",
  iformbuilder: "iFormBuilder",
  versature: "Versature",
  custom: "Custom connector",
};

// ============================================================================
// Hero Type Mapping — Klipfolio component_type → Hero KlipType
// ============================================================================

export const KLIPFOLIO_TO_HERO_TYPE: Record<string, string> = {
  // Bar charts
  "bar-chart": "bar_chart",
  "column-chart": "bar_chart",
  "horizontal-bar": "bar_chart",
  "stacked-bar-chart": "bar_chart",
  "100-stacked-bar": "bar_chart",
  "grouped-bar": "bar_chart",

  // Line charts
  "line-chart": "line_chart",
  "multi-line": "line_chart",

  // Area charts
  "area-chart": "area_chart",
  "stacked-area-chart": "area_chart",
  "100-stacked-area": "area_chart",

  // Pie / donut
  "pie-chart": "pie_chart",
  "donut-chart": "pie_chart",

  // Scatter / bubble
  "scatter-chart": "scatter_chart",
  "bubble-chart": "scatter_chart",

  // Combo
  "combo-chart": "combo_chart",
  "column-line-combo": "combo_chart",
  "pareto-chart": "combo_chart",

  // Flow
  "funnel-chart": "funnel",
  "sankey": "sankey",

  // Advanced charts
  "waterfall-chart": "waterfall_chart",
  "bullet-chart": "bullet_chart",
  "radar-chart": "radar_chart",
  "histogram": "bar_chart",
  "box-plot": "box_plot",
  "candlestick": "line_chart",
  "timeline": "timeline",

  // KPI widgets
  "gauge": "gauge",
  "number-block": "kpi_tile",
  "sparkline": "sparkline",
  "win-loss": "sparkline",
  "progress-bar": "progress_bar",
  "indicator": "kpi_tile",
  "ticker": "kpi_tile",
  "metric-list": "kpi_tile",
  "summary-block": "metric_card",

  // Tables
  "table": "table",
  "pivot-table": "table",
  "leaderboard": "table",
  "comparison-table": "table",

  // Maps / spatial
  "map": "map",
  "geo-map": "map",
  "heatmap": "heatmap",
  "calendar-heatmap": "heatmap",
  "treemap": "treemap",

  // Content
  "text-block": "text_widget",
  "html-block": "iframe",
  "image": "iframe",
  "word-cloud": "text_widget",
};
