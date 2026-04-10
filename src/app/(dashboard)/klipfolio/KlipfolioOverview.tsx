"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import {
  KLIPFOLIO_COMPONENT_TYPES,
  KLIPFOLIO_CONNECTOR_TYPES,
  KLIPFOLIO_TO_HERO_TYPE,
} from "@/lib/klipfolio/types";
import type {
  KlipfolioTab,
  KlipfolioKlipDetail,
  KlipfolioDatasourceDetail,
} from "@/lib/klipfolio/types";

interface Props {
  tabs: KlipfolioTab[];
  tabsTotal: number;
  klips: KlipfolioKlipDetail[];
  klipsTotal: number;
  datasources: KlipfolioDatasourceDetail[];
  datasourcesTotal: number;
}

type TabKey = "dashboards" | "klips" | "datasources" | "insights";

const PAGE_SIZE = 25;

function formatDate(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatRefreshInterval(seconds?: number): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} uur`;
  return `${Math.round(seconds / 86400)} dagen`;
}

export default function KlipfolioOverview({
  tabs,
  tabsTotal,
  klips,
  klipsTotal,
  datasources,
  datasourcesTotal,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboards");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearch("");
    setVisibleCount(PAGE_SIZE);
  };

  // Compute stats
  const componentTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of klips) {
      const ct = k.component_type || "onbekend";
      counts[ct] = (counts[ct] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [klips]);

  const connectorTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ds of datasources) {
      const ct = ds.connector || ds.type || "onbekend";
      counts[ct] = (counts[ct] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [datasources]);

  const tabConfig: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: "dashboards", label: "Dashboards", icon: "dashboard", count: tabsTotal },
    { key: "klips", label: "Klips", icon: "bar_chart", count: klipsTotal },
    { key: "datasources", label: "Databronnen", icon: "database", count: datasourcesTotal },
    { key: "insights", label: "Analyse", icon: "analytics", count: componentTypeCounts.length },
  ];

  // Filter helpers
  const filteredTabs = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return tabs;
    return tabs.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    );
  }, [tabs, search]);

  const filteredKlips = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return klips;
    return klips.filter(
      (k) =>
        k.name?.toLowerCase().includes(q) ||
        k.description?.toLowerCase().includes(q) ||
        k.component_type?.toLowerCase().includes(q)
    );
  }, [klips, search]);

  const filteredDatasources = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return datasources;
    return datasources.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.connector?.toLowerCase().includes(q)
    );
  }, [datasources, search]);

  const currentFilteredCount =
    activeTab === "dashboards"
      ? filteredTabs.length
      : activeTab === "klips"
        ? filteredKlips.length
        : activeTab === "datasources"
          ? filteredDatasources.length
          : 0;

  const hasMore = visibleCount < currentFilteredCount;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="info">{tabsTotal} dashboards</Badge>
        <Badge variant="info">{klipsTotal} klips</Badge>
        <Badge variant="info">{datasourcesTotal} databronnen</Badge>
        <Badge variant="info">{componentTypeCounts.length} visualisatietypen</Badge>
        <Badge variant="info">{connectorTypeCounts.length} databrontypen</Badge>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-hero-grey-light">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer ${
              activeTab === tab.key
                ? "border-hero-blue text-hero-blue"
                : "border-transparent text-hero-grey-regular hover:text-hero-grey-black"
            }`}
          >
            <span className="material-symbols-rounded text-[18px]">
              {tab.icon}
            </span>
            {tab.label}
            <span className="text-[11px] tabular-nums opacity-70">
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Search (not for insights) */}
      {activeTab !== "insights" && (
        <div className="max-w-sm">
          <Input
            placeholder={`Zoeken in ${tabConfig.find((t) => t.key === activeTab)?.label.toLowerCase()}...`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === "dashboards" && (
        <DashboardsTable tabs={filteredTabs.slice(0, visibleCount)} />
      )}
      {activeTab === "klips" && (
        <KlipsTable
          klips={filteredKlips.slice(0, visibleCount)}
          datasources={datasources}
        />
      )}
      {activeTab === "datasources" && (
        <DatasourcesTable
          datasources={filteredDatasources.slice(0, visibleCount)}
          klips={klips}
        />
      )}
      {activeTab === "insights" && (
        <InsightsPanel
          componentTypeCounts={componentTypeCounts}
          connectorTypeCounts={connectorTypeCounts}
          klips={klips}
          datasources={datasources}
        />
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            icon="expand_more"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Meer laden ({currentFilteredCount - visibleCount} resterend)
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboards Table                                                    */
/* ------------------------------------------------------------------ */

function DashboardsTable({ tabs }: { tabs: KlipfolioTab[] }) {
  const router = useRouter();

  if (tabs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="dashboard"
          title="Geen dashboards gevonden"
          description="Pas je zoekopdracht aan of controleer je Klipfolio-account."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto -m-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hero-grey-light text-left">
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Naam
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Beschrijving
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs w-32">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {tabs.map((tab) => (
              <tr
                key={tab.id}
                className="border-b border-hero-grey-light/50 last:border-0 hover:bg-hero-blue-hairline/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-hero-grey-black whitespace-nowrap">
                  {tab.name || "-"}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular max-w-md truncate">
                  {tab.description || "-"}
                </td>
                <td className="px-5 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="auto_awesome"
                    onClick={() =>
                      router.push(`/klipfolio/rebuild/${tab.id}`)
                    }
                  >
                    Herbouwen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Klips Table (Enhanced)                                               */
/* ------------------------------------------------------------------ */

function KlipsTable({
  klips,
  datasources,
}: {
  klips: KlipfolioKlipDetail[];
  datasources: KlipfolioDatasourceDetail[];
}) {
  const dsMap = useMemo(() => {
    const map = new Map<string, KlipfolioDatasourceDetail>();
    for (const ds of datasources) map.set(ds.id, ds);
    return map;
  }, [datasources]);

  if (klips.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="bar_chart"
          title="Geen klips gevonden"
          description="Pas je zoekopdracht aan of controleer je Klipfolio-account."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto -m-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hero-grey-light text-left">
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Naam
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Type
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Hero type
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Databronnen
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Laatst bijgewerkt
              </th>
            </tr>
          </thead>
          <tbody>
            {klips.map((klip) => {
              const componentType = klip.component_type || "onbekend";
              const typeLabel = KLIPFOLIO_COMPONENT_TYPES[componentType] || componentType;
              const heroType = KLIPFOLIO_TO_HERO_TYPE[componentType] || "custom";

              const dsNames: string[] = [];
              if (klip.datasources) {
                for (const dsRef of klip.datasources) {
                  const dsId = dsRef.datasource_id || dsRef.id;
                  const ds = dsMap.get(dsId);
                  dsNames.push(ds?.name || dsRef.name || dsId);
                }
              }

              return (
                <tr
                  key={klip.id}
                  className="border-b border-hero-grey-light/50 last:border-0 hover:bg-hero-blue-hairline/50 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-hero-grey-black">
                    <div className="max-w-xs truncate">{klip.name || "-"}</div>
                    {klip.description && (
                      <div className="text-xs text-hero-grey-regular max-w-xs truncate">
                        {klip.description}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="rounded bg-hero-grey-light/60 px-2 py-1 text-xs text-hero-grey-regular">
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="rounded bg-hero-blue-hairline px-2 py-1 text-xs text-hero-blue">
                      {heroType}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {dsNames.length > 0
                        ? dsNames.map((name, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-full bg-hero-grey-light/40 px-2 py-0.5 text-[10px] text-hero-grey-regular"
                            >
                              {name}
                            </span>
                          ))
                        : <span className="text-xs text-hero-grey-regular">-</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                    {formatDate(klip.last_updated)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Datasources Table (Enhanced)                                        */
/* ------------------------------------------------------------------ */

function DatasourcesTable({
  datasources,
  klips,
}: {
  datasources: KlipfolioDatasourceDetail[];
  klips: KlipfolioKlipDetail[];
}) {
  // Count how many klips use each datasource
  const dsUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const klip of klips) {
      if (klip.datasources) {
        for (const dsRef of klip.datasources) {
          const dsId = dsRef.datasource_id || dsRef.id;
          usage.set(dsId, (usage.get(dsId) || 0) + 1);
        }
      }
    }
    return usage;
  }, [klips]);

  if (datasources.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="database"
          title="Geen databronnen gevonden"
          description="Pas je zoekopdracht aan of controleer je Klipfolio-account."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto -m-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hero-grey-light text-left">
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Naam
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Connector
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Gebruikt door
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Verversing
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Laatst ververst
              </th>
            </tr>
          </thead>
          <tbody>
            {datasources.map((ds) => {
              const connector = ds.connector || ds.type || "onbekend";
              const connectorLabel = KLIPFOLIO_CONNECTOR_TYPES[connector] || connector;
              const usageCount = dsUsage.get(ds.id) || 0;

              return (
                <tr
                  key={ds.id}
                  className="border-b border-hero-grey-light/50 last:border-0 hover:bg-hero-blue-hairline/50 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-hero-grey-black">
                    <div className="max-w-xs truncate">{ds.name || "-"}</div>
                    {ds.description && (
                      <div className="text-xs text-hero-grey-regular max-w-xs truncate">
                        {ds.description}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="rounded bg-hero-grey-light/60 px-2 py-1 text-xs text-hero-grey-regular">
                      {connectorLabel}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {usageCount > 0 ? (
                      <Badge variant="info">{usageCount} klips</Badge>
                    ) : (
                      <span className="text-xs text-hero-grey-regular">
                        Niet gebruikt
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                    {formatRefreshInterval(ds.refresh_interval)}
                  </td>
                  <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                    {formatDate(ds.date_last_refresh)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Insights Panel                                                      */
/* ------------------------------------------------------------------ */

function InsightsPanel({
  componentTypeCounts,
  connectorTypeCounts,
  klips,
  datasources,
}: {
  componentTypeCounts: [string, number][];
  connectorTypeCounts: [string, number][];
  klips: KlipfolioKlipDetail[];
  datasources: KlipfolioDatasourceDetail[];
}) {
  // Klips without datasources
  const klipsWithoutDs = klips.filter(
    (k) => !k.datasources || k.datasources.length === 0
  ).length;

  // Unused datasources
  const usedDsIds = new Set<string>();
  for (const klip of klips) {
    if (klip.datasources) {
      for (const dsRef of klip.datasources) {
        usedDsIds.add(dsRef.datasource_id || dsRef.id);
      }
    }
  }
  const unusedDs = datasources.filter((d) => !usedDsIds.has(d.id)).length;

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon="bar_chart"
          label="Visualisatietypen"
          value={componentTypeCounts.length.toString()}
        />
        <StatCard
          icon="database"
          label="Databrontypen"
          value={connectorTypeCounts.length.toString()}
        />
        <StatCard
          icon="warning"
          label="Klips zonder databron"
          value={klipsWithoutDs.toString()}
        />
        <StatCard
          icon="delete"
          label="Ongebruikte databronnen"
          value={unusedDs.toString()}
        />
      </div>

      {/* Component types breakdown */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
          Visualisatietypen
        </h3>
        <div className="space-y-2">
          {componentTypeCounts.map(([type, count]) => {
            const label = KLIPFOLIO_COMPONENT_TYPES[type] || type;
            const heroType = KLIPFOLIO_TO_HERO_TYPE[type] || "custom";
            const pct = Math.round((count / klips.length) * 100);
            return (
              <div key={type} className="flex items-center gap-3">
                <div className="w-40 text-sm text-hero-grey-black truncate">
                  {label}
                </div>
                <div className="flex-1">
                  <div className="h-4 overflow-hidden rounded-full bg-hero-grey-light/30">
                    <div
                      className="h-full rounded-full bg-hero-blue transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="w-10 text-right text-xs tabular-nums text-hero-grey-regular">
                  {count}
                </div>
                <div className="w-24">
                  <span className="rounded bg-hero-blue-hairline px-1.5 py-0.5 text-[10px] text-hero-blue">
                    → {heroType}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Connector types breakdown */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
          Databrontypen
        </h3>
        <div className="space-y-2">
          {connectorTypeCounts.map(([type, count]) => {
            const label = KLIPFOLIO_CONNECTOR_TYPES[type] || type;
            const pct = Math.round((count / datasources.length) * 100);
            return (
              <div key={type} className="flex items-center gap-3">
                <div className="w-40 text-sm text-hero-grey-black truncate">
                  {label}
                </div>
                <div className="flex-1">
                  <div className="h-4 overflow-hidden rounded-full bg-hero-grey-light/30">
                    <div
                      className="h-full rounded-full bg-hero-orange transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="w-10 text-right text-xs tabular-nums text-hero-grey-regular">
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Migration readiness */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-hero-grey-black">
          Migratie-gereedheid
        </h3>
        <div className="space-y-3">
          {componentTypeCounts.map(([type, count]) => {
            const heroType = KLIPFOLIO_TO_HERO_TYPE[type];
            const label = KLIPFOLIO_COMPONENT_TYPES[type] || type;
            const isSupported = !!heroType && heroType !== "custom_component";
            return (
              <div
                key={type}
                className="flex items-center justify-between border-b border-hero-grey-light/50 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`material-symbols-rounded text-[16px] ${
                      isSupported ? "text-green-500" : "text-hero-orange"
                    }`}
                  >
                    {isSupported ? "check_circle" : "warning"}
                  </span>
                  <span className="text-sm text-hero-grey-black">
                    {label}
                  </span>
                  <span className="text-xs text-hero-grey-regular">
                    ({count}x)
                  </span>
                </div>
                <span
                  className={`text-xs ${
                    isSupported ? "text-green-600" : "text-hero-orange"
                  }`}
                >
                  {isSupported ? `→ ${heroType}` : "Handmatige aanpassing nodig"}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="material-symbols-rounded text-[24px] text-hero-blue">
          {icon}
        </span>
        <div>
          <p className="text-xl font-bold text-hero-grey-black tabular-nums">
            {value}
          </p>
          <p className="text-xs text-hero-grey-regular">{label}</p>
        </div>
      </div>
    </Card>
  );
}
