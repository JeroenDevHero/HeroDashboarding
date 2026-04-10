"use server";

import { revalidatePath } from "next/cache";

/**
 * Force-refresh all cached Klipfolio data.
 * Clears the Next.js ISR cache so the next page load fetches fresh data.
 */
export async function refreshKlipfolioCache() {
  revalidatePath("/klipfolio", "layout");
  revalidatePath("/klipfolio");
  return { refreshed: true, at: new Date().toISOString() };
}
