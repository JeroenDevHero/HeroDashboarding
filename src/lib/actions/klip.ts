'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
    .select(
      `
      *,
      datasource:datasources (*)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createKlip(data: {
  title: string;
  type: string;
  description?: string;
  config?: object;
  query?: string;
  datasource_id?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: klip, error } = await supabase
    .from('klips')
    .insert({
      title: data.title,
      type: data.type,
      description: data.description || null,
      config: data.config || {},
      query: data.query || null,
      datasource_id: data.datasource_id || null,
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
    title?: string;
    type?: string;
    description?: string;
    config?: object;
    query?: string;
    datasource_id?: string;
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

export async function refreshKlipData(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Fetch the klip with its datasource
  const { data: klip, error: klipError } = await supabase
    .from('klips')
    .select(
      `
      *,
      datasource:datasources (*)
    `
    )
    .eq('id', id)
    .single();

  if (klipError || !klip) throw new Error('Klip niet gevonden');
  if (!klip.datasource) throw new Error('Geen datasource gekoppeld');
  if (!klip.query) throw new Error('Geen query geconfigureerd');

  // Execute the query against the datasource
  // The actual execution depends on datasource type; for now we call
  // a Supabase edge function that handles the various datasource types.
  const { data: result, error: execError } = await supabase.functions.invoke(
    'execute-query',
    {
      body: {
        datasource_id: klip.datasource_id,
        query: klip.query,
        datasource_type: klip.datasource.type,
        datasource_config: klip.datasource.config,
      },
    }
  );

  if (execError) throw new Error(`Query uitvoering mislukt: ${execError.message}`);

  // Update cached data on the klip
  const { error: updateError } = await supabase
    .from('klips')
    .update({
      cached_data: result,
      cached_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/klips');
  return result;
}
