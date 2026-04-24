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

End-users never need to know the underlying schema. Five layers cooperate:

1. **Data catalog** (`data_catalog`) — every table/column is auto-discovered, with sample values and DB-comment descriptions.
2. **Column statistics** (`column_stats`) — distincts, null rates, min/max/avg, top-10 values per column.
3. **Semantic layer** (`semantic_entities`) — hand-curated business concepts ("Omzet", "Debiteurenstand") with SQL templates. Manage these at `/semantics`. The AI prefers a matching concept over self-constructing SQL.
4. **AI-generated column descriptions** — the "Verrijk" button on the datasources page lets Claude rewrite every column's description in plain Dutch. BC-specific conventions (No_, LCY, Posting Date, company-prefixing) are detected automatically.
5. **Feedback loop** — 👍/👎 on every assistant reply updates `query_patterns.quality_score`, and patterns with negative score are excluded from future AI context.

Query patterns and knowledge entries continue to grow over time, so the system gets smarter as it's used.

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
3. Paste the pooler connection string (port 6543 is recommended) and submit.
4. Click **Test** — a successful test auto-discovers the full catalog.
5. Click **Verrijk** to generate Dutch business descriptions for every column (optional but recommended).
6. Open **Business-concepten** in the sidebar and add a couple of key concepts (Omzet, Marge, Debiteurenstand, ...). These drastically improve answer quality.

## Database migrations

Migrations live under `supabase/migrations/`. Apply via the Supabase CLI:

```bash
supabase db push
```
