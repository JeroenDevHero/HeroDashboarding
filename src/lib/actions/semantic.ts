'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  getSemanticEntities,
  createSemanticEntity as createEntity,
  updateSemanticEntity as updateEntity,
  deleteSemanticEntity as deleteEntity,
  type SemanticEntity,
} from '@/lib/datasources/semantic';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');
  return { supabase, user };
}

export async function listSemanticEntities(
  dataSourceId: string
): Promise<SemanticEntity[]> {
  await requireUser();
  return getSemanticEntities(dataSourceId);
}

export async function saveSemanticEntity(input: {
  id?: string;
  data_source_id: string;
  name: string;
  synonyms: string[];
  description: string;
  sql_template: string;
  required_tables: string[];
  default_filters?: string | null;
  confidence?: number;
}) {
  await requireUser();

  if (input.id) {
    const { id, ...rest } = input;
    const result = await updateEntity(id, rest);
    revalidatePath('/semantics');
    return result;
  }

  const result = await createEntity({
    ...input,
    created_by_type: 'user',
  });
  revalidatePath('/semantics');
  return result;
}

export async function removeSemanticEntity(id: string) {
  await requireUser();
  await deleteEntity(id);
  revalidatePath('/semantics');
}
