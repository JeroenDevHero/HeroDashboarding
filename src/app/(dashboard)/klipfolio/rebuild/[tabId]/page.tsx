import {
  getKlipfolioTab,
  getKlipfolioTabKlipInstances,
  getAllKlipfolioKlips,
  isKlipfolioConfigured,
} from "@/lib/klipfolio/client";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import RebuildWizard from "./RebuildWizard";

export const dynamic = "force-dynamic";

export default async function RebuildPage({
  params,
}: {
  params: Promise<{ tabId: string }>;
}) {
  const { tabId } = await params;

  if (!isKlipfolioConfigured()) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Dashboard herbouwen
        </h1>
        <Card>
          <EmptyState
            icon="link_off"
            title="Klipfolio niet geconfigureerd"
            description="Stel de KLIPFOLIO_API_KEY en KLIPFOLIO_USER_ID omgevingsvariabelen in."
          />
        </Card>
      </div>
    );
  }

  try {
    // Fetch tab details and klip instances + all klips for the wizard
    const [tab, tabKlipInstances, allKlips] = await Promise.all([
      getKlipfolioTab(tabId),
      getKlipfolioTabKlipInstances(tabId),
      getAllKlipfolioKlips(),
    ]);

    // IDs of klips on this tab
    const tabKlipIds = tabKlipInstances.map((inst) => inst.klip_id);

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Dashboard herbouwen
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Herbouw &ldquo;{tab.name}&rdquo; als nieuw Hero dashboard met
            behulp van AI.
          </p>
        </div>

        <RebuildWizard
          tabId={tabId}
          tabName={tab.name}
          tabDescription={tab.description || ""}
          klips={allKlips}
          tabKlipIds={tabKlipIds}
        />
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout";
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Dashboard herbouwen
        </h1>
        <Card>
          <EmptyState
            icon="error"
            title="Kon gegevens niet laden"
            description={message}
          />
        </Card>
      </div>
    );
  }
}
