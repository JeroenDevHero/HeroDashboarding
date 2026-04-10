import Link from "next/link";
import { notFound } from "next/navigation";
import { getKlip } from "@/lib/actions/klip";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import KlipChart from "@/components/klip/KlipChart";
import EmptyState from "@/components/ui/EmptyState";
import KlipDetailActions from "./KlipDetailActions";

const typeBadgeVariant: Record<
  string,
  "info" | "success" | "warning" | "error"
> = {
  bar: "info",
  line: "info",
  pie: "success",
  area: "info",
  number: "warning",
  table: "success",
};

export default async function KlipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let klip;
  try {
    klip = await getKlip(id);
  } catch {
    notFound();
  }

  if (!klip) notFound();

  const hasData = klip.cached_data && klip.cached_data.length > 0;

  return (
    <div>
      {/* Back navigation */}
      <div className="mb-4">
        <Link
          href="/klips"
          className="inline-flex items-center gap-1 text-sm text-hero-grey-regular hover:text-hero-grey-black transition-colors"
        >
          <span className="material-symbols-rounded text-[18px]">
            arrow_back
          </span>
          Terug naar klips
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            {klip.title}
          </h1>
          <Badge variant={typeBadgeVariant[klip.type] ?? "info"}>
            {klip.type}
          </Badge>
        </div>
        <KlipDetailActions klipId={klip.id} />
      </div>

      {/* Chart area */}
      <Card className="mb-6">
        <div className="min-h-[320px]">
          {hasData ? (
            <div className="h-[320px]">
              <KlipChart
                type={klip.type}
                data={klip.cached_data!}
                config={klip.config || {}}
              />
            </div>
          ) : (
            <EmptyState
              icon="bar_chart"
              title="Geen data beschikbaar"
              description="Koppel een databron en voer een query uit om deze klip te vullen."
            />
          )}
        </div>
      </Card>

      {/* Metadata */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Details">
          <dl className="space-y-3 text-sm">
            {klip.description && (
              <div>
                <dt className="text-xs font-medium text-hero-grey-regular">
                  Beschrijving
                </dt>
                <dd className="mt-0.5 text-hero-grey-black">
                  {klip.description}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-hero-grey-regular">
                Type
              </dt>
              <dd className="mt-0.5 text-hero-grey-black">{klip.type}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-hero-grey-regular">
                Databron
              </dt>
              <dd className="mt-0.5 text-hero-grey-black">
                {klip.datasource ? klip.datasource.name : "Niet gekoppeld"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-hero-grey-regular">
                Laatst bijgewerkt
              </dt>
              <dd className="mt-0.5 text-hero-grey-black">
                {klip.updated_at
                  ? new Date(klip.updated_at).toLocaleString("nl-NL")
                  : "Onbekend"}
              </dd>
            </div>
            {klip.cached_at && (
              <div>
                <dt className="text-xs font-medium text-hero-grey-regular">
                  Data opgehaald op
                </dt>
                <dd className="mt-0.5 text-hero-grey-black">
                  {new Date(klip.cached_at).toLocaleString("nl-NL")}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Card title="Query">
          {klip.query ? (
            <pre className="overflow-auto rounded-md bg-hero-blue-hairline p-3 text-xs text-hero-grey-black">
              <code>{klip.query}</code>
            </pre>
          ) : (
            <p className="text-sm text-hero-grey-regular">
              Geen query geconfigureerd.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
