import Link from "next/link";
import { notFound } from "next/navigation";
import { getKlip } from "@/lib/actions/klip";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import KlipDetailActions from "./KlipDetailActions";

const typeBadgeVariant: Record<
  string,
  "info" | "success" | "warning" | "error"
> = {
  kpi_tile: "warning",
  bar_chart: "info",
  line_chart: "info",
  area_chart: "info",
  pie_chart: "success",
  gauge: "warning",
  table: "success",
  sparkline: "info",
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
            {klip.name}
          </h1>
          <Badge variant={typeBadgeVariant[klip.type] ?? "info"}>
            {klip.type}
          </Badge>
          {klip.ai_generated && (
            <Badge variant="warning">AI gegenereerd</Badge>
          )}
        </div>
        <KlipDetailActions klipId={klip.id} />
      </div>

      {/* Placeholder for chart -- data comes from query execution, not cached on klip */}
      <Card className="mb-6">
        <div className="min-h-[320px]">
          <EmptyState
            icon="bar_chart"
            title="Visualisatie"
            description="Koppel een query en voer deze uit om data te laden."
          />
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
                Query
              </dt>
              <dd className="mt-0.5 text-hero-grey-black">
                {klip.query_id ? klip.query_id : "Niet gekoppeld"}
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
          </dl>
        </Card>

        <Card title="AI informatie">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-hero-grey-regular">
                AI gegenereerd
              </dt>
              <dd className="mt-0.5 text-hero-grey-black">
                {klip.ai_generated ? "Ja" : "Nee"}
              </dd>
            </div>
            {klip.ai_prompt && (
              <div>
                <dt className="text-xs font-medium text-hero-grey-regular">
                  AI prompt
                </dt>
                <dd className="mt-0.5 text-hero-grey-black">
                  {klip.ai_prompt}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}
