#!/usr/bin/env node
/**
 * AI-enrichment of data_catalog rows for the BC-Supabase data source.
 *
 * - Groups catalog by table
 * - Runs Claude Opus 4.7 per table in parallel (bounded concurrency)
 * - Writes semantic_description + semantic_description_source='ai-generated'
 * - After enrichment, rebuilds the catalog_embeddings so the vectors reflect
 *   the richer AI descriptions.
 *
 * Usage: node scripts/bc-enrich.mjs [--concurrency=8] [--limit=N] [--force]
 *
 * Env (.env.local):
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFile } from "fs/promises";
import { createHash } from "crypto";

const DATA_SOURCE_ID = "0c7218cc-22e1-4c53-8f16-a5e97e20d542";
const ENRICH_MODEL = "claude-opus-4-7";
const EMBED_MODEL = "text-embedding-3-small";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_CONCURRENCY = 8;
const OPENAI_BATCH = 96;
const EMBEDDING_UPSERT_CHUNK = 50;
const MAX_RETRIES = 4;
const COLUMNS_PER_CALL = 60;
const ANTHROPIC_MAX_TOKENS = 8192;

// ---------- env ----------
async function loadEnvLocal() {
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // optional
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} ontbreekt in .env.local / environment`);
  return v;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { concurrency: DEFAULT_CONCURRENCY, limit: null, force: false };
  for (const a of args) {
    if (a === "--force") out.force = true;
    else if (a.startsWith("--concurrency=")) out.concurrency = Number(a.split("=")[1]) || DEFAULT_CONCURRENCY;
    else if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]) || null;
  }
  return out;
}

// ---------- Supabase helpers ----------
function supaHeaders() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function supaUrl(path) {
  const base = requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  return `${base}/rest/v1/${path}`;
}

async function fetchCatalog() {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const res = await fetch(
      supaUrl(
        `data_catalog?data_source_id=eq.${DATA_SOURCE_ID}&select=id,schema_name,table_name,column_name,column_type,column_description,table_description,sample_values,ordinal_position,semantic_description,semantic_description_source&order=table_name.asc,ordinal_position.asc&limit=${pageSize}&offset=${offset}`
      ),
      { headers: supaHeaders() }
    );
    if (!res.ok) throw new Error(`Catalog fetch ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function updateSemantic(rowId, description) {
  const res = await fetch(
    supaUrl(`data_catalog?id=eq.${rowId}`),
    {
      method: "PATCH",
      headers: { ...supaHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        semantic_description: description,
        semantic_description_source: "ai-generated",
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Update ${rowId} ${res.status}: ${await res.text()}`);
  }
}

async function supaUpsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const res = await fetch(
    supaUrl(`${table}?on_conflict=${onConflict}`),
    {
      method: "POST",
      headers: {
        ...supaHeaders(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) {
    throw new Error(`Upsert ${table} ${res.status}: ${await res.text()}`);
  }
}

// ---------- Anthropic ----------
function detectBC(entries) {
  const names = new Set(entries.map((e) => e.table_name.toLowerCase()));
  const hits = [
    "gl_entry",
    "general_ledger_entry",
    "general_ledger_entries",
    "customer",
    "vendor",
    "vendors",
    "customers",
    "sales_invoice_header",
    "sales_invoices",
    "item_ledger_entry",
    "items",
  ].filter((h) => names.has(h)).length;
  return hits >= 2;
}

function buildPromptForTable(tableKey, cols, isBC) {
  const first = cols[0];
  const bcContext = isBC
    ? `\nDeze database is een Business Central sync. Let op BC-conventies:\n- Posting_Date = boekdatum, Document_Date = factuurdatum\n- LCY = lokale valuta (Amount vs Amount_LCY)\n- G/L = General Ledger (grootboek)\n- No_ is vaak identifier/nummer\n- Blocked-velden duiden op geblokkeerde records`
    : "";

  const colList = cols
    .map((c) => {
      const samples = Array.isArray(c.sample_values)
        ? c.sample_values.slice(0, 3).map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" | ")
        : "(geen)";
      const existing = c.column_description ? ` [comment: ${c.column_description}]` : "";
      return `- ${c.column_name} (${c.column_type})${existing} voorbeelden: ${samples}`;
    })
    .join("\n");

  return `Je analyseert één tabel uit een bedrijfsdatabase. Schrijf voor ELKE kolom een korte (max 15 woorden) Nederlandse business-beschrijving die uitlegt WAT dit betekent voor een zakelijke gebruiker — niet wat het technisch is.

Regels:
- Geen vakjargon, een manager moet het snappen.
- Gebruik nooit de technische veldnaam in de beschrijving.
- Voor technische identifiers (rowversion, systemId, GUID primary keys, synced_at, sync_source): schrijf letterlijk "Technische identifier — niet relevant voor gebruikers."
- Retourneer UITSLUITEND een JSON-array: [{"column":"...","description":"..."},...]. Geen uitleg eromheen, geen markdown fences.${bcContext}

Tabel: ${tableKey}${first.table_description ? ` — ${first.table_description}` : ""}
Kolommen:
${colList}`;
}

async function anthropicCall(prompt, attempt = 0) {
  const key = requireEnv("ANTHROPIC_API_KEY");
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ENRICH_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      // Retry on 429 / 5xx
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const wait = 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        return anthropicCall(prompt, attempt + 1);
      }
      throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
    }
    const body = await res.json();
    const block = body.content?.find?.((b) => b.type === "text");
    return block?.text ?? "";
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const wait = 2000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return anthropicCall(prompt, attempt + 1);
    }
    throw err;
  }
}

function extractJsonArray(text) {
  if (!text) return null;
  const m = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ---------- OpenAI embeddings ----------
async function openaiEmbedBatch(inputs, attempt = 0) {
  const key = requireEnv("OPENAI_API_KEY");
  if (inputs.length === 0) return [];
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const wait = 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        return openaiEmbedBatch(inputs, attempt + 1);
      }
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
    }
    const body = await res.json();
    return [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const wait = 2000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return openaiEmbedBatch(inputs, attempt + 1);
    }
    throw err;
  }
}

async function embedMany(inputs) {
  const out = [];
  for (let i = 0; i < inputs.length; i += OPENAI_BATCH) {
    const slice = inputs.slice(i, i + OPENAI_BATCH);
    const v = await openaiEmbedBatch(slice);
    out.push(...v);
    process.stdout.write(
      `\r[rebuild-embed] ${Math.min(i + OPENAI_BATCH, inputs.length)}/${inputs.length}`
    );
  }
  process.stdout.write("\n");
  return out;
}

function buildTableDocument({
  schema_name,
  table_name,
  table_description,
  columns,
}) {
  const parts = [`Tabel: ${schema_name}.${table_name}`];
  if (table_description) parts.push(`Omschrijving: ${table_description}`);
  if (columns.length > 0) {
    parts.push("Kolommen:");
    for (const c of columns.slice(0, 40)) {
      let line = `- ${c.column_name} (${c.column_type})`;
      const desc = c.semantic_description || c.column_description;
      if (desc) line += `: ${desc}`;
      if (Array.isArray(c.sample_values) && c.sample_values.length > 0) {
        const s = c.sample_values
          .slice(0, 3)
          .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
          .join(", ");
        line += ` [bv. ${s}]`;
      }
      parts.push(line);
    }
  }
  return parts.join("\n");
}

function hashContent(s) {
  return createHash("sha256").update(s).digest("hex");
}

// ---------- concurrency pool ----------
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function runOne() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err.message };
      }
      done++;
      process.stdout.write(`\r[enrich] ${done}/${items.length}`);
    }
  }
  const workers = Array(Math.min(concurrency, items.length)).fill(0).map(() => runOne());
  await Promise.all(workers);
  process.stdout.write("\n");
  return results;
}

// ---------- main ----------
async function main() {
  await loadEnvLocal();
  const { concurrency, limit, force } = parseArgs();

  requireEnv("ANTHROPIC_API_KEY");
  requireEnv("OPENAI_API_KEY");
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`[enrich] concurrency=${concurrency} limit=${limit ?? "all"} force=${force} model=${ENRICH_MODEL}`);

  console.log("[enrich] Fetching catalog...");
  const catalog = await fetchCatalog();
  console.log(`[enrich] Catalog rows: ${catalog.length}`);

  const byTable = new Map();
  for (const r of catalog) {
    const key = `${r.schema_name}.${r.table_name}`;
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(r);
  }
  const isBC = detectBC(catalog);
  console.log(`[enrich] Tables: ${byTable.size}, BC-mode: ${isBC}`);

  let tableEntries = [...byTable.entries()];
  if (!force) {
    const before = tableEntries.length;
    tableEntries = tableEntries.filter(([, cols]) =>
      cols.some(
        (c) =>
          !c.semantic_description ||
          c.semantic_description_source === "ai-generated"
      )
    );
    if (before !== tableEntries.length) {
      console.log(`[enrich] Skipped ${before - tableEntries.length} tables (already curated)`);
    }
  }
  if (limit) tableEntries = tableEntries.slice(0, limit);

  let tablesProcessed = 0;
  let columnsUpdated = 0;
  let tablesFailed = 0;

  // Split wide tables into smaller column-chunks so Claude can return complete JSON.
  const workUnits = [];
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
  console.log(`[enrich] Work units (table chunks): ${workUnits.length}`);

  const processedTables = new Set();
  const failedUnits = [];

  await runPool(
    workUnits,
    async (unit) => {
      const { tableKey, cols, chunkIdx, chunkCount } = unit;
      const title = chunkCount > 1 ? `${tableKey} [${chunkIdx + 1}/${chunkCount}]` : tableKey;
      const prompt = buildPromptForTable(title, cols, isBC);
      const text = await anthropicCall(prompt);
      const arr = extractJsonArray(text);
      if (!arr) {
        failedUnits.push(title);
        return { tableKey, error: "no-json" };
      }

      let updates = 0;
      for (const entry of arr) {
        if (typeof entry?.column !== "string" || typeof entry?.description !== "string") continue;
        const target = cols.find((c) => c.column_name === entry.column);
        if (!target) continue;
        try {
          await updateSemantic(target.id, entry.description.trim());
          updates++;
        } catch (err) {
          console.error(`\n[enrich] update failed for ${tableKey}.${entry.column}:`, err.message);
        }
      }
      processedTables.add(tableKey);
      columnsUpdated += updates;
      return { tableKey, updates };
    },
    concurrency
  );
  tablesProcessed = processedTables.size;
  tablesFailed = failedUnits.length;
  if (failedUnits.length > 0) {
    console.log(`[enrich] Failed chunks: ${failedUnits.slice(0, 10).join(", ")}${failedUnits.length > 10 ? " ..." : ""}`);
  }

  console.log(`[enrich] Done: tables=${tablesProcessed}, columns=${columnsUpdated}, failed=${tablesFailed}`);

  // ---- rebuild embeddings with the new descriptions ----
  console.log("[rebuild-embed] Re-fetching catalog with enriched descriptions...");
  const refreshed = await fetchCatalog();
  const refreshedByTable = new Map();
  for (const r of refreshed) {
    const key = `${r.schema_name}.${r.table_name}`;
    if (!refreshedByTable.has(key)) refreshedByTable.set(key, []);
    refreshedByTable.get(key).push(r);
  }

  const docs = [...refreshedByTable.entries()].map(([, rows]) => {
    const first = rows[0];
    return {
      schema_name: first.schema_name,
      table_name: first.table_name,
      document: buildTableDocument({
        schema_name: first.schema_name,
        table_name: first.table_name,
        table_description: first.table_description,
        columns: rows,
      }),
    };
  });

  console.log(`[rebuild-embed] Embedding ${docs.length} documents...`);
  const vectors = await embedMany(docs.map((d) => d.document));
  const rows = docs.map((d, i) => ({
    data_source_id: DATA_SOURCE_ID,
    schema_name: d.schema_name,
    table_name: d.table_name,
    content: d.document,
    content_hash: hashContent(d.document),
    embedding: vectors[i],
    model: EMBED_MODEL,
    updated_at: new Date().toISOString(),
  }));

  console.log("[rebuild-embed] Upserting...");
  for (let i = 0; i < rows.length; i += EMBEDDING_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + EMBEDDING_UPSERT_CHUNK);
    await supaUpsert("catalog_embeddings", chunk, "data_source_id,schema_name,table_name");
    process.stdout.write(`\r[rebuild-embed] upsert ${Math.min(i + EMBEDDING_UPSERT_CHUNK, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
  console.log("[rebuild-embed] Done.");
}

main().catch((err) => {
  console.error("\n[enrich] FAILED:", err);
  process.exit(1);
});
