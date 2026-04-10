'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getDashboards() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('dashboards')
    .select('*')
    .eq('created_by', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getDashboard(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('dashboards')
    .select(
      `
      *,
      dashboard_klips (
        *,
        klip:klips (*)
      )
    `
    )
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createDashboard(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const isPublic = formData.get('is_public') === 'true';

  const { data, error } = await supabase
    .from('dashboards')
    .insert({
      title,
      description: description || null,
      is_public: isPublic,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
  redirect(`/dashboards/${data.id}`);
}

export async function updateDashboard(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const isPublic = formData.get('is_public') === 'true';

  const { error } = await supabase
    .from('dashboards')
    .update({
      title,
      description: description || null,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
}

export async function deleteDashboard(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('dashboards')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
  redirect('/dashboards');
}

export async function updateDashboardLayout(
  id: string,
  layouts: {
    klip_id: string;
    layout: { x: number; y: number; w: number; h: number };
  }[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify dashboard ownership
  const { data: dashboard, error: dashError } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', id)
    .eq('created_by', user.id)
    .single();

  if (dashError || !dashboard) throw new Error('Dashboard niet gevonden');

  // Upsert each layout position
  const upserts = layouts.map((item) => ({
    dashboard_id: id,
    klip_id: item.klip_id,
    position_x: item.layout.x,
    position_y: item.layout.y,
    width: item.layout.w,
    height: item.layout.h,
  }));

  const { error } = await supabase
    .from('dashboard_klips')
    .upsert(upserts, { onConflict: 'dashboard_id,klip_id' });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
}

export async function addKlipToDashboard(
  dashboardId: string,
  klipId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify dashboard ownership
  const { data: dashboard, error: dashError } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('created_by', user.id)
    .single();

  if (dashError || !dashboard) throw new Error('Dashboard niet gevonden');

  const { error } = await supabase.from('dashboard_klips').insert({
    dashboard_id: dashboardId,
    klip_id: klipId,
    position_x: 0,
    position_y: 0,
    width: 6,
    height: 4,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
}

export async function removeKlipFromDashboard(
  dashboardId: string,
  klipId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify dashboard ownership
  const { data: dashboard, error: dashError } = await supabase
    .from('dashboards')
    .select('id')
    .eq('id', dashboardId)
    .eq('created_by', user.id)
    .single();

  if (dashError || !dashboard) throw new Error('Dashboard niet gevonden');

  const { error } = await supabase
    .from('dashboard_klips')
    .delete()
    .eq('dashboard_id', dashboardId)
    .eq('klip_id', klipId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboards');
}
