import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";

export interface CatalogEntry {
  id: string;
  data_source_id: string;
  catalog_name: string;
  schema_name: string;
  table_name: string;
  column_name: string;
  column_type: string;
  column_description: string | null;
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

  if (entries.length === 0) {
    return "Geen catalogus beschikbaar voor deze databron. Mogelijk moet de catalog eerst worden geanalyseerd.";
  }

  // Group by table
  const tables = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const key = `${entry.catalog_name}.${entry.schema_name}.${entry.table_name}`;
    if (!tables.has(key)) {
      tables.set(key, []);
    }
    tables.get(key)!.push(entry);
  }

  const lines: string[] = [];
  for (const [tableFqn, columns] of tables) {
    lines.push(`Tabel: ${tableFqn}`);
    for (const col of columns) {
      let line = `  - ${col.column_name} (${col.column_type})`;
      if (col.column_description) {
        line += ` - ${col.column_description}`;
      }
      if (col.sample_values && Array.isArray(col.sample_values) && col.sample_values.length > 0) {
        const samples = col.sample_values
          .slice(0, 3)
          .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
          .join(", ");
        line += ` - Voorbeelden: ${samples}`;
      }
      lines.push(line);
    }
    lines.push(""); // blank line between tables
  }

  return lines.join("\n").trim();
}
