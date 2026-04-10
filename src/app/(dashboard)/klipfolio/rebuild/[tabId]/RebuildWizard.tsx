"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { startDashboardRebuild } from "@/lib/actions/rebuild";
import type { KlipfolioKlip } from "@/lib/klipfolio/types";

interface RebuildWizardProps {
  tabId: string;
  tabName: string;
  tabDescription: string;
  klips: KlipfolioKlip[];
  tabKlipIds: string[];
}

type Step = "review" | "starting";

function scoreRelevance(klipName: string, tabName: string, isOnTab: boolean): number {
  if (isOnTab) return 100;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const klipNorm = normalize(klipName);
  const tabNorm = normalize(tabName);

  if (klipNorm.includes(tabNorm) || tabNorm.includes(klipNorm)) return 90;

  const tabWords = tabNorm.split(/\s+/).filter((w) => w.length > 2);
  if (tabWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of tabWords) {
    if (klipNorm.includes(word)) matchedWords++;
  }

  return Math.round((matchedWords / tabWords.length) * 70);
}

export default function RebuildWizard({
  tabId,
  tabName,
  tabDescription,
  klips,
  tabKlipIds,
}: RebuildWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("review");
  const [dashboardName, setDashboardName] = useState(tabName);
  const [userContext, setUserContext] = useState("");
  const [klipSearch, setKlipSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tabKlipSet = useMemo(() => new Set(tabKlipIds), [tabKlipIds]);

  const scoredKlips = useMemo(
    () =>
      klips
        .map((k) => ({
          ...k,
          score: scoreRelevance(k.name, tabName, tabKlipSet.has(k.id)),
          isOnTab: tabKlipSet.has(k.id),
        }))
        .sort((a, b) => b.score - a.score),
    [klips, tabName, tabKlipSet]
  );

  const tabDirectKlips = scoredKlips.filter((k) => k.isOnTab);
  const relevantKlips = scoredKlips.filter((k) => !k.isOnTab && k.score > 0);
  const otherKlips = scoredKlips.filter((k) => !k.isOnTab && k.score === 0);

  const [selectedKlips, setSelectedKlips] = useState<Set<string>>(
    new Set([
      ...tabDirectKlips.map((k) => k.id),
      ...relevantKlips.map((k) => k.id),
    ])
  );

  const filterKlips = <T extends { name: string; description: string }>(
    items: T[]
  ): T[] => {
    if (!klipSearch) return items;
    const q = klipSearch.toLowerCase();
    return items.filter(
      (k) =>
        k.name?.toLowerCase().includes(q) ||
        k.description?.toLowerCase().includes(q)
    );
  };

  const filteredTabDirect = filterKlips(tabDirectKlips);
  const filteredRelevant = filterKlips(relevantKlips);
  const filteredOther = filterKlips(otherKlips);

  const toggleKlip = (id: string) => {
    setSelectedKlips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllTab = () => {
    setSelectedKlips(
      new Set([
        ...tabDirectKlips.map((k) => k.id),
        ...relevantKlips.map((k) => k.id),
      ])
    );
  };

  const selectNone = () => setSelectedKlips(new Set());

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
      const selectedDetails = klips.filter((k) => selectedKlips.has(k.id));

      const result = await startDashboardRebuild({
        klipfolioTabName: tabName,
        newDashboardName: dashboardName.trim(),
        klipNames: selectedDetails.map((k) => k.name),
        userContext: userContext.trim() || undefined,
      });

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
                proberen deze te recreeren met beschikbare databronnen.
              </p>
            </div>
            <Badge variant="info">
              {selectedKlips.size} / {klips.length} geselecteerd
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="Zoeken in klips..."
                value={klipSearch}
                onChange={(e) => setKlipSearch(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={selectAllTab}>
              Gerelateerd
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone}>
              Geen
            </Button>
          </div>

          {/* Tab direct klips */}
          {filteredTabDirect.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px]">check_circle</span>
                Op dit dashboard ({filteredTabDirect.length})
              </h3>
              <div className="max-h-72 overflow-auto rounded-lg border border-green-200">
                {filteredTabDirect.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Relevant klips */}
          {filteredRelevant.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-hero-blue uppercase tracking-wide flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px]">stars</span>
                Gerelateerd aan &ldquo;{tabName}&rdquo; ({filteredRelevant.length})
              </h3>
              <div className="max-h-60 overflow-auto rounded-lg border border-hero-blue-soft">
                {filteredRelevant.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other klips */}
          {filteredOther.length > 0 && (
            <details className="group">
              <summary className="mb-2 text-xs font-semibold text-hero-grey-regular uppercase tracking-wide cursor-pointer flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
                Overige klips ({filteredOther.length})
              </summary>
              <div className="max-h-48 overflow-auto rounded-lg border border-hero-grey-light">
                {filteredOther.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                  />
                ))}
              </div>
            </details>
          )}

          {filteredTabDirect.length === 0 &&
            filteredRelevant.length === 0 &&
            filteredOther.length === 0 && (
              <p className="py-4 text-center text-sm text-hero-grey-regular">
                Geen klips gevonden.
              </p>
            )}
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

function KlipRow({
  klip,
  selected,
  onToggle,
}: {
  klip: KlipfolioKlip & { score?: number; isOnTab?: boolean };
  selected: boolean;
  onToggle: () => void;
}) {
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
      {klip.score !== undefined && klip.score > 0 && !klip.isOnTab && (
        <span className="text-[10px] text-hero-blue-medium shrink-0">
          {klip.score}%
        </span>
      )}
    </label>
  );
}
