import Link from "next/link";
import { getDatasources } from "@/lib/actions/datasource";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import DatasourceList from "./DatasourceList";

export default async function DataSourcesPage() {
  const datasources = await getDatasources();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          Databronnen
        </h1>
        <Link href="/datasources/new">
          <Button icon="add">Databron toevoegen</Button>
        </Link>
      </div>

      {datasources.length === 0 ? (
        <Card>
          <EmptyState
            icon="database"
            title="Nog geen databronnen"
            description="Voeg je eerste databron toe om data te koppelen aan je klips."
            action={
              <Link href="/datasources/new">
                <Button variant="secondary" icon="add">
                  Databron toevoegen
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <DatasourceList datasources={datasources} />
      )}
    </div>
  );
}
