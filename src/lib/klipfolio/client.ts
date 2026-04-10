// ============================================================================
// Klipfolio API Client — Deep Discovery Edition
// ============================================================================
// Base URL: https://app.klipfolio.com/api/1
// Auth: kf-api-key + kf-user-id headers
// Rate limit: 5 requests/second — batching respects this
// Pagination: limit (max 100) + offset

import type {
  KlipfolioTab,
  KlipfolioTabDetail,
  KlipfolioKlip,
  KlipfolioKlipDetail,
  KlipfolioKlipInstance,
  KlipfolioKlipSchema,
  KlipfolioDatasource,
  KlipfolioDatasourceDetail,
  KlipfolioDatasourceProperties,
  KlipfolioListResponse,
} from "./types";

// Re-export types for backward compatibility
export type {
  KlipfolioTab,
  KlipfolioKlip,
  KlipfolioDatasource,
  KlipfolioListResponse,
} from "./types";

const BASE_URL = "https://app.klipfolio.com/api/1";

/** Max concurrent requests to stay under 5 req/sec rate limit */
const BATCH_SIZE = 4;

/** Small delay between batches to respect rate limit */
const BATCH_DELAY_MS = 250;

function getHeaders(): Record<string, string> {
  const apiKey = process.env.KLIPFOLIO_API_KEY;
  const userId = process.env.KLIPFOLIO_USER_ID;

  if (!apiKey || !userId) {
    throw new Error("KLIPFOLIO_API_KEY en KLIPFOLIO_USER_ID zijn niet geconfigureerd");
  }

  return {
    "kf-api-key": apiKey,
    "kf-user-id": userId,
  };
}

async function klipfolioFetch<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: getHeaders(),
    next: { revalidate },
  });

  if (!res.ok) {
    if (res.status === 429) {
      // Rate limited — wait and retry once
      await sleep(1000);
      const retry = await fetch(`${BASE_URL}${path}`, {
        headers: getHeaders(),
        next: { revalidate },
      });
      if (!retry.ok) {
        const text = await retry.text().catch(() => "Rate limit exceeded");
        throw new Error(`Klipfolio API fout (${retry.status}): ${text}`);
      }
      return retry.json() as Promise<T>;
    }
    const text = await res.text().catch(() => "Onbekende fout");
    throw new Error(`Klipfolio API fout (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function batchFetch<T>(
  ids: string[],
  fetcher: (id: string) => Promise<T>
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY_MS);
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(fetcher));

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

// ========================================================================
// TABS (Dashboards)
// ========================================================================

export async function getKlipfolioTabs(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ tabs: KlipfolioTab[] }>>(
    `/tabs?limit=${limit}&offset=${offset}`
  );
  return { tabs: data.data.tabs, total: data.meta.total };
}

export async function getKlipfolioTab(id: string): Promise<KlipfolioTabDetail> {
  const data = await klipfolioFetch<{ data: KlipfolioTabDetail }>(`/tabs/${id}`);
  return data.data;
}

/**
 * Get klip instances on a tab — the correct endpoint per Klipfolio API docs.
 * Returns which klips are placed on a dashboard with their positions.
 */
export async function getKlipfolioTabKlipInstances(tabId: string): Promise<KlipfolioKlipInstance[]> {
  try {
    const data = await klipfolioFetch<{ data: { klip_instances: KlipfolioKlipInstance[] } }>(
      `/tabs/${tabId}/klip-instances`
    );
    return data.data.klip_instances || [];
  } catch {
    return [];
  }
}

/** @deprecated Use getKlipfolioTabKlipInstances instead */
export async function getKlipfolioTabKlips(tabId: string): Promise<KlipfolioKlipDetail[]> {
  const instances = await getKlipfolioTabKlipInstances(tabId);
  // Convert instances to KlipfolioKlipDetail-like objects
  return instances.map((inst) => ({
    id: inst.klip_id || inst.id,
    name: inst.name || "",
    description: "",
  }));
}

export async function getAllKlipfolioTabs(): Promise<KlipfolioTab[]> {
  const allTabs: KlipfolioTab[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { tabs, total } = await getKlipfolioTabs(limit, offset);
    allTabs.push(...tabs);
    offset += limit;
    if (offset >= total || tabs.length === 0) break;
    await sleep(BATCH_DELAY_MS);
  }

  return allTabs;
}

// ========================================================================
// KLIPS (Visualizations)
// ========================================================================

export async function getKlipfolioKlips(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ klips: KlipfolioKlip[] }>>(
    `/klips?limit=${limit}&offset=${offset}`
  );
  return { klips: data.data.klips, total: data.meta.total };
}

export async function getKlipfolioKlip(id: string): Promise<KlipfolioKlipDetail> {
  const data = await klipfolioFetch<{ data: KlipfolioKlipDetail }>(`/klips/${id}`);
  return data.data;
}

/**
 * Get the visualization schema for a klip.
 * Contains component type, data bindings, formulas, and layout config.
 */
export async function getKlipfolioKlipSchema(klipId: string): Promise<KlipfolioKlipSchema> {
  const data = await klipfolioFetch<{ data: KlipfolioKlipSchema }>(`/klips/${klipId}/schema`);
  return data.data;
}

export async function getAllKlipfolioKlips(): Promise<KlipfolioKlip[]> {
  const allKlips: KlipfolioKlip[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { klips, total } = await getKlipfolioKlips(limit, offset);
    allKlips.push(...klips);
    offset += limit;
    if (offset >= total || klips.length === 0) break;
    await sleep(BATCH_DELAY_MS);
  }

  return allKlips;
}

export async function getKlipfolioKlipDetails(klipIds: string[]): Promise<KlipfolioKlipDetail[]> {
  return batchFetch(klipIds, getKlipfolioKlip);
}

export async function getKlipfolioKlipSchemas(klipIds: string[]): Promise<KlipfolioKlipSchema[]> {
  return batchFetch(klipIds, getKlipfolioKlipSchema);
}

// ========================================================================
// DATASOURCES
// ========================================================================

export async function getKlipfolioDatasources(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ datasources: KlipfolioDatasource[] }>>(
    `/datasources?limit=${limit}&offset=${offset}`
  );
  return { datasources: data.data.datasources, total: data.meta.total };
}

export async function getKlipfolioDatasource(id: string): Promise<KlipfolioDatasourceDetail> {
  const data = await klipfolioFetch<{ data: KlipfolioDatasourceDetail }>(`/datasources/${id}`);
  return data.data;
}

/**
 * Get connection properties for a datasource.
 * Returns connector-specific details: URL, query, credentials, etc.
 */
export async function getKlipfolioDatasourceProperties(dsId: string): Promise<KlipfolioDatasourceProperties> {
  const data = await klipfolioFetch<{ data: { properties: Record<string, unknown> } }>(
    `/datasources/${dsId}/properties`
  );
  return { datasource_id: dsId, properties: data.data.properties };
}

export async function getAllKlipfolioDatasources(): Promise<KlipfolioDatasource[]> {
  const allDs: KlipfolioDatasource[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { datasources, total } = await getKlipfolioDatasources(limit, offset);
    allDs.push(...datasources);
    offset += limit;
    if (offset >= total || datasources.length === 0) break;
    await sleep(BATCH_DELAY_MS);
  }

  return allDs;
}

export async function getKlipfolioDatasourceDetails(dsIds: string[]): Promise<KlipfolioDatasourceDetail[]> {
  return batchFetch(dsIds, getKlipfolioDatasource);
}

export async function getKlipfolioDatasourcePropertiesBatch(
  dsIds: string[]
): Promise<KlipfolioDatasourceProperties[]> {
  return batchFetch(dsIds, getKlipfolioDatasourceProperties);
}

// ========================================================================
// Utility
// ========================================================================

export function isKlipfolioConfigured(): boolean {
  return !!(process.env.KLIPFOLIO_API_KEY && process.env.KLIPFOLIO_USER_ID);
}
