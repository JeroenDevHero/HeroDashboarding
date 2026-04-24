"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { testDataSourceConnection, deleteDataSource } from "@/lib/actions/datasource";

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

export default function DatasourceList({ datasources }: DatasourceListProps) {
  const router = useRouter();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; message: string }>>({});
  const [catalogRefreshingId, setCatalogRefreshingId] = useState<string | null>(null);
  const [catalogResult, setCatalogResult] = useState<Record<string, { status: string; message: string }>>({});
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichResult, setEnrichResult] = useState<Record<string, { status: string; message: string }>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const result = await testDataSourceConnection(id);
      setTestResult((prev) => ({
        ...prev,
        [id]: { status: result.status, message: result.message },
      }));
      router.refresh();
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
    setEnrichingId(id);
    setEnrichResult((prev) => ({
      ...prev,
      [id]: { status: "pending", message: "Bezig met AI-verrijking..." },
    }));
    try {
      const res = await fetch("/api/datasources/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_source_id: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnrichResult((prev) => ({
          ...prev,
          [id]: {
            status: "error",
            message: data.error || "Verrijking mislukt",
          },
        }));
      } else {
        setEnrichResult((prev) => ({
          ...prev,
          [id]: {
            status: "success",
            message: `${data.columnsUpdated || 0} kolommen verrijkt (${data.tablesProcessed || 0} tabellen)`,
          },
        }));
      }
    } catch (err) {
      setEnrichResult((prev) => ({
        ...prev,
        [id]: {
          status: "error",
          message: err instanceof Error ? err.message : "Verrijking mislukt",
        },
      }));
    } finally {
      setEnrichingId(null);
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
                Laatst getest
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium text-hero-grey-regular">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {datasources.map((ds) => (
              <tr
                key={ds.id}
                className="border-b border-hero-grey-light/50 last:border-0"
              >
                <td className="px-5 py-3">
                  <div>
                    <p className="font-medium text-hero-grey-black">{ds.name}</p>
                    {ds.description && (
                      <p className="mt-0.5 text-xs text-hero-grey-regular">
                        {ds.description}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant="info">
                    {ds.data_source_type?.name || typeLabels[ds.type_id] || ds.type_id}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[ds.last_refresh_status ?? "pending"] ?? "warning"}>
                      {statusLabels[ds.last_refresh_status ?? "pending"] || ds.last_refresh_status || "Onbekend"}
                    </Badge>
                    {ds.is_active ? (
                      <span className="text-[11px] text-emerald-600">Actief</span>
                    ) : (
                      <span className="text-[11px] text-hero-grey-regular">Inactief</span>
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
                <td className="px-5 py-3 text-hero-grey-regular">
                  {ds.last_refresh_at
                    ? new Date(ds.last_refresh_at).toLocaleString("nl-NL")
                    : "Nog niet getest"}
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
                      loading={enrichingId === ds.id}
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
                  {enrichResult[ds.id] && (
                    <p
                      className={`mt-1 text-[11px] text-right ${
                        enrichResult[ds.id].status === "success"
                          ? "text-emerald-600"
                          : enrichResult[ds.id].status === "pending"
                            ? "text-hero-blue"
                            : "text-red-500"
                      }`}
                    >
                      {enrichResult[ds.id].message}
                    </p>
                  )}
                </td>
              </tr>
            ))}
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
