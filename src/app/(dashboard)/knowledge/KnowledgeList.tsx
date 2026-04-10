"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { deleteKnowledgeEntry, updateKnowledgeEntry } from "@/lib/actions/knowledge";

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[] | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface KnowledgeListProps {
  entries: KnowledgeEntry[];
}

const categories = [
  { value: "", label: "Alle" },
  { value: "algemeen", label: "Algemeen" },
  { value: "bedrijf", label: "Bedrijf" },
  { value: "data", label: "Data" },
  { value: "klanten", label: "Klanten" },
  { value: "producten", label: "Producten" },
  { value: "processen", label: "Processen" },
  { value: "definities", label: "Definities" },
];

const categoryLabels: Record<string, string> = {
  algemeen: "Algemeen",
  bedrijf: "Bedrijf",
  data: "Data",
  klanten: "Klanten",
  producten: "Producten",
  processen: "Processen",
  definities: "Definities",
};

const categoryVariant: Record<string, "info" | "success" | "warning" | "error"> = {
  algemeen: "info",
  bedrijf: "success",
  data: "info",
  klanten: "warning",
  producten: "success",
  processen: "warning",
  definities: "info",
};

export default function KnowledgeList({ entries }: KnowledgeListProps) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editEntry, setEditEntry] = useState<KnowledgeEntry | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = entries.filter((entry) => {
    if (activeCategory && entry.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        (entry.tags && entry.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    return true;
  });

  function openEdit(entry: KnowledgeEntry) {
    setEditEntry(entry);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditCategory(entry.category);
    setEditTags(entry.tags ? entry.tags.join(", ") : "");
  }

  function closeEdit() {
    setEditEntry(null);
    setEditTitle("");
    setEditContent("");
    setEditCategory("");
    setEditTags("");
    setSaving(false);
  }

  async function handleSaveEdit() {
    if (!editEntry) return;
    setSaving(true);
    try {
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await updateKnowledgeEntry(editEntry.id, {
        title: editTitle,
        content: editContent,
        category: editCategory,
        tags,
      });
      closeEdit();
      router.refresh();
    } catch {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteKnowledgeEntry(deleteId);
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
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                activeCategory === cat.value
                  ? "bg-hero-blue text-white"
                  : "bg-hero-blue-hairline text-hero-grey-regular hover:bg-hero-blue-soft hover:text-hero-blue"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            placeholder="Zoeken in kennisbank..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-card)] bg-white p-12 text-center shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          <span className="material-symbols-rounded text-[32px] text-hero-grey-light mb-2 block">
            search_off
          </span>
          <p className="text-sm text-hero-grey-regular">
            Geen kennisitems gevonden{activeCategory ? ` in categorie "${categoryLabels[activeCategory]}"` : ""}{search ? ` voor "${search}"` : ""}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col rounded-[var(--radius-card)] bg-white p-5 shadow-[0_1px_3px_rgba(7,56,137,0.08)] transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-hero-grey-black line-clamp-1">
                  {entry.title}
                </h3>
                <Badge variant={categoryVariant[entry.category] || "info"}>
                  {categoryLabels[entry.category] || entry.category}
                </Badge>
              </div>

              <p className="mb-3 flex-1 text-xs text-hero-grey-regular line-clamp-4">
                {entry.content}
              </p>

              {entry.tags && entry.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-full bg-hero-blue-hairline px-2 py-0.5 text-[10px] text-hero-grey-regular"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-hero-grey-light/50 pt-3">
                <span className="text-[11px] text-hero-grey-regular">
                  {new Date(entry.updated_at).toLocaleDateString("nl-NL", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    onClick={() => openEdit(entry)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="delete"
                    onClick={() => setDeleteId(entry.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={editEntry !== null}
        onClose={closeEdit}
        title="Kennis bewerken"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Titel"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Select
            label="Categorie"
            options={categories.filter((c) => c.value !== "")}
            value={editCategory}
            onChange={setEditCategory}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-hero-grey-black">
              Inhoud
            </label>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
              className="w-full rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>
          <Input
            label="Tags (kommagescheiden)"
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="bijv. omzet, kpi, target"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeEdit}>
              Annuleren
            </Button>
            <Button icon="save" loading={saving} onClick={handleSaveEdit}>
              Opslaan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteId !== null}
        onClose={() => {
          setDeleteId(null);
          setDeleting(false);
        }}
        title="Kennis verwijderen"
        size="sm"
      >
        <p className="mb-4 text-sm text-hero-grey-regular">
          Weet je zeker dat je dit kennisitem wilt verwijderen? Dit kan niet
          ongedaan worden gemaakt.
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
