// ============================================================================
// Hero Dashboards — TypeScript Type Definitions
// ============================================================================

// ---------- Enums / Union Types ----------

export type UserRole = "admin" | "builder" | "viewer";

export type DatasourceType = "postgresql" | "rest_api" | "google_sheets" | "csv";

export type DatasourceStatus = "active" | "error" | "inactive";

export type KlipType = "bar" | "line" | "pie" | "area" | "number" | "table" | "custom";

export type MessageRole = "user" | "assistant";

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

export type DatasourceConfig =
  | PostgresConfig
  | RestApiConfig
  | GoogleSheetsConfig
  | CsvConfig;

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

export interface DashboardKlipLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

// ---------- Core Interfaces ----------

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  config: DatasourceConfig;
  status: DatasourceStatus;
  last_synced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Klip {
  id: string;
  title: string;
  description: string | null;
  type: KlipType;
  config: KlipConfig;
  query: string | null;
  datasource_id: string | null;
  cache_duration_seconds: number;
  cached_data: unknown | null;
  cached_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardKlip {
  id: string;
  dashboard_id: string;
  klip_id: string;
  layout: DashboardKlipLayout;
  created_at: string;
}

export interface DashboardWithKlips extends Dashboard {
  dashboard_klips: Array<DashboardKlip & { klip: Klip }>;
}

export interface AIConversation {
  id: string;
  user_id: string;
  title: string | null;
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
  conversation_id: string;
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
