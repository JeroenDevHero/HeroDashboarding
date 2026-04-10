// ============================================================================
// Klipfolio Discovery — Deep scan of all dashboards, klips & datasources
// ============================================================================

import {
  getAllKlipfolioTabs,
  getAllKlipfolioKlips,
  getAllKlipfolioDatasources,
  getKlipfolioTabKlips,
  getKlipfolioKlipDetails,
  getKlipfolioDatasourceDetails,
} from "./client";
import {
  KLIPFOLIO_TO_HERO_TYPE,
  KLIPFOLIO_COMPONENT_TYPES,
  KLIPFOLIO_CONNECTOR_TYPES,
} from "./types";
import type {
  KlipfolioDiscoveryResult,
  KlipfolioDashboardMap,
  KlipfolioKlipMap,
  KlipfolioDatasourceMap,
  KlipfolioDatasourceRef,
  KlipfolioKlipDetail,
  KlipfolioDatasourceDetail,
} from "./types";

export interface DiscoveryProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: DiscoveryProgress) => void;

/**
 * Perform a deep discovery of the entire Klipfolio environment.
 * Fetches all dashboards, klips, datasources and maps their relationships.
 */
export async function discoverKlipfolioEnvironment(
  onProgress?: ProgressCallback
): Promise<KlipfolioDiscoveryResult> {
  const progress = (phase: string, current: number, total: number, message: string) => {
    onProgress?.({ phase, current, total, message });
  };

  // Phase 1: Fetch all basic lists
  progress("lists", 0, 3, "Ophalen van dashboards...");
  const allTabs = await getAllKlipfolioTabs();

  progress("lists", 1, 3, "Ophalen van klips...");
  const allKlips = await getAllKlipfolioKlips();

  progress("lists", 2, 3, "Ophalen van databronnen...");
  const allDatasources = await getAllKlipfolioDatasources();

  progress("lists", 3, 3, `Gevonden: ${allTabs.length} dashboards, ${allKlips.length} klips, ${allDatasources.length} databronnen`);

  // Phase 2: Fetch klips per tab (dashboard -> klip mapping)
  const tabKlipMap = new Map<string, KlipfolioKlipDetail[]>();
  for (let i = 0; i < allTabs.length; i++) {
    const tab = allTabs[i];
    progress("tab-klips", i, allTabs.length, `Klips ophalen voor dashboard "${tab.name}"...`);
    const tabKlips = await getKlipfolioTabKlips(tab.id);
    tabKlipMap.set(tab.id, tabKlips);
  }

  // Phase 3: Fetch detailed klip info (component_type, datasources)
  progress("klip-details", 0, allKlips.length, "Klip details ophalen...");
  const klipDetails = await getKlipfolioKlipDetails(allKlips.map((k) => k.id));
  progress("klip-details", klipDetails.length, allKlips.length, `${klipDetails.length} klip details opgehaald`);

  // Build klip detail map
  const klipDetailMap = new Map<string, KlipfolioKlipDetail>();
  for (const detail of klipDetails) {
    klipDetailMap.set(detail.id, detail);
  }

  // Phase 4: Collect unique datasource IDs from klip details
  const referencedDsIds = new Set<string>();
  for (const detail of klipDetails) {
    if (detail.datasources) {
      for (const ds of detail.datasources) {
        referencedDsIds.add(ds.datasource_id || ds.id);
      }
    }
  }
  // Also add all known datasources
  for (const ds of allDatasources) {
    referencedDsIds.add(ds.id);
  }

  // Phase 5: Fetch detailed datasource info (connector, properties)
  progress("ds-details", 0, referencedDsIds.size, "Databron details ophalen...");
  const dsDetails = await getKlipfolioDatasourceDetails(Array.from(referencedDsIds));
  progress("ds-details", dsDetails.length, referencedDsIds.size, `${dsDetails.length} databron details opgehaald`);

  // Build datasource detail map
  const dsDetailMap = new Map<string, KlipfolioDatasourceDetail>();
  for (const ds of dsDetails) {
    dsDetailMap.set(ds.id, ds);
  }

  // Phase 6: Build the mapped result
  progress("mapping", 0, 1, "Relaties in kaart brengen...");

  // Track which klips are assigned to tabs
  const assignedKlipIds = new Set<string>();

  // Track datasource usage
  const dsUsage = new Map<string, Set<string>>();

  // Build dashboard maps
  const dashboards: KlipfolioDashboardMap[] = allTabs.map((tab) => {
    const tabKlips = tabKlipMap.get(tab.id) || [];

    const klipMaps: KlipfolioKlipMap[] = tabKlips.map((tk) => {
      const klipId = tk.id;
      assignedKlipIds.add(klipId);
      const detail = klipDetailMap.get(klipId);

      const dsRefs: KlipfolioDatasourceRef[] = [];
      if (detail?.datasources) {
        for (const dsRef of detail.datasources) {
          const dsId = dsRef.datasource_id || dsRef.id;
          const dsDetail = dsDetailMap.get(dsId);

          // Track usage
          if (!dsUsage.has(dsId)) dsUsage.set(dsId, new Set());
          dsUsage.get(dsId)!.add(klipId);

          dsRefs.push({
            id: dsId,
            name: dsDetail?.name || dsRef.name || "Onbekend",
            connector: dsDetail?.connector || dsDetail?.type || "onbekend",
            format: dsDetail?.format,
            refreshInterval: dsDetail?.refresh_interval,
          });
        }
      }

      return {
        id: klipId,
        name: detail?.name || tk.name || "Naamloze klip",
        description: detail?.description || "",
        componentType: detail?.component_type || "onbekend",
        datasources: dsRefs,
        properties: detail?.properties,
        position: tk.row != null ? {
          row: tk.row,
          col: tk.col,
          sizeX: tk.size_x,
          sizeY: tk.size_y,
        } : undefined,
      };
    });

    // If no tab klips were returned, try to match klips by name relevance
    if (klipMaps.length === 0) {
      const tabNameLower = tab.name.toLowerCase();
      const tabWords = tabNameLower.split(/\s+/).filter((w) => w.length > 2);

      for (const klip of klipDetails) {
        if (assignedKlipIds.has(klip.id)) continue;
        const klipNameLower = (klip.name || "").toLowerCase();

        const matches = tabWords.some((word) => klipNameLower.includes(word));
        if (matches || klipNameLower.includes(tabNameLower) || tabNameLower.includes(klipNameLower)) {
          assignedKlipIds.add(klip.id);

          const dsRefs: KlipfolioDatasourceRef[] = [];
          if (klip.datasources) {
            for (const dsRef of klip.datasources) {
              const dsId = dsRef.datasource_id || dsRef.id;
              const dsDetail = dsDetailMap.get(dsId);
              if (!dsUsage.has(dsId)) dsUsage.set(dsId, new Set());
              dsUsage.get(dsId)!.add(klip.id);

              dsRefs.push({
                id: dsId,
                name: dsDetail?.name || dsRef.name || "Onbekend",
                connector: dsDetail?.connector || dsDetail?.type || "onbekend",
                format: dsDetail?.format,
                refreshInterval: dsDetail?.refresh_interval,
              });
            }
          }

          klipMaps.push({
            id: klip.id,
            name: klip.name || "Naamloze klip",
            description: klip.description || "",
            componentType: klip.component_type || "onbekend",
            datasources: dsRefs,
            properties: klip.properties,
          });
        }
      }
    }

    return {
      id: tab.id,
      name: tab.name,
      description: tab.description || "",
      klips: klipMaps,
    };
  });

  // Orphaned klips (not assigned to any tab)
  const orphanedKlips: KlipfolioKlipMap[] = klipDetails
    .filter((k) => !assignedKlipIds.has(k.id))
    .map((klip) => {
      const dsRefs: KlipfolioDatasourceRef[] = [];
      if (klip.datasources) {
        for (const dsRef of klip.datasources) {
          const dsId = dsRef.datasource_id || dsRef.id;
          const dsDetail = dsDetailMap.get(dsId);
          if (!dsUsage.has(dsId)) dsUsage.set(dsId, new Set());
          dsUsage.get(dsId)!.add(klip.id);

          dsRefs.push({
            id: dsId,
            name: dsDetail?.name || dsRef.name || "Onbekend",
            connector: dsDetail?.connector || dsDetail?.type || "onbekend",
            format: dsDetail?.format,
            refreshInterval: dsDetail?.refresh_interval,
          });
        }
      }

      return {
        id: klip.id,
        name: klip.name || "Naamloze klip",
        description: klip.description || "",
        componentType: klip.component_type || "onbekend",
        datasources: dsRefs,
        properties: klip.properties,
      };
    });

  // Build datasource map
  const datasourcesList: KlipfolioDatasourceMap[] = dsDetails.map((ds) => ({
    id: ds.id,
    name: ds.name || "Naamloze databron",
    description: ds.description || "",
    connector: ds.connector || ds.type || "onbekend",
    format: ds.format,
    refreshInterval: ds.refresh_interval,
    lastRefresh: ds.date_last_refresh,
    usedByKlips: Array.from(dsUsage.get(ds.id) || []),
  }));

  // Build summary statistics
  const componentTypes: Record<string, number> = {};
  const connectorTypes: Record<string, number> = {};

  for (const detail of klipDetails) {
    const ct = detail.component_type || "onbekend";
    componentTypes[ct] = (componentTypes[ct] || 0) + 1;
  }

  for (const ds of dsDetails) {
    const connector = ds.connector || ds.type || "onbekend";
    connectorTypes[connector] = (connectorTypes[connector] || 0) + 1;
  }

  progress("mapping", 1, 1, "Discovery voltooid!");

  return {
    discoveredAt: new Date().toISOString(),
    summary: {
      totalDashboards: allTabs.length,
      totalKlips: allKlips.length,
      totalDatasources: allDatasources.length,
      componentTypes,
      connectorTypes,
    },
    dashboards,
    orphanedKlips,
    datasources: datasourcesList,
  };
}

/**
 * Generate a human-readable knowledge text from discovery results.
 * This text is suitable for AI prompts and rebuild instructions.
 */
export function generateKnowledgeText(result: KlipfolioDiscoveryResult): string {
  const lines: string[] = [];

  lines.push("# Klipfolio Omgeving — Volledige Inventarisatie");
  lines.push(`Ontdekt op: ${new Date(result.discoveredAt).toLocaleDateString("nl-NL")}`);
  lines.push("");

  // Summary
  lines.push("## Samenvatting");
  lines.push(`- ${result.summary.totalDashboards} dashboards`);
  lines.push(`- ${result.summary.totalKlips} klips (visualisaties)`);
  lines.push(`- ${result.summary.totalDatasources} databronnen`);
  lines.push("");

  // Component types
  lines.push("### Visualisatietypen");
  for (const [type, count] of Object.entries(result.summary.componentTypes).sort((a, b) => b[1] - a[1])) {
    const label = KLIPFOLIO_COMPONENT_TYPES[type] || type;
    const heroType = KLIPFOLIO_TO_HERO_TYPE[type] || "custom_component";
    lines.push(`- ${label} (${type}): ${count}x → Hero type: ${heroType}`);
  }
  lines.push("");

  // Connector types
  lines.push("### Databrontypen");
  for (const [type, count] of Object.entries(result.summary.connectorTypes).sort((a, b) => b[1] - a[1])) {
    const label = KLIPFOLIO_CONNECTOR_TYPES[type] || type;
    lines.push(`- ${label} (${type}): ${count}x`);
  }
  lines.push("");

  // Dashboards
  lines.push("## Dashboards");
  lines.push("");
  for (const dash of result.dashboards) {
    lines.push(`### ${dash.name}`);
    if (dash.description) lines.push(`> ${dash.description}`);
    lines.push(`Klipfolio ID: ${dash.id}`);
    lines.push(`Aantal klips: ${dash.klips.length}`);
    lines.push("");

    if (dash.klips.length > 0) {
      lines.push("| Klip | Type | Databronnen |");
      lines.push("|------|------|-------------|");
      for (const klip of dash.klips) {
        const typeLabel = KLIPFOLIO_COMPONENT_TYPES[klip.componentType] || klip.componentType;
        const dsNames = klip.datasources.map((d) => d.name).join(", ") || "Geen";
        lines.push(`| ${klip.name} | ${typeLabel} | ${dsNames} |`);
      }
      lines.push("");
    }
  }

  // Orphaned klips
  if (result.orphanedKlips.length > 0) {
    lines.push("## Losse klips (niet op een dashboard)");
    lines.push("");
    lines.push("| Klip | Type | Databronnen |");
    lines.push("|------|------|-------------|");
    for (const klip of result.orphanedKlips) {
      const typeLabel = KLIPFOLIO_COMPONENT_TYPES[klip.componentType] || klip.componentType;
      const dsNames = klip.datasources.map((d) => d.name).join(", ") || "Geen";
      lines.push(`| ${klip.name} | ${typeLabel} | ${dsNames} |`);
    }
    lines.push("");
  }

  // Datasources
  lines.push("## Databronnen");
  lines.push("");
  lines.push("| Databron | Type | Verversing | Gebruikt door |");
  lines.push("|----------|------|------------|---------------|");
  for (const ds of result.datasources) {
    const connectorLabel = KLIPFOLIO_CONNECTOR_TYPES[ds.connector] || ds.connector;
    const refresh = ds.refreshInterval
      ? ds.refreshInterval < 3600
        ? `${Math.round(ds.refreshInterval / 60)} min`
        : `${Math.round(ds.refreshInterval / 3600)} uur`
      : "-";
    const usedBy = ds.usedByKlips.length > 0 ? `${ds.usedByKlips.length} klips` : "Niet gebruikt";
    lines.push(`| ${ds.name} | ${connectorLabel} | ${refresh} | ${usedBy} |`);
  }

  return lines.join("\n");
}

/**
 * Generate rebuild instructions for a specific dashboard.
 * This provides the AI with detailed context for recreating a dashboard.
 */
export function generateRebuildInstructions(
  dashboard: KlipfolioDashboardMap,
  allDatasources: KlipfolioDatasourceMap[]
): string {
  const lines: string[] = [];

  lines.push(`# Herbouwinstructies: "${dashboard.name}"`);
  lines.push("");
  lines.push("## Overzicht");
  lines.push(`Dit Klipfolio dashboard bevat ${dashboard.klips.length} visualisaties.`);
  if (dashboard.description) lines.push(`Beschrijving: ${dashboard.description}`);
  lines.push("");

  lines.push("## Klips om te herbouwen");
  lines.push("");

  for (let i = 0; i < dashboard.klips.length; i++) {
    const klip = dashboard.klips[i];
    const typeLabel = KLIPFOLIO_COMPONENT_TYPES[klip.componentType] || klip.componentType;
    const heroType = KLIPFOLIO_TO_HERO_TYPE[klip.componentType] || "custom_component";

    lines.push(`### ${i + 1}. ${klip.name}`);
    lines.push(`- **Klipfolio type:** ${typeLabel} (${klip.componentType})`);
    lines.push(`- **Hero type:** ${heroType}`);

    if (klip.description) {
      lines.push(`- **Beschrijving:** ${klip.description}`);
    }

    if (klip.datasources.length > 0) {
      lines.push("- **Databronnen:**");
      for (const ds of klip.datasources) {
        const dsDetail = allDatasources.find((d) => d.id === ds.id);
        const connectorLabel = KLIPFOLIO_CONNECTOR_TYPES[ds.connector] || ds.connector;
        lines.push(`  - ${ds.name} (${connectorLabel})`);
        if (dsDetail?.description) {
          lines.push(`    Beschrijving: ${dsDetail.description}`);
        }
      }
    }

    if (klip.position) {
      lines.push(`- **Positie:** rij ${klip.position.row}, kolom ${klip.position.col}, ${klip.position.sizeX}x${klip.position.sizeY}`);
    }

    lines.push("");
  }

  // Datasource summary
  const uniqueDsIds = new Set<string>();
  for (const klip of dashboard.klips) {
    for (const ds of klip.datasources) {
      uniqueDsIds.add(ds.id);
    }
  }

  if (uniqueDsIds.size > 0) {
    lines.push("## Benodigde databronnen");
    lines.push("De volgende databronnen worden gebruikt door dit dashboard:");
    lines.push("");
    for (const dsId of uniqueDsIds) {
      const ds = allDatasources.find((d) => d.id === dsId);
      if (ds) {
        const connectorLabel = KLIPFOLIO_CONNECTOR_TYPES[ds.connector] || ds.connector;
        lines.push(`- **${ds.name}** (${connectorLabel})`);
        if (ds.description) lines.push(`  ${ds.description}`);
      }
    }
    lines.push("");
  }

  lines.push("## Aanbevelingen");
  lines.push("1. Zoek in de Hero data catalog naar overeenkomstige tabellen/data");
  lines.push("2. Gebruik preview_data om de data te verkennen voordat je klips maakt");
  lines.push("3. Pas de visualisatietypen aan naar wat het beste werkt met de beschikbare data");
  lines.push("4. Gebruik Nederlandse labels en het Hero kleurenschema");

  return lines.join("\n");
}
