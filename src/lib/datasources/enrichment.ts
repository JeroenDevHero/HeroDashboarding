import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CatalogEntry } from "@/lib/datasources/catalog";

const ENRICH_MODEL = "claude-opus-4-6";

/**
 * Heuristics for detecting a Business-Central-style schema, so we can give
 * Claude stronger hints about common BC conventions (No_, flowfields,
 * company-prefixing, $-escaping, etc.).
 */
function detectBusinessCentralSignals(entries: CatalogEntry[]): {
  isBC: boolean;
  companies: string[];
} {
  const tableNames = new Set(entries.map((e) => e.table_name.toLowerCase()));
  const hints = [
    "g_l entry",
    "g_l_entry",
    "gl_entry",
    "general_ledger_entry",
    "customer",
    "vendor",
    "sales invoice header",
    "sales_invoice_header",
    "item ledger entry",
    "item_ledger_entry",
    "posting_date",
    "posting date",
  ];
  let hits = 0;
  for (const h of hints) {
    if (tableNames.has(h)) hits++;
  }

  // BC on Supabase typically syncs tables like `CompanyName$Table$Name` or
  // prefixes them with `company_`. Detect both.
  const companies = new Set<string>();
  for (const e of entries) {
    const m = e.table_name.match(/^([A-Za-z0-9_]+)\$/);
    if (m) companies.add(m[1]);
    const m2 = e.table_name.match(/^company_([a-z0-9_]+)__/);
    if (m2) companies.add(m2[1]);
  }

  return {
    isBC: hits >= 2 || companies.size > 0,
    companies: Array.from(companies),
  };
}

/**
 * Group catalog entries by table and produce a prompt describing one table
 * at a time, so the Claude call stays within token limits and returns
 * deterministic results per table.
 */
function buildPromptForTable(
  entries: CatalogEntry[],
  isBC: boolean,
  companies: string[]
): string {
  const first = entries[0];
  const fqn = `${first.schema_name}.${first.table_name}`;

  const bcContext = isBC
    ? `
Deze database is een Business Central sync. Houd rekening met BC-conventies:
- Veldnamen eindigen vaak op een underscore (bijv. "No_" = nummer/identifier)
- Spaties in BC-veldnamen worden underscores (bijv. "Document Type" → Document_Type)
- Bedragen zijn vaak in LCY (Local Currency)
- "Posting Date" = boekdatum, "Document Date" = factuurdatum
- "Posted" of "Invoiced Quantity > 0" = verwerkte / afgeronde record
${
  companies.length > 0
    ? `- Er zijn meerdere bedrijven gedetecteerd: ${companies.join(", ")}. Dit wordt meestal gefilterd met company_name of table-prefix.`
    : ""
}`
    : "";

  const columnList = entries
    .map((col) => {
      const samples =
        col.sample_values && Array.isArray(col.sample_values)
          ? col.sample_values.slice(0, 3).map((v) => JSON.stringify(v)).join(", ")
          : "(geen voorbeelden)";
      const existing = col.column_description
        ? ` [bestaande comment: ${col.column_description}]`
        : "";
      return `- ${col.column_name} (${col.column_type})${existing} | voorbeelden: ${samples}`;
    })
    .join("\n");

  return `Je analyseert één tabel uit een bedrijfsdatabase. Schrijf voor ELKE kolom een korte (max 15 woorden) Nederlandse business-beschrijving die uitlegt WAT dit betekent voor een zakelijke gebruiker, niet wat het technisch is.

Regels:
- Geen vakjargon. Een manager moet het kunnen begrijpen.
- Gebruik nooit de technische veldnaam in de beschrijving.
- Als de kolom duidelijk een interne ID is (zoals rowversion, systemId, primary_key GUIDs), schrijf: "Technische identifier — niet relevant voor gebruikers."
- Retourneer UITSLUITEND een JSON-array in de vorm [{"column":"...","description":"..."},...] — geen uitleg eromheen.
${bcContext}

Tabel: ${fqn}${first.table_description ? ` — ${first.table_description}` : ""}
Kolommen:
${columnList}`;
}

async function runTableEnrichment(
  client: Anthropic,
  entries: CatalogEntry[],
  isBC: boolean,
  companies: string[]
): Promise<{ column: string; description: string }[]> {
  const prompt = buildPromptForTable(entries, isBC, companies);

  const response = await client.messages.create({
    model: ENRICH_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];
  const raw = textBlock.text.trim();

  // The model usually returns a JSON array directly, but occasionally wraps
  // it in ```json fences. Handle both.
  const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      column: string;
      description: string;
    }>;
    return parsed.filter(
      (x) => typeof x.column === "string" && typeof x.description === "string"
    );
  } catch (err) {
    console.warn(`[enrichment] Could not parse JSON for table:`, err);
    return [];
  }
}

/**
 * Run AI enrichment across every table in the data_catalog for a data source.
 * Writes semantic_description + semantic_description_source = 'ai-generated'.
 * Skips rows that already have a human-curated description.
 */
export async function enrichCatalogWithAI(
  dataSourceId: string,
  options: { force?: boolean } = {}
): Promise<{ tablesProcessed: number; columnsUpdated: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is niet geconfigureerd");
  }
  const supabase = createAdminClient();

  const { data: catalog } = await supabase
    .from("data_catalog")
    .select("*")
    .eq("data_source_id", dataSourceId)
    .order("table_name")
    .order("ordinal_position");

  if (!catalog || catalog.length === 0) {
    return { tablesProcessed: 0, columnsUpdated: 0 };
  }

  const entries = catalog as CatalogEntry[];
  const { isBC, companies } = detectBusinessCentralSignals(entries);

  // Group by table
  const byTable = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const key = `${e.schema_name}.${e.table_name}`;
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key)!.push(e);
  }

  const anthropic = new Anthropic();
  let columnsUpdated = 0;
  let tablesProcessed = 0;

  // Process tables sequentially to respect API rate limits
  for (const [tableKey, tableCols] of byTable) {
    // Skip if all columns already have a non-AI description unless forced
    if (!options.force) {
      const allCurated = tableCols.every(
        (c) =>
          c.semantic_description &&
          c.semantic_description_source &&
          c.semantic_description_source !== "ai-generated"
      );
      if (allCurated) continue;
    }

    try {
      const results = await runTableEnrichment(
        anthropic,
        tableCols,
        isBC,
        companies
      );

      for (const r of results) {
        const target = tableCols.find((c) => c.column_name === r.column);
        if (!target) continue;

        const { error } = await supabase
          .from("data_catalog")
          .update({
            semantic_description: r.description,
            semantic_description_source: "ai-generated",
            updated_at: new Date().toISOString(),
          })
          .eq("id", target.id);

        if (!error) columnsUpdated++;
      }
      tablesProcessed++;
    } catch (err) {
      console.error(
        `[enrichment] Failed for ${tableKey}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[enrichment] Done: ${tablesProcessed} tables, ${columnsUpdated} columns updated (source ${dataSourceId})`
  );
  return { tablesProcessed, columnsUpdated };
}
