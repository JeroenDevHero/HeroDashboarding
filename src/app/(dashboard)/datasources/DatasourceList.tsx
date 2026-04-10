"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { testDatasourceConnection, deleteDatasource } from "@/lib/actions/datasource";

interface Datasource {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  status: string;
  last_tested_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface DatasourceListProps {
  datasources: Datasource[];
}

const typeLabels: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  rest_api: "REST API",
  google_sheets: "Google Sheets",
  csv: "CSV",
};

const statusVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  connected: "success",
  pending: "warning",
  error: "error",
};

const statusLabels: Record<string, string> = {
  connected: "Verbonden",
  pending: "In afwachting",
  error: "Fout",
};

export default function DatasourceList({ datasources }: DatasourceListProps) {
  const router = useRouter();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { status: string; message: string }>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const result = await testDatasourceConnection(id);
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

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDatasource(deleteId);
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
                    {typeLabels[ds.type] || ds.type}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={statusVariant[ds.status] ?? "warning"}>
                    {statusLabels[ds.status] || ds.status}
                  </Badge>
                  {testResult[ds.id] && (
                    <p
                      className={`mt-1 text-[11px] ${
                        testResult[ds.id].status === "connected"
                          ? "text-emerald-600"
                          : "text-red-500"
                      }`}
                    >
                      {testResult[ds.id].message}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular">
                  {ds.last_tested_at
                    ? new Date(ds.last_tested_at).toLocaleString("nl-NL")
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
                      variant="ghost"
                      size="sm"
                      icon="delete"
                      onClick={() => setDeleteId(ds.id)}
                    />
                  </div>
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
