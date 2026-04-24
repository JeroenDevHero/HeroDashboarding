#!/usr/bin/env node
/**
 * One-shot catalog + embedding sync for the BC-Supabase data source.
 *
 * Pipeline:
 *   1. Connect to BC-Supabase via pg and discover every public table (except
 *      patterns listed in EXCLUDED_PATTERNS) plus 3 sample rows per table.
 *   2. Upsert data_catalog rows in the app-Supabase via PostgREST (service role).
 *   3. Embed each table document via OpenAI text-embedding-3-small.
 *   4. Upsert catalog_embeddings rows via PostgREST.
 *
 * Usage: node scripts/bc-sync.mjs [--skip-embeddings]
 *
 * Required env (.env.local):
 *   OPENAI_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { Client, types } from "pg";
import { readFile } from "fs/promises";
import { createHash } from "crypto";

types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1184, (v) => v);

// ---------- config ----------
const DATA_SOURCE_ID = "0c7218cc-22e1-4c53-8f16-a5e97e20d542";
const CATALOG_NAME = "bc_supabase";
const BC_CONNECTION_STRING =
  "postgres://dashboard_ro.sxkhvoatilklmhknpral:d0b058419c8e4d7bca413194a66f19cca2a4b6e91153890d@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
const SCHEMAS = ["public"];
const EXCLUDED_PATTERNS = ["bc_fivetran_%"];
const CATALOG_UPSERT_CHUNK = 500;
const EMBEDDING_UPSERT_CHUNK = 50;
const OPENAI_BATCH = 96;
const MAX_TEXT_SAMPLE_LENGTH = 400;

// ---------- env loading ----------
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

// ---------- OpenAI ----------
async function openaiEmbedBatch(inputs) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (inputs.length === 0) return [];
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: inputs }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }
  const body = await res.json();
  return [...body.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function embedMany(inputs) {
  const out = [];
  for (let i = 0; i < inputs.length; i += OPENAI_BATCH) {
    const slice = inputs.slice(i, i + OPENAI_BATCH);
    const vectors = await openaiEmbedBatch(slice);
    out.push(...vectors);
    process.stdout.write(
      `\r[embed] ${Math.min(i + OPENAI_BATCH, inputs.length)}/${inputs.length}`
    );
  }
  process.stdout.write("\n");
  return out;
}

// ---------- Supabase REST ----------
function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL ontbreekt");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ontbreekt");
  return { url: url.replace(/\/+$/, ""), key };
}

async function supabaseUpsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const { url, key } = supabaseConfig();
  const endpoint = `${url}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase upsert ${table} ${res.status}: ${t.slice(0, 400)}`);
  }
}

async function supabaseDelete(table, filter) {
  const { url, key } = supabaseConfig();
  const endpoint = `${url}/rest/v1/${table}?${filter}`;
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase delete ${table} ${res.status}: ${t.slice(0, 400)}`);
  }
}

// ---------- doc building ----------
function sampleToText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length > MAX_TEXT_SAMPLE_LENGTH
      ? value.slice(0, MAX_TEXT_SAMPLE_LENGTH) + "…"
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const s = JSON.stringify(value);
    return s.length > MAX_TEXT_SAMPLE_LENGTH
      ? s.slice(0, MAX_TEXT_SAMPLE_LENGTH) + "…"
      : s;
  } catch {
    return String(value);
  }
}

function buildTableDocument({
  schema_name,
  table_name,
  table_description,
  columns,
}) {
  const parts = [];
  parts.push(`Tabel: ${schema_name}.${table_name}`);
  if (table_description) parts.push(`Omschrijving: ${table_description}`);
  if (columns.length > 0) {
    parts.push("Kolommen:");
    for (const c of columns.slice(0, 40)) {
      let line = `- ${c.column_name} (${c.column_type})`;
      if (c.description) line += `: ${c.description}`;
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

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

// ---------- catalog discovery ----------
async function discoverSchema(client) {
  const params = [SCHEMAS];
  const conds = [
    "c.table_schema = ANY($1::text[])",
    "t.table_type IN ('BASE TABLE', 'VIEW')",
  ];
  for (const pattern of EXCLUDED_PATTERNS) {
    params.push(pattern);
    conds.push(`c.table_name NOT LIKE $${params.length}`);
  }
  const sql = `
    SELECT
      c.table_schema, c.table_name, c.column_name, c.data_type,
      c.is_nullable = 'YES' AS is_nullable, c.ordinal_position,
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
    WHERE ${conds.join(" AND ")}
    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
  `;
  const { rows } = await client.query(sql, params);
  return rows;
}

async function sampleTable(client, schema, table) {
  const id = `"${schema.replace(/"/g, '""')}"."${table.replace(/"/g, '""')}"`;
  try {
    const { rows } = await client.query(`SELECT * FROM ${id} LIMIT 3`);
    return rows;
  } catch (err) {
    console.error(`[sample] ${schema}.${table} failed:`, err.message);
    return [];
  }
}

// ---------- main ----------
async function main() {
  await loadEnvLocal();
  supabaseConfig(); // throw early if missing

  const skipEmbeddings = process.argv.includes("--skip-embeddings");

  const client = new Client({
    connectionString: BC_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    query_timeout: 60_000,
  });

  console.log("[bc-sync] Connecting to BC-Supabase...");
  await client.connect();
  await client.query("BEGIN READ ONLY");

  console.log("[bc-sync] Discovering schema...");
  const columns = await discoverSchema(client);
  const tableMap = new Map();
  for (const col of columns) {
    const key = `${col.table_schema}.${col.table_name}`;
    if (!tableMap.has(key)) {
      tableMap.set(key, {
        table_schema: col.table_schema,
        table_name: col.table_name,
        table_description: col.table_description,
        columns: [],
      });
    }
    tableMap.get(key).columns.push(col);
  }
  const tables = [...tableMap.values()];
  console.log(
    `[bc-sync] Discovered ${tables.length} tables, ${columns.length} columns`
  );

  console.log("[bc-sync] Sampling tables...");
  const sampleMap = new Map();
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const samples = await sampleTable(client, t.table_schema, t.table_name);
    sampleMap.set(`${t.table_schema}.${t.table_name}`, samples);
    if ((i + 1) % 25 === 0 || i === tables.length - 1) {
      process.stdout.write(`\r[sample] ${i + 1}/${tables.length}`);
    }
  }
  process.stdout.write("\n");

  await client.query("COMMIT");
  await client.end();

  // ---- clear existing rows for this data source ----
  console.log("[bc-sync] Clearing old catalog + embeddings...");
  await supabaseDelete(
    "data_catalog",
    `data_source_id=eq.${DATA_SOURCE_ID}`
  );
  await supabaseDelete(
    "catalog_embeddings",
    `data_source_id=eq.${DATA_SOURCE_ID}`
  );

  // ---- build catalog rows ----
  console.log("[bc-sync] Building catalog rows...");
  const catalogRows = [];
  for (const t of tables) {
    const samples = sampleMap.get(`${t.table_schema}.${t.table_name}`) || [];
    for (const col of t.columns) {
      const values = samples
        .map((row) => row[col.column_name])
        .filter((v) => v !== null && v !== undefined);
      catalogRows.push({
        data_source_id: DATA_SOURCE_ID,
        catalog_name: CATALOG_NAME,
        schema_name: t.table_schema,
        table_name: t.table_name,
        column_name: col.column_name,
        column_type: col.data_type,
        column_description: col.column_description,
        table_description: t.table_description,
        sample_values: values.length > 0 ? values.map(sampleToText) : null,
        is_nullable: col.is_nullable,
        ordinal_position: col.ordinal_position,
      });
    }
  }
  console.log(`[bc-sync] Catalog rows to upsert: ${catalogRows.length}`);

  for (let i = 0; i < catalogRows.length; i += CATALOG_UPSERT_CHUNK) {
    const chunk = catalogRows.slice(i, i + CATALOG_UPSERT_CHUNK);
    await supabaseUpsert(
      "data_catalog",
      chunk,
      "data_source_id,catalog_name,schema_name,table_name,column_name"
    );
    process.stdout.write(
      `\r[catalog] ${Math.min(i + CATALOG_UPSERT_CHUNK, catalogRows.length)}/${catalogRows.length}`
    );
  }
  process.stdout.write("\n");

  if (skipEmbeddings) {
    console.log("[bc-sync] --skip-embeddings: done");
    return;
  }

  // ---- build documents + embeddings ----
  console.log("[bc-sync] Building documents for embedding...");
  const docs = tables.map((t) => {
    const samples = sampleMap.get(`${t.table_schema}.${t.table_name}`) || [];
    return {
      schema_name: t.table_schema,
      table_name: t.table_name,
      document: buildTableDocument({
        schema_name: t.table_schema,
        table_name: t.table_name,
        table_description: t.table_description,
        columns: t.columns.map((c) => ({
          column_name: c.column_name,
          column_type: c.data_type,
          description: c.column_description,
          sample_values: samples
            .map((row) => row[c.column_name])
            .filter((v) => v !== null && v !== undefined)
            .map(sampleToText),
        })),
      }),
    };
  });

  console.log(`[bc-sync] Embedding ${docs.length} documents...`);
  const vectors = await embedMany(docs.map((d) => d.document));

  const embeddingRows = docs.map((d, i) => ({
    data_source_id: DATA_SOURCE_ID,
    schema_name: d.schema_name,
    table_name: d.table_name,
    content: d.document,
    content_hash: hashContent(d.document),
    embedding: vectors[i],
    model: "text-embedding-3-small",
  }));

  console.log("[bc-sync] Upserting embeddings...");
  for (let i = 0; i < embeddingRows.length; i += EMBEDDING_UPSERT_CHUNK) {
    const chunk = embeddingRows.slice(i, i + EMBEDDING_UPSERT_CHUNK);
    await supabaseUpsert(
      "catalog_embeddings",
      chunk,
      "data_source_id,schema_name,table_name"
    );
    process.stdout.write(
      `\r[embeddings] ${Math.min(i + EMBEDDING_UPSERT_CHUNK, embeddingRows.length)}/${embeddingRows.length}`
    );
  }
  process.stdout.write("\n");

  console.log("[bc-sync] Done.");
}

main().catch((err) => {
  console.error("\n[bc-sync] FAILED:", err);
  process.exit(1);
});
