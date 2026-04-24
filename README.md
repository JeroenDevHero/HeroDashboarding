# Hero Dashboards

AI-powered dashboard platform replacing Klipfolio for Hero employees.

## Tech Stack

- **Frontend:** Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Database:** Supabase (PostgreSQL 17 + RLS)
- **Deployment:** Railway (Docker)
- **AI:** Anthropic Claude API

## Supported Data Sources

- **Business Central (Supabase)** — direct Postgres connection to the BC-synced Supabase project
- **PostgreSQL** — generic Postgres
- **Databricks** — SQL warehouses

## Business Central integration — how the AI "understands" the data

End-users never need to know the underlying schema. Six layers cooperate:

1. **Data catalog** (`data_catalog`) — every table/column is auto-discovered, with sample values and DB-comment descriptions. The Postgres analyzer scans the whole configured schema by default; leave the optional table-prefix filter empty unless you really want to restrict it.
2. **Semantic retrieval** (`catalog_embeddings` + pgvector) — each table is embedded as a document (name + description + columns + samples) using OpenAI `text-embedding-3-small`. At chat time the user's question is embedded and the top-K most relevant tables are injected into Claude's prompt. This keeps the prompt small even when the source has hundreds of tables, and avoids Fivetran-style duplicate tables drowning out the canonical ones.
3. **Column statistics** (`column_stats`) — distincts, null rates, min/max/avg, top-10 values per column (Databricks only by default; Postgres is opt-in because per-column queries on hundreds of tables are expensive).
4. **Semantic layer** (`semantic_entities`) — hand-curated business concepts ("Omzet", "Debiteurenstand") with SQL templates. Manage these at `/semantics`. The AI prefers a matching concept over self-constructing SQL.
5. **AI-generated column descriptions** — the "Verrijk" button on the datasources page lets Claude rewrite every column's description in plain Dutch. BC-specific conventions (No_, LCY, Posting Date, company-prefixing) are detected automatically.
6. **Feedback loop** — 👍/👎 on every assistant reply updates `query_patterns.quality_score`, and patterns with negative score are excluded from future AI context.

Query patterns and knowledge entries continue to grow over time, so the system gets smarter as it's used.

### Enabling semantic retrieval

Set `OPENAI_API_KEY` in your environment (local `.env.local` and on Railway). Without it:

- Catalog discovery still works (the app just skips the embeddings step).
- The AI chat falls back to injecting the **full** catalog into every prompt, which only scales to a few dozen tables.

Re-run "Catalog" on a data source whenever you add/rename/remove tables — embeddings are rebuilt incrementally (content-hashed, so unchanged tables are skipped).

## Getting Started

```bash
cp .env.example .env.local
# Fill in the environment variables
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Adding the Business Central Supabase source

1. Create a **read-only Postgres role** in the BC-Supabase project (with `SELECT` grants on the schemas you want to expose).
2. In the app, navigate to **Databronnen → Nieuwe databron** and pick _Business Central (Supabase)_.
3. Paste the pooler connection string (session mode, port 5432 for long-lived server sockets; 6543 also works) and submit. Leave the table-prefix filter empty so the analyzer picks up every table.
4. Click **Test** — a successful test auto-discovers the full catalog and, if `OPENAI_API_KEY` is set, builds embeddings for all tables.
5. Click **Verrijk** to generate Dutch business descriptions for every column (optional but recommended — embeddings get much richer this way, so re-run "Catalog" afterwards to refresh them).
6. Open **Business-concepten** in the sidebar and add a couple of key concepts (Omzet, Marge, Debiteurenstand, ...). These drastically improve answer quality.

## Database migrations

Migrations live under `supabase/migrations/`. Apply via the Supabase CLI:

```bash
supabase db push
```
