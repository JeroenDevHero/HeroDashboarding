"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  saveSemanticEntity,
  removeSemanticEntity,
} from "@/lib/actions/semantic";
import type { SemanticEntity } from "@/lib/datasources/semantic";

interface DataSource {
  id: string;
  name: string;
  data_source_type?: { slug: string; name: string } | null;
}

interface GroupedEntry {
  dataSource: DataSource;
  entities: SemanticEntity[];
}

interface Props {
  grouped: GroupedEntry[];
}

export default function SemanticsClient({ grouped }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    dataSourceId: string;
    entity: SemanticEntity | null;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    synonyms: "",
    description: "",
    sql_template: "",
    required_tables: "",
    default_filters: "",
  });

  function openCreate(dataSourceId: string) {
    setEditing({ dataSourceId, entity: null });
    setForm({
      name: "",
      synonyms: "",
      description: "",
      sql_template: "",
      required_tables: "",
      default_filters: "",
    });
    setError(null);
  }

  function openEdit(dataSourceId: string, entity: SemanticEntity) {
    setEditing({ dataSourceId, entity });
    setForm({
      name: entity.name,
      synonyms: entity.synonyms.join(", "),
      description: entity.description,
      sql_template: entity.sql_template,
      required_tables: entity.required_tables.join(", "),
      default_filters: entity.default_filters || "",
    });
    setError(null);
  }

  function closeModal() {
    setEditing(null);
    setSaving(false);
    setError(null);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await saveSemanticEntity({
        id: editing.entity?.id,
        data_source_id: editing.dataSourceId,
        name: form.name.trim(),
        synonyms: form.synonyms
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        description: form.description.trim(),
        sql_template: form.sql_template.trim(),
        required_tables: form.required_tables
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        default_filters: form.default_filters.trim() || null,
      });
      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await removeSemanticEntity(deleteId);
      setDeleteId(null);
      setDeleting(false);
      router.refresh();
    } catch {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        {grouped.map(({ dataSource, entities }) => {
          const isSupported =
            dataSource.data_source_type?.slug === "supabase-bc" ||
            dataSource.data_source_type?.slug === "postgresql" ||
            dataSource.data_source_type?.slug === "databricks";
          return (
            <section key={dataSource.id}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-hero-grey-black">
                    {dataSource.name}
                  </h2>
                  <Badge variant="info">
                    {dataSource.data_source_type?.name ||
                      dataSource.data_source_type?.slug ||
                      "Onbekend"}
                  </Badge>
                </div>
                {isSupported && (
                  <Button
                    size="sm"
                    icon="add"
                    onClick={() => openCreate(dataSource.id)}
                  >
                    Concept toevoegen
                  </Button>
                )}
              </div>

              {entities.length === 0 ? (
                <Card>
                  <p className="text-sm text-hero-grey-regular">
                    Nog geen concepten gedefinieerd voor deze databron.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {entities.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-col rounded-[var(--radius-card)] bg-white p-5 shadow-[0_1px_3px_rgba(7,56,137,0.08)] transition-shadow hover:shadow-md"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-hero-grey-black">
                          {e.name}
                        </h3>
                        <Badge
                          variant={
                            e.created_by_type === "user"
                              ? "success"
                              : e.created_by_type === "ai-suggested"
                                ? "info"
                                : "warning"
                          }
                        >
                          {e.created_by_type === "user"
                            ? "Gebruiker"
                            : e.created_by_type === "ai-suggested"
                              ? "AI voorstel"
                              : "Systeem"}
                        </Badge>
                      </div>

                      {e.description && (
                        <p className="mb-2 text-xs text-hero-grey-regular line-clamp-3">
                          {e.description}
                        </p>
                      )}

                      {e.synonyms.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {e.synonyms.slice(0, 4).map((syn) => (
                            <span
                              key={syn}
                              className="inline-block rounded-full bg-hero-blue-hairline px-2 py-0.5 text-[10px] text-hero-grey-regular"
                            >
                              {syn}
                            </span>
                          ))}
                        </div>
                      )}

                      <pre className="mb-3 max-h-20 overflow-hidden rounded bg-hero-blue-hairline/40 p-2 text-[10px] font-mono text-hero-grey-black line-clamp-3">
                        {e.sql_template}
                      </pre>

                      <div className="mt-auto flex items-center justify-between border-t border-hero-grey-light/50 pt-3">
                        <span className="text-[11px] text-hero-grey-regular">
                          {e.use_count} keer gebruikt
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="edit"
                            onClick={() => openEdit(dataSource.id, e)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="delete"
                            onClick={() => setDeleteId(e.id)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Modal
        open={editing !== null}
        onClose={closeModal}
        title={editing?.entity ? "Concept bewerken" : "Concept toevoegen"}
        size="lg"
      >
        {error && (
          <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <Input
            label="Naam"
            placeholder="bijv. Omzet, Debiteurenstand, Voorraadwaarde"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Synoniemen (kommagescheiden)"
            placeholder="Revenue, Verkoop, Turnover"
            value={form.synonyms}
            onChange={(e) => setForm({ ...form, synonyms: e.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-hero-grey-black">
              Beschrijving
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Korte zakelijke uitleg die de AI gebruikt om de juiste context te begrijpen."
              className="w-full rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-hero-grey-black">
              SQL template
            </label>
            <textarea
              rows={6}
              value={form.sql_template}
              onChange={(e) =>
                setForm({ ...form, sql_template: e.target.value })
              }
              placeholder={`SELECT DATE_TRUNC('month', posting_date) AS maand,\n       SUM(amount) AS omzet\nFROM sales_invoice_line\nWHERE {default_filters}\nGROUP BY 1 ORDER BY 1`}
              className="w-full font-mono rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-xs text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>
          <Input
            label="Vereiste tabellen (kommagescheiden)"
            placeholder="sales_invoice_line, sales_invoice_header"
            value={form.required_tables}
            onChange={(e) =>
              setForm({ ...form, required_tables: e.target.value })
            }
          />
          <Input
            label="Standaard filters (optioneel)"
            placeholder="bijv. company_name = 'Hero' AND posted = true"
            value={form.default_filters}
            onChange={(e) =>
              setForm({ ...form, default_filters: e.target.value })
            }
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeModal}>
              Annuleren
            </Button>
            <Button icon="save" loading={saving} onClick={handleSave}>
              Opslaan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteId !== null}
        onClose={() => {
          setDeleteId(null);
          setDeleting(false);
        }}
        title="Concept verwijderen"
        size="sm"
      >
        <p className="mb-4 text-sm text-hero-grey-regular">
          Weet je zeker dat je dit business-concept wilt verwijderen? De AI
          kan dan geen vragen met deze term meer automatisch vertalen.
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
