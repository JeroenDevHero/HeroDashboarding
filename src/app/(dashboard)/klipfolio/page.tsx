import {
  getAllKlipfolioTabs,
  getAllKlipfolioKlips,
  getAllKlipfolioDatasources,
  isKlipfolioConfigured,
} from "@/lib/klipfolio/client";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import KlipfolioOverview from "./KlipfolioOverview";

export const dynamic = "force-dynamic";

export default async function KlipfolioPage() {
  if (!isKlipfolioConfigured()) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Klipfolio
        </h1>
        <Card>
          <EmptyState
            icon="link_off"
            title="Klipfolio niet geconfigureerd"
            description="Stel de KLIPFOLIO_API_KEY en KLIPFOLIO_USER_ID omgevingsvariabelen in om je Klipfolio-omgeving te bekijken."
          />
        </Card>
      </div>
    );
  }

  try {
    // Fetch basic lists only — deep details are too many API calls for page load
    const [allTabs, allKlips, allDatasources] = await Promise.all([
      getAllKlipfolioTabs(),
      getAllKlipfolioKlips(),
      getAllKlipfolioDatasources(),
    ]);

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Klipfolio
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Overzicht van je Klipfolio omgeving. Klik op &ldquo;Herbouwen&rdquo;
            bij een dashboard voor gedetailleerde klip- en databronanalyse.
          </p>
        </div>

        <KlipfolioOverview
          tabs={allTabs}
          tabsTotal={allTabs.length}
          klips={allKlips}
          klipsTotal={allKlips.length}
          datasources={allDatasources}
          datasourcesTotal={allDatasources.length}
        />
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout";
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Klipfolio
        </h1>
        <Card>
          <EmptyState
            icon="error"
            title="Kon Klipfolio niet laden"
            description={message}
          />
        </Card>
      </div>
    );
  }
}
