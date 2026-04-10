// ============================================================================
// Klipfolio API — Deep Type Definitions
// ============================================================================

// ---------- Core API Response Types ----------

export interface KlipfolioMeta {
  total: number;
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
  datasources?: KlipfolioKlipDatasource[];
  properties?: Record<string, unknown>;
  formula?: string;
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

// ---------- Datasource Types ----------

export interface KlipfolioDatasource {
  id: string;
  name: string;
  description: string;
  refresh_interval?: number;
  date_last_refresh?: string;
}

export interface KlipfolioDatasourceDetail extends KlipfolioDatasource {
  connector?: string;
  type?: string;
  properties?: Record<string, unknown>;
  format?: string;
  url?: string;
  query?: string;
  date_created?: string;
  last_updated?: string;
  active?: boolean;
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

// ---------- Component Type Mapping ----------

export const KLIPFOLIO_COMPONENT_TYPES: Record<string, string> = {
  "bar-chart": "Staafdiagram",
  "column-chart": "Kolomdiagram",
  "line-chart": "Lijndiagram",
  "area-chart": "Vlakdiagram",
  "pie-chart": "Taartdiagram",
  "donut-chart": "Donutdiagram",
  "scatter-chart": "Spreidingsdiagram",
  "bubble-chart": "Bellendiagram",
  "combo-chart": "Combinatiediagram",
  "stacked-bar-chart": "Gestapeld staafdiagram",
  "stacked-area-chart": "Gestapeld vlakdiagram",
  "funnel-chart": "Trechterdiagram",
  "gauge": "Meter",
  "number-block": "Getal / KPI",
  "sparkline": "Sparkline",
  "table": "Tabel",
  "pivot-table": "Draaitabel",
  "image": "Afbeelding",
  "text-block": "Tekstblok",
  "html-block": "HTML blok",
  "map": "Kaart",
  "geo-map": "Geografische kaart",
  "heatmap": "Heatmap",
  "treemap": "Treemap",
  "waterfall-chart": "Watervalgrafiek",
  "bullet-chart": "Bullet chart",
  "progress-bar": "Voortgangsbalk",
  "win-loss": "Win/Loss sparkline",
  "multi-line": "Multi-lijn",
  "grouped-bar": "Gegroepeerd staafdiagram",
  "timeline": "Tijdlijn",
  "leaderboard": "Ranglijst",
};

export const KLIPFOLIO_CONNECTOR_TYPES: Record<string, string> = {
  rest_api: "REST API",
  sql_query: "SQL Query",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mssql: "Microsoft SQL Server",
  google_analytics: "Google Analytics",
  google_analytics_4: "Google Analytics 4",
  google_sheets: "Google Sheets",
  google_bigquery: "Google BigQuery",
  google_ads: "Google Ads",
  facebook: "Facebook",
  facebook_ads: "Facebook Ads",
  instagram: "Instagram",
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  quickbooks: "QuickBooks",
  xero: "Xero",
  stripe: "Stripe",
  shopify: "Shopify",
  mailchimp: "Mailchimp",
  zendesk: "Zendesk",
  jira: "Jira",
  excel: "Excel / CSV",
  csv: "CSV",
  json: "JSON",
  xml: "XML",
  ftp: "FTP/SFTP",
  custom: "Custom connector",
  databricks: "Databricks",
  snowflake: "Snowflake",
  amazon_redshift: "Amazon Redshift",
};

// ---------- Hero Type Mapping ----------

export const KLIPFOLIO_TO_HERO_TYPE: Record<string, string> = {
  "bar-chart": "bar_chart",
  "column-chart": "bar_chart",
  "stacked-bar-chart": "bar_chart",
  "grouped-bar": "bar_chart",
  "line-chart": "line_chart",
  "multi-line": "line_chart",
  "area-chart": "area_chart",
  "stacked-area-chart": "area_chart",
  "pie-chart": "pie_chart",
  "donut-chart": "pie_chart",
  "scatter-chart": "scatter_chart",
  "bubble-chart": "scatter_chart",
  "combo-chart": "combo_chart",
  "funnel-chart": "funnel",
  "gauge": "gauge",
  "number-block": "kpi_tile",
  "sparkline": "sparkline",
  "table": "table",
  "pivot-table": "table",
  "text-block": "text_widget",
  "html-block": "iframe",
  "image": "iframe",
  "map": "map",
  "geo-map": "map",
  "heatmap": "heatmap",
  "treemap": "heatmap",
  "waterfall-chart": "bar_chart",
  "bullet-chart": "bar_chart",
  "progress-bar": "progress_bar",
  "win-loss": "sparkline",
  "timeline": "line_chart",
  "leaderboard": "table",
};
