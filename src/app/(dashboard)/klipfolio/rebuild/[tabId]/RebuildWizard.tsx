"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { startDashboardRebuild } from "@/lib/actions/rebuild";
import {
  KLIPFOLIO_COMPONENT_TYPES,
  KLIPFOLIO_CONNECTOR_TYPES,
  KLIPFOLIO_TO_HERO_TYPE,
} from "@/lib/klipfolio/types";
import type {
  KlipfolioKlipDetail,
  KlipfolioDatasourceDetail,
} from "@/lib/klipfolio/types";

interface RebuildWizardProps {
  tabId: string;
  tabName: string;
  tabDescription: string;
  klips: KlipfolioKlipDetail[];
  tabKlipIds: string[];
  datasources: KlipfolioDatasourceDetail[];
}

type Step = "review" | "starting";

/** Score how relevant a klip is to a tab name */
function scoreRelevance(klipName: string, tabName: string, isOnTab: boolean): number {
  // Klips that are actually on this tab get max score
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

function getComponentIcon(componentType: string): string {
  const iconMap: Record<string, string> = {
    "bar-chart": "bar_chart",
    "column-chart": "bar_chart",
    "line-chart": "show_chart",
    "area-chart": "area_chart",
    "pie-chart": "pie_chart",
    "donut-chart": "donut_large",
    "scatter-chart": "scatter_plot",
    "combo-chart": "stacked_line_chart",
    "funnel-chart": "filter_alt",
    "gauge": "speed",
    "number-block": "pin",
    "sparkline": "trending_up",
    "table": "table_chart",
    "pivot-table": "pivot_table_chart",
    "map": "map",
    "geo-map": "public",
    "heatmap": "grid_on",
    "treemap": "dashboard",
    "text-block": "text_fields",
    "html-block": "code",
    "image": "image",
    "progress-bar": "linear_scale",
    "bullet-chart": "horizontal_rule",
    "waterfall-chart": "waterfall_chart",
    "leaderboard": "leaderboard",
  };
  return iconMap[componentType] || "bar_chart";
}

export default function RebuildWizard({
  tabId,
  tabName,
  tabDescription,
  klips,
  tabKlipIds,
  datasources,
}: RebuildWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("review");
  const [dashboardName, setDashboardName] = useState(tabName);
  const [userContext, setUserContext] = useState("");
  const [klipSearch, setKlipSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tabKlipSet = useMemo(() => new Set(tabKlipIds), [tabKlipIds]);

  // Build datasource lookup
  const dsMap = useMemo(() => {
    const map = new Map<string, KlipfolioDatasourceDetail>();
    for (const ds of datasources) map.set(ds.id, ds);
    return map;
  }, [datasources]);

  // Score and sort klips
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

  // Pre-select tab klips + relevant klips
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

  // Build rich rebuild context
  const buildRebuildContext = () => {
    const selectedDetails = klips.filter((k) => selectedKlips.has(k.id));
    const lines: string[] = [];

    for (const klip of selectedDetails) {
      const typeLabel = KLIPFOLIO_COMPONENT_TYPES[klip.component_type || ""] || klip.component_type || "onbekend";
      const heroType = KLIPFOLIO_TO_HERO_TYPE[klip.component_type || ""] || "custom_component";
      lines.push(`- ${klip.name} (${typeLabel} → Hero: ${heroType})`);

      if (klip.datasources && klip.datasources.length > 0) {
        for (const dsRef of klip.datasources) {
          const dsId = dsRef.datasource_id || dsRef.id;
          const ds = dsMap.get(dsId);
          if (ds) {
            const connLabel = KLIPFOLIO_CONNECTOR_TYPES[ds.connector || ""] || ds.connector || "onbekend";
            lines.push(`  Databron: ${ds.name} (${connLabel})`);
          }
        }
      }
    }

    return lines.join("\n");
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
      const selectedDetails = klips.filter((k) => selectedKlips.has(k.id));
      const klipContext = buildRebuildContext();

      const result = await startDashboardRebuild({
        klipfolioTabName: tabName,
        newDashboardName: dashboardName.trim(),
        klipNames: selectedDetails.map((k) => k.name),
        userContext: [
          klipContext,
          userContext.trim() ? `\nExtra instructies: ${userContext.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
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

  // Count component types in selection
  const selectedComponentTypes: Record<string, number> = {};
  for (const klip of klips.filter((k) => selectedKlips.has(k.id))) {
    const ct = klip.component_type || "onbekend";
    selectedComponentTypes[ct] = (selectedComponentTypes[ct] || 0) + 1;
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

      {/* Selection summary */}
      {selectedKlips.size > 0 && (
        <Card>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-hero-grey-black">
              Selectie-overzicht
            </h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(selectedComponentTypes)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <Badge key={type} variant="info">
                    <span className="material-symbols-rounded text-[12px] mr-1">
                      {getComponentIcon(type)}
                    </span>
                    {KLIPFOLIO_COMPONENT_TYPES[type] || type}: {count}x
                  </Badge>
                ))}
            </div>
          </div>
        </Card>
      )}

      {/* Klip selection */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-hero-grey-black">
                Klips selecteren
              </h2>
              <p className="mt-0.5 text-xs text-hero-grey-regular">
                Selecteer welke visualisaties je wilt herbouwen. De AI gebruikt
                de visuele types en databronnen als context.
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
                <span className="material-symbols-rounded text-[14px]">
                  check_circle
                </span>
                Op dit dashboard ({filteredTabDirect.length})
              </h3>
              <div className="max-h-72 overflow-auto rounded-lg border border-green-200">
                {filteredTabDirect.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                    dsMap={dsMap}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Relevant klips */}
          {filteredRelevant.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-hero-blue uppercase tracking-wide flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px]">
                  stars
                </span>
                Gerelateerd aan &ldquo;{tabName}&rdquo; ({filteredRelevant.length})
              </h3>
              <div className="max-h-60 overflow-auto rounded-lg border border-hero-blue-soft">
                {filteredRelevant.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                    dsMap={dsMap}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other klips */}
          {filteredOther.length > 0 && (
            <details className="group">
              <summary className="mb-2 text-xs font-semibold text-hero-grey-regular uppercase tracking-wide cursor-pointer flex items-center gap-1">
                <span className="material-symbols-rounded text-[14px] transition-transform group-open:rotate-90">
                  chevron_right
                </span>
                Overige klips ({filteredOther.length})
              </summary>
              <div className="max-h-48 overflow-auto rounded-lg border border-hero-grey-light">
                {filteredOther.map((klip) => (
                  <KlipRow
                    key={klip.id}
                    klip={klip}
                    selected={selectedKlips.has(klip.id)}
                    onToggle={() => toggleKlip(klip.id)}
                    dsMap={dsMap}
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
  dsMap,
}: {
  klip: KlipfolioKlipDetail & { score?: number; isOnTab?: boolean };
  selected: boolean;
  onToggle: () => void;
  dsMap: Map<string, KlipfolioDatasourceDetail>;
}) {
  const componentType = klip.component_type || "onbekend";
  const typeLabel = KLIPFOLIO_COMPONENT_TYPES[componentType] || componentType;
  const heroType = KLIPFOLIO_TO_HERO_TYPE[componentType] || "custom";
  const icon = getComponentIcon(componentType);

  const dsNames: string[] = [];
  if (klip.datasources) {
    for (const dsRef of klip.datasources) {
      const dsId = dsRef.datasource_id || dsRef.id;
      const ds = dsMap.get(dsId);
      if (ds) {
        const connLabel = KLIPFOLIO_CONNECTOR_TYPES[ds.connector || ""] || ds.connector || "";
        dsNames.push(`${ds.name} (${connLabel})`);
      } else {
        dsNames.push(dsRef.name || dsId);
      }
    }
  }

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border-b border-hero-grey-light/50 px-4 py-3 transition-colors last:border-0 ${
        selected
          ? "bg-hero-blue-hairline/50"
          : "hover:bg-hero-blue-hairline/30"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 rounded border-hero-grey-light text-hero-blue focus:ring-hero-blue-medium/30"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[16px] text-hero-grey-regular">
            {icon}
          </span>
          <p className="text-sm font-medium text-hero-grey-black truncate">
            {klip.name}
          </p>
          <span className="shrink-0 rounded bg-hero-grey-light/60 px-1.5 py-0.5 text-[10px] text-hero-grey-regular">
            {typeLabel}
          </span>
          <span className="shrink-0 rounded bg-hero-blue-hairline px-1.5 py-0.5 text-[10px] text-hero-blue">
            → {heroType}
          </span>
        </div>
        {klip.description && (
          <p className="mt-0.5 text-xs text-hero-grey-regular truncate pl-6">
            {klip.description}
          </p>
        )}
        {dsNames.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1 pl-6">
            {dsNames.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 rounded-full bg-hero-grey-light/40 px-2 py-0.5 text-[10px] text-hero-grey-regular"
              >
                <span className="material-symbols-rounded text-[10px]">
                  database
                </span>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
      {klip.score !== undefined && klip.score > 0 && !klip.isOnTab && (
        <span className="text-[10px] text-hero-blue-medium shrink-0 mt-0.5">
          {klip.score}%
        </span>
      )}
    </label>
  );
}
