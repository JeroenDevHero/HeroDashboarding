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

export interface KlipfolioTab {
  id: string;
  name: string;
  description: string;
}

export interface KlipfolioKlip {
  id: string;
  name: string;
  description: string;
  created_by?: string;
  date_created?: string;
  last_updated?: string;
}

export interface KlipfolioDatasource {
  id: string;
  name: string;
  description: string;
  refresh_interval?: number;
  date_last_refresh?: string;
}

export interface KlipfolioListResponse<T> {
  meta: { total: number };
  data: T;
}

async function klipfolioFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: getHeaders(),
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Onbekende fout");
    throw new Error(`Klipfolio API fout (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function getKlipfolioTabs(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ tabs: KlipfolioTab[] }>>(
    `/tabs?limit=${limit}&offset=${offset}`
  );
  return { tabs: data.data.tabs, total: data.meta.total };
}

export async function getKlipfolioTab(id: string) {
  const data = await klipfolioFetch<{ data: KlipfolioTab }>(`/tabs/${id}`);
  return data.data;
}

export async function getKlipfolioKlips(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ klips: KlipfolioKlip[] }>>(
    `/klips?limit=${limit}&offset=${offset}`
  );
  return { klips: data.data.klips, total: data.meta.total };
}

export async function getKlipfolioKlip(id: string) {
  const data = await klipfolioFetch<{ data: KlipfolioKlip }>(`/klips/${id}`);
  return data.data;
}

export async function getKlipfolioDatasources(limit = 50, offset = 0) {
  const data = await klipfolioFetch<KlipfolioListResponse<{ datasources: KlipfolioDatasource[] }>>(
    `/datasources?limit=${limit}&offset=${offset}`
  );
  return { datasources: data.data.datasources, total: data.meta.total };
}

export function isKlipfolioConfigured(): boolean {
  return !!(process.env.KLIPFOLIO_API_KEY && process.env.KLIPFOLIO_USER_ID);
}
