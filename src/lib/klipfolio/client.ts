// ============================================================================
// Klipfolio API Client — Deep Discovery Edition
// ============================================================================

import type {
  KlipfolioTab,
  KlipfolioTabDetail,
  KlipfolioKlip,
  KlipfolioKlipDetail,
  KlipfolioDatasource,
  KlipfolioDatasourceDetail,
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
    const text = await res.text().catch(() => "Onbekende fout");
    throw new Error(`Klipfolio API fout (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------- Tabs (Dashboards) ----------

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

export async function getKlipfolioTabKlips(tabId: string): Promise<KlipfolioKlipDetail[]> {
  try {
    const data = await klipfolioFetch<KlipfolioListResponse<{ klips: KlipfolioKlipDetail[] }>>(
      `/tabs/${tabId}/klips?limit=200`
    );
    return data.data.klips || [];
  } catch {
    // Fallback: some Klipfolio versions don't support /tabs/{id}/klips
    return [];
  }
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
  }

  return allTabs;
}

// ---------- Klips ----------

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

export async function getAllKlipfolioKlips(): Promise<KlipfolioKlip[]> {
  const allKlips: KlipfolioKlip[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { klips, total } = await getKlipfolioKlips(limit, offset);
    allKlips.push(...klips);
    offset += limit;
    if (offset >= total || klips.length === 0) break;
  }

  return allKlips;
}

export async function getKlipfolioKlipDetails(klipIds: string[]): Promise<KlipfolioKlipDetail[]> {
  const batchSize = 5;
  const results: KlipfolioKlipDetail[] = [];

  for (let i = 0; i < klipIds.length; i += batchSize) {
    const batch = klipIds.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((id) => getKlipfolioKlip(id))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

// ---------- Datasources ----------

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

export async function getAllKlipfolioDatasources(): Promise<KlipfolioDatasource[]> {
  const allDs: KlipfolioDatasource[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { datasources, total } = await getKlipfolioDatasources(limit, offset);
    allDs.push(...datasources);
    offset += limit;
    if (offset >= total || datasources.length === 0) break;
  }

  return allDs;
}

export async function getKlipfolioDatasourceDetails(dsIds: string[]): Promise<KlipfolioDatasourceDetail[]> {
  const batchSize = 5;
  const results: KlipfolioDatasourceDetail[] = [];

  for (let i = 0; i < dsIds.length; i += batchSize) {
    const batch = dsIds.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((id) => getKlipfolioDatasource(id))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

// ---------- Utility ----------

export function isKlipfolioConfigured(): boolean {
  return !!(process.env.KLIPFOLIO_API_KEY && process.env.KLIPFOLIO_USER_ID);
}
