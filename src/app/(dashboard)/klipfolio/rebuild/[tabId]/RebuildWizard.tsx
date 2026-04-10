"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { startDashboardRebuild } from "@/lib/actions/rebuild";
import type { KlipfolioKlip } from "@/lib/klipfolio/client";

interface RebuildWizardProps {
  tabId: string;
  tabName: string;
  tabDescription: string;
  klips: KlipfolioKlip[];
}

type Step = "review" | "starting";

/** Score how relevant a klip is to a tab name */
function scoreRelevance(klipName: string, tabName: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const klipNorm = normalize(klipName);
  const tabNorm = normalize(tabName);

  // Exact match in name
  if (klipNorm.includes(tabNorm) || tabNorm.includes(klipNorm)) return 100;

  // Word-level matching
  const tabWords = tabNorm.split(/\s+/).filter((w) => w.length > 2);
  if (tabWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of tabWords) {
    if (klipNorm.includes(word)) matchedWords++;
  }

  return Math.round((matchedWords / tabWords.length) * 80);
}

export default function RebuildWizard({
  tabId,
  tabName,
  tabDescription,
  klips,
}: RebuildWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("review");
  const [dashboardName, setDashboardName] = useState(tabName);
  const [userContext, setUserContext] = useState("");
  const [klipSearch, setKlipSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Score and sort klips by relevance to tab name
  const scoredKlips = klips
    .map((k) => ({ ...k, score: scoreRelevance(k.name, tabName) }))
    .sort((a, b) => b.score - a.score);

  const relevantKlips = scoredKlips.filter((k) => k.score > 0);
  const otherKlips = scoredKlips.filter((k) => k.score === 0);

  // Pre-select only relevant klips
  const [selectedKlips, setSelectedKlips] = useState<Set<string>>(
    new Set(relevantKlips.map((k) => k.name))
  );

  const filteredRelevant = klipSearch
    ? relevantKlips.filter(
        (k) =>
          k.name?.toLowerCase().includes(klipSearch.toLowerCase()) ||
          k.description?.toLowerCase().includes(klipSearch.toLowerCase())
      )
    : relevantKlips;

  const filteredOther = klipSearch
    ? otherKlips.filter(
        (k) =>
          k.name?.toLowerCase().includes(klipSearch.toLowerCase()) ||
          k.description?.toLowerCase().includes(klipSearch.toLowerCase())
      )
    : otherKlips;

  const toggleKlip = (name: string) => {
    setSelectedKlips((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAllRelevant = () => {
    setSelectedKlips(new Set(relevantKlips.map((k) => k.name)));
  };

  const selectNone = () => {
    setSelectedKlips(new Set());
  };

  const handleStartRebuild = async () => {
    if (selectedKlips.size === 0) {
      setError("Selecteer minimaal een klip om te herbouwen.");
      return;
    }
    if (!dashboardName.trim()) {
      setError("Vul een naam in voor het nieuwe dashboard.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setStep("starting");

    try {
      const result = await startDashboardRebuild({
        klipfolioTabName: tabName,
        newDashboardName: dashboardName.trim(),
        klipNames: Array.from(selectedKlips),
        userContext: userContext.trim() || undefined,
      });

      // Redirect to AI assistant with conversation pre-selected
      router.push(`/ai?conversation=${result.conversationId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Onbekende fout bij herbouw";
      setError(message);
      setStep("review");
      setIsSubmitting(false);
    }
  };

  if (step === "starting") {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12">
          <span className="material-symbols-rounded text-[40px] text-hero-blue animate-spin">
            progress_activity
          </span>
          <p className="mt-4 text-sm font-medium text-hero-grey-black">
            Dashboard wordt voorbereid...
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
      {/* Dashboard info */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-hero-grey-black">
              Klipfolio dashboard
            </h2>
            <p className="mt-1 text-sm text-hero-grey-regular">
              {tabDescription || "Geen beschrijving beschikbaar."}
            </p>
          </div>

          <Input
            label="Naam nieuw dashboard"
            value={dashboardName}
            onChange={(e) => setDashboardName(e.target.value)}
            placeholder="Naam voor het nieuwe Hero dashboard"
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
              placeholder="Voeg extra instructies toe voor de AI, bijv. welke databronnen er gebruikt moeten worden, specifieke filters, of andere wensen..."
              rows={3}
              className="resize-none rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 transition-colors"
            />
          </div>
        </div>
      </Card>

      {/* Klip selection */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-hero-grey-black">
                Klips selecteren
              </h2>
              <p className="mt-0.5 text-xs text-hero-grey-regular">
                Selecteer welke visualisaties je wilt herbouwen. De AI zal
                proberen deze te recreeren met Databricks data.
              </p>
            </div>
            <Badge variant="info">
              {selectedKlips.size} / {klips.length} geselecteerd
            </Badge>
          </div>

          {/* Search and bulk actions */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="Zoeken in klips..."
                value={klipSearch}
                onChange={(e) => setKlipSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={selectAllRelevant}>
              Gerelateerd
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone}>
              Geen
            </Button>
          </div>

          {/* Relevant klips */}
          {filteredRelevant.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-hero-blue uppercase tracking-wide flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px]">stars</span>
                Gerelateerd aan &ldquo;{tabName}&rdquo; ({filteredRelevant.length})
              </h3>
              <div className="max-h-60 overflow-auto rounded-lg border border-hero-blue-soft">
                {filteredRelevant.map((klip) => (
                  <KlipRow key={klip.id} klip={klip} selected={selectedKlips.has(klip.name)} onToggle={() => toggleKlip(klip.name)} />
                ))}
              </div>
            </div>
          )}

          {/* Other klips (collapsed by default) */}
          {filteredOther.length > 0 && (
            <details className="group">
              <summary className="mb-2 text-xs font-semibold text-hero-grey-regular uppercase tracking-wide cursor-pointer flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
                Overige klips ({filteredOther.length})
              </summary>
              <div className="max-h-48 overflow-auto rounded-lg border border-hero-grey-light">
                {filteredOther.map((klip) => (
                  <KlipRow key={klip.id} klip={klip} selected={selectedKlips.has(klip.name)} onToggle={() => toggleKlip(klip.name)} />
                ))}
              </div>
            </details>
          )}

          {filteredRelevant.length === 0 && filteredOther.length === 0 && (
            <p className="py-4 text-center text-sm text-hero-grey-regular">
              Geen klips gevonden.
            </p>
          )}
        </div>
      </Card>

      {/* Error message */}
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
          onClick={handleStartRebuild}
          loading={isSubmitting}
          disabled={selectedKlips.size === 0 || !dashboardName.trim()}
        >
          Start herbouw ({selectedKlips.size}{" "}
          {selectedKlips.size === 1 ? "klip" : "klips"})
        </Button>
      </div>
    </div>
  );
}

function KlipRow({ klip, selected, onToggle }: { klip: KlipfolioKlip & { score?: number }; selected: boolean; onToggle: () => void }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border-b border-hero-grey-light/50 px-4 py-2.5 transition-colors last:border-0 ${
        selected ? "bg-hero-blue-hairline/50" : "hover:bg-hero-blue-hairline/30"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 rounded border-hero-grey-light text-hero-blue focus:ring-hero-blue-medium/30"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-hero-grey-black truncate">
          {klip.name}
        </p>
        {klip.description && (
          <p className="text-xs text-hero-grey-regular truncate">
            {klip.description}
          </p>
        )}
      </div>
      {klip.score !== undefined && klip.score > 0 && (
        <span className="text-[10px] text-hero-blue-medium shrink-0">
          {klip.score}%
        </span>
      )}
    </label>
  );
}
