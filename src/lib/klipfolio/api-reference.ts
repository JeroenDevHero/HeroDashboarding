// ============================================================================
// Klipfolio API v1 — Reference Documentation
// ============================================================================
// Base URL: https://app.klipfolio.com/api/1
// Auth: kf-api-key + kf-user-id headers
// Pagination: ?limit=N&offset=N on list endpoints
// Response format: { meta: { total }, data: { ... } }

/**
 * Complete reference of Klipfolio API v1 endpoints and their response structures.
 * Used by the discovery system to know which fields to extract.
 */
export const KLIPFOLIO_API_REFERENCE = {
  // ============================
  // TABS (Dashboards)
  // ============================
  tabs: {
    list: {
      method: "GET",
      path: "/tabs",
      params: ["limit", "offset"],
      response: {
        meta: { total: "number" },
        data: {
          tabs: [
            {
              id: "string - unique tab ID",
              name: "string - dashboard name",
              description: "string - dashboard description",
              active: "boolean - whether tab is active",
              order: "number - display order",
              date_created: "string - ISO date",
              last_updated: "string - ISO date",
            },
          ],
        },
      },
    },
    get: {
      method: "GET",
      path: "/tabs/{id}",
      response: {
        data: {
          id: "string",
          name: "string",
          description: "string",
          active: "boolean",
          order: "number",
        },
      },
    },
    getKlipInstances: {
      method: "GET",
      path: "/tabs/{id}/klip-instances",
      description: "Returns all klip instances on a tab with their template klip IDs. This is the correct endpoint for tab-klip mapping.",
      response: {
        meta: { total: "number" },
        data: {
          klip_instances: [
            {
              id: "string - instance ID (unique per tab placement)",
              klip_id: "string - referenced klip ID",
              name: "string - klip name",
              position: "number - sort order",
              row: "number - grid row",
              col: "number - grid column",
              size_x: "number - width in grid units",
              size_y: "number - height in grid units",
            },
          ],
        },
      },
    },
  },

  // ============================
  // KLIPS (Visualizations)
  // ============================
  klips: {
    list: {
      method: "GET",
      path: "/klips",
      params: ["limit", "offset"],
      response: {
        meta: { total: "number" },
        data: {
          klips: [
            {
              id: "string",
              name: "string",
              description: "string",
              created_by: "string",
              date_created: "string - ISO date",
              last_updated: "string - ISO date",
            },
          ],
        },
      },
    },
    get: {
      method: "GET",
      path: "/klips/{id}",
      description: "Returns full klip details including component type and datasource bindings",
      response: {
        data: {
          id: "string",
          name: "string",
          description: "string",
          component_type:
            "string - visualization type (bar-chart, line-chart, pie-chart, number-block, gauge, table, sparkline, etc.)",
          tab_id: "string - which tab this klip is on (may be null for orphaned klips)",
          datasources: [
            {
              id: "string - binding ID",
              datasource_id: "string - referenced datasource ID",
              name: "string - datasource name in this binding",
            },
          ],
          properties: "object - klip-specific configuration (axes, colors, formatting, etc.)",
          formula: "string - Klipfolio formula expression if applicable",
          active: "boolean",
          created_by: "string",
          date_created: "string",
          last_updated: "string",
        },
      },
    },
  },

  // ============================
  // DATASOURCES
  // ============================
  datasources: {
    list: {
      method: "GET",
      path: "/datasources",
      params: ["limit", "offset"],
      response: {
        meta: { total: "number" },
        data: {
          datasources: [
            {
              id: "string",
              name: "string",
              description: "string",
              refresh_interval: "number - seconds between refreshes",
              date_last_refresh: "string - ISO date",
            },
          ],
        },
      },
    },
    get: {
      method: "GET",
      path: "/datasources/{id}",
      description: "Returns full datasource details including connector type and properties",
      response: {
        data: {
          id: "string",
          name: "string",
          description: "string",
          connector:
            "string - connector type (rest_api, sql_query, google_analytics, google_sheets, csv, facebook, salesforce, etc.)",
          type: "string - alternative field for connector type",
          properties:
            "object - connector-specific config (url, query, credentials reference, etc.)",
          format: "string - data format (JSON, XML, CSV)",
          url: "string - source URL for REST/web connectors",
          query: "string - SQL query for database connectors",
          refresh_interval: "number - seconds",
          date_last_refresh: "string - ISO date",
          date_created: "string - ISO date",
          last_updated: "string - ISO date",
          active: "boolean",
        },
      },
    },
  },

  // ============================
  // COMPONENT TYPES
  // ============================
  componentTypes: {
    description: "Known component_type values returned by GET /klips/{id}",
    types: [
      "bar-chart",
      "column-chart",
      "stacked-bar-chart",
      "grouped-bar",
      "line-chart",
      "multi-line",
      "area-chart",
      "stacked-area-chart",
      "pie-chart",
      "donut-chart",
      "scatter-chart",
      "bubble-chart",
      "combo-chart",
      "funnel-chart",
      "gauge",
      "number-block",
      "sparkline",
      "table",
      "pivot-table",
      "image",
      "text-block",
      "html-block",
      "map",
      "geo-map",
      "heatmap",
      "treemap",
      "waterfall-chart",
      "bullet-chart",
      "progress-bar",
      "win-loss",
      "timeline",
      "leaderboard",
    ],
  },

  // ============================
  // CONNECTOR TYPES
  // ============================
  connectorTypes: {
    description: "Known connector values returned by GET /datasources/{id}",
    types: [
      "rest_api",
      "sql_query",
      "mysql",
      "postgresql",
      "mssql",
      "google_analytics",
      "google_analytics_4",
      "google_sheets",
      "google_bigquery",
      "google_ads",
      "facebook",
      "facebook_ads",
      "instagram",
      "twitter",
      "linkedin",
      "hubspot",
      "salesforce",
      "quickbooks",
      "xero",
      "stripe",
      "shopify",
      "mailchimp",
      "zendesk",
      "jira",
      "excel",
      "csv",
      "json",
      "xml",
      "ftp",
      "custom",
      "databricks",
      "snowflake",
      "amazon_redshift",
    ],
  },
} as const;

/**
 * Available Klipfolio component types organized by category.
 */
export const KLIPFOLIO_VISUAL_CATEGORIES = {
  charts: {
    label: "Grafieken",
    types: [
      "bar-chart",
      "column-chart",
      "stacked-bar-chart",
      "grouped-bar",
      "line-chart",
      "multi-line",
      "area-chart",
      "stacked-area-chart",
      "combo-chart",
      "waterfall-chart",
    ],
  },
  distribution: {
    label: "Verdeling",
    types: [
      "pie-chart",
      "donut-chart",
      "treemap",
      "heatmap",
    ],
  },
  scatter: {
    label: "Spreiding",
    types: [
      "scatter-chart",
      "bubble-chart",
    ],
  },
  kpi: {
    label: "KPI / Metrieken",
    types: [
      "number-block",
      "gauge",
      "sparkline",
      "progress-bar",
      "bullet-chart",
      "win-loss",
    ],
  },
  tables: {
    label: "Tabellen",
    types: [
      "table",
      "pivot-table",
      "leaderboard",
    ],
  },
  flow: {
    label: "Stroom / Proces",
    types: [
      "funnel-chart",
      "timeline",
    ],
  },
  geo: {
    label: "Geografisch",
    types: [
      "map",
      "geo-map",
    ],
  },
  content: {
    label: "Content",
    types: [
      "text-block",
      "html-block",
      "image",
    ],
  },
} as const;
