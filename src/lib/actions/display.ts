'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface DisplayIpWhitelistEntry {
  id: string;
  label: string;
  ip_range: string;
  created_by: string | null;
  created_at: string;
}

// -------------------------------------------------------------------------
// Helpers (server-only)
// -------------------------------------------------------------------------

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile) throw new Error('Profiel niet gevonden');
  if (profile.role !== 'admin') throw new Error('Geen admin rechten');

  return { user, supabase };
}

/**
 * Extract the first public-facing client IP from the request headers.
 * Order of trust: x-forwarded-for > x-real-ip > cf-connecting-ip. Returns
 * null when nothing usable is present (e.g. during build / prerender).
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();

  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const realIp = h.get('x-real-ip');
  if (realIp) return normalizeIp(realIp.trim());

  const cfIp = h.get('cf-connecting-ip');
  if (cfIp) return normalizeIp(cfIp.trim());

  return null;
}

function normalizeIp(raw: string): string {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

/**
 * Ask Postgres whether the given IP falls inside any whitelist range.
 * Uses the service-role client so this can run for anonymous visitors
 * hitting the display route.
 */
export async function isIpWhitelisted(ip: string): Promise<boolean> {
  if (!ip) return false;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('is_display_ip_allowed', {
    client_ip: ip,
  });
  if (error) {
    console.error('is_display_ip_allowed failed:', error);
    return false;
  }
  return Boolean(data);
}

// -------------------------------------------------------------------------
// Dashboard share-token actions
// -------------------------------------------------------------------------

export async function regenerateShareToken(dashboardId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Generate a fresh URL-safe random token on the server.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = Buffer.from(bytes).toString('base64');
  const token = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  const { error } = await supabase
    .from('dashboards')
    .update({ share_token: token })
    .eq('id', dashboardId)
    .eq('created_by', user.id);

  if (error) throw new Error(error.message);

  revalidatePath(`/dashboards/${dashboardId}`);
  return token;
}

// -------------------------------------------------------------------------
// Display IP whitelist actions (admin-only)
// -------------------------------------------------------------------------

export async function listIpWhitelist(): Promise<DisplayIpWhitelistEntry[]> {
  await requireAdmin();

  // Use admin client so the INET value is serialized as plain text
  // regardless of RLS / role-level quirks.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('display_ip_whitelist')
    .select('id, label, ip_range, created_by, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as DisplayIpWhitelistEntry[];
}

export async function addIpWhitelistEntry(formData: FormData) {
  const { user } = await requireAdmin();

  const label = (formData.get('label') as string | null)?.trim();
  const rawRange = (formData.get('ip_range') as string | null)?.trim();

  if (!label) throw new Error('Label is verplicht');
  if (!rawRange) throw new Error('IP-adres of CIDR is verplicht');

  // Basic validation — Postgres will do the real parsing.
  if (!/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(rawRange)) {
    throw new Error('Ongeldig IP-adres of CIDR-notatie');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('display_ip_whitelist').insert({
    label,
    ip_range: rawRange,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}

export async function deleteIpWhitelistEntry(id: string) {
  await requireAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from('display_ip_whitelist')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}
