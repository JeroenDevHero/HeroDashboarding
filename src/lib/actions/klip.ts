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
