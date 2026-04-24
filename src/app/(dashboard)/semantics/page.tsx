import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { getDataSources } from "@/lib/actions/datasource";
import { getSemanticEntities } from "@/lib/datasources/semantic";
import SemanticsClient from "./SemanticsClient";

export const dynamic = "force-dynamic";

export default async function SemanticsPage() {
  const dataSources = await getDataSources();

  // Fetch entities per data source so we can group nicely in the UI
  const grouped = await Promise.all(
    dataSources.map(async (ds) => ({
      dataSource: ds,
      entities: await getSemanticEntities(ds.id),
    }))
  );

  const totalEntities = grouped.reduce((sum, g) => sum + g.entities.length, 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Business-concepten
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-hero-grey-regular">
            Vertaal zakelijke termen (zoals &quot;Omzet&quot;,
            &quot;Debiteurenstand&quot;, &quot;Voorraad&quot;) naar concrete
            SQL-templates. De AI gebruikt deze automatisch als iemand een vraag
            stelt met een bijpassende term, zodat gebruikers niets over de
            onderliggende tabelstructuur hoeven te weten.
          </p>
        </div>
      </div>

      {dataSources.length === 0 ? (
        <Card>
          <EmptyState
            icon="database"
            title="Nog geen databronnen"
            description="Voeg eerst een databron toe voordat je business-concepten kunt definiëren."
          />
        </Card>
      ) : totalEntities === 0 && grouped.every((g) => g.entities.length === 0) ? (
        <SemanticsClient grouped={grouped} />
      ) : (
        <SemanticsClient grouped={grouped} />
      )}
    </div>
  );
}
