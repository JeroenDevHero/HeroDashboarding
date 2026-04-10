"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import type {
  KlipfolioTab,
  KlipfolioKlip,
  KlipfolioDatasource,
} from "@/lib/klipfolio/client";

interface Props {
  tabs: KlipfolioTab[];
  tabsTotal: number;
  klips: KlipfolioKlip[];
  klipsTotal: number;
  datasources: KlipfolioDatasource[];
  datasourcesTotal: number;
}

type TabKey = "dashboards" | "klips" | "datasources";

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

  // Reset visible count and search when switching tabs
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearch("");
    setVisibleCount(PAGE_SIZE);
  };

  const tabConfig: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: "dashboards", label: "Dashboards", icon: "dashboard", count: tabsTotal },
    { key: "klips", label: "Klips", icon: "bar_chart", count: klipsTotal },
    { key: "datasources", label: "Databronnen", icon: "database", count: datasourcesTotal },
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
        k.description?.toLowerCase().includes(q)
    );
  }, [klips, search]);

  const filteredDatasources = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return datasources;
    return datasources.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [datasources, search]);

  const currentFilteredCount =
    activeTab === "dashboards"
      ? filteredTabs.length
      : activeTab === "klips"
        ? filteredKlips.length
        : filteredDatasources.length;

  const hasMore = visibleCount < currentFilteredCount;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="info">{tabsTotal} dashboards</Badge>
        <Badge variant="info">{klipsTotal} klips</Badge>
        <Badge variant="info">{datasourcesTotal} databronnen</Badge>
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

      {/* Search */}
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

      {/* Tab content */}
      {activeTab === "dashboards" && (
        <DashboardsTable tabs={filteredTabs.slice(0, visibleCount)} />
      )}
      {activeTab === "klips" && (
        <KlipsTable klips={filteredKlips.slice(0, visibleCount)} />
      )}
      {activeTab === "datasources" && (
        <DatasourcesTable
          datasources={filteredDatasources.slice(0, visibleCount)}
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
/* Sub-components                                                      */
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

function KlipsTable({ klips }: { klips: KlipfolioKlip[] }) {
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
                Beschrijving
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Aangemaakt
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Laatst bijgewerkt
              </th>
            </tr>
          </thead>
          <tbody>
            {klips.map((klip) => (
              <tr
                key={klip.id}
                className="border-b border-hero-grey-light/50 last:border-0 hover:bg-hero-blue-hairline/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-hero-grey-black whitespace-nowrap">
                  {klip.name || "-"}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular max-w-md truncate">
                  {klip.description || "-"}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                  {formatDate(klip.date_created)}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                  {formatDate(klip.last_updated)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DatasourcesTable({
  datasources,
}: {
  datasources: KlipfolioDatasource[];
}) {
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
                Beschrijving
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Verversingsinterval
              </th>
              <th className="px-5 py-3 font-medium text-hero-grey-regular text-xs">
                Laatst ververst
              </th>
            </tr>
          </thead>
          <tbody>
            {datasources.map((ds) => (
              <tr
                key={ds.id}
                className="border-b border-hero-grey-light/50 last:border-0 hover:bg-hero-blue-hairline/50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-hero-grey-black whitespace-nowrap">
                  {ds.name || "-"}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular max-w-md truncate">
                  {ds.description || "-"}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                  {formatRefreshInterval(ds.refresh_interval)}
                </td>
                <td className="px-5 py-3 text-hero-grey-regular whitespace-nowrap">
                  {formatDate(ds.date_last_refresh)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
