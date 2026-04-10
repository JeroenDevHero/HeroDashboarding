"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { startKlipRebuild } from "@/lib/actions/rebuild";

interface Props {
  klipId: string;
  klipName: string;
  klipDescription: string;
  vizType: string;
  vizLabel: string;
  datasourceCount: number;
}

export default function RebuildKlipWizard({
  klipId,
  klipName,
  klipDescription,
  vizType,
  vizLabel,
  datasourceCount,
}: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState(klipName);
  const [userContext, setUserContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRebuild = async () => {
    if (!newName.trim()) {
      setError("Vul een naam in voor de nieuwe klip.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await startKlipRebuild({
        klipfolioKlipName: klipName,
        newKlipName: newName.trim(),
        vizType,
        vizLabel,
        datasourceCount,
        userContext: userContext.trim() || undefined,
      });

      router.push(`/ai?conversation=${result.conversationId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Onbekende fout bij herbouw";
      setError(message);
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12">
          <span className="material-symbols-rounded text-[40px] text-hero-blue animate-spin">
            progress_activity
          </span>
          <p className="mt-4 text-sm font-medium text-hero-grey-black">
            Klip wordt voorbereid...
          </p>
          <p className="mt-1 text-xs text-hero-grey-regular">
            Even geduld, je wordt doorgestuurd naar de AI assistent.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Klip info */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-hero-grey-black">
              Klipfolio klip
            </h2>
            <p className="mt-1 text-sm text-hero-grey-regular">
              {klipDescription || "Geen beschrijving beschikbaar."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="info">
              <span className="material-symbols-rounded text-[12px] mr-1">bar_chart</span>
              {vizLabel}
            </Badge>
            <Badge variant="info">
              <span className="material-symbols-rounded text-[12px] mr-1">database</span>
              {datasourceCount} databron{datasourceCount !== 1 ? "nen" : ""}
            </Badge>
          </div>

          <Input
            label="Naam nieuwe klip"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Naam voor de nieuwe Hero klip"
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="user-context"
              className="text-xs font-medium text-hero-grey-black"
            >
              Extra context (optioneel)
            </label>
            <textarea
              id="user-context"
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              placeholder="Welke databron wil je gebruiken? Specifieke filters? Ander visueel type?"
              rows={3}
              className="resize-none rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          icon="arrow_back"
          onClick={() => router.push("/klipfolio")}
        >
          Terug naar overzicht
        </Button>

        <Button
          variant="primary"
          icon="auto_awesome"
          onClick={handleRebuild}
          disabled={!newName.trim()}
        >
          Herbouw klip
        </Button>
      </div>
    </div>
  );
}
