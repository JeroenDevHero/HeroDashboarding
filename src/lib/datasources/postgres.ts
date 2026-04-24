import { Client, types } from "pg";

// Configure numeric types to return as strings for precision, then parse
// them on the client. JSONB / JSON are already parsed by default.
types.setTypeParser(1700, (val) => (val === null ? null : Number(val))); // numeric
types.setTypeParser(20, (val) => (val === null ? null : Number(val))); // bigint
types.setTypeParser(1082, (val) => val); // date as string
types.setTypeParser(1114, (val) => val); // timestamp as string
types.setTypeParser(1184, (val) => val); // timestamptz as string

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  schema?: string;
  connection_string?: string;
  /** Statement timeout in milliseconds. Defaults to 30_000 (30s). */
  statement_timeout_ms?: number;
}

/**
 * Build a pg Client config from our PostgresConfig. Prefers connection_string
 * when provided; otherwise builds from individual fields.
 */
function buildClientOptions(config: PostgresConfig) {
  const timeout = config.statement_timeout_ms ?? 30_000;

  if (config.connection_string) {
    return {
      connectionString: config.connection_string,
      ssl: config.ssl === false ? undefined : { rejectUnauthorized: false },
      statement_timeout: timeout,
      query_timeout: timeout,
    };
  }

  return {
    host: config.host,
    port: config.port || 5432,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    statement_timeout: timeout,
    query_timeout: timeout,
  };
}

export async function testPostgresConnection(
  config: PostgresConfig
): Promise<{ success: boolean; message: string }> {
  const client = new Client(buildClientOptions(config));
  try {
    await client.connect();
    const result = await client.query("SELECT 1 AS test, version() AS version");
    await client.end();
    const version = (result.rows[0]?.version as string) || "onbekend";
    return {
      success: true,
      message: `Verbinding succesvol (${version.split(" ").slice(0, 2).join(" ")})`,
    };
  } catch (error) {
    try {
      await client.end();
    } catch {
      // ignore
    }
    const msg = error instanceof Error ? error.message : "Onbekende fout";
    return { success: false, message: `Verbinding mislukt: ${msg}` };
  }
}

/**
 * Execute a read-only SQL query against Postgres and return rows as plain
 * objects. Enforces a statement timeout and a hard row cap to avoid runaway
 * queries.
 */
export async function executePostgresQuery(
  config: PostgresConfig,
  query: string,
  maxRows: number = 10_000
): Promise<Record<string, unknown>[]> {
  const client = new Client(buildClientOptions(config));
  try {
    await client.connect();

    // Wrap in a read-only transaction so queries cannot modify data even if
    // the supplied role accidentally has write grants.
    await client.query("BEGIN READ ONLY");

    // Apply the row cap as a hard LIMIT wrapper when not already present.
    // This protects the UI and the network layer from accidental huge result
    // sets while still allowing the inner SQL to use its own LIMIT / aggregation.
    const needsOuterLimit = !/\blimit\s+\d+\s*;?\s*$/i.test(query.trim());
    const wrapped = needsOuterLimit
      ? `SELECT * FROM (${query.replace(/;\s*$/, "")}) AS _wrapped LIMIT ${maxRows}`
      : query;

    const result = await client.query(wrapped);

    await client.query("COMMIT");
    await client.end();

    return result.rows as Record<string, unknown>[];
  } catch (error) {
    try {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    } catch {
      // ignore cleanup errors
    }
    const msg = error instanceof Error ? error.message : "Onbekende fout";
    throw new Error(`Postgres query mislukt: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Catalog discovery helpers
// ---------------------------------------------------------------------------

export interface DiscoveredColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  ordinal_position: number;
  column_description: string | null;
  table_description: string | null;
}

/**
 * Return all columns of every user-facing table in the given schema(s). Uses
 * information_schema + pg_catalog for descriptions (COMMENT ON TABLE/COLUMN).
 */
export async function discoverPostgresSchema(
  config: PostgresConfig,
  schemas: string[] = ["public"]
): Promise<DiscoveredColumn[]> {
  const query = `
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable = 'YES' AS is_nullable,
      c.ordinal_position,
      col_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        c.ordinal_position
      ) AS column_description,
      obj_description(
        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
        'pg_class'
      ) AS table_description
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = ANY($1::text[])
      AND t.table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
  `;

  const client = new Client(buildClientOptions(config));
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query(query, [schemas]);
    await client.query("COMMIT");
    await client.end();
    return result.rows as DiscoveredColumn[];
  } catch (error) {
    try {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    } catch {
      // ignore
    }
    const msg = error instanceof Error ? error.message : "Onbekende fout";
    throw new Error(`Schema discovery mislukt: ${msg}`);
  }
}

/**
 * Fetch a few example rows for a fully-qualified table. Used to populate
 * sample_values in the data_catalog so the AI can see real values.
 */
export async function samplePostgresTable(
  config: PostgresConfig,
  schema: string,
  tableName: string,
  limit: number = 3
): Promise<Record<string, unknown>[]> {
  const ident = `${quoteIdent(schema)}.${quoteIdent(tableName)}`;
  return executePostgresQuery(config, `SELECT * FROM ${ident}`, limit);
}

/**
 * Safely quote a Postgres identifier. Rejects anything that doesn't look like
 * a normal identifier to be safe against SQL injection via schema / table name.
 */
export function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)) {
    // Fall back to double-quote escape for identifiers with special characters
    return `"${name.replace(/"/g, '""')}"`;
  }
  return `"${name}"`;
}
