import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CatalogEntry } from "@/lib/datasources/catalog";

const ENRICH_MODEL = "claude-opus-4-7";
/**
 * Max output tokens per Claude call. 4096 is too small for wide BC tables
 * (the JSON array gets cut off mid-object → parse fails → zero columns
 * updated for that chunk). 8192 matches the proven CLI script.
 */
const ANTHROPIC_MAX_TOKENS = 8192;
/**
 * Split a single table into sub-prompts of at most this many columns. Keeps
 * every response well within the token budget and makes wide tables
 * parallelizable across workers.
 */
const COLUMNS_PER_CALL = 60;
/** How many Anthropic calls run in parallel. Same default as bc-enrich.mjs. */
const DEFAULT_CONCURRENCY = 6;
/** Retries for 429 / 5xx. Exponential backoff: 2s, 4s, 8s, 16s. */
const MAX_RETRIES = 4;

interface WorkUnit {
  tableKey: string;
  cols: CatalogEntry[];
  chunkIdx: number;
  chunkCount: number;
}

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
  title: string,
  entries: CatalogEntry[],
  isBC: boolean,
  companies: string[]
): string {
  const first = entries[0];

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
- Retourneer UITSLUITEND een JSON-array in de vorm [{"column":"...","description":"..."},...] — geen uitleg eromheen, geen markdown fences.
${bcContext}

Tabel: ${title}${first.table_description ? ` — ${first.table_description}` : ""}
Kolommen:
${columnList}`;
}

async function anthropicCall(
  client: Anthropic,
  prompt: string,
  attempt = 0
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  } catch (err: unknown) {
    // Retry on 429 / 5xx or transient network errors.
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    const retriable = status === 429 || (typeof status === "number" && status >= 500) || status === undefined;
    if (retriable && attempt < MAX_RETRIES) {
      const wait = 2000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return anthropicCall(client, prompt, attempt + 1);
    }
    throw err;
  }
}

function extractJsonArray(
  text: string
): Array<{ column: string; description: string }> | null {
  if (!text) return null;
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (x) =>
        x &&
        typeof x.column === "string" &&
        typeof x.description === "string"
    );
  } catch {
    return null;
  }
}

/**
 * Bounded-concurrency async worker pool. Much cheaper than spinning up N
 * Promise.all groups of the entire work list, and guarantees we never exceed
 * `concurrency` in-flight Anthropic calls.
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runOne = async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        console.error(
          `[enrichment] Worker failed on item ${idx}:`,
          err instanceof Error ? err.message : err
        );
        results[idx] = undefined as unknown as R;
      }
    }
  };
  const workers = Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(() => runOne());
  await Promise.all(workers);
  return results;
}

/**
 * Run AI enrichment across every table in the data_catalog for a data source.
 * Writes semantic_description + semantic_description_source = 'ai-generated'.
 * Skips rows that already have a human-curated description.
 *
 * Architecture mirrors scripts/bc-enrich.mjs:
 *   - Wide tables are chunked into blocks of COLUMNS_PER_CALL columns so
 *     the JSON response never truncates.
 *   - Chunks run with bounded concurrency (default 6) so 500+ tables finish
 *     in minutes rather than hours.
 *   - 8192 output tokens matches what the CLI uses successfully.
 *   - Exponential backoff retries absorb transient 429/5xx errors.
 */
export async function enrichCatalogWithAI(
  dataSourceId: string,
  options: { force?: boolean; concurrency?: number } = {}
): Promise<{ tablesProcessed: number; columnsUpdated: number; failedChunks: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is niet geconfigureerd");
  }
  const supabase = createAdminClient();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

  // Paginate — the RLS-bypassing admin client still honours PostgREST's
  // default row ceiling (1000), so we need to loop until drained.
  const entries: CatalogEntry[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("data_catalog")
      .select("*")
      .eq("data_source_id", dataSourceId)
      .order("table_name")
      .order("ordinal_position")
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`Catalog-fetch mislukt: ${error.message}`);
    }
    const batch = (data as CatalogEntry[] | null) ?? [];
    entries.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  if (entries.length === 0) {
    return { tablesProcessed: 0, columnsUpdated: 0, failedChunks: 0 };
  }

  const { isBC, companies } = detectBusinessCentralSignals(entries);

  const byTable = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    const key = `${e.schema_name}.${e.table_name}`;
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key)!.push(e);
  }

  let tableEntries = [...byTable.entries()];
  if (!options.force) {
    // Skip tables where every column has a non-AI description (human /
    // db-comment curated). Partially-enriched tables stay in the queue so
    // new or cleared columns still get processed.
    const before = tableEntries.length;
    tableEntries = tableEntries.filter(([, cols]) =>
      cols.some(
        (c) =>
          !c.semantic_description ||
          c.semantic_description_source === "ai-generated"
      )
    );
    if (before !== tableEntries.length) {
      console.log(
        `[enrichment] Skipping ${before - tableEntries.length} fully-curated tables`
      );
    }
  }

  // Split wide tables into smaller column-chunks so Claude can return complete JSON.
  const workUnits: WorkUnit[] = [];
  for (const [tableKey, cols] of tableEntries) {
    if (cols.length <= COLUMNS_PER_CALL) {
      workUnits.push({ tableKey, cols, chunkIdx: 0, chunkCount: 1 });
    } else {
      const totalChunks = Math.ceil(cols.length / COLUMNS_PER_CALL);
      for (let i = 0; i < cols.length; i += COLUMNS_PER_CALL) {
        workUnits.push({
          tableKey,
          cols: cols.slice(i, i + COLUMNS_PER_CALL),
          chunkIdx: Math.floor(i / COLUMNS_PER_CALL),
          chunkCount: totalChunks,
        });
      }
    }
  }

  console.log(
    `[enrichment] Source ${dataSourceId}: ${tableEntries.length} tables, ${workUnits.length} chunks, concurrency=${concurrency}, BC=${isBC}`
  );

  const anthropic = new Anthropic();
  const processedTables = new Set<string>();
  let columnsUpdated = 0;
  let failedChunks = 0;
  let finishedUnits = 0;
  const startMs = Date.now();

  await runPool(workUnits, concurrency, async (unit) => {
    const { tableKey, cols, chunkIdx, chunkCount } = unit;
    const title =
      chunkCount > 1 ? `${tableKey} [${chunkIdx + 1}/${chunkCount}]` : tableKey;
    const prompt = buildPromptForTable(title, cols, isBC, companies);

    let text: string;
    try {
      text = await anthropicCall(anthropic, prompt);
    } catch (err) {
      failedChunks++;
      console.error(
        `[enrichment] Anthropic call failed for ${title}:`,
        err instanceof Error ? err.message : err
      );
      finishedUnits++;
      return;
    }

    const arr = extractJsonArray(text);
    if (!arr) {
      failedChunks++;
      console.warn(`[enrichment] Could not parse JSON for ${title}`);
      finishedUnits++;
      return;
    }

    let localUpdates = 0;
    for (const entry of arr) {
      const target = cols.find((c) => c.column_name === entry.column);
      if (!target) continue;

      const { error } = await supabase
        .from("data_catalog")
        .update({
          semantic_description: entry.description.trim(),
          semantic_description_source: "ai-generated",
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);

      if (!error) localUpdates++;
    }

    processedTables.add(tableKey);
    columnsUpdated += localUpdates;
    finishedUnits++;

    if (finishedUnits % 10 === 0 || finishedUnits === workUnits.length) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      console.log(
        `[enrichment] ${finishedUnits}/${workUnits.length} chunks · ${columnsUpdated} cols · ${elapsed}s elapsed`
      );
    }
  });

  console.log(
    `[enrichment] Done: ${processedTables.size} tables, ${columnsUpdated} columns, ${failedChunks} failed chunks (source ${dataSourceId})`
  );
  return {
    tablesProcessed: processedTables.size,
    columnsUpdated,
    failedChunks,
  };
}
