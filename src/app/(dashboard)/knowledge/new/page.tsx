"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Card from "@/components/ui/Card";
import { createKnowledgeEntry } from "@/lib/actions/knowledge";

const categoryOptions = [
  { value: "algemeen", label: "Algemeen" },
  { value: "bedrijf", label: "Bedrijf" },
  { value: "data", label: "Data" },
  { value: "klanten", label: "Klanten" },
  { value: "producten", label: "Producten" },
  { value: "processen", label: "Processen" },
  { value: "definities", label: "Definities" },
];

export default function NewKnowledgePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("algemeen");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const title = formData.get("title") as string;
      const content = formData.get("content") as string;
      const tagsRaw = formData.get("tags") as string;
      const source = formData.get("source") as string;

      const tags = tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await createKnowledgeEntry({
        title,
        content,
        category,
        tags: tags.length > 0 ? tags : undefined,
        source: source || undefined,
      });

      router.push("/knowledge");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Er ging iets mis bij het opslaan."
      );
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-1 text-sm text-hero-grey-regular hover:text-hero-grey-black transition-colors"
        >
          <span className="material-symbols-rounded text-[18px]">
            arrow_back
          </span>
          Terug naar kennisbank
        </Link>
      </div>

      <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
        Kennis toevoegen
      </h1>

      <Card>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Titel"
            name="title"
            placeholder="Bijv. Omzet target Q4"
            required
          />

          <Select
            label="Categorie"
            options={categoryOptions}
            value={category}
            onChange={setCategory}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="content"
              className="text-xs font-medium text-hero-grey-black"
            >
              Inhoud
            </label>
            <textarea
              id="content"
              name="content"
              rows={10}
              required
              placeholder="Beschrijf de kennis hier. Wees zo specifiek mogelijk zodat de AI dit goed kan gebruiken."
              className="w-full rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>

          <Input
            label="Tags (kommagescheiden)"
            name="tags"
            placeholder="bijv. omzet, kpi, target"
          />

          <Input
            label="Bron (optioneel)"
            name="source"
            placeholder="Bijv. Jaarverslag 2025, Interne meeting"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => router.push("/knowledge")}
            >
              Annuleren
            </Button>
            <Button type="submit" icon="save" loading={saving}>
              Opslaan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
