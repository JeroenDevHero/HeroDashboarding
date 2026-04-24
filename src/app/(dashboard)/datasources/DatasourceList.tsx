"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { testDataSourceConnection, deleteDataSource } from "@/lib/actions/datasource";
import type { CatalogStats } from "@/lib/datasources/stats";

interface Datasource {
  id: string;
  name: string;
  type_id: string;
  description?: string | null;
  is_active: boolean;
  last_refresh_status?: string | null;
  last_refresh_at?: string | null;
  connection_config?: Record<string, unknown> | null;
  updated_at?: string | null;
  created_at?: string | null;
  data_source_type?: { id: string; name: string; slug: string } | null;
}

interface DatasourceListProps {
  datasources: Datasource[];
  initialStats: CatalogStats[];
}

const typeLabels: Record<string, string> = {
  "supabase-bc": "Business Central (Supabase)",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  rest_api: "REST API",
  google_sheets: "Google Sheets",
  csv: "CSV",
  databricks: "Databricks",
};

const statusVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  success: "success",
  pending: "warning",
  error: "error",
};

const statusLabels: Record<string, string> = {
  success: "Verbonden",
  pending: "In afwachting",
  error: "Fout",
};

/** Poll cadence while an enrichment job appears to be running. */
const POLL_INTERVAL_MS = 4000;
/**
 * Consider enrichment "currently running" when the most recent AI update is
 * within this window. Anthropic Opus calls can easily take 30-60s per wide
 * table, so we keep the window generous. Anything older than this gets
 * treated as a stale job and polling stops.
 */
const LIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
/**
 * Grace period right after the user clicks Verrijk / Catalog. Keeps the
 * spinner up even before the first row is written, in case the very first
 * Claude call is slow.
 */
const CLICK_GRACE_MS = 30 * 1000; // 30 seconds
/** Hard ceiling — never poll longer than this after a Verrijk click. */
const MAX_POLL_DURATION_MS = 60 * 60 * 1000; // 1 hour

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "net nu";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s geleden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  return `${d} dag${d === 1 ? "" : "en"} geleden`;
}

interface EnrichmentProgressProps {
  stats: CatalogStats | undefined;
  isRunning: boolean;
}

function EnrichmentProgress({ stats, isRunning }: EnrichmentProgressProps) {
  if (!stats || stats.total_tables === 0) {
    return (
      <div className="text-[11px] text-hero-grey-regular">
        Nog geen catalog — klik <span className="font-medium">Catalog</span> om
        tabellen te ontdekken.
      </div>
    );
  }

  const tablesPct =
    stats.total_tables > 0
      ? Math.min(100, Math.round((stats.ai_enriched_tables / stats.total_tables) * 100))
      : 0;

  const colsPct =
    stats.total_columns > 0
      ? Math.min(100, Math.round((stats.ai_enriched_columns / stats.total_columns) * 100))
      : 0;

  const done =
    stats.ai_enriched_tables >= stats.total_tables && stats.total_tables > 0;

  const barColor = done
    ? "bg-emerald-500"
    : isRunning
      ? "bg-hero-blue"
      : "bg-amber-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[11px] text-hero-grey-regular">
        <span className="font-medium text-hero-grey-black">
          {stats.ai_enriched_tables}/{stats.total_tables} tabellen
        </span>
        <span>·</span>
        <span>
          {stats.ai_enriched_columns}/{stats.total_columns} kolommen ({colsPct}%)
        </span>
        {isRunning && !done && (
          <span className="inline-flex items-center gap-1 text-hero-blue">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-hero-blue opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-hero-blue" />
            </span>
            bezig
          </span>
        )}
        {done && (
          <span className="text-emerald-600">✓ compleet</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-hero-grey-light">
        <div
          className={`h-full transition-all duration-500 ${barColor}`}
          style={{ width: `${tablesPct}%` }}
        />
      </div>
      {stats.last_enriched_at && (
        <div className="text-[10px] text-hero-grey-regular">
          Laatst verrijkt: {formatRelativeTime(stats.last_enriched_at)}
          {stats.embeddings_count > 0 && (
            <>
              {" · "}
              {stats.embeddings_count} embeddings
            </>
          )}
        </div>
      )}
      {!stats.last_enriched_at && stats.embeddings_count > 0 && (
        <div className="text-[10px] text-hero-grey-regular">
          {stats.embeddings_count} embeddings · nog niet verrijkt
        </div>
      )}
    </div>
  );
}

export default function DatasourceList({
  datasources,
  initialStats,
}: DatasourceListProps) {
  const router = useRouter();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, { status: string; message: string }>
  >({});
  const [catalogRefreshingId, setCatalogRefreshingId] = useState<string | null>(null);
  const [catalogResult, setCatalogResult] = useState<
    Record<string, { status: string; message: string }>
  >({});
  const [enrichStartedAt, setEnrichStartedAt] = useState<Record<string, number>>({});
  const [enrichError, setEnrichError] = useState<Record<string, string>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [stats, setStats] = useState<Record<string, CatalogStats>>(() => {
    const map: Record<string, CatalogStats> = {};
    for (const s of initialStats) map[s.data_source_id] = s;
    return map;
  });
  /**
   * Re-evaluate "is this source currently running?" on every tick even if
   * the stats response is byte-identical. Without this, `isRunning` would
   * stay stuck on `true` once last_enriched_at crosses the LIVE_WINDOW_MS
   * boundary, because nothing else would re-render the row.
   */
  const [tick, setTick] = useState(0);

  const ids = useMemo(() => datasources.map((d) => d.id), [datasources]);

  const fetchStats = useCallback(async () => {
    if (ids.length === 0) return;
    try {
      const res = await fetch(
        `/api/datasources/catalog-stats?ids=${ids.join(",")}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const body = (await res.json()) as { stats: CatalogStats[] };
      setStats((prev) => {
        const next = { ...prev };
        for (const s of body.stats) next[s.data_source_id] = s;
        return next;
      });
    } catch (err) {
      console.warn("[DatasourceList] stats poll failed:", err);
    }
  }, [ids]);

  /**
   * Derive active set from the server-side truth (last_enriched_at) instead
   * of local click-state. This means the "bezig"-indicator:
   *   - survives a page refresh while enrichment is running on the server,
   *   - stops automatically ~2 min after the last update, with no idle-
   *     counter heuristics that can mis-fire on slow Opus calls.
   * Local `enrichStartedAt` is only used for the 30s grace window right
   * after a click, before the first row lands in the DB.
   */
  const activeIds = useMemo(() => {
    const now = Date.now();
    return ids.filter((id) => {
      const startedAt = enrichStartedAt[id];
      if (startedAt && now - startedAt < CLICK_GRACE_MS) return true;
      if (startedAt && now - startedAt > MAX_POLL_DURATION_MS) return false;

      const s = stats[id];
      if (!s?.last_enriched_at) return false;
      const lastMs = new Date(s.last_enriched_at).getTime();
      if (Number.isNaN(lastMs)) return false;
      return now - lastMs < LIVE_WINDOW_MS;
    });
  }, [ids, enrichStartedAt, stats]);

  useEffect(() => {
    if (activeIds.length === 0) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      void fetchStats();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeIds, fetchStats]);

  // Keep the tick var from being flagged as unused by the compiler; it only
  // exists to force `activeIds` to re-compute on each poll.
  void tick;

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const result = await testDataSourceConnection(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: { status: result.status, message: result.message },
      }));
      router.refresh();
      // Connection test triggers a fresh catalog analyze → pick up new totals.
      void fetchStats();
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          message: err instanceof Error ? err.message : "Verbinding mislukt",
        },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleCatalogRefresh(id: string) {
    setCatalogRefreshingId(id);
    try {
      const res = await fetch("/api/datasources/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_source_id: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCatalogResult((prev) => ({
          ...prev,
          [id]: { status: "error", message: data.error || "Catalog verversen mislukt" },
        }));
      } else {
        setCatalogResult((prev) => ({
          ...prev,
          [id]: { status: "success", message: "Catalog wordt geanalyseerd..." },
        }));
        // Treat catalog refresh like enrichment for polling purposes — totals
        // and embeddings will shift for a few minutes.
        setEnrichStartedAt((prev) => ({ ...prev, [id]: Date.now() }));
        void fetchStats();
      }
    } catch (err) {
      setCatalogResult((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          message: err instanceof Error ? err.message : "Catalog verversen mislukt",
        },
      }));
    } finally {
      setCatalogRefreshingId(null);
    }
  }

  async function handleEnrich(id: string) {
    setEnrichError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch("/api/datasources/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_source_id: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnrichError((prev) => ({
          ...prev,
          [id]: data.error || "Verrijking starten mislukt",
        }));
        return;
      }
      setEnrichStartedAt((prev) => ({ ...prev, [id]: Date.now() }));
      void fetchStats();
    } catch (err) {
      setEnrichError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Verrijking starten mislukt",
      }));
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDataSource(deleteId);
    } catch {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hero-grey-light bg-hero-blue-hairline/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-hero-grey-regular">
                Naam
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-hero-grey-regular">
                Type
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-hero-grey-regular">
                Status
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-hero-grey-regular">
                Verrijking
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium text-hero-grey-regular">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {datasources.map((ds) => {
              const sourceStats = stats[ds.id];
              const isRunning = activeIds.includes(ds.id);
              return (
                <tr
                  key={ds.id}
                  className="border-b border-hero-grey-light/50 last:border-0 align-top"
                >
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-hero-grey-black">{ds.name}</p>
                      {ds.description && (
                        <p className="mt-0.5 text-xs text-hero-grey-regular">
                          {ds.description}
                        </p>
                      )}
                      {ds.last_refresh_at && (
                        <p className="mt-0.5 text-[11px] text-hero-grey-regular">
                          Laatst getest:{" "}
                          {new Date(ds.last_refresh_at).toLocaleString("nl-NL")}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="info">
                      {ds.data_source_type?.name ||
                        typeLabels[ds.type_id] ||
                        ds.type_id}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          statusVariant[ds.last_refresh_status ?? "pending"] ??
                          "warning"
                        }
                      >
                        {statusLabels[ds.last_refresh_status ?? "pending"] ||
                          ds.last_refresh_status ||
                          "Onbekend"}
                      </Badge>
                      {ds.is_active ? (
                        <span className="text-[11px] text-emerald-600">
                          Actief
                        </span>
                      ) : (
                        <span className="text-[11px] text-hero-grey-regular">
                          Inactief
                        </span>
                      )}
                    </div>
                    {testResult[ds.id] && (
                      <p
                        className={`mt-1 text-[11px] ${
                          testResult[ds.id].status === "success"
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        {testResult[ds.id].message}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3" style={{ minWidth: 240 }}>
                    <EnrichmentProgress stats={sourceStats} isRunning={isRunning} />
                    {enrichError[ds.id] && (
                      <p className="mt-1 text-[11px] text-red-500">
                        {enrichError[ds.id]}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="sync"
                        loading={testingId === ds.id}
                        onClick={() => handleTest(ds.id)}
                      >
                        Test
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="sync"
                        loading={catalogRefreshingId === ds.id}
                        onClick={() => handleCatalogRefresh(ds.id)}
                      >
                        Catalog
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="auto_awesome"
                        loading={isRunning}
                        onClick={() => handleEnrich(ds.id)}
                        title="Gebruik AI om business-beschrijvingen voor alle kolommen te genereren"
                      >
                        Verrijk
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="delete"
                        onClick={() => setDeleteId(ds.id)}
                      />
                    </div>
                    {catalogResult[ds.id] && (
                      <p
                        className={`mt-1 text-[11px] text-right ${
                          catalogResult[ds.id].status === "success"
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        {catalogResult[ds.id].message}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={deleteId !== null}
        onClose={() => {
          setDeleteId(null);
          setDeleting(false);
        }}
        title="Databron verwijderen"
        size="sm"
      >
        <p className="mb-4 text-sm text-hero-grey-regular">
          Weet je zeker dat je deze databron wilt verwijderen? Alle gekoppelde
          klips verliezen hun verbinding.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDeleteId(null);
              setDeleting(false);
            }}
          >
            Annuleren
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Verwijderen
          </Button>
        </div>
      </Modal>
    </>
  );
}
