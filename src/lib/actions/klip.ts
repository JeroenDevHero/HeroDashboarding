'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { KlipType } from '@/lib/types';

export async function getKlips() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('klips')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getKlip(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('klips')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createKlip(data: {
  name: string;
  type: KlipType;
  description?: string;
  config?: object;
  query_id?: string;
  ai_prompt?: string;
  ai_generated?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: klip, error } = await supabase
    .from('klips')
    .insert({
      name: data.name,
      type: data.type,
      description: data.description || null,
      config: data.config || {},
      query_id: data.query_id || null,
      ai_prompt: data.ai_prompt || null,
      ai_generated: data.ai_generated ?? false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/klips');
  return klip;
}

export async function updateKlip(
  id: string,
  data: {
    name?: string;
    type?: KlipType;
    description?: string;
    config?: object;
    query_id?: string;
    ai_prompt?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('klips')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/klips');
}

export async function deleteKlip(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase.from('klips').delete().eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/klips');
}

export async function duplicateKlip(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Fetch the original klip
  const { data: original, error: fetchError } = await supabase
    .from('klips')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !original) throw new Error('Klip niet gevonden');

  // Create a copy with "(kopie)" suffix
  const { data: duplicate, error: insertError } = await supabase
    .from('klips')
    .insert({
      name: `${original.name} (kopie)`,
      type: original.type,
      description: original.description,
      config: original.config,
      query_id: original.query_id,
      ai_prompt: original.ai_prompt,
      ai_generated: original.ai_generated,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  revalidatePath('/klips');
  return duplicate;
}

export async function getKlipVersions(klipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('klip_versions')
    .select('*')
    .eq('klip_id', klipId)
    .order('version_number', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function restoreKlipVersion(klipId: string, versionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Get the version to restore
  const { data: version, error: versionError } = await supabase
    .from('klip_versions')
    .select('*')
    .eq('id', versionId)
    .eq('klip_id', klipId)
    .single();

  if (versionError || !version) throw new Error('Versie niet gevonden');

  const versionData = version.version_data as Record<string, unknown>;

  // Save current state as a new version before restoring
  const { data: currentKlip } = await supabase
    .from('klips')
    .select('*')
    .eq('id', klipId)
    .single();

  if (currentKlip) {
    await supabase.from('klip_versions').insert({
      klip_id: klipId,
      version_data: {
        name: currentKlip.name,
        type: currentKlip.type,
        description: currentKlip.description,
        config: currentKlip.config,
        query_id: currentKlip.query_id,
      },
      created_by: user.id,
    });
  }

  // Restore the klip to the selected version
  const { error: updateError } = await supabase
    .from('klips')
    .update({
      name: versionData.name,
      type: versionData.type,
      description: versionData.description || null,
      config: versionData.config || {},
      query_id: versionData.query_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', klipId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/klips');
  revalidatePath(`/klips/${klipId}`);
}
