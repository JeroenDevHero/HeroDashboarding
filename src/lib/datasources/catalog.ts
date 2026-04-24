import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";
import {
  discoverPostgresSchema,
  fetchPostgresTableStats,
  samplePostgresTable,
  type PostgresConfig,
} from "@/lib/datasources/postgres";
import { analyzeColumnStats } from "@/lib/datasources/intelligence";
import { refreshCatalogEmbeddings } from "@/lib/datasources/retrieval";

export interface CatalogEntry {
  id: string;
  data_source_id: string;
  catalog_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  column_type: string;
  column_description: string | null;
  table_description: string | null;
  semantic_description: string | null;
  semantic_description_source: "db-comment" | "ai-generated" | "user" | null;
  sample_values: unknown[] | null;
  is_nullable: boolean;
  ordinal_position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Analyze a Databricks data source: discover all tables, columns, types
 * and sample data, then upsert the results into the data_catalog table.
 */
export async function analyzeDatabricksSource(
  dataSourceId: string,
  config: DatabricksConfig
): Promise<void> {
  const catalog = config.catalog || "main";
  const schema = config.schema || "default";
  const supabase = createAdminClient();

  // 1. Get all tables in the catalog.schema
  let tables: Record<string, unknown>[];
  try {
    tables = await executeDatabricksQuery(
      config,
      `SHOW TABLES IN ${catalog}.${schema}`,
      1000
    );
  } catch (err) {
    console.error(
      `[catalog] Failed to list tables for ${catalog}.${schema}:`,
      err
    );
    return;
  }

  // SHOW TABLES returns rows with tableName (or similar) — extract the name
  const tableNames: string[] = tables
    .map((row) => {
      // Databricks SHOW TABLES returns columns: database, tableName, isTemporary
      const name =
        (row as Record<string, unknown>).tableName ??
        (row as Record<string, unknown>).table_name ??
        (row as Record<string, unknown>).TABLE_NAME;
      return typeof name === "string" ? name : null;
    })
    .filter((n): n is string => n !== null);

  // 2. For each table, get column info and sample data
  for (const tableName of tableNames) {
    const fqn = `${catalog}.${schema}.${tableName}`;

    // Get column descriptions via DESCRIBE TABLE
    let columns: Record<string, unknown>[];
    try {
      columns = await executeDatabricksQuery(
        config,
        `DESCRIBE TABLE ${fqn}`,
        1000
      );
    } catch (err) {
      console.error(`[catalog] Failed to describe table ${fqn}:`, err);
      continue; // skip this table, continue with next
    }

    // Get sample data (first 3 rows)
    let sampleRows: Record<string, unknown>[];
    try {
      sampleRows = await executeDatabricksQuery(
        config,
        `SELECT * FROM ${fqn} LIMIT 3`,
        3
      );
    } catch (err) {
      console.error(`[catalog] Failed to sample table ${fqn}:`, err);
      sampleRows = [];
    }

    // Parse columns from DESCRIBE TABLE output
    // DESCRIBE TABLE returns: col_name, data_type, comment
    const catalogRows = columns
      .filter((col) => {
        // DESCRIBE TABLE may include partition info / empty rows — skip those
        const colName =
          (col.col_name as string) ??
          (col.column_name as string) ??
          (col.COL_NAME as string) ??
          "";
        return colName.length > 0 && !colName.startsWith("#");
      })
      .map((col, idx) => {
        const colName =
          ((col.col_name as string) ??
            (col.column_name as string) ??
            (col.COL_NAME as string) ??
            "").trim();
        const colType =
          ((col.data_type as string) ??
            (col.column_type as string) ??
            (col.DATA_TYPE as string) ??
            "string").trim();
        const comment =
          ((col.comment as string) ?? (col.COMMENT as string) ?? "").trim();

        // Extract sample values for this column from sample rows
        const sampleValues = sampleRows
          .map((row) => row[colName])
          .filter((v) => v !== null && v !== undefined);

        return {
          data_source_id: dataSourceId,
          catalog_name: catalog,
          schema_name: schema,
          table_name: tableName,
          column_name: colName,
          column_type: colType,
          column_description: comment || null,
          sample_values: sampleValues.length > 0 ? sampleValues : null,
          is_nullable: true, // DESCRIBE TABLE doesn't reliably expose nullability
          ordinal_position: idx + 1,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((row) => row.column_name.length > 0);

    if (catalogRows.length === 0) continue;

    // Upsert into data_catalog
    const { error } = await supabase.from("data_catalog").upsert(catalogRows, {
      onConflict:
        "data_source_id,catalog_name,schema_name,table_name,column_name",
    });

    if (error) {
      console.error(
        `[catalog] Failed to upsert catalog for ${fqn}:`,
        error.message
      );
    }

    // Fire-and-forget: analyze column statistics for this table
    analyzeColumnStats(dataSourceId, config, tableName).catch((err) =>
      console.error(
        `[catalog] Column stats analysis failed for ${fqn}:`,
        err instanceof Error ? err.message : err
      )
    );
  }

  // Rebuild table-level embeddings so semantic retrieval reflects the new
  // catalog. Skipped silently when OPENAI_API_KEY is absent.
  try {
    const embedding = await refreshCatalogEmbeddings(dataSourceId);
    console.log(
      `[catalog] Embeddings: ${embedding.embedded} new, ${embedding.skipped} unchanged, ${embedding.tables} total${embedding.reason ? ` (${embedding.reason})` : ""}`
    );
  } catch (err) {
    console.error(
      `[catalog] Embeddings refresh failed for ${dataSourceId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Analyze a PostgreSQL / Supabase data source: discover every table and column
 * in the configured schema, take a small data sample, and upsert the result
 * into the data_catalog table.
 */
export async function analyzePostgresSource(
  dataSourceId: string,
  config: PostgresConfig
): Promise<void> {
  const schemas = config.schema ? [config.schema] : ["public"];
  const supabase = createAdminClient();

  let rows: Awaited<ReturnType<typeof discoverPostgresSchema>>;
  try {
    rows = await discoverPostgresSchema(config, schemas);
  } catch (err) {
    console.error(
      `[catalog] Failed to discover Postgres schema(s) ${schemas.join(",")}:`,
      err
    );
    return;
  }

  if (rows.length === 0) {
    console.warn(
      `[catalog] No tables found in Postgres schema(s) ${schemas.join(",")} for source ${dataSourceId}`
    );
    return;
  }

  // Group columns by table so we can fetch sample rows per table.
  const tableMap = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!tableMap.has(key)) tableMap.set(key, []);
    tableMap.get(key)!.push(row);
  }

  // Fetch pg_class row-count estimates once. Used to detect RLS-blindness:
  // if reltuples suggests a table has many rows but SELECT returns 0, the
  // connecting role is almost certainly being filtered out by a Row Level
  // Security policy (e.g. policies that only allow the Supabase JWT roles
  // `authenticated` / `service_role`, which never match a direct Postgres
  // connection). We warn prominently instead of silently treating the table
  // as empty.
  const tableStats = new Map<string, number>();
  try {
    const stats = await fetchPostgresTableStats(config, schemas);
    for (const s of stats) {
      tableStats.set(`${s.schema_name}.${s.table_name}`, s.estimated_rows);
    }
  } catch (err) {
    console.warn(
      `[catalog] Could not fetch pg_class stats for RLS-blindness check:`,
      err instanceof Error ? err.message : err
    );
  }
  const rlsBlindTables: string[] = [];
  const RLS_BLIND_ESTIMATE_THRESHOLD = 10;

  for (const [key, columns] of tableMap) {
    const [schema, tableName] = key.split(".", 2);

    let sampleRows: Record<string, unknown>[] = [];
    let sampleError: string | null = null;
    try {
      sampleRows = await samplePostgresTable(config, schema, tableName, 3);
    } catch (err) {
      sampleError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[catalog] Failed to sample ${schema}.${tableName}:`,
        sampleError
      );
    }

    const estimate = tableStats.get(key);
    if (
      sampleError === null &&
      sampleRows.length === 0 &&
      typeof estimate === "number" &&
      estimate > RLS_BLIND_ESTIMATE_THRESHOLD
    ) {
      rlsBlindTables.push(`${key} (~${estimate} rows)`);
    }

    const catalogRows = columns.map((col) => {
      const sampleValues = sampleRows
        .map((row) => row[col.column_name])
        .filter((v) => v !== null && v !== undefined)
        .map((v) => {
          // Ensure JSON-serializable values
          if (v instanceof Date) return v.toISOString();
          if (typeof v === "bigint") return v.toString();
          if (typeof v === "object") {
            try {
              JSON.stringify(v);
              return v;
            } catch {
              return String(v);
            }
          }
          return v;
        });

      // NOTE: deliberately omit `semantic_description` and
      // `semantic_description_source` here. Supabase upsert overwrites every
      // provided column on conflict, so including them would wipe existing
      // AI-enriched descriptions on every catalog refresh. Initial seeding
      // from the db-comment for brand-new rows is handled below via the
      // `seed_catalog_semantic_from_comment` RPC, which only touches rows
      // whose semantic_description is still NULL.
      return {
        data_source_id: dataSourceId,
        catalog_name: "postgres",
        schema_name: col.table_schema,
        table_name: col.table_name,
        column_name: col.column_name,
        column_type: col.data_type,
        column_description: col.column_description,
        table_description: col.table_description,
        sample_values: sampleValues.length > 0 ? sampleValues : null,
        is_nullable: col.is_nullable,
        ordinal_position: col.ordinal_position,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase.from("data_catalog").upsert(catalogRows, {
      onConflict:
        "data_source_id,catalog_name,schema_name,table_name,column_name",
    });

    if (error) {
      console.error(
        `[catalog] Failed to upsert Postgres catalog for ${key}:`,
        error.message
      );
    }

    // Column statistics are opt-in for Postgres — per-column queries on
    // hundreds of tables would crush the source DB. Run them explicitly from
    // /api/datasources/column-stats if/when needed.
  }

  // Seed semantic_description from db-comments for NEW rows only. Existing
  // rows with ai-generated / curated descriptions stay untouched.
  try {
    const { data: seeded, error: seedErr } = await supabase.rpc(
      "seed_catalog_semantic_from_comment",
      { p_data_source_id: dataSourceId }
    );
    if (seedErr) {
      console.warn(
        `[catalog] Could not seed semantic descriptions from comments: ${seedErr.message}`
      );
    } else if (typeof seeded === "number" && seeded > 0) {
      console.log(
        `[catalog] Seeded ${seeded} semantic descriptions from db-comments`
      );
    }
  } catch (err) {
    console.warn(
      `[catalog] Seed-from-comment RPC failed:`,
      err instanceof Error ? err.message : err
    );
  }

  console.log(
    `[catalog] Postgres discovery complete: ${tableMap.size} tables, ${rows.length} columns for source ${dataSourceId}`
  );

  if (rlsBlindTables.length > 0) {
    const preview = rlsBlindTables.slice(0, 10).join(", ");
    const suffix =
      rlsBlindTables.length > 10
        ? ` (+${rlsBlindTables.length - 10} meer)`
        : "";
    const message =
      `[catalog] RLS-blindness gedetecteerd: ${rlsBlindTables.length} tabel(len) lijken niet-leeg ` +
      `volgens pg_class, maar SELECT gaf 0 rijen terug. Waarschijnlijk blokkeren Row Level Security ` +
      `policies de read-only rol. Fix: grant BYPASSRLS aan de rol, of voeg een policy toe die deze rol ` +
      `toestaat. Voorbeelden: ${preview}${suffix}`;
    console.warn(message);

    await supabase
      .from("data_sources")
      .update({
        last_refresh_status: "warning",
        last_refresh_error: `RLS blokkeert ${rlsBlindTables.length} tabellen (bv. ${preview}${suffix}). Voer op de bron uit: ALTER ROLE <rol> BYPASSRLS;`,
      })
      .eq("id", dataSourceId);
  }

  // Rebuild table-level embeddings so semantic retrieval reflects the new
  // catalog. Skipped silently when OPENAI_API_KEY is absent.
  try {
    const embedding = await refreshCatalogEmbeddings(dataSourceId);
    console.log(
      `[catalog] Embeddings: ${embedding.embedded} new, ${embedding.skipped} unchanged, ${embedding.tables} total${embedding.reason ? ` (${embedding.reason})` : ""}`
    );
  } catch (err) {
    console.error(
      `[catalog] Embeddings refresh failed for ${dataSourceId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Ensure the data catalog is populated for a data source.
 * If the catalog is empty, auto-triggers schema discovery based on the data
 * source type. Returns true if catalog has entries after the check.
 */
export async function ensureCatalogPopulated(
  dataSourceId: string
): Promise<boolean> {
  const supabase = createAdminClient();

  // Quick check — does catalog already have entries?
  const { count } = await supabase
    .from("data_catalog")
    .select("id", { count: "exact", head: true })
    .eq("data_source_id", dataSourceId);

  if (count && count > 0) return true;

  console.log(
    `[catalog] Auto-discovering schema for data source ${dataSourceId}...`
  );

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("*, data_source_type:data_source_types (*)")
    .eq("id", dataSourceId)
    .single();

  if (!dataSource) {
    console.error(`[catalog] Data source ${dataSourceId} not found`);
    return false;
  }

  const typeSlug = dataSource.data_source_type?.slug;

  try {
    if (typeSlug === "databricks") {
      const config = dataSource.connection_config as DatabricksConfig;
      await analyzeDatabricksSource(dataSourceId, config);
    } else if (typeSlug === "postgresql" || typeSlug === "supabase-bc") {
      const config = dataSource.connection_config as PostgresConfig;
      await analyzePostgresSource(dataSourceId, config);
    } else {
      console.log(
        `[catalog] Auto-discover not supported for type: ${typeSlug}`
      );
      return false;
    }
    console.log(
      `[catalog] Auto-discovery complete for data source ${dataSourceId}`
    );
    return true;
  } catch (err) {
    console.error(
      `[catalog] Auto-discovery failed for ${dataSourceId}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Returns the full catalog for a data source, ordered by table and column.
 */
export async function getCatalogForSource(
  dataSourceId: string
): Promise<CatalogEntry[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("data_catalog")
    .select("*")
    .eq("data_source_id", dataSourceId)
    .order("table_name", { ascending: true })
    .order("ordinal_position", { ascending: true });

  if (error) {
    throw new Error(`Catalog ophalen mislukt: ${error.message}`);
  }

  return (data as CatalogEntry[]) || [];
}

/**
 * Returns a human-readable text summary of all tables and columns,
 * suitable for including in an AI prompt.
 */
export async function getCatalogSummary(
  dataSourceId: string
): Promise<string> {
  const entries = await getCatalogForSource(dataSourceId);
  return formatCatalogSummary(entries);
}

/**
 * Focused summary: only includes the tables listed in `tables`. Used by the
 * AI chat route after semantic retrieval has narrowed the catalog to the
 * top-K relevant tables for the user's question.
 */
export async function getFocusedCatalogSummary(
  dataSourceId: string,
  tables: { schema_name: string; table_name: string }[]
): Promise<string> {
  if (tables.length === 0) return getCatalogSummary(dataSourceId);
  const keys = new Set(tables.map((t) => `${t.schema_name}.${t.table_name}`));
  const entries = (await getCatalogForSource(dataSourceId)).filter((e) =>
    keys.has(`${e.schema_name}.${e.table_name}`)
  );
  return formatCatalogSummary(entries);
}

function formatCatalogSummary(entries: CatalogEntry[]): string {
  if (entries.length === 0) {
    return "Geen catalogus beschikbaar voor deze databron. Mogelijk moet de catalog eerst worden geanalyseerd.";
  }

  const tables = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const key = `${entry.catalog_name}.${entry.schema_name}.${entry.table_name}`;
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key)!.push(entry);
  }

  const lines: string[] = [];
  for (const [tableFqn, columns] of tables) {
    const first = columns[0];
    const tableHeader = first.table_description
      ? `Tabel: ${tableFqn} — ${first.table_description}`
      : `Tabel: ${tableFqn}`;
    lines.push(tableHeader);

    for (const col of columns) {
      let line = `  - ${col.column_name} (${col.column_type})`;
      const description =
        col.semantic_description || col.column_description || null;
      if (description) line += ` - ${description}`;
      if (
        col.sample_values &&
        Array.isArray(col.sample_values) &&
        col.sample_values.length > 0
      ) {
        const samples = col.sample_values
          .slice(0, 3)
          .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
          .join(", ");
        line += ` - Voorbeelden: ${samples}`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
