'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getDatasources() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('datasources')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getDatasource(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('datasources')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createDatasource(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const description = formData.get('description') as string | null;

  // Parse type-specific configuration from formData
  const config = parseConfigFromFormData(type, formData);

  const { data, error } = await supabase
    .from('datasources')
    .insert({
      name,
      type,
      description: description || null,
      config,
      created_by: user.id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
  return data;
}

export async function updateDatasource(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const name = formData.get('name') as string;
  const type = formData.get('type') as string;
  const description = formData.get('description') as string | null;

  const config = parseConfigFromFormData(type, formData);

  const { error } = await supabase
    .from('datasources')
    .update({
      name,
      type,
      description: description || null,
      config,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
}

export async function deleteDatasource(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('datasources')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/datasources');
  redirect('/datasources');
}

export async function testDatasourceConnection(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Fetch the datasource
  const { data: datasource, error: fetchError } = await supabase
    .from('datasources')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .single();

  if (fetchError || !datasource) throw new Error('Datasource niet gevonden');

  // Test the connection via edge function
  const { data: result, error: testError } = await supabase.functions.invoke(
    'test-datasource',
    {
      body: {
        datasource_id: datasource.id,
        type: datasource.type,
        config: datasource.config,
      },
    }
  );

  const newStatus = testError ? 'error' : 'connected';
  const statusMessage = testError
    ? `Verbinding mislukt: ${testError.message}`
    : 'Verbinding succesvol';

  // Update the datasource status
  const { error: updateError } = await supabase
    .from('datasources')
    .update({
      status: newStatus,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw new Error(updateError.message);

  revalidatePath('/datasources');

  return { status: newStatus, message: statusMessage, details: result };
}

/**
 * Parse type-specific datasource configuration from FormData.
 */
function parseConfigFromFormData(
  type: string,
  formData: FormData
): Record<string, unknown> {
  switch (type) {
    case 'postgresql':
    case 'mysql':
      return {
        host: formData.get('host') as string,
        port: Number(formData.get('port')) || (type === 'postgresql' ? 5432 : 3306),
        database: formData.get('database') as string,
        username: formData.get('username') as string,
        password: formData.get('password') as string,
        ssl: formData.get('ssl') === 'true',
      };
    case 'rest_api':
      return {
        base_url: formData.get('base_url') as string,
        auth_type: formData.get('auth_type') as string,
        api_key: formData.get('api_key') as string | null,
        headers: parseJsonField(formData.get('headers') as string),
      };
    case 'google_sheets':
      return {
        spreadsheet_id: formData.get('spreadsheet_id') as string,
        sheet_name: formData.get('sheet_name') as string | null,
        credentials: parseJsonField(formData.get('credentials') as string),
      };
    case 'csv':
      return {
        url: formData.get('url') as string | null,
        delimiter: (formData.get('delimiter') as string) || ',',
      };
    default:
      // Generic: collect all config_* fields
      const config: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        if (key.startsWith('config_')) {
          config[key.replace('config_', '')] = value;
        }
      });
      return config;
  }
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
