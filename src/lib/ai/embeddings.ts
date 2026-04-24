import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// OpenAI embeddings client
// ---------------------------------------------------------------------------
//
// We use OpenAI's text-embedding-3-small model (1536 dims) because:
//   • it is multilingual (handles Dutch questions → English table names)
//   • it is cheap (~$0.02 per 1M tokens)
//   • 1536 dims matches the pgvector column in catalog_embeddings
//
// If OPENAI_API_KEY is not set, embedding functions throw a clear error so
// the catalog analyzer can keep running (just without the semantic-retrieval
// layer). The AI chat route then falls back to the full catalog summary.
// ---------------------------------------------------------------------------

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

/** Maximum inputs OpenAI accepts per /embeddings request. */
const OPENAI_BATCH_SIZE = 96;

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage?: { prompt_tokens: number; total_tokens: number };
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY ontbreekt. Voeg de key toe aan je omgevingsvariabelen om semantic retrieval te activeren."
    );
  }
  return key;
}

/** Raw OpenAI call for a batch of strings. */
async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const apiKey = getApiKey();

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenAI embeddings request faalde (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const body = (await res.json()) as OpenAIEmbeddingResponse;
  // Sort results by index to guarantee order (OpenAI promises it but be safe).
  const sorted = [...body.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Embed an arbitrary list of strings, batching transparently to stay inside
 * OpenAI's 96-inputs-per-request limit.
 */
export async function embedMany(inputs: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < inputs.length; i += OPENAI_BATCH_SIZE) {
    const slice = inputs.slice(i, i + OPENAI_BATCH_SIZE);
    const batch = await embedBatch(slice);
    results.push(...batch);
  }
  return results;
}

export async function embedOne(input: string): Promise<number[]> {
  const [vector] = await embedMany([input]);
  return vector;
}

// ---------------------------------------------------------------------------
// Content hashing — skip re-embedding unchanged tables
// ---------------------------------------------------------------------------

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Document construction — what we actually embed per table
// ---------------------------------------------------------------------------

export interface CatalogTableDocumentInput {
  schema_name: string;
  table_name: string;
  table_description?: string | null;
  columns: {
    column_name: string;
    column_type: string;
    description?: string | null;
    sample_values?: unknown[] | null;
  }[];
}

/**
 * Build the natural-language document that represents a table, which is what
 * we actually pass to the embedding model. We include:
 *   - table name (unmodified, so lexical matches also help)
 *   - table description
 *   - up to 40 columns with name, type, description and a handful of samples
 *
 * Columns beyond 40 are truncated to keep the document within a few hundred
 * tokens — embeddings beyond that add diminishing returns.
 */
export function buildTableDocument(
  input: CatalogTableDocumentInput
): string {
  const parts: string[] = [];
  parts.push(`Tabel: ${input.schema_name}.${input.table_name}`);
  if (input.table_description) {
    parts.push(`Omschrijving: ${input.table_description}`);
  }

  const topColumns = input.columns.slice(0, 40);
  if (topColumns.length > 0) {
    parts.push("Kolommen:");
    for (const c of topColumns) {
      let line = `- ${c.column_name} (${c.column_type})`;
      if (c.description) line += `: ${c.description}`;
      if (Array.isArray(c.sample_values) && c.sample_values.length > 0) {
        const sample = c.sample_values
          .slice(0, 3)
          .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
          .join(", ");
        line += ` [bv. ${sample}]`;
      }
      parts.push(line);
    }
  }

  return parts.join("\n");
}
