'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const fullName = formData.get('full_name') as string | null;
  const avatarUrl = formData.get('avatar_url') as string | null;

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName || null,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/settings');
}

export async function getAllProfiles() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify admin role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) throw new Error('Profiel niet gevonden');
  if (profile.role !== 'admin') throw new Error('Geen admin rechten');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function updateUserRole(userId: string, role: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify admin role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) throw new Error('Profiel niet gevonden');
  if (profile.role !== 'admin') throw new Error('Geen admin rechten');

  // Prevent self-demotion
  if (userId === user.id) throw new Error('Kan eigen rol niet wijzigen');

  const validRoles = ['viewer', 'builder', 'admin'];
  if (!validRoles.includes(role)) throw new Error('Ongeldige rol');

  const { error } = await supabase
    .from('profiles')
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(error.message);

  revalidatePath('/settings');
}
