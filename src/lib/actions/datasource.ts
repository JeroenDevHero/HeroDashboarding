'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  testDatabricksConnection,
  type DatabricksConfig,
} from '@/lib/datasources/databricks';
import { analyzeDatabricksSource } from '@/lib/datasources/catalog';

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
  type_id: string; // accepts either a UUID or a slug (e.g. "databricks")
  description?: string;
  connection_config: Record<string, unknown>;
  refresh_interval_seconds?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Resolve type_id: if it's not a UUID, look it up by slug
  let resolvedTypeId = data.type_id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.type_id);
  if (!isUuid) {
    const { data: dsType, error: typeError } = await supabase
      .from('data_source_types')
      .select('id')
      .eq('slug', data.type_id)
      .single();
    if (typeError || !dsType) throw new Error(`Onbekend databron type: ${data.type_id}`);
    resolvedTypeId = dsType.id;
  }

  const { data: dataSource, error } = await supabase
    .from('data_sources')
    .insert({
      name: data.name,
      type_id: resolvedTypeId,
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

  // Verify the user owns this data source (RLS-safe query)
  const { data: owned, error: ownedError } = await supabase
    .from('data_sources')
    .select('id')
    .eq('id', id)
    .eq('created_by', user.id)
    .single();

  if (ownedError || !owned) throw new Error('Databron niet gevonden');

  // Fetch full config with admin client (bypasses RLS, includes secrets)
  const admin = createAdminClient();
  const { data: dataSource, error: fetchError } = await admin
    .from('data_sources')
    .select(
      `
      *,
      data_source_type:data_source_types (*)
    `
    )
    .eq('id', id)
    .single();

  if (fetchError || !dataSource) throw new Error('Databron niet gevonden');

  // Test the connection based on type slug
  const typeSlug = dataSource.data_source_type?.slug;
  let testResult: { success: boolean; message: string };

  switch (typeSlug) {
    case 'databricks': {
      const config = dataSource.connection_config as DatabricksConfig;
      testResult = await testDatabricksConnection(config);
      break;
    }
    default: {
      testResult = {
        success: false,
        message: `Niet-ondersteund type: ${typeSlug}`,
      };
    }
  }

  const newStatus = testResult.success ? 'success' : 'error';

  // Update the data source status using admin client
  const { error: updateError } = await admin
    .from('data_sources')
    .update({
      last_refresh_status: newStatus,
      last_refresh_at: new Date().toISOString(),
      last_refresh_error: testResult.success ? null : testResult.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw new Error(updateError.message);

  // Fire-and-forget catalog analysis after successful connection test
  if (testResult.success && typeSlug === 'databricks') {
    const config = dataSource.connection_config as DatabricksConfig;
    analyzeDatabricksSource(id, config).catch((err) =>
      console.error('Catalog analysis failed:', err)
    );
  }

  revalidatePath('/datasources');

  return { status: newStatus, message: testResult.message };
}

export async function refreshCatalog(dataSourceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify the user owns this data source (RLS-safe query)
  const { data: owned, error: ownedError } = await supabase
    .from('data_sources')
    .select('id')
    .eq('id', dataSourceId)
    .eq('created_by', user.id)
    .single();

  if (ownedError || !owned) throw new Error('Databron niet gevonden');

  // Fetch full config with admin client
  const admin = createAdminClient();
  const { data: dataSource, error: fetchError } = await admin
    .from('data_sources')
    .select(
      `
      *,
      data_source_type:data_source_types (*)
    `
    )
    .eq('id', dataSourceId)
    .single();

  if (fetchError || !dataSource) throw new Error('Databron niet gevonden');

  const typeSlug = dataSource.data_source_type?.slug;

  switch (typeSlug) {
    case 'databricks': {
      const config = dataSource.connection_config as DatabricksConfig;
      // Fire-and-forget: don't block the response
      analyzeDatabricksSource(dataSourceId, config).catch((err) =>
        console.error('Catalog refresh failed:', err)
      );
      break;
    }
    default:
      throw new Error(`Catalog analyse niet ondersteund voor type: ${typeSlug}`);
  }

  return { status: 'analyzing' };
}
