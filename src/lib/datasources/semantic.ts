import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A "business concept" that translates user-facing terminology (e.g. "Omzet",
 * "Debiteurenstand", "Openstaande posten") into concrete SQL fragments and
 * table references. Lets the AI answer questions in plain Dutch without the
 * end-user needing to know anything about the underlying BC schema.
 */
export interface SemanticEntity {
  id: string;
  data_source_id: string;
  name: string;
  synonyms: string[];
  description: string;
  sql_template: string;
  required_tables: string[];
  default_filters: string | null;
  created_by_type: "system" | "ai-suggested" | "user";
  confidence: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSemanticEntities(
  dataSourceId: string
): Promise<SemanticEntity[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("semantic_entities")
    .select("*")
    .eq("data_source_id", dataSourceId)
    .order("use_count", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error(`[semantic] Failed to fetch entities:`, error.message);
    return [];
  }
  return (data as SemanticEntity[]) || [];
}

/**
 * Returns a human-readable summary of all business concepts for this data
 * source. Included verbatim in the AI system prompt so Claude can translate
 * Dutch questions straight into the correct SQL.
 */
export async function getSemanticEntitiesSummary(
  dataSourceId: string
): Promise<string> {
  const entities = await getSemanticEntities(dataSourceId);
  if (entities.length === 0) {
    return "Geen business-concepten gedefinieerd voor deze databron.";
  }

  const lines: string[] = [];
  lines.push(
    "Deze concepten vertalen gebruikerstaal naar SQL. Gebruik deze ALTIJD wanneer de vraag overeenkomt met een naam of synoniem hieronder, in plaats van zelf de juiste tabellen te gaan zoeken."
  );
  lines.push("");

  for (const e of entities) {
    const synonyms =
      e.synonyms.length > 0 ? ` (aka: ${e.synonyms.join(", ")})` : "";
    lines.push(`## ${e.name}${synonyms}`);
    if (e.description) lines.push(e.description);
    if (e.required_tables.length > 0) {
      lines.push(`Tabellen: ${e.required_tables.join(", ")}`);
    }
    if (e.default_filters) {
      lines.push(`Standaard filters: ${e.default_filters}`);
    }
    lines.push("SQL template:");
    lines.push("```sql");
    lines.push(e.sql_template.trim());
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n").trim();
}

export interface CreateSemanticEntityInput {
  data_source_id: string;
  name: string;
  synonyms?: string[];
  description: string;
  sql_template: string;
  required_tables?: string[];
  default_filters?: string | null;
  created_by_type?: "system" | "ai-suggested" | "user";
  confidence?: number;
}

export async function createSemanticEntity(
  input: CreateSemanticEntityInput
): Promise<SemanticEntity> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("semantic_entities")
    .insert({
      data_source_id: input.data_source_id,
      name: input.name,
      synonyms: input.synonyms || [],
      description: input.description,
      sql_template: input.sql_template,
      required_tables: input.required_tables || [],
      default_filters: input.default_filters ?? null,
      created_by_type: input.created_by_type || "user",
      confidence: input.confidence ?? 0.5,
      use_count: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Concept aanmaken mislukt: ${error.message}`);
  }
  return data as SemanticEntity;
}

/**
 * Increment the use_count + last_used_at for an entity when it gets referenced
 * in a successful klip creation. Cheap fire-and-forget operation.
 */
export async function incrementSemanticUse(entityId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.rpc("increment_semantic_use_count", {
    entity_id: entityId,
  });
}

export async function updateSemanticEntity(
  id: string,
  updates: Partial<CreateSemanticEntityInput>
): Promise<SemanticEntity> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("semantic_entities")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Concept bijwerken mislukt: ${error.message}`);
  }
  return data as SemanticEntity;
}

export async function deleteSemanticEntity(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("semantic_entities")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`Concept verwijderen mislukt: ${error.message}`);
  }
}
