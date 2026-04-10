'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getDataSources() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('data_sources')
    .select(
      `
      *,
      data_source_type:data_source_types (*)
    `
    )
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getDataSource(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('data_sources')
    .select(
      `
      *,
      data_source_type:data_source_types (*)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getDataSourceTypes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('data_source_types')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function createDataSource(data: {
  name: string;
  type_id: string;
  description?: string;
  connection_config: Record<string, unknown>;
  refresh_interval_seconds?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: dataSource, error } = await supabase
    .from('data_sources')
    .insert({
      name: data.name,
      type_id: data.type_id,
      description: data.description || null,
      connection_config: data.connection_config,
      refresh_interval_seconds: data.refresh_interval_seconds ?? 3600,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
  return dataSource;
}

export async function updateDataSource(
  id: string,
  data: {
    name?: string;
    type_id?: string;
    description?: string;
    connection_config?: Record<string, unknown>;
    refresh_interval_seconds?: number;
    is_active?: boolean;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('data_sources')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
}

export async function deleteDataSource(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('data_sources')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
  redirect('/datasources');
}

export async function testDataSourceConnection(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Fetch the data source with its type
  const { data: dataSource, error: fetchError } = await supabase
    .from('data_sources')
    .select(
      `
      *,
      data_source_type:data_source_types (*)
    `
    )
    .eq('id', id)
    .eq('created_by', user.id)
    .single();

  if (fetchError || !dataSource) throw new Error('Databron niet gevonden');

  // Test the connection via edge function
  const { data: result, error: testError } = await supabase.functions.invoke(
    'test-datasource',
    {
      body: {
        datasource_id: dataSource.id,
        type_slug: dataSource.data_source_type?.slug,
        connection_config: dataSource.connection_config,
      },
    }
  );

  const newStatus = testError ? 'error' : 'success';
  const statusMessage = testError
    ? `Verbinding mislukt: ${testError.message}`
    : 'Verbinding succesvol';

  // Update the data source status
  const { error: updateError } = await supabase
    .from('data_sources')
    .update({
      last_refresh_status: newStatus,
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: testError ? testError.message : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/datasources');

  return { status: newStatus, message: statusMessage, details: result };
}
