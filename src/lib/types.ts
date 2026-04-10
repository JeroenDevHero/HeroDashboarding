// ============================================================================
// Hero Dashboards — TypeScript Type Definitions
// ============================================================================

// ---------- Enums / Union Types ----------

export type UserRole = "admin" | "builder" | "viewer";

export type KlipType =
  | "kpi_tile"
  | "bar_chart"
  | "line_chart"
  | "area_chart"
  | "pie_chart"
  | "gauge"
  | "table"
  | "sparkline"
  | "scatter_chart"
  | "funnel"
  | "map"
  | "number_comparison"
  | "progress_bar"
  | "heatmap"
  | "combo_chart"
  | "text_widget"
  | "iframe"
  | "radar_chart"
  | "treemap"
  | "waterfall_chart"
  | "sankey"
  | "bullet_chart"
  | "box_plot"
  | "slope_chart"
  | "small_multiples"
  | "metric_card"
  | "status_board"
  | "timeline";

export type RefreshStatus = "success" | "error" | "pending" | "refreshing";

export type ContextType = "klip_builder" | "data_explorer" | "dashboard_assistant";

export type MessageRole = "user" | "assistant";

export type DashboardTheme = "light" | "dark";

export type SharePermission = "view" | "edit" | "admin";

// ---------- Config Sub-Types ----------

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface RestApiConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  auth_type?: "none" | "bearer" | "api_key" | "basic";
  auth_value?: string;
}

export interface GoogleSheetsConfig {
  spreadsheet_id: string;
  sheet_name: string;
  range?: string;
  credentials_json?: string;
}

export interface CsvConfig {
  url?: string;
  file_path?: string;
  delimiter?: string;
  has_header?: boolean;
}

export interface DatabricksConfig {
  server_hostname: string;
  http_path: string;
  access_token: string;
  catalog?: string;
  schema?: string;
}

export type ConnectionConfig =
  | PostgresConfig
  | RestApiConfig
  | GoogleSheetsConfig
  | CsvConfig
  | DatabricksConfig
  | Record<string, unknown>;

export interface KlipConfig {
  /** Chart-specific options (axes, colors, legend, etc.) */
  chart_options?: Record<string, unknown>;
  /** Column definitions for table-type klips */
  columns?: Array<{ key: string; label: string; sortable?: boolean }>;
  /** Number formatting for number-type klips */
  number_format?: {
    prefix?: string;
    suffix?: string;
    decimals?: number;
    comparison_value?: number;
  };
  /** Custom component identifier for custom-type klips */
  custom_component?: string;
  /** Extra settings */
  [key: string]: unknown;
}

// ---------- Core Interfaces ----------

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  preferences: Record<string, unknown> | null;
  last_active_at: string | null;
  created_at: string;
}

export interface DataSourceType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  config_schema: Record<string, unknown>;
}

export interface DataSource {
  id: string;
  org_id: string;
  type_id: string;
  name: string;
  description: string | null;
  connection_config: ConnectionConfig;
  refresh_interval_seconds: number;
  last_refresh_at: string | null;
  last_refresh_status: RefreshStatus;
  last_refresh_error: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Joined from data_source_types */
  data_source_type?: DataSourceType;
}

export interface Klip {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  type: KlipType;
  query_id: string | null;
  config: KlipConfig;
  ai_prompt: string | null;
  ai_conversation_id: string | null;
  ai_generated: boolean;
  is_template: boolean;
  thumbnail_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_template: boolean;
  layout_config: Record<string, unknown> | null;
  theme: DashboardTheme;
  auto_refresh_seconds: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardKlip {
  id: string;
  dashboard_id: string;
  klip_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config_overrides: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
}

export interface DashboardWithKlips extends Dashboard {
  dashboard_klips: Array<DashboardKlip & { klip: Klip }>;
}

export interface DashboardShare {
  id: string;
  dashboard_id: string;
  shared_with_user_id: string | null;
  shared_with_group: string | null;
  permission: SharePermission;
  created_at: string;
}

export interface AIConversation {
  id: string;
  user_id: string;
  title: string | null;
  context_type: ContextType;
  context_id: string | null;
  messages: AIMessage[];
  created_klip_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export interface AIMessage {
  id: string;
  role: MessageRole;
  content: string;
  tool_calls: AIToolCall[] | null;
  created_at: string;
}

// ---------- API Response Generics ----------

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
