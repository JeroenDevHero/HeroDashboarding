import {
  getKlipfolioKlip,
  getKlipfolioKlipSchema,
  isKlipfolioConfigured,
} from "@/lib/klipfolio/client";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import RebuildKlipWizard from "./RebuildKlipWizard";
import { KLIPFOLIO_SCHEMA_TYPES } from "@/lib/klipfolio/types";

export const dynamic = "force-dynamic";

function detectVisualType(schema: Record<string, unknown> | null): string {
  if (!schema || !("components" in schema)) return "onbekend";
  const types = new Set<string>();
  function walk(comps: unknown) {
    if (!Array.isArray(comps)) return;
    for (const c of comps) {
      if (c && typeof c === "object") {
        const obj = c as Record<string, unknown>;
        if (typeof obj.type === "string") types.add(obj.type);
        if (obj.components) walk(obj.components);
      }
    }
  }
  walk((schema as Record<string, unknown>).components);
  if (types.has("chart_pie")) return "pie-chart";
  if (types.has("chart_series") && types.has("chart_axis")) return "bar-or-line-chart";
  if (types.has("gauge")) return "gauge";
  if (types.has("table")) return "table";
  if (types.has("simple_value")) return "number-block";
  if (types.has("mini_series")) return "sparkline";
  if (types.has("panel_grid")) return "panel-grid";
  return [...types].join(" + ") || "onbekend";
}

export default async function RebuildKlipPage({
  params,
}: {
  params: Promise<{ klipId: string }>;
}) {
  const { klipId } = await params;

  if (!isKlipfolioConfigured()) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Klip herbouwen
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
    const [klip, schemaResult] = await Promise.all([
      getKlipfolioKlip(klipId),
      getKlipfolioKlipSchema(klipId).catch(() => null),
    ]);

    const schema = schemaResult as Record<string, unknown> | null;
    const vizType = detectVisualType(schema);
    const vizLabel = KLIPFOLIO_SCHEMA_TYPES[vizType] || vizType;

    // Extract datasource IDs from schema
    const datasourceIds: string[] = [];
    if (
      schema &&
      "workspace" in schema &&
      typeof schema.workspace === "object" &&
      schema.workspace !== null &&
      "datasources" in (schema.workspace as Record<string, unknown>)
    ) {
      const ds = (schema.workspace as Record<string, unknown>).datasources;
      if (Array.isArray(ds)) datasourceIds.push(...ds.filter((d): d is string => typeof d === "string"));
    }

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Klip herbouwen
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Herbouw &ldquo;{klip.name}&rdquo; als nieuw Hero klip met behulp
            van AI.
          </p>
        </div>

        <RebuildKlipWizard
          klipId={klipId}
          klipName={klip.name}
          klipDescription={klip.description || ""}
          vizType={vizType}
          vizLabel={vizLabel}
          datasourceCount={datasourceIds.length}
        />
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout";
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
          Klip herbouwen
        </h1>
        <Card>
          <EmptyState
            icon="error"
            title="Kon klip niet laden"
            description={message}
          />
        </Card>
      </div>
    );
  }
}
