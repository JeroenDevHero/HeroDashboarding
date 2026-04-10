import {
  getKlipfolioTab,
  getKlipfolioTabKlips,
  getAllKlipfolioKlips,
  getAllKlipfolioDatasources,
  getKlipfolioKlipDetails,
  getKlipfolioDatasourceDetails,
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
    // Fetch tab details and all klips in parallel
    const [tab, tabKlips, allKlipsResult, allDatasources] = await Promise.all([
      getKlipfolioTab(tabId),
      getKlipfolioTabKlips(tabId),
      getAllKlipfolioKlips(),
      getAllKlipfolioDatasources(),
    ]);

    // Get detailed info for all klips (component types, datasource bindings)
    const klipIds = allKlipsResult.map((k) => k.id);
    const klipDetails = await getKlipfolioKlipDetails(klipIds);

    // Get detailed datasource info
    const dsIds = allDatasources.map((d) => d.id);
    const dsDetails = await getKlipfolioDatasourceDetails(dsIds);

    // IDs of klips actually on this tab
    const tabKlipIds = new Set(tabKlips.map((tk) => tk.id));

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
          klips={klipDetails}
          tabKlipIds={Array.from(tabKlipIds)}
          datasources={dsDetails}
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
