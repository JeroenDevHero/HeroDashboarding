import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeDatabricksQuery,
  type DatabricksConfig,
} from "@/lib/datasources/databricks";
import {
  executePostgresQuery,
  quoteIdent,
  type PostgresConfig,
} from "@/lib/datasources/postgres";
import { getCatalogForSource } from "@/lib/datasources/catalog";

// ---------------------------------------------------------------------------
// SQL Parsing helpers (simple regex-based)
// ---------------------------------------------------------------------------

function extractTablesFromSQL(sql: string): string[] {
  const tables = new Set<string>();
  // Match FROM and JOIN clauses
  const fromJoinRegex = /(?:FROM|JOIN)\s+([`"]?[\w.]+[`"]?)/gi;
  let match: RegExpExecArray | null;
  while ((match = fromJoinRegex.exec(sql)) !== null) {
    const table = match[1].replace(/[`"]/g, "").trim();
    if (table.length > 0) tables.add(table);
  }
  return Array.from(tables);
}

function extractColumnsFromSQL(sql: string): string[] {
  const columns = new Set<string>();
  // Match column names from SELECT, WHERE, GROUP BY, ORDER BY, HAVING
  // Remove subqueries first to avoid picking up nested column refs
  const cleaned = sql.replace(/\(SELECT[^)]*\)/gi, "");

  // SELECT columns (between SELECT and FROM)
  const selectMatch = cleaned.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (selectMatch) {
    const selectPart = selectMatch[1];
    // Split by comma, extract column names (handle aliases, functions)
    const parts = selectPart.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed === "*") continue;
      // If it has an alias (AS ...), get the source column
      const asMatch = trimmed.match(/^(.+?)\s+(?:AS\s+)?["'`]?(\w+)["'`]?\s*$/i);
      // Extract bare column names (possibly with table prefix)
      const colMatch = trimmed.match(/(?:[\w.]+\.)?(\w+)\s*$/);
      if (asMatch) {
        // Try to extract column from function like SUM(col)
        const funcColMatch = asMatch[1].match(/\(([`"]?[\w.]+[`"]?)\)/);
        if (funcColMatch) {
          const col = funcColMatch[1].replace(/[`"]/g, "").split(".").pop();
          if (col) columns.add(col);
        } else {
          const col = asMatch[1].replace(/[`"]/g, "").split(".").pop();
          if (col) columns.add(col);
        }
      } else if (colMatch) {
        columns.add(colMatch[1]);
      }
    }
  }

  // WHERE columns
  const whereMatch = cleaned.match(/WHERE\s+([\s\S]*?)(?:GROUP|ORDER|HAVING|LIMIT|$)/i);
  if (whereMatch) {
    const whereColRegex = /(?:[\w.]+\.)?(\w+)\s*(?:=|!=|<|>|<=|>=|LIKE|IN|IS|BETWEEN)/gi;
    let wm: RegExpExecArray | null;
    while ((wm = whereColRegex.exec(whereMatch[1])) !== null) {
      columns.add(wm[1]);
    }
  }

  // GROUP BY columns
  const groupByMatch = cleaned.match(/GROUP\s+BY\s+([\s\S]*?)(?:HAVING|ORDER|LIMIT|$)/i);
  if (groupByMatch) {
    const parts = groupByMatch[1].split(",");
    for (const part of parts) {
      const col = part.trim().replace(/[`"]/g, "").split(".").pop();
      if (col && /^\w+$/.test(col)) columns.add(col);
    }
  }

  return Array.from(columns);
}

function extractAggregationsFromSQL(sql: string): string[] {
  const aggs = new Set<string>();
  const aggRegex = /\b(COUNT|SUM|AVG|MAX|MIN)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = aggRegex.exec(sql)) !== null) {
    aggs.add(match[1].toUpperCase());
  }
  return Array.from(aggs);
}

/**
 * Simple similarity check: do two strings share >50% of their words?
 */
function isSimilarNaturalLanguage(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const similarity = overlap / Math.max(wordsA.size, wordsB.size);
  return similarity > 0.5;
}

// ---------------------------------------------------------------------------
// Auto-learn from klip creation
// ---------------------------------------------------------------------------

export async function learnFromKlipCreation(params: {
  dataSourceId: string;
  naturalLanguage: string;
  sqlQuery: string;
  klipType: string;
  config: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminClient();

  const tablesUsed = extractTablesFromSQL(params.sqlQuery);
  const columnsUsed = extractColumnsFromSQL(params.sqlQuery);
  const aggregations = extractAggregationsFromSQL(params.sqlQuery);

  // Check for existing similar pattern (same tables_used and similar natural_language)
  const { data: existing } = await supabase
    .from("query_patterns")
    .select("id, natural_language, use_count")
    .eq("data_source_id", params.dataSourceId)
    .contains("tables_used", tablesUsed);

  let matched = false;
  if (existing && existing.length > 0) {
    for (const row of existing) {
      if (
        tablesUsed.length > 0 &&
        isSimilarNaturalLanguage(row.natural_language, params.naturalLanguage)
      ) {
        // Increment use_count for existing pattern
        await supabase
          .from("query_patterns")
          .update({
            use_count: (row.use_count || 1) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        matched = true;
        break;
      }
    }
  }

  if (!matched) {
    // Insert new pattern
    await supabase.from("query_patterns").insert({
      data_source_id: params.dataSourceId,
      natural_language: params.naturalLanguage,
      sql_query: params.sqlQuery,
      tables_used: tablesUsed,
      columns_used: columnsUsed,
      aggregations,
      klip_type: params.klipType,
      config: params.config,
      use_count: 1,
      last_used_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Analyze column statistics
// ---------------------------------------------------------------------------

export async function analyzeColumnStats(
  dataSourceId: string,
  config: DatabricksConfig,
  tableName: string
): Promise<void> {
  const supabase = createAdminClient();

  // Get column info from catalog
  const catalog = await getCatalogForSource(dataSourceId);
  const tableColumns = catalog.filter((c) => c.table_name === tableName);

  if (tableColumns.length === 0) return;

  // Build the fully qualified table name
  const firstCol = tableColumns[0];
  const fqn = `${firstCol.catalog_name}.${firstCol.schema_name}.${firstCol.table_name}`;

  for (const col of tableColumns) {
    const colName = col.column_name;
    const colType = col.column_type.toLowerCase();

    try {
      const isNumeric =
        colType.includes("int") ||
        colType.includes("float") ||
        colType.includes("double") ||
        colType.includes("decimal") ||
        colType.includes("numeric") ||
        colType.includes("bigint") ||
        colType.includes("smallint") ||
        colType.includes("tinyint");

      let statsRow: Record<string, unknown>;

      if (isNumeric) {
        // Numeric column: get distinct count, null count, total, min, max, avg
        const rows = await executeDatabricksQuery(
          config,
          `SELECT
            COUNT(DISTINCT \`${colName}\`) AS distinct_count,
            COUNT(*) - COUNT(\`${colName}\`) AS null_count,
            COUNT(*) AS total_count,
            CAST(MIN(\`${colName}\`) AS STRING) AS min_value,
            CAST(MAX(\`${colName}\`) AS STRING) AS max_value,
            CAST(AVG(\`${colName}\`) AS STRING) AS avg_value
          FROM ${fqn}`,
          1
        );

        if (rows.length === 0) continue;
        const r = rows[0];

        statsRow = {
          data_source_id: dataSourceId,
          table_name: tableName,
          column_name: colName,
          column_type: col.column_type,
          distinct_count: Number(r.distinct_count) || 0,
          null_count: Number(r.null_count) || 0,
          total_count: Number(r.total_count) || 0,
          min_value: r.min_value != null ? String(r.min_value) : null,
          max_value: r.max_value != null ? String(r.max_value) : null,
          avg_value: r.avg_value != null ? String(r.avg_value) : null,
          top_values: null,
          analyzed_at: new Date().toISOString(),
        };
      } else {
        // String / other column: get distinct count, null count, total, top 10 values
        const countRows = await executeDatabricksQuery(
          config,
          `SELECT
            COUNT(DISTINCT \`${colName}\`) AS distinct_count,
            COUNT(*) - COUNT(\`${colName}\`) AS null_count,
            COUNT(*) AS total_count
          FROM ${fqn}`,
          1
        );

        if (countRows.length === 0) continue;
        const cr = countRows[0];

        // Top 10 most common values
        let topValues: { value: string; count: number }[] = [];
        try {
          const topRows = await executeDatabricksQuery(
            config,
            `SELECT CAST(\`${colName}\` AS STRING) AS val, COUNT(*) AS cnt
            FROM ${fqn}
            WHERE \`${colName}\` IS NOT NULL
            GROUP BY \`${colName}\`
            ORDER BY cnt DESC
            LIMIT 10`,
            10
          );
          topValues = topRows.map((r) => ({
            value: String(r.val),
            count: Number(r.cnt),
          }));
        } catch {
          // Skip top values if the query fails
        }

        statsRow = {
          data_source_id: dataSourceId,
          table_name: tableName,
          column_name: colName,
          column_type: col.column_type,
          distinct_count: Number(cr.distinct_count) || 0,
          null_count: Number(cr.null_count) || 0,
          total_count: Number(cr.total_count) || 0,
          min_value: null,
          max_value: null,
          avg_value: null,
          top_values: topValues.length > 0 ? topValues : null,
          analyzed_at: new Date().toISOString(),
        };
      }

      // Upsert into column_stats
      const { error } = await supabase.from("column_stats").upsert(statsRow, {
        onConflict: "data_source_id,table_name,column_name",
      });

      if (error) {
        console.error(
          `[intelligence] Failed to upsert column_stats for ${tableName}.${colName}:`,
          error.message
        );
      }
    } catch (err) {
      console.error(
        `[intelligence] Error analyzing column ${tableName}.${colName}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Postgres column statistics
// ---------------------------------------------------------------------------

/**
 * Detect whether a Postgres data_type is numeric for statistics purposes.
 */
function isPostgresNumericType(t: string): boolean {
  const lt = t.toLowerCase();
  return (
    lt.includes("int") ||
    lt.includes("numeric") ||
    lt.includes("decimal") ||
    lt.includes("real") ||
    lt.includes("double") ||
    lt.includes("float") ||
    lt === "money"
  );
}

/**
 * Analyze per-column distribution / range / top-values for a Postgres table.
 * Mirrors analyzeColumnStats (Databricks) but uses information_schema
 * quoting and PG-native casts.
 */
export async function analyzePostgresColumnStats(
  dataSourceId: string,
  config: PostgresConfig,
  schemaName: string,
  tableName: string
): Promise<void> {
  const supabase = createAdminClient();
  const catalog = await getCatalogForSource(dataSourceId);
  const tableColumns = catalog.filter(
    (c) => c.schema_name === schemaName && c.table_name === tableName
  );
  if (tableColumns.length === 0) return;

  const fqn = `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;

  for (const col of tableColumns) {
    const colName = col.column_name;
    const quotedCol = quoteIdent(colName);
    const isNumeric = isPostgresNumericType(col.column_type);

    try {
      let statsRow: Record<string, unknown>;

      if (isNumeric) {
        const rows = await executePostgresQuery(
          config,
          `SELECT
             COUNT(DISTINCT ${quotedCol}) AS distinct_count,
             COUNT(*) - COUNT(${quotedCol}) AS null_count,
             COUNT(*) AS total_count,
             MIN(${quotedCol})::text AS min_value,
             MAX(${quotedCol})::text AS max_value,
             AVG(${quotedCol})::text AS avg_value
           FROM ${fqn}`,
          1
        );

        if (rows.length === 0) continue;
        const r = rows[0];

        statsRow = {
          data_source_id: dataSourceId,
          table_name: tableName,
          column_name: colName,
          column_type: col.column_type,
          distinct_count: Number(r.distinct_count) || 0,
          null_count: Number(r.null_count) || 0,
          total_count: Number(r.total_count) || 0,
          min_value: r.min_value != null ? String(r.min_value) : null,
          max_value: r.max_value != null ? String(r.max_value) : null,
          avg_value: r.avg_value != null ? String(r.avg_value) : null,
          top_values: null,
          analyzed_at: new Date().toISOString(),
        };
      } else {
        const countRows = await executePostgresQuery(
          config,
          `SELECT
             COUNT(DISTINCT ${quotedCol}) AS distinct_count,
             COUNT(*) - COUNT(${quotedCol}) AS null_count,
             COUNT(*) AS total_count
           FROM ${fqn}`,
          1
        );
        if (countRows.length === 0) continue;
        const cr = countRows[0];

        let topValues: { value: string; count: number }[] = [];
        try {
          const topRows = await executePostgresQuery(
            config,
            `SELECT ${quotedCol}::text AS val, COUNT(*)::int AS cnt
             FROM ${fqn}
             WHERE ${quotedCol} IS NOT NULL
             GROUP BY ${quotedCol}
             ORDER BY cnt DESC
             LIMIT 10`,
            10
          );
          topValues = topRows.map((r) => ({
            value: String(r.val),
            count: Number(r.cnt),
          }));
        } catch {
          // top values are best-effort
        }

        statsRow = {
          data_source_id: dataSourceId,
          table_name: tableName,
          column_name: colName,
          column_type: col.column_type,
          distinct_count: Number(cr.distinct_count) || 0,
          null_count: Number(cr.null_count) || 0,
          total_count: Number(cr.total_count) || 0,
          min_value: null,
          max_value: null,
          avg_value: null,
          top_values: topValues.length > 0 ? topValues : null,
          analyzed_at: new Date().toISOString(),
        };
      }

      const { error } = await supabase.from("column_stats").upsert(statsRow, {
        onConflict: "data_source_id,table_name,column_name",
      });
      if (error) {
        console.error(
          `[intelligence] Failed to upsert Postgres column_stats for ${tableName}.${colName}:`,
          error.message
        );
      }
    } catch (err) {
      console.error(
        `[intelligence] Error analyzing Postgres column ${tableName}.${colName}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Get intelligence summary for AI context
// ---------------------------------------------------------------------------

export async function getDataIntelligence(
  dataSourceId: string
): Promise<string> {
  const supabase = createAdminClient();
  const lines: string[] = [];

  // 1. Popular query patterns — filter out patterns that have received more
  // thumbs-down than thumbs-up (quality_score < 0) so they stop polluting the
  // AI context after users have flagged them.
  const { data: patterns } = await supabase
    .from("query_patterns")
    .select(
      "natural_language, sql_query, tables_used, klip_type, use_count, quality_score"
    )
    .eq("data_source_id", dataSourceId)
    .gte("quality_score", 0)
    .order("quality_score", { ascending: false })
    .order("use_count", { ascending: false })
    .limit(10);

  if (patterns && patterns.length > 0) {
    lines.push("=== Populaire query-patronen ===");
    for (const p of patterns) {
      lines.push(`- "${p.natural_language}" (${p.use_count}x gebruikt)`);
      lines.push(`  Type: ${p.klip_type} | Tabellen: ${(p.tables_used || []).join(", ")}`);
      lines.push(`  SQL: ${p.sql_query}`);
      lines.push("");
    }
  } else {
    lines.push("=== Populaire query-patronen ===");
    lines.push("Nog geen patronen opgeslagen. Deze worden automatisch geleerd bij klip-creatie.");
    lines.push("");
  }

  // 2. Column statistics summary
  const { data: stats } = await supabase
    .from("column_stats")
    .select("*")
    .eq("data_source_id", dataSourceId)
    .order("table_name", { ascending: true })
    .order("column_name", { ascending: true });

  if (stats && stats.length > 0) {
    lines.push("=== Kolom-statistieken ===");

    // Group by table
    const byTable = new Map<string, typeof stats>();
    for (const s of stats) {
      const key = s.table_name;
      if (!byTable.has(key)) byTable.set(key, []);
      byTable.get(key)!.push(s);
    }

    for (const [tableName, columns] of byTable) {
      lines.push(`Tabel: ${tableName}`);
      for (const col of columns) {
        let line = `  - ${col.column_name} (${col.column_type}): ${col.distinct_count} unieke waarden, ${col.total_count} rijen`;
        if (col.null_count > 0) {
          const nullPct = ((col.null_count / col.total_count) * 100).toFixed(1);
          line += `, ${nullPct}% null`;
        }
        if (col.min_value != null && col.max_value != null) {
          line += ` | bereik: ${col.min_value} - ${col.max_value}`;
        }
        if (col.avg_value != null) {
          line += ` | gem: ${col.avg_value}`;
        }
        if (col.top_values && Array.isArray(col.top_values) && col.top_values.length > 0) {
          const topStr = col.top_values
            .slice(0, 5)
            .map((tv: { value: string; count: number }) => `${tv.value} (${tv.count}x)`)
            .join(", ");
          line += ` | top waarden: ${topStr}`;
        }
        lines.push(line);
      }
      lines.push("");
    }
  } else {
    lines.push("=== Kolom-statistieken ===");
    lines.push("Nog geen kolom-statistieken beschikbaar. Deze worden automatisch gegenereerd bij catalog-analyse.");
    lines.push("");
  }

  return lines.join("\n").trim();
}
