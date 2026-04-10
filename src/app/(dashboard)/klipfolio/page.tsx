import {
  getKlipfolioTabs,
  getKlipfolioKlips,
  getKlipfolioDatasources,
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
    const [tabsResult, klipsResult, datasourcesResult] = await Promise.all([
      getKlipfolioTabs(100),
      getKlipfolioKlips(100),
      getKlipfolioDatasources(100),
    ]);

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Klipfolio
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Referentie-overzicht van je huidige Klipfolio omgeving. Gebruik dit
            als inspiratie bij het maken van nieuwe dashboards.
          </p>
        </div>

        <KlipfolioOverview
          tabs={tabsResult.tabs}
          tabsTotal={tabsResult.total}
          klips={klipsResult.klips}
          klipsTotal={klipsResult.total}
          datasources={datasourcesResult.datasources}
          datasourcesTotal={datasourcesResult.total}
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
