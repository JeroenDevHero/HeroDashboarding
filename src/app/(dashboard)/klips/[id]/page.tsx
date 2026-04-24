import Link from "next/link";
import { notFound } from "next/navigation";
import { getKlip } from "@/lib/actions/klip";
import { getLatestKlipConversation } from "@/lib/actions/ai";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import KlipDetailActions from "./KlipDetailActions";
import KlipChartWrapper from "./KlipChartWrapper";
import KlipVersionHistory from "./KlipVersionHistory";
import KlipChat, { type KlipChatInitialMessage } from "./KlipChat";

const typeBadgeVariant: Record<
  string,
  "info" | "success" | "warning" | "error"
> = {
  bar_chart: "info",
  line_chart: "info",
  area_chart: "info",
  pie_chart: "success",
  scatter_chart: "info",
  radar_chart: "info",
  combo_chart: "info",
  sparkline: "info",
  funnel: "info",
  treemap: "info",
  waterfall_chart: "info",
  heatmap: "info",
  slope_chart: "info",
  small_multiples: "info",
  box_plot: "info",
  sankey: "info",
  table: "success",
  status_board: "success",
  kpi_tile: "warning",
  number_comparison: "warning",
  metric_card: "warning",
  gauge: "warning",
  progress_bar: "warning",
  bullet_chart: "warning",
  timeline: "success",
  text_widget: "success",
  iframe: "success",
  map: "info",
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

  // Load any previous KlipChat conversation so the user can continue where they left off
  let initialConversationId: string | undefined;
  let initialChatMessages: KlipChatInitialMessage[] = [];
  try {
    const prev = await getLatestKlipConversation(klip.id);
    if (prev) {
      initialConversationId = prev.id;
      const raw = (prev.messages ?? []) as Array<{
        id?: string;
        role: string;
        content?: string;
      }>;
      initialChatMessages = raw
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m, idx) => ({
          id: m.id || `persisted_${prev.id}_${idx}`,
          role: m.role as "user" | "assistant",
          content: m.content || "",
        }));
    }
  } catch (err) {
    console.error("[KlipDetailPage] Failed to load klip chat history:", err);
  }

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
        <div className="flex items-center gap-2">
          <KlipVersionHistory klipId={klip.id} />
          <KlipDetailActions klipId={klip.id} />
        </div>
      </div>

      {/* Chart visualisation -- renders sample_data from config when available */}
      <Card className="mb-6">
        <div className="min-h-[320px]">
          {(() => {
            const cfg = klip.config as Record<string, unknown>;
            const sampleData = cfg?.sample_data as Record<string, unknown>[] | undefined;
            if (sampleData && sampleData.length > 0) {
              return (
                <KlipChartWrapper
                  type={klip.type}
                  data={sampleData}
                  config={cfg as import("@/components/klip/KlipChart").KlipChartConfig}
                />
              );
            }
            return (
              <EmptyState
                icon="bar_chart"
                title="Visualisatie"
                description="Koppel een query en voer deze uit om data te laden."
              />
            );
          })()}
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

      {/* Chat window for discussing changes */}
      <KlipChat
        klipId={klip.id}
        klipName={klip.name}
        initialConversationId={initialConversationId}
        initialMessages={initialChatMessages}
      />
    </div>
  );
}
